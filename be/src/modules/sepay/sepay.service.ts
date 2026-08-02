import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { Account, AccountStatus } from '../accounts/account.entity';
import { Student } from '../students/student.entity';
import { AccountsService } from '../accounts/accounts.service';
import { StudentsService } from '../students/students.service';
import { TopupPendingService } from '../topup-pending/topup-pending.service';
import { RedisService } from '../redis/redis.service';

interface SePayWebhookDto {
  id: number;
  amount: number;
  content: string;
  transferType: string;
  sender: string;
  bankRef: string;
  bankName: string;
}

@Injectable()
export class SePayService {
  private readonly logger = new Logger(SePayService.name);
  private readonly apiKey: string;
  private readonly bankId: string;
  private readonly bankName: string;
  private readonly accountNumber: string;
  private readonly sepayQrBase: string;
  private readonly staticQrDescription: string;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    private readonly studentsService: StudentsService,
    private readonly topupPendingService: TopupPendingService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.config.get('SEPAY_API_KEY', '');
    this.bankId = this.config.get('SEPAY_BANK_ID', '');
    this.bankName = this.config.get('SEPAY_BANK_NAME', '');
    this.accountNumber = this.config.get('SEPAY_ACCOUNT_NUMBER', '');
    this.sepayQrBase = this.config.get(
      'SEPAY_QR_BASE',
      'https://qr.sepay.vn/img',
    );
    this.staticQrDescription = this.config.get(
      'SEPAY_STATIC_QR_DES',
      'Nap tien SmartCampusPay - ghi ro ma SV',
    );
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
      des: content,
    });
    if (amount > 0) params.set('amount', String(amount));
    if (this.bankId) params.set('bank', this.bankId);
    else if (this.bankName) params.set('bank', this.bankName);
    return `${this.sepayQrBase}?${params.toString()}`;
  }

  createStaticQr(): {
    qrUrl: string;
    bankName: string;
    accountNumber: string;
    description: string;
  } {
    const params = new URLSearchParams({
      acc: this.accountNumber,
      des: this.staticQrDescription,
    });
    if (this.bankId) params.set('bank', this.bankId);
    else if (this.bankName) params.set('bank', this.bankName);
    return {
      qrUrl: `${this.sepayQrBase}?${params.toString()}`,
      bankName: this.bankName,
      accountNumber: this.accountNumber,
      description: this.staticQrDescription,
    };
  }

  async createPayment(
    studentCode: string,
    amount: number,
  ): Promise<{
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

    return {
      referenceCode: refCode,
      qrUrl,
      amount,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async createDevicePayment(studentCode: string): Promise<{
    referenceCode: string;
    qrUrl: string;
    amount: number;
    expiresAt: string;
  }> {
    const student = await this.studentsService.findByCode(studentCode);
    if (!student) throw new BadRequestException('Sinh viên không tồn tại');
    if (!student.isActive) throw new BadRequestException('Sinh viên bị khóa');

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const refCode = this.generateRefCode(studentCode);
    // amount = 0 → QR không gắn số tiền cố định, SV tự nhập khi chuyển khoản
    const qrUrl = this.getQrUrl(0, refCode);

    await this.txRepo.save({
      amount: 0,
      type: TransactionType.CREDIT,
      status: TransactionStatus.PENDING,
      idempotencyKey: `sepay_${refCode}`,
      referenceCode: refCode,
      description: `Nạp tiền qua thiết bị - ${refCode}`,
      studentCode: student.studentCode,
      studentId: student.id,
      accountId: (await this.accountsService.findByStudentId(student.id)).id,
    });

    return {
      referenceCode: refCode,
      qrUrl,
      amount: 0,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async handleWebhook(body: any): Promise<{ message: string }> {
    this.logger.log(`====== SEPAY WEBHOOK RAW ======`);
    this.logger.log(JSON.stringify(body, null, 2));
    this.logger.log(`===============================`);

    const dto = this.parseWebhook(body);
    this.logger.log(
      `SePay webhook parsed: id=${dto.id}, amount=${dto.amount}, content="${dto.content}", transferType="${dto.transferType}", sender="${dto.sender}"`,
    );

    if (dto.transferType !== 'in') {
      this.logger.warn(
        `Bỏ qua giao dịch không phải tiền vào: ${dto.transferType}`,
      );
      return { message: 'ignored' };
    }

    const transferId = dto.id ? String(dto.id) : null;
    if (!transferId) {
      this.logger.warn(
        `Thiếu transferId, không thể xử lý tự động: "${dto.content}"`,
      );
      return { message: 'missing_transfer_id' };
    }

    const lockKey = `sepay_webhook:${transferId}`;
    const acquired = await this.redis.acquireLock(lockKey, 30);
    if (!acquired) {
      this.logger.warn(
        `Webhook đang được xử lý bởi request khác: ${transferId}`,
      );
      return { message: 'processing' };
    }

    try {
      const idemKey = `sepay_${transferId}`;

      const existingByKey = await this.txRepo.findOne({
        where: { idempotencyKey: idemKey },
      });
      if (existingByKey) {
        this.logger.log(`Giao dịch đã được xử lý trước đó: ${idemKey}`);
        return {
          message:
            existingByKey.status === TransactionStatus.SUCCESS
              ? 'already_processed'
              : 'processing',
        };
      }

      const result = await this.tryMatchByRefCode(dto);
      if (result) return result;

      const resultByStudent = await this.tryMatchByStudentCode(dto, idemKey);
      if (resultByStudent) return resultByStudent;

      this.logger.warn(
        `Không khớp refCode/mã SV, đưa vào hàng đợi: "${dto.content}"`,
      );
      await this.topupPendingService.createFromWebhook({
        transferId,
        amount: dto.amount,
        content: dto.content,
        sender: dto.sender,
        bankRef: dto.bankRef,
        bankName: dto.bankName,
      });
      return { message: 'pending_match' };
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  async cancelPayment(referenceCode: string, userId: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { referenceCode } });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.studentId !== userId)
      throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.status !== TransactionStatus.PENDING) return;

    tx.status = TransactionStatus.FAILED;
    tx.description = 'Đã hủy nạp tiền';
    await this.txRepo.save(tx);
  }

  async checkStatus(
    referenceCode: string,
    user: any,
  ): Promise<{
    status: string;
    amount: number;
    createdAt: string;
  } | null> {
    const tx = await this.txRepo.findOne({ where: { referenceCode } });
    if (!tx) return null;
    if (user.role === 'student' && tx.studentId !== user.id) {
      throw new NotFoundException('Giao dịch không tồn tại');
    }
    return {
      status: tx.status,
      amount: tx.amount,
      createdAt: tx.createdAt.toISOString(),
    };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private parseWebhook(body: any): SePayWebhookDto {
    const rawContent =
      body.content ??
      body.code ??
      body.description ??
      body.transactionContent ??
      '';
    return {
      id: Number(body.id) || 0,
      amount:
        Number(
          String(body.transferAmount ?? body.amount).replace(/[^0-9.-]/g, ''),
        ) || 0,
      content: String(rawContent).trim(),
      transferType: String(body.transferType ?? body.type ?? '')
        .toLowerCase()
        .trim(),
      sender: String(body.sender ?? '').trim(),
      bankRef: String(body.tid ?? body.refNo ?? '').trim(),
      bankName: String(body.bankName ?? body.bankAbbreviation ?? '').trim(),
    };
  }

  private async tryMatchByRefCode(
    dto: SePayWebhookDto,
  ): Promise<{ message: string } | null> {
    const refCode = this.parseRefCode(dto.content);
    if (!refCode) return null;

    const tx = await this.txRepo.findOne({ where: { referenceCode: refCode } });
    if (!tx) {
      this.logger.warn(
        `Không tìm thấy giao dịch với referenceCode: ${refCode}`,
      );
      return { message: 'transaction_not_found' };
    }

    if (tx.status === TransactionStatus.SUCCESS) {
      this.logger.log(`Giao dịch đã được xử lý trước đó: ${refCode}`);
      return { message: 'already_processed' };
    }

    if (tx.amount !== 0 && tx.amount !== dto.amount) {
      this.logger.warn(
        `Số tiền không khớp: expected=${tx.amount}, actual=${dto.amount}`,
      );
      return { message: 'amount_mismatch' };
    }

    await this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { studentId: tx.studentId },
      });
      if (!account)
        throw new NotFoundException(
          `Không tìm thấy ví cho studentId: ${tx.studentId}`,
        );
      if (account.status !== AccountStatus.ACTIVE)
        throw new BadRequestException(
          `Ví đang bị đóng băng: ${account.status}`,
        );

      account.balance = Number(account.balance) + Number(dto.amount);
      await manager.save(account);
      this.logger.log(
        `Đã cộng ${dto.amount}đ vào ví ${account.id}, balance mới: ${account.balance}`,
      );

      const currentTx = await manager.findOne(Transaction, {
        where: { id: tx.id },
      });
      if (currentTx && currentTx.status !== TransactionStatus.SUCCESS) {
        currentTx.status = TransactionStatus.SUCCESS;
        currentTx.amount = currentTx.amount === 0 ? dto.amount : currentTx.amount;
        currentTx.description = `Nạp tiền qua ngân hàng - ${dto.content}`;
        await manager.save(currentTx);
      }
    });

    this.logger.log(
      `Nạp tiền thành công (refCode): ${tx.studentCode} +${dto.amount}đ (ref: ${refCode})`,
    );
    return { message: 'success' };
  }

  private async tryMatchByStudentCode(
    dto: SePayWebhookDto,
    idemKey: string,
  ): Promise<{ message: string } | null> {
    const student = await this.matchStudentByContent(dto.content);
    if (!student) return null;

    if (dto.amount < 1000 || dto.amount > 5000000) {
      this.logger.warn(`Số tiền ngoài phạm vi cho phép: ${dto.amount}`);
      return { message: 'amount_out_of_range' };
    }

    await this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { studentId: student.id },
      });
      if (!account)
        throw new NotFoundException(
          `Không tìm thấy ví cho sinh viên ${student.studentCode}`,
        );
      if (account.status !== AccountStatus.ACTIVE)
        throw new BadRequestException(
          `Ví đang bị đóng băng: ${account.status}`,
        );

      account.balance = Number(account.balance) + Number(dto.amount);
      await manager.save(account);
      this.logger.log(
        `Đã cộng ${dto.amount}đ vào ví ${account.id}, balance mới: ${account.balance}`,
      );

      const tx = manager.create(Transaction, {
        amount: dto.amount,
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
        idempotencyKey: idemKey,
        description: `Nạp tiền qua ngân hàng - ${dto.content}`,
        studentCode: student.studentCode,
        studentId: student.id,
        accountId: account.id,
      });
      await manager.save(tx);
    });

    this.logger.log(
      `Nạp tiền thành công (mã SV): ${student.studentCode} +${dto.amount}đ`,
    );
    return { message: 'success' };
  }

  private async matchStudentByContent(
    content: string,
  ): Promise<Student | null> {
    // Lấy các token chữ-số dài >= 6 (mã SV có thể chứa chữ, ví dụ B23DCCN358)
    const tokens = content.match(/[A-Za-z0-9]{6,}/g);
    if (!tokens) return null;

    const seen = new Set<string>();
    for (const token of tokens) {
      const variants = [token, token.toUpperCase()];
      for (const candidate of variants) {
        const key = candidate.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const student = await this.studentsService.findByCode(candidate);
        if (student && student.isActive) return student;
      }
    }
    return null;
  }

  private parseRefCode(content: string): string | null {
    const cleaned = content.replace(/[^A-Z0-9]/g, '');
    const match = cleaned.match(/SCP[A-Z0-9]+/);
    return match ? match[0] : null;
  }
}
