import { Injectable, Logger, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/transaction.entity';
import { Account } from '../accounts/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { StudentsService } from '../students/students.service';

@Injectable()
export class SePayService {
  private readonly logger = new Logger(SePayService.name);
  private readonly apiKey: string;
  private readonly bankId: string;
  private readonly bankName: string;
  private readonly accountNumber: string;
  private readonly sepayQrBase: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    private readonly studentsService: StudentsService,
  ) {
    this.apiKey = this.config.get('SEPAY_API_KEY', '');
    this.bankId = this.config.get('SEPAY_BANK_ID', '');
    this.bankName = this.config.get('SEPAY_BANK_NAME', '');
    this.accountNumber = this.config.get('SEPAY_ACCOUNT_NUMBER', '');
    this.sepayQrBase = this.config.get('SEPAY_QR_BASE', 'https://qr.sepay.vn/img');
  }

  verifyApiKey(authHeader: string | undefined): void {
    if (!this.apiKey) {
      this.logger.warn('SEPAY_API_KEY chưa được cấu hình');
      return;
    }
    const expected = `Apikey ${this.apiKey}`;
    if (!authHeader || authHeader !== expected) {
      throw new UnauthorizedException('API Key không hợp lệ');
    }
  }

  generateRefCode(studentCode: string): string {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SCP${studentCode}${rand}`;
  }

  getQrUrl(amount: number, content: string): string {
    const params = new URLSearchParams({
      acc: this.accountNumber,
      amount: String(amount),
      des: content,
    });
    if (this.bankId) params.set('bank', this.bankId);
    else if (this.bankName) params.set('bank', this.bankName);
    return `${this.sepayQrBase}?${params.toString()}`;
  }

  async createPayment(studentCode: string, amount: number): Promise<{
    referenceCode: string;
    qrUrl: string;
    amount: number;
    expiresAt: string;
  }> {
    const student = await this.studentsService.findByCode(studentCode);
    if (!student) throw new BadRequestException('Sinh viên không tồn tại');
    if (amount < 1000 || amount > 5000000) {
      throw new BadRequestException('Số tiền từ 1.000đ đến 5.000.000đ');
    }
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const refCode = this.generateRefCode(studentCode);
    const qrUrl = this.getQrUrl(amount, refCode);

    await this.txRepo.save({
      amount,
      type: TransactionType.CREDIT,
      status: TransactionStatus.PENDING,
      idempotencyKey: `sepay_${refCode}`,
      referenceCode: refCode,
      description: `Nạp tiền qua SePay - ${refCode}`,
      studentCode: student.studentCode,
      studentId: student.id,
      accountId: (await this.accountsService.findByStudentId(student.id)).id,
    });

    return { referenceCode: refCode, qrUrl, amount, expiresAt: expiresAt.toISOString() };
  }

  async handleWebhook(body: any): Promise<{ message: string }> {
    this.logger.log(`====== SEPAY WEBHOOK RAW ======`);
    this.logger.log(JSON.stringify(body, null, 2));
    this.logger.log(`===============================`);

    const rawContent = body.content ?? body.code ?? body.description ?? body.transactionContent ?? '';
    const dto = {
      id: Number(body.id) || 0,
      amount: Number(String(body.transferAmount ?? body.amount).replace(/[^0-9.-]/g, '')) || 0,
      content: String(rawContent).trim(),
      transferType: String(body.transferType ?? body.type ?? '').toLowerCase().trim(),
    };

    this.logger.log(`SePay webhook parsed: id=${dto.id}, amount=${dto.amount}, content="${dto.content}", transferType="${dto.transferType}"`);

    if (dto.transferType !== 'in') {
      this.logger.warn(`Bỏ qua giao dịch không phải tiền vào: ${dto.transferType}`);
      return { message: 'ignored' };
    }

    const refCode = this.parseRefCode(dto.content);
    if (!refCode) {
      this.logger.warn(`Không tìm thấy reference code trong nội dung: "${dto.content}"`);
      return { message: 'no_ref_code' };
    }
    this.logger.log(`Parsed refCode: ${refCode}`);

    const tx = await this.txRepo.findOne({ where: { referenceCode: refCode } });
    if (!tx) {
      this.logger.warn(`Không tìm thấy giao dịch với referenceCode: ${refCode}`);
      return { message: 'transaction_not_found' };
    }
    this.logger.log(`Tìm thấy giao dịch: id=${tx.id}, status=${tx.status}, amount=${tx.amount}`);

    if (tx.status === TransactionStatus.SUCCESS) {
      this.logger.log(`Giao dịch đã được xử lý trước đó: ${refCode}`);
      return { message: 'already_processed' };
    }

    if (tx.amount !== dto.amount) {
      this.logger.warn(`Số tiền không khớp: expected=${tx.amount}, actual=${dto.amount}`);
      return { message: 'amount_mismatch' };
    }

    // Xử lý trong DB transaction để đảm bảo atomic
    await this.dataSource.transaction(async (manager) => {
      const accountRepo = manager.getRepository(Account);
      const txRepo = manager.getRepository(Transaction);

      const account = await accountRepo.findOne({ where: { studentId: tx.studentId } });
      if (!account) {
        throw new NotFoundException(`Không tìm thấy ví cho studentId: ${tx.studentId}`);
      }
      if (account.status !== 'active') {
        throw new BadRequestException(`Ví đang bị đóng băng: ${account.status}`);
      }

      account.balance = Number(account.balance) + Number(dto.amount);
      await accountRepo.save(account);
      this.logger.log(`Đã cộng ${dto.amount}đ vào ví ${account.id}, balance mới: ${account.balance}`);

      const currentTx = await txRepo.findOne({ where: { id: tx.id } });
      if (currentTx && currentTx.status !== TransactionStatus.SUCCESS) {
        currentTx.status = TransactionStatus.SUCCESS;
        currentTx.description = `Nạp tiền qua ngân hàng - ${dto.content}`;
        await txRepo.save(currentTx);
      }
    });

    this.logger.log(`Nạp tiền thành công: ${tx.studentCode} +${dto.amount}đ (ref: ${refCode})`);
    return { message: 'success' };
  }

  async cancelPayment(referenceCode: string, userId: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { referenceCode } });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.studentId !== userId) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.status !== TransactionStatus.PENDING) return;

    tx.status = TransactionStatus.FAILED;
    tx.description = 'Đã hủy nạp tiền';
    await this.txRepo.save(tx);
  }

  async checkStatus(referenceCode: string, user: any): Promise<{
    status: string;
    amount: number;
    createdAt: string;
  } | null> {
    const tx = await this.txRepo.findOne({ where: { referenceCode } });
    if (!tx) return null;
    if (user.role === 'student' && tx.studentId !== user.id) {
      throw new NotFoundException('Giao dịch không tồn tại');
    }
    return { status: tx.status, amount: tx.amount, createdAt: tx.createdAt.toISOString() };
  }

  private parseRefCode(content: string): string | null {
    const cleaned = content.replace(/[^A-Z0-9]/g, '');
    const match = cleaned.match(/SCP[A-Z0-9]+/);
    return match ? match[0] : null;
  }
}
