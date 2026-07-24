import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';
import { StudentsService } from '../students/students.service';
import { AccountsService } from '../accounts/accounts.service';
import { CardsService } from '../cards/cards.service';
import { RedisService } from '../redis/redis.service';
import { PayDto } from './dto/pay.dto';
import { TopupDto } from './dto/topup.dto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly studentsService: StudentsService,
    private readonly accountsService: AccountsService,
    private readonly cardsService: CardsService,
    private readonly redis: RedisService,
  ) {}

  async pay(dto: PayDto, merchantId: string): Promise<Transaction> {
    const lockKey = `idem:${dto.idempotencyKey}`;
    const locked = await this.redis.acquireLock(lockKey, 5);
    if (!locked) {
      this.logger.warn(`Contention on idempotencyKey: ${dto.idempotencyKey}`);
      const existing = await this.repo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return existing;
      throw new BadRequestException('Request in progress. Try again.');
    }

    try {
      const existing = await this.repo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) {
        this.logger.warn(`Duplicate transaction: ${dto.idempotencyKey}`);
        return existing;
      }

      const student = await this.studentsService.findByCode(dto.studentCode);
      if (!student || !student.isActive) throw new BadRequestException('Invalid student');

      const account = await this.accountsService.findByStudentId(student.id);
      if (account.status !== 'active') throw new BadRequestException('Account is frozen');

      await this.accountsService.debit(student.id, dto.amount);

      const tx = this.repo.create({
        amount: dto.amount,
        type: TransactionType.DEBIT,
        status: TransactionStatus.SUCCESS,
        idempotencyKey: dto.idempotencyKey,
        description: dto.description || 'Payment',
        studentCode: dto.studentCode,
        studentId: student.id,
        accountId: account.id,
        merchantId,
      });
      return this.repo.save(tx);
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  async payByCard(cardUid: string, merchantId: string, amount: number, idempotencyKey: string): Promise<Transaction> {
    const lockKey = `idem:${idempotencyKey}`;
    const locked = await this.redis.acquireLock(lockKey, 5);
    if (!locked) {
      const existing = await this.repo.findOne({ where: { idempotencyKey } });
      if (existing) return existing;
      throw new BadRequestException('Request in progress. Try again.');
    }

    try {
      const existing = await this.repo.findOne({ where: { idempotencyKey } });
      if (existing) return existing;

      const card = await this.cardsService.findByUid(cardUid);
      if (card.status !== 'active') throw new BadRequestException('Card is not active');

      return this.pay({ studentCode: card.student.studentCode, merchantId, amount, idempotencyKey }, merchantId);
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  async topup(dto: TopupDto, _adminId: string): Promise<Transaction> {
    const student = await this.studentsService.findByCode(dto.studentCode);
    if (!student) throw new NotFoundException('Student not found');

    await this.accountsService.topup(student.id, dto.amount);

    const tx = this.repo.create({
      amount: dto.amount,
      type: TransactionType.CREDIT,
      status: TransactionStatus.SUCCESS,
      idempotencyKey: `topup_${student.id}_${Date.now()}`,
      description: dto.description || 'Top-up',
      studentCode: dto.studentCode,
      studentId: student.id,
      accountId: (await this.accountsService.findByStudentId(student.id)).id,
    });
    return this.repo.save(tx);
  }

  async findByStudent(studentCode: string): Promise<Transaction[]> {
    return this.repo.find({
      where: { studentCode },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findAll(): Promise<Transaction[]> {
    return this.repo.find({
      relations: { student: true, merchant: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getDailyStats(): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await this.repo
      .createQueryBuilder('tx')
      .select('COUNT(*)', 'totalTransactions')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'totalAmount')
      .addSelect('COUNT(CASE WHEN tx.status = \'success\' THEN 1 END)', 'successCount')
      .where('tx.createdAt >= :today', { today })
      .getRawOne();

    const dailyKeys = await this.redis.get('stats:daily:keys');
    return { ...result, realtimeTxCount: dailyKeys ? parseInt(dailyKeys, 10) : 0 };
  }
}
