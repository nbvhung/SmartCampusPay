import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Raw } from 'typeorm';
import { TopupPending, TopupPendingStatus } from './topup-pending.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { Account, AccountStatus } from '../accounts/account.entity';
import { validateTopupAmount } from '../../common/utils/payment';
import { Student } from '../students/student.entity';

@Injectable()
export class TopupPendingService {
  private readonly logger = new Logger(TopupPendingService.name);

  constructor(
    @InjectRepository(TopupPending)
    private readonly repo: Repository<TopupPending>,
    private readonly dataSource: DataSource,
  ) {}

  async createFromWebhook(input: {
    transferId: string;
    amount: number;
    content: string;
    sender?: string;
    bankRef?: string;
    bankName?: string;
    note?: string;
  }): Promise<TopupPending> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(TopupPending)
      .values({ ...input, status: TopupPendingStatus.PENDING })
      .orIgnore()
      .execute();
    return this.repo.findOneByOrFail({ transferId: input.transferId });
  }

  async findAll(filter?: { status?: string }): Promise<TopupPending[]> {
    const where: Record<string, unknown> = {};
    if (filter?.status) where.status = filter.status;
    return this.repo.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async match(
    id: string,
    studentCode: string,
    adminId: string,
  ): Promise<TopupPending> {
    return this.dataSource.transaction((manager) => this.matchWithManager(manager, id, studentCode, adminId));
  }

  // Called by claim review so credit, transfer and claim commit together.
  async matchWithManager(
    manager: EntityManager,
    id: string,
    studentCode: string,
    adminId: string,
    expectedAmount?: number,
  ): Promise<TopupPending> {
    if (!/^[A-Za-z0-9]{5,20}$/.test(studentCode.trim()))
      throw new BadRequestException('Invalid student code');
      const pending = await manager.findOne(TopupPending, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pending)
        throw new NotFoundException('Không tìm thấy giao dịch chưa khớp');
      if (pending.status !== TopupPendingStatus.PENDING) {
        throw new BadRequestException('Giao dịch đã được xử lý');
      }
      if (expectedAmount !== undefined && pending.amount !== expectedAmount) {
        throw new BadRequestException('Số tiền thực nhận không khớp số tiền trong hồ sơ');
      }

      validateTopupAmount(pending.amount);
      if (pending.note === 'recipient_account_mismatch')
        throw new BadRequestException({
          code: 'RECIPIENT_ACCOUNT_MISMATCH',
          message:
            'Tài khoản nhận tiền không khớp cấu hình SePay. Cần xác minh tài khoản nhận trước khi cộng tiền.',
        });
      const student = await manager.findOne(Student, {
        lock: { mode: 'pessimistic_read' },
        where: {
          studentCode: Raw((alias) => `${alias} ILIKE :code`, {
            code: studentCode.trim(),
          }),
        },
      });
      if (!student || !student.isActive) {
        throw new BadRequestException('Sinh viên không tồn tại hoặc bị khóa');
      }

      const idemKey = `sepay_${pending.transferId}`;
      const existingTx = await manager.findOne(Transaction, {
        where: { idempotencyKey: idemKey },
      });
      if (existingTx) {
        throw new BadRequestException('Giao dịch đã được xử lý trước đó');
      }

      const account = await manager.findOne(Account, {
        where: { studentId: student.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account)
        throw new NotFoundException('Không tìm thấy ví của sinh viên');
      if (account.status !== AccountStatus.ACTIVE)
        throw new BadRequestException('Ví đang bị đóng băng');

      if (account.balance + pending.amount > 2147483647)
        throw new BadRequestException('Balance overflow');
      account.balance += pending.amount;
      await manager.save(account);

      const tx = manager.create(Transaction, {
        amount: pending.amount,
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
        idempotencyKey: idemKey,
        description:
          `Nạp tiền qua ngân hàng (xử lý thủ công) - ${pending.content}`.slice(
            0,
            255,
          ),
        studentCode: student.studentCode,
        studentId: student.id,
        accountId: account.id,
      });
      const savedTx = await manager.save(tx);

      pending.status = TopupPendingStatus.MATCHED;
      pending.studentId = student.id;
      pending.adminId = adminId;
      pending.transactionId = savedTx.id;
      pending.matchedAt = new Date();
      this.logger.log(
        `Đã khớp pending ${pending.id} với sinh viên ${student.studentCode} +${pending.amount}đ`,
      );
      return manager.save(pending);
  }

  async ignore(id: string, adminId: string): Promise<TopupPending> {
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOne(TopupPending, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pending)
        throw new NotFoundException('Không tìm thấy giao dịch chưa khớp');
      if (pending.status !== TopupPendingStatus.PENDING)
        throw new BadRequestException('Giao dịch đã được xử lý');
      pending.status = TopupPendingStatus.IGNORED;
      pending.adminId = adminId;
      pending.note = 'Bỏ qua bởi admin';
      return manager.save(pending);
    });
  }
}
