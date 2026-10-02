import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountStatus } from './account.entity';
import { campusDate } from '../../common/utils/payment';
import { Student } from '../students/student.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  async create(student: Student): Promise<Account> {
    const account = this.repo.create({
      student,
      studentId: student.id,
      balance: 0,
      dailyLimit: 500000,
      dailySpent: 0,
    });
    return this.repo.save(account);
  }

  async createAccountIfNotExists(studentId: string): Promise<Account> {
    const existing = await this.repo.findOne({ where: { studentId } });
    if (existing) return existing;

    const account = this.repo.create({
      studentId,
      balance: 0,
      dailyLimit: 500000,
      dailySpent: 0,
    });
    return this.repo.save(account);
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
