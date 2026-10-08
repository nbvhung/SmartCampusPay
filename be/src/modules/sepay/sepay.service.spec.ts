import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SePayService } from './sepay.service';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.entity';
import { TopupPendingStatus } from '../topup-pending/topup-pending.entity';
import { Account, AccountStatus } from '../accounts/account.entity';
import { Student } from '../students/student.entity';

describe('SePay transfer inbox', () => {
  let service: SePayService;
  let inbox: any;
  let account: any;
  let qr: any;
  let manager: any;
  let student: any;
  let pendingService: any;
  const payload = {
    id: 102,
    transferType: 'in',
    transferAmount: 50000,
    content: 'SCP20210012ABCDEF',
    accountNumber: '123',
  };

  beforeEach(() => {
    student = { id: 'student-1', studentCode: '20210012', isActive: true };
    inbox = {
      id: 'inbox-1',
      transferId: '102',
      amount: 50000,
      content: payload.content,
      status: TopupPendingStatus.PENDING,
    };
    account = { id: 'account-1', balance: 1000, status: AccountStatus.ACTIVE };
    qr = {
      id: 'qr-1',
      studentId: student.id,
      studentCode: student.studentCode,
      amount: 50000,
      type: TransactionType.CREDIT,
      status: TransactionStatus.PENDING,
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
    };
    manager = {
      findOneOrFail: jest.fn(async () => inbox),
      findOne: jest.fn(async (entity, options) => {
        if (entity === Transaction)
          return options.where.referenceCode ? qr : null;
        if (entity === Account) return account;
        if (entity === Student) return student;
        return null;
      }),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? 'new-tx' })),
      create: jest.fn((_entity, value) => value),
    };
    pendingService = { createFromWebhook: jest.fn(async () => inbox) };
    service = new SePayService(
      new ConfigService({
        SEPAY_ACCOUNT_NUMBER: '123',
        SEPAY_API_KEY: 'secret',
      }),
      { transaction: async (cb) => cb(manager) } as DataSource,
      {} as any,
      {} as any,
      { findByCode: jest.fn(async () => student) } as any,
      pendingService,
      {} as any,
    );
  });

  it('credits a QR and records the bank transfer key atomically', async () => {
    expect(await service.handleWebhook(payload)).toEqual({
      message: 'success',
    });
    expect(account.balance).toBe(51000);
    expect(qr.idempotencyKey).toBe('sepay_102');
    expect(qr.balanceBefore).toBe(1000);
    expect(qr.balanceAfter).toBe(51000);
    expect(inbox.status).toBe(TopupPendingStatus.MATCHED);
    expect(inbox.transactionId).toBe('qr-1');
  });

  it('matches lowercase student codes in static QR transfer content', async () => {
    const content = 'QAKHGV3200 SEPAY18763 1 b23dccn358';
    student.studentCode = 'B23DCCN358';
    const lookup = jest.spyOn((service as any).studentsService, 'findByCode');
    lookup.mockImplementation(async (code) =>
      code === 'B23DCCN358' ? student : null,
    );
    inbox.content = content;
    await expect(
      service.handleWebhook({ ...payload, content }),
    ).resolves.toEqual({
      message: 'success',
    });
    expect(account.balance).toBe(51000);
    expect(inbox.studentId).toBe(student.id);
    expect(lookup).toHaveBeenCalledWith('B23DCCN358');
  });

  it('does not credit a duplicate bank transfer', async () => {
    inbox.status = TopupPendingStatus.MATCHED;
    expect(await service.handleWebhook(payload)).toEqual({
      message: 'already_processed',
    });
    expect(account.balance).toBe(1000);
  });

  it.each([
    [
      'cancelled',
      { status: TransactionStatus.FAILED },
      'reference_already_used_or_cancelled',
    ],
    [
      'already paid',
      { status: TransactionStatus.SUCCESS },
      'reference_already_used_or_cancelled',
    ],
    ['expired', { expiresAt: new Date(0) }, 'reference_expired'],
    ['wrong amount', { amount: 10000 }, 'amount_mismatch'],
  ])('queues money for a %s QR', async (_name, overrides, reason) => {
    Object.assign(qr, overrides);
    expect(await service.handleWebhook(payload)).toEqual({
      message: 'pending_match',
    });
    expect(inbox.note).toBe(reason);
    expect(account.balance).toBe(1000);
  });

  it('queues a transfer to a different recipient account', async () => {
    await service.handleWebhook({ ...payload, accountNumber: '456' });
    expect(inbox.note).toBe('recipient_account_mismatch');
    expect(account.balance).toBe(1000);
  });

  it('queues an out-of-range amount instead of discarding it', async () => {
    inbox.amount = 6000000;
    await service.handleWebhook({ ...payload, transferAmount: 6000000 });
    expect(inbox.note).toBe('amount_out_of_range');
    expect(account.balance).toBe(1000);
  });

  it('credits static QR by student code through the same inbox', async () => {
    inbox.content = 'Nap tien B23dccn358';
    await service.handleWebhook({ ...payload, content: inbox.content });
    expect(account.balance).toBe(51000);
    expect(inbox.status).toBe(TopupPendingStatus.MATCHED);
  });

  it('leaves a queued transfer for an admin decision on replay', async () => {
    inbox.note = 'student_not_found_or_inactive';
    await service.handleWebhook(payload);
    expect(account.balance).toBe(1000);
  });

  it.each([0, -10, 1.5, 'not-money'])(
    'rejects malformed amount %s',
    async (amount) => {
      await expect(
        service.handleWebhook({ ...payload, transferAmount: amount }),
      ).rejects.toThrow();
      expect(pendingService.createFromWebhook).not.toHaveBeenCalled();
    },
  );

  it('rejects missing IDs and invalid webhook authentication', async () => {
    await expect(
      service.handleWebhook({ ...payload, id: undefined }),
    ).rejects.toThrow();
    expect(() => service.verifyApiKey('Apikey wrong')).toThrow();
    expect(() => service.verifyApiKey('Apikey secret')).not.toThrow();
  });
});
