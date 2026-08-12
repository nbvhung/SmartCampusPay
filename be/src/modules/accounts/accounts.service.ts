import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountStatus } from './account.entity';
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

  async topup(studentId: string, amount: number): Promise<Account> {
    if (amount <= 0) throw new BadRequestException('Invalid amount');
    const account = await this.findByStudentId(studentId);
    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Account is not active');
    }
    account.balance += amount;
    return this.repo.save(account);
  }

  async debit(studentId: string, amount: number): Promise<Account> {
    const account = await this.findByStudentId(studentId);
    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Account is not active');
    }
    if (account.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }
    if (account.dailySpent + amount > account.dailyLimit) {
      throw new BadRequestException('Daily limit exceeded');
    }
    account.balance -= amount;
    account.dailySpent += amount;
    return this.repo.save(account);
  }

  async resetDailySpent(): Promise<void> {
    await this.repo.update({}, { dailySpent: 0 });
  }

  async toggleFreeze(id: string): Promise<Account> {
    const account = await this.repo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    account.status =
      account.status === AccountStatus.ACTIVE
        ? AccountStatus.FROZEN
        : AccountStatus.ACTIVE;
    return this.repo.save(account);
  }
}
