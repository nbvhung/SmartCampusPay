import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountStatus } from './account.entity';
import { campusDate } from '../../common/utils/payment';
import { Student } from '../students/student.entity';
import { Transaction } from '../transactions/transaction.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  async create(student: Student): Promise<Account> {
    return this.createAccountIfNotExists(student.id);
  }

  async createAccountIfNotExists(
    studentId: string,
    allowArchived = false,
  ): Promise<Account> {
    return this.repo.manager.transaction(async (manager) => {
      const student = await manager.findOne(Student, {
        where: { id: studentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!student) throw new NotFoundException('Không tìm thấy sinh viên');
      const existing = await manager.findOne(Account, {
        where: { studentId },
        withDeleted: true,
      });
      if (existing) {
        if (existing.deletedAt && !allowArchived) {
          throw new ConflictException(
            'Ví đã được xóa; không thể tự động tạo lại ví này',
          );
        }
        return existing;
      }
      return manager.save(
        Account,
        manager.create(Account, {
          studentId,
          balance: 0,
          dailyLimit: 500000,
          dailySpent: 0,
        }),
      );
    });
  }

  async remove(id: string): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) throw new NotFoundException('Không tìm thấy ví');
      if (account.balance !== 0) {
        throw new ConflictException(
          'Ví còn số dư. Cần xử lý hết số dư trước khi xóa ví',
        );
      }
      if (await manager.exists(Transaction, { where: { accountId: id } })) {
        throw new ConflictException(
          'Ví đã có lịch sử giao dịch nên không thể xóa vĩnh viễn. Hãy dùng “Đóng băng” để ngừng sử dụng ví',
        );
      }
      await manager.delete(Account, id);
    });
  }

  async findAll(): Promise<Account[]> {
    return this.repo.find({ relations: { student: true } });
  }

  async findByStudentId(studentId: string): Promise<Account> {
    const account = await this.repo.findOne({ where: { studentId } });
    if (!account) throw new NotFoundException('Account not found for student');
    return account;
  }

  async getBalance(studentId: string): Promise<{ balance: number }> {
    const account = await this.findByStudentId(studentId);
    return { balance: account.balance };
  }

  // Balance writes belong to TransactionsService/SePayService with a ledger.
  async resetDailySpent(): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Account)
      .set({ dailySpent: 0, dailySpentDate: campusDate() })
      .where('"dailySpentDate" IS NULL OR "dailySpentDate" < :today', {
        today: campusDate(),
      })
      .execute();
  }

  async toggleFreeze(id: string): Promise<Account> {
    return this.repo.manager.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) throw new NotFoundException('Account not found');
      if (account.status === AccountStatus.CLOSED)
        throw new BadRequestException('Account is closed');
      account.status =
        account.status === AccountStatus.ACTIVE
          ? AccountStatus.FROZEN
          : AccountStatus.ACTIVE;
      return manager.save(account);
    });
  }
}
