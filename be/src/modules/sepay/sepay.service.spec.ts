import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SePayService } from './sepay.service';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { Account, AccountStatus } from '../accounts/account.entity';
import { Student } from '../students/student.entity';
import { AccountsService } from '../accounts/accounts.service';
import { StudentsService } from '../students/students.service';
import { TopupPendingService } from '../topup-pending/topup-pending.service';
import { RedisService } from '../redis/redis.service';

describe('SePayService (webhook)', () => {
  let service: SePayService;
  let txRepo: jest.Mocked<Partial<Repository<Transaction>>>;
  let studentsService: jest.Mocked<Partial<StudentsService>>;
  let topupPendingService: jest.Mocked<Partial<TopupPendingService>>;
  let redis: jest.Mocked<Partial<RedisService>>;
  let dataSource: any;

  const activeStudent = {
    id: 'stu-1',
    studentCode: '20210012',
    fullName: 'Nguyen Van A',
    isActive: true,
  } as Student;

  const fakeManager = () => ({
    findOne: jest.fn().mockImplementation(async (_entity: any) => ({
      id: 'acc-1',
      studentId: 'stu-1',
      balance: 1000,
      status: AccountStatus.ACTIVE,
    })),
    save: jest.fn().mockImplementation(async (e: any) => e),
    create: jest.fn().mockImplementation((_entity: any, data: any) => data),
  });

  beforeEach(async () => {
    txRepo = { findOne: jest.fn().mockResolvedValue(null) };
    studentsService = { findByCode: jest.fn() };
    topupPendingService = { createFromWebhook: jest.fn().mockResolvedValue({}) };
    redis = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SePayService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: AccountsService, useValue: { findByStudentId: jest.fn() } },
        { provide: StudentsService, useValue: studentsService },
        { provide: TopupPendingService, useValue: topupPendingService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<SePayService>(SePayService);
  });

  it('bỏ qua giao dịch không phải tiền vào', async () => {
    const result = await service.handleWebhook({
      id: 1,
      transferType: 'out',
      transferAmount: 50000,
      content: 'Rut tien',
    });
    expect(result).toEqual({ message: 'ignored' });
  });

  it('khớp theo mã sinh viên thì cộng tiền vào ví', async () => {
    studentsService.findByCode = jest.fn().mockResolvedValue(activeStudent);
    const manager = fakeManager();
    dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

    const result = await service.handleWebhook({
      id: 100,
      transferType: 'in',
      transferAmount: 50000,
      content: 'Nap tien 20210012',
      sender: 'NGUYEN VAN A',
    });

    expect(result).toEqual({ message: 'success' });
    expect(studentsService.findByCode).toHaveBeenCalledWith('20210012');
    expect(manager.save).toHaveBeenCalled();
  });

  it('không khớp refCode/mã SV thì đưa vào hàng đợi', async () => {
    studentsService.findByCode = jest.fn().mockResolvedValue(null);

    const result = await service.handleWebhook({
      id: 101,
      transferType: 'in',
      transferAmount: 30000,
      content: 'Chuyen tien khong ghi ma',
    });

    expect(result).toEqual({ message: 'pending_match' });
    expect(topupPendingService.createFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: '101', amount: 30000, content: 'Chuyen tien khong ghi ma' }),
    );
  });

  it('khớp mã SV có chữ cái (B23DCCN358) qua nội dung QR tĩnh', async () => {
    const stu = {
      id: 'stu-1',
      studentCode: 'B23DCCN358',
      fullName: 'Nguyen Ba Viet Hung',
      isActive: true,
    } as Student;
    studentsService.findByCode = jest.fn().mockResolvedValue(stu);
    const manager = fakeManager();
    dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

    const result = await service.handleWebhook({
      id: 200,
      transferType: 'in',
      transferAmount: 40000,
      content: 'Nap tien B23DCCN358',
    });

    expect(result).toEqual({ message: 'success' });
    expect(studentsService.findByCode).toHaveBeenCalledWith('B23DCCN358');
    expect(manager.save).toHaveBeenCalled();
  });

  it('khớp theo refCode (QR động) và cộng tiền', async () => {
    const pendingTx = {
      id: 'tx-1',
      studentId: 'stu-1',
      studentCode: '20210012',
      amount: 50000,
      status: TransactionStatus.PENDING,
    } as Transaction;
    txRepo.findOne = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(pendingTx);

    const manager = fakeManager();
    dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

    const result = await service.handleWebhook({
      id: 102,
      transferType: 'in',
      transferAmount: 50000,
      content: 'SCP20210012ABCDEF',
    });

    expect(result).toEqual({ message: 'success' });
    expect(manager.save).toHaveBeenCalled();
  });
});
