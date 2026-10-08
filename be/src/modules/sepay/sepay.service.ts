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
import {
  TopupPending,
  TopupPendingStatus,
} from '../topup-pending/topup-pending.entity';
import { validateTopupAmount } from '../../common/utils/payment';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

interface SePayWebhookDto {
  id: string;
  amount: number;
  accountNumber?: string;
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
  private readonly webhookAccountNumber: string;
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
    this.webhookAccountNumber =
      this.config.get<string>('SEPAY_WEBHOOK_ACCOUNT_NUMBER')?.trim() ||
      this.accountNumber;
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
      this.logger.error('SEPAY_API_KEY chưa được cấu hình');
      throw new UnauthorizedException(
        'Webhook authentication is not configured',
      );
    }
    const expected = `Apikey ${this.apiKey}`;
    if (!authHeader || authHeader !== expected) {
      throw new UnauthorizedException('API Key không hợp lệ');
    }
  }

  generateRefCode(studentCode: string): string {
    const rand = randomBytes(3).toString('hex').toUpperCase();
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

  createPersonalStaticQr(studentCode: string): {
    qrUrl: string;
    bankName: string;
    accountNumber: string;
    description: string;
  } {
    const personalDescription = `Nap tien ${studentCode}`;
    const params = new URLSearchParams({
      acc: this.accountNumber,
      des: personalDescription,
    });
    if (this.bankId) params.set('bank', this.bankId);
    else if (this.bankName) params.set('bank', this.bankName);
    return {
      qrUrl: `${this.sepayQrBase}?${params.toString()}`,
      bankName: this.bankName,
      accountNumber: this.accountNumber,
      description: personalDescription,
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
    validateTopupAmount(amount);
    if (!student.isActive) throw new BadRequestException('Sinh viên bị khóa');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const refCode = this.generateRefCode(studentCode);
    const qrUrl = this.getQrUrl(amount, refCode);

    await this.txRepo.save({
      amount,
      type: TransactionType.CREDIT,
      status: TransactionStatus.PENDING,
      idempotencyKey: `sepay_${refCode}`,
      referenceCode: refCode,
      expiresAt,
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

  async createDevicePayment(
    studentCode: string,
    merchantId: string,
    amount: number,
  ): Promise<{
    referenceCode: string;
    qrUrl: string;
    amount: number;
    expiresAt: string;
  }> {
    const student = await this.studentsService.findByCode(studentCode);
    if (!student) throw new BadRequestException('Sinh viên không tồn tại');
    validateTopupAmount(amount);
    if (!student.isActive) throw new BadRequestException('Sinh viên bị khóa');

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const refCode = this.generateRefCode(studentCode);
    const qrUrl = this.getQrUrl(amount, refCode);

    await this.txRepo.save({
      amount,
      type: TransactionType.CREDIT,
      status: TransactionStatus.PENDING,
      idempotencyKey: `sepay_${refCode}`,
      referenceCode: refCode,
      expiresAt,
      description: `Nạp tiền qua thiết bị - ${refCode}`,
      merchantId,
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

  async handleWebhook(body: unknown): Promise<{ message: string }> {
    const dto = this.parseWebhook(body);
    if (dto.transferType !== 'in') return { message: 'ignored' };
    // Persist every incoming transfer first. All automatic/manual processing locks
    // this same unique inbox row, even when Redis is unavailable.
    const inbox = await this.topupPendingService.createFromWebhook({
      transferId: dto.id,
      amount: dto.amount,
      content: dto.content,
      sender: dto.sender,
      bankRef: dto.bankRef,
      bankName: dto.bankName,
    });
    const refCode = this.parseRefCode(dto.content);
    const student = refCode
      ? null
      : await this.matchStudentByContent(dto.content);
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOneOrFail(TopupPending, {
        where: { id: inbox.id },
        lock: { mode: 'pessimistic_write' },
      });
      // Replays must never change the recorded destination, amount or content.
      if (pending.amount !== dto.amount || pending.content !== dto.content) {
        throw new BadRequestException({
          code: 'TRANSFER_CONFLICT',
          message: 'Transfer ID payload mismatch',
        });
      }
      if (pending.status !== TopupPendingStatus.PENDING)
        return { message: 'already_processed' };
      // Leave an already queued transfer for an explicit admin decision.
      if (pending.note) return { message: 'pending_match' };
      const queue = async (reason: string): Promise<{ message: string }> => {
        pending.note = reason;
        await manager.save(pending);
        return { message: 'pending_match' };
      };
      const idemKey = `sepay_${dto.id}`;
      const previous = await manager.findOne(Transaction, {
        where: { idempotencyKey: idemKey },
      });
      if (previous) {
        pending.status = TopupPendingStatus.MATCHED;
        pending.studentId = previous.studentId;
        pending.transactionId = previous.id;
        pending.matchedAt = new Date();
        await manager.save(pending);
        return { message: 'already_processed' };
      }
      if (
        dto.accountNumber &&
        this.webhookAccountNumber &&
        dto.accountNumber !== this.webhookAccountNumber
      ) {
        return queue('recipient_account_mismatch');
      }
      if (
        !Number.isSafeInteger(dto.amount) ||
        dto.amount < 1000 ||
        dto.amount > 5000000
      ) {
        return queue('amount_out_of_range');
      }
      let tx: Transaction | null = null;
      let target: Student | null = student;
      if (refCode) {
        tx = await manager.findOne(Transaction, {
          where: { referenceCode: refCode },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tx) return queue('reference_not_found');
        if (tx.status !== TransactionStatus.PENDING)
          return queue('reference_already_used_or_cancelled');
        const expiresAt =
          tx.expiresAt ?? new Date(tx.createdAt.getTime() + 30 * 60 * 1000);
        if (expiresAt.getTime() <= Date.now()) {
          tx.status = TransactionStatus.FAILED;
          await manager.save(tx);
          return queue('reference_expired');
        }
        if (tx.amount !== 0 && tx.amount !== dto.amount)
          return queue('amount_mismatch');
        target = await manager.findOne(Student, {
          where: { id: tx.studentId },
          lock: { mode: 'pessimistic_read' },
        });
      }
      if (!refCode && target) {
        target = await manager.findOne(Student, {
          where: { id: target.id },
          lock: { mode: 'pessimistic_read' },
        });
      }
      if (!target || !target.isActive)
        return queue('student_not_found_or_inactive');
      const account = await manager.findOne(Account, {
        where: { studentId: target.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account || account.status !== AccountStatus.ACTIVE)
        return queue('account_not_active');
      if (account.balance + dto.amount > 2147483647)
        return queue('balance_overflow');
      const balanceBefore = account.balance;
      account.balance = balanceBefore + dto.amount;
      await manager.save(account);
      tx =
        tx ??
        manager.create(Transaction, {
          studentId: target.id,
          studentCode: target.studentCode,
          accountId: account.id,
        });
      tx.type = TransactionType.CREDIT;
      tx.status = TransactionStatus.SUCCESS;
      tx.amount = dto.amount;
      tx.balanceBefore = balanceBefore;
      tx.balanceAfter = account.balance;
      tx.idempotencyKey = idemKey;
      tx.description = `Nạp tiền qua ngân hàng - ${dto.content}`.slice(0, 255);
      const saved = await manager.save(tx);
      pending.status = TopupPendingStatus.MATCHED;
      pending.studentId = target.id;
      pending.transactionId = saved.id;
      pending.matchedAt = new Date();
      pending.note = 'auto_matched';
      await manager.save(pending);
      return { message: 'success' };
    });
  }

  async cancelPayment(referenceCode: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, {
        where: { referenceCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tx || tx.studentId !== userId)
        throw new NotFoundException('Giao dịch không tồn tại');
      if (tx.status !== TransactionStatus.PENDING) return;
      tx.status = TransactionStatus.FAILED;
      tx.description = 'Đã hủy nạp tiền';
      await manager.save(tx);
    });
  }

  async expirePayment(tx: Transaction): Promise<Transaction> {
    if (
      tx.status === TransactionStatus.PENDING &&
      tx.type === TransactionType.CREDIT &&
      (
        tx.expiresAt ?? new Date(tx.createdAt.getTime() + 30 * 60 * 1000)
      ).getTime() <= Date.now()
    ) {
      // Conditional UPDATE cannot overwrite a concurrently committed webhook.
      await this.txRepo.update(
        { id: tx.id, status: TransactionStatus.PENDING },
        { status: TransactionStatus.FAILED },
      );
      return (await this.txRepo.findOneBy({ id: tx.id }))!;
    }
    return tx;
  }

  async checkStatus(
    referenceCode: string,
    user: any,
  ): Promise<{
    status: string;
    amount: number;
    createdAt: string;
  } | null> {
    let tx = await this.txRepo.findOne({ where: { referenceCode } });
    if (!tx) return null;
    if (user.role === 'student' && tx.studentId !== user.id) {
      throw new NotFoundException('Giao dịch không tồn tại');
    }
    tx = await this.expirePayment(tx);
    return {
      status: tx.status,
      amount: tx.amount,
      createdAt: tx.createdAt.toISOString(),
    };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private parseWebhook(input: unknown): SePayWebhookDto {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Invalid webhook');
    const body = input as Record<string, unknown>;
    const transferType = String(body.transferType ?? body.type ?? '')
      .toLowerCase()
      .trim();
    const id = String(body.id ?? '').trim();
    const amount = Number(body.transferAmount ?? body.amount);
    const content = String(
      body.content ??
        body.code ??
        body.description ??
        body.transactionContent ??
        '',
    ).trim();
    if (
      transferType === 'in' &&
      (!/^[0-9]{1,50}$/.test(id) ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > 2147483647)
    ) {
      throw new BadRequestException({
        code: 'INVALID_WEBHOOK',
        message: 'Webhook requires a transfer ID and a positive integer amount',
      });
    }
    if (content.length > 255)
      throw new BadRequestException('Webhook content exceeds 255 characters');
    return {
      id,
      amount,
      content,
      transferType,
      accountNumber:
        body.accountNumber == null
          ? undefined
          : String(body.accountNumber).trim(),
      sender: String(body.sender ?? '')
        .trim()
        .slice(0, 100),
      bankRef: String(body.tid ?? body.refNo ?? '')
        .trim()
        .slice(0, 64),
      bankName: String(body.bankName ?? body.bankAbbreviation ?? '')
        .trim()
        .slice(0, 100),
    };
  }

  private async matchStudentByContent(
    content: string,
  ): Promise<Student | null> {
    // Lấy các token chữ-số dài >= 6 (mã SV có thể chứa chữ, ví dụ B23DCCN358)
    const tokens = content.match(/[A-Za-z0-9]{6,}/g);
    this.logger.debug(
      `[matchStudentByContent] Extracted tokens: ${JSON.stringify(tokens)}`,
    );
    if (!tokens) return null;

    const seen = new Set<string>();
    for (const token of tokens) {
      const variants = [token.toUpperCase(), token];
      for (const candidate of variants) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);

        this.logger.debug(
          `[matchStudentByContent] Checking student code: ${candidate}`,
        );
        const student = await this.studentsService.findByCode(candidate);
        this.logger.debug(
          `[matchStudentByContent] findByCode('${candidate}'): ${student ? student.studentCode : 'not found'}, isActive=${student?.isActive}`,
        );
        if (student && student.isActive) return student;
      }
    }
    this.logger.debug(`[matchStudentByContent] No student found`);
    return null;
  }

  private parseRefCode(content: string): string | null {
    const match = content.toUpperCase().match(/SCP[A-Z0-9]+/);
    return match ? match[0] : null;
  }
}
