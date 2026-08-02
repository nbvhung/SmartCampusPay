import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TopupPending, TopupPendingStatus } from './topup-pending.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { Account, AccountStatus } from '../accounts/account.entity';
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
  }): Promise<TopupPending> {
    const existing = await this.repo.findOne({
      where: { transferId: input.transferId },
    });
    if (existing) return existing;

    const entity = this.repo.create({
      ...input,
      status: TopupPendingStatus.PENDING,
    });
    return this.repo.save(entity);
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
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOne(TopupPending, { where: { id } });
      if (!pending)
        throw new NotFoundException('Không tìm thấy giao dịch chưa khớp');
      if (pending.status !== TopupPendingStatus.PENDING) {
        throw new BadRequestException('Giao dịch đã được xử lý');
      }

      const student = await manager.findOne(Student, {
        where: { studentCode },
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
      });
      if (!account)
        throw new NotFoundException('Không tìm thấy ví của sinh viên');
      if (account.status !== AccountStatus.ACTIVE)
        throw new BadRequestException('Ví đang bị đóng băng');

      account.balance = Number(account.balance) + Number(pending.amount);
      await manager.save(account);

      const tx = manager.create(Transaction, {
        amount: pending.amount,
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
        idempotencyKey: idemKey,
        description: `Nạp tiền qua ngân hàng (xử lý thủ công) - ${pending.content}`,
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
    });
  }

  async ignore(id: string, adminId: string): Promise<TopupPending> {
    const pending = await this.repo.findOne({ where: { id } });
    if (!pending)
      throw new NotFoundException('Không tìm thấy giao dịch chưa khớp');
    if (pending.status !== TopupPendingStatus.PENDING) {
      throw new BadRequestException('Giao dịch đã được xử lý');
    }

    pending.status = TopupPendingStatus.IGNORED;
    pending.adminId = adminId;
    pending.note = 'Bỏ qua bởi admin';
    return this.repo.save(pending);
  }
}
