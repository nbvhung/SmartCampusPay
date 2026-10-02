import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import { Account, AccountStatus } from './account.entity';
import { campusDate } from '../../common/utils/payment';
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
    dailySpentDate: campusDate(),
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

  describe('toggleFreeze', () => {
    it('locks the wallet before changing status and preserves the balance', async () => {
      const account = createMockAccount({ balance: 75000 });
      const manager = {
        findOne: jest.fn().mockResolvedValue(account),
        save: jest.fn(async (value) => value),
      };
      Object.assign(repo, {
        manager: { transaction: jest.fn(async (cb) => cb(manager)) },
      });
      const result = await service.toggleFreeze(account.id);
      expect(manager.findOne).toHaveBeenCalledWith(Account, {
        where: { id: account.id },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result.status).toBe(AccountStatus.FROZEN);
      expect(result.balance).toBe(75000);
    });
  });
});
