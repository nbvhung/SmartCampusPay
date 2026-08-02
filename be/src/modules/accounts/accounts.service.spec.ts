import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import { Account, AccountStatus } from './account.entity';
import { Student } from '../students/student.entity';

describe('AccountsService', () => {
  let service: AccountsService;
  let repo: jest.Mocked<Repository<Account>>;

  const mockStudent = { id: 'student-uuid' } as Student;

  const createMockAccount = (overrides: Partial<Account> = {}): Account => ({
    id: 'account-uuid',
    balance: 100000,
    dailyLimit: 500000,
    dailySpent: 0,
    status: AccountStatus.ACTIVE,
    studentId: 'student-uuid',
    student: mockStudent,
    transactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: getRepositoryToken(Account),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
    repo = module.get(getRepositoryToken(Account));
  });

  describe('getBalance', () => {
    it('should return balance for active account', async () => {
      repo.findOne.mockResolvedValue(createMockAccount({ balance: 250000 }));
      const result = await service.getBalance('student-uuid');
      expect(result).toEqual({ balance: 250000 });
    });

    it('should throw if account not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getBalance('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('topup', () => {
    it('should add balance to active account', async () => {
      const account = createMockAccount({ balance: 50000 });
      repo.findOne.mockResolvedValue(account);
      repo.save.mockResolvedValue({ ...account, balance: 150000 });

      const result = await service.topup('student-uuid', 100000);
      expect(result.balance).toBe(150000);
    });

    it('should throw if amount is not positive', async () => {
      await expect(service.topup('student-uuid', -1000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if account is frozen', async () => {
      repo.findOne.mockResolvedValue(
        createMockAccount({ status: AccountStatus.FROZEN }),
      );
      await expect(service.topup('student-uuid', 50000)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('debit', () => {
    it('should deduct balance within limit', async () => {
      const account = createMockAccount({ balance: 200000, dailySpent: 50000 });
      repo.findOne.mockResolvedValue(account);
      repo.save.mockResolvedValue({
        ...account,
        balance: 150000,
        dailySpent: 100000,
      });

      const result = await service.debit('student-uuid', 50000);
      expect(result.balance).toBe(150000);
      expect(result.dailySpent).toBe(100000);
    });

    it('should throw if insufficient balance', async () => {
      repo.findOne.mockResolvedValue(createMockAccount({ balance: 10000 }));
      await expect(service.debit('student-uuid', 50000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if daily limit exceeded', async () => {
      repo.findOne.mockResolvedValue(
        createMockAccount({
          balance: 500000,
          dailySpent: 480000,
          dailyLimit: 500000,
        }),
      );
      await expect(service.debit('student-uuid', 50000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if account is not active', async () => {
      repo.findOne.mockResolvedValue(
        createMockAccount({ status: AccountStatus.FROZEN }),
      );
      await expect(service.debit('student-uuid', 10000)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resetDailySpent', () => {
    it('should reset dailySpent to 0 for all accounts', async () => {
      repo.update.mockResolvedValue({ affected: 5 } as any);
      await service.resetDailySpent();
      expect(repo.update).toHaveBeenCalledWith({}, { dailySpent: 0 });
    });
  });
});
