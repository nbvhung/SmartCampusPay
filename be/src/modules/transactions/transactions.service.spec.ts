import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TransactionsService } from './transactions.service';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './transaction.entity';
import { Student } from '../students/student.entity';
import { campusDate } from '../../common/utils/payment';
import { Account, AccountStatus } from '../accounts/account.entity';
import { CardsService } from '../cards/cards.service';
import { RedisService } from '../redis/redis.service';

describe('TransactionsService money path', () => {
  const dto = {
    studentCode: 'B23DCCN358',
    amount: 25_000,
    idempotencyKey: '3c9b1e2a-aaaa-4bbb-8ccc-dddddddddddd',
  };
  const merchantId = 'merchant-1';
  let repo: any;
  let manager: any;
  let dataSource: any;
  let redis: any;
  let service: TransactionsService;

  beforeEach(async () => {
    repo = { findOne: jest.fn().mockResolvedValue(null) };
    manager = {
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === Transaction) return null;
        if (entity === Student)
          return {
            id: 'student-1',
            studentCode: dto.studentCode,
            isActive: true,
          };
        if (entity === Account)
          return {
            id: 'account-1',
            studentId: 'student-1',
            balance: 100_000,
            dailySpent: 10_000,
            dailySpentDate: campusDate(),
            dailyLimit: 500_000,
            status: AccountStatus.ACTIVE,
          };
      }),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (value) => value),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation, callback) => callback(manager)),
    };
    redis = {
      acquireLock: jest.fn().mockResolvedValue('lock-token'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
        { provide: CardsService, useValue: {} },
        { provide: RedisService, useValue: redis },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(TransactionsService);
  });

  it('debits the account and creates the transaction atomically', async () => {
    const result = await service.pay(dto, merchantId);

    expect(dataSource.transaction).toHaveBeenCalledWith(
      'READ COMMITTED',
      expect.any(Function),
    );
    const savedAccount = manager.save.mock.calls[0][0];
    expect(savedAccount.balance).toBe(75_000);
    expect(savedAccount.dailySpent).toBe(35_000);
    expect(result).toMatchObject({
      amount: 25_000,
      balanceBefore: 100_000,
      balanceAfter: 75_000,
      merchantId,
      status: TransactionStatus.SUCCESS,
      type: TransactionType.DEBIT,
    });
  });

  it('returns the previous transaction for an identical retry', async () => {
    const existing = {
      ...dto,
      merchantId,
      type: TransactionType.DEBIT,
      status: TransactionStatus.SUCCESS,
    } as Transaction;
    repo.findOne.mockResolvedValue(existing);

    await expect(service.pay(dto, merchantId)).resolves.toBe(existing);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key with a different payload', async () => {
    repo.findOne.mockResolvedValue({
      ...dto,
      amount: 30_000,
      merchantId,
      type: TransactionType.DEBIT,
    } as Transaction);

    await expect(service.pay(dto, merchantId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('lets the database transaction roll back when saving the ledger fails', async () => {
    manager.save
      .mockImplementationOnce(async (value) => value)
      .mockRejectedValueOnce(new Error('database write failed'));

    await expect(service.pay(dto, merchantId)).rejects.toThrow(
      'database write failed',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
