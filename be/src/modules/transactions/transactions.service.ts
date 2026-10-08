import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './transaction.entity';
import { Student } from '../students/student.entity';
import { Account, AccountStatus } from '../accounts/account.entity';
import { Merchant } from '../merchants/merchant.entity';
import { CardsService } from '../cards/cards.service';
import { Card, CardStatus } from '../cards/card.entity';
import { RedisService } from '../redis/redis.service';
import { PayDto } from './dto/pay.dto';
import { campusDate, normalizeUid } from '../../common/utils/payment';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly cardsService: CardsService,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async pay(
    dto: PayDto & { cardUid?: string },
    merchantId: string,
  ): Promise<Transaction> {
    if (
      !Number.isSafeInteger(dto.amount) ||
      dto.amount < 100 ||
      dto.amount > 10000000
    )
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Invalid amount',
      });
    const lockKey = `idem:${dto.idempotencyKey}`;
    const lockToken = await this.redis.acquireLock(lockKey, 15);
    if (!lockToken) {
      this.logger.warn(`Contention on idempotencyKey: ${dto.idempotencyKey}`);
      const existing = await this.repo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing)
        return this.validateIdempotentReplay(existing, dto, merchantId);
      throw new ServiceUnavailableException({
        code: 'PAYMENT_IN_PROGRESS',
        message: 'Request in progress. Retry with the same key.',
      });
    }

    try {
      const existing = await this.repo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        this.logger.warn(`Duplicate transaction: ${dto.idempotencyKey}`);
        return this.validateIdempotentReplay(existing, dto, merchantId);
      }

      return await this.dataSource.transaction('READ COMMITTED', (manager) =>
        this.executePayment(manager, dto, merchantId),
      );
    } catch (error) {
      // Redis is only an optimization. The database unique constraint is the
      // final arbiter when two instances race with the same idempotency key.
      if (this.isUniqueViolation(error)) {
        const existing = await this.repo.findOne({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing)
          return this.validateIdempotentReplay(existing, dto, merchantId);
      }
      throw error;
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  private async executePayment(
    manager: EntityManager,
    dto: PayDto & { cardUid?: string },
    merchantId: string,
  ): Promise<Transaction> {
    const existing = await manager.findOne(Transaction, {
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing)
      return this.validateIdempotentReplay(existing, dto, merchantId);

    const student = await manager.findOne(Student, {
      where: { studentCode: dto.studentCode },
      lock: { mode: 'pessimistic_read' },
    });
    if (!student || !student.isActive)
      throw new BadRequestException('Invalid student');

    let paymentCard: Card | null = null;
    if (dto.cardUid) {
      paymentCard = await manager.findOne(Card, {
        where: { uid: dto.cardUid },
        // The successful debit also updates lastUsedAt. Take the write lock
        // up front so concurrent taps cannot deadlock while upgrading a
        // shared Card lock after one request has locked the wallet.
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !paymentCard ||
        paymentCard.status !== CardStatus.ACTIVE ||
        paymentCard.studentId !== student.id
      )
        throw new BadRequestException('Card is not active');
    }

    // Serializes all balance changes for this wallet. Balance validation and
    // both writes are committed or rolled back as a single database unit.
    const account = await manager.findOne(Account, {
      where: { studentId: student.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!account) throw new BadRequestException('Account not found');
    // A concurrent replay may have committed while this request waited for
    // the wallet. Check again before applying balance/status validation.
    const committed = await manager.findOne(Transaction, {
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (committed)
      return this.validateIdempotentReplay(committed, dto, merchantId);
    if (account.status !== AccountStatus.ACTIVE)
      throw new BadRequestException('Account is frozen');
    if (account.balance < dto.amount)
      throw new BadRequestException('Insufficient balance');
    const today = campusDate();
    if (account.dailySpentDate !== today) {
      account.dailySpent = 0;
      account.dailySpentDate = today;
    }
    if (account.dailySpent + dto.amount > account.dailyLimit)
      throw new BadRequestException('Daily limit exceeded');

    const balanceBefore = account.balance;
    account.balance = balanceBefore - dto.amount;
    account.dailySpent += dto.amount;
    await manager.save(account);

    const transaction = await manager.save(
      manager.create(Transaction, {
        amount: dto.amount,
        balanceBefore,
        balanceAfter: account.balance,
        type: TransactionType.DEBIT,
        status: TransactionStatus.SUCCESS,
        idempotencyKey: dto.idempotencyKey,
        description: dto.description || 'Payment',
        studentCode: student.studentCode,
        studentId: student.id,
        accountId: account.id,
        merchantId,
        cardUid: dto.cardUid ?? null,
      }),
    );
    if (paymentCard) {
      await manager.update(
        Card,
        { id: paymentCard.id },
        { lastUsedAt: new Date() },
      );
    }
    return transaction;
  }

  private validateIdempotentReplay(
    existing: Transaction,
    dto: PayDto & { cardUid?: string },
    merchantId: string,
  ): Transaction {
    if (
      existing.merchantId !== merchantId ||
      existing.studentCode !== dto.studentCode ||
      Number(existing.amount) !== Number(dto.amount) ||
      existing.type !== TransactionType.DEBIT ||
      (existing.cardUid ?? null) !== (dto.cardUid ?? null)
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different request',
      );
    }
    return existing;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }

  async payByCard(
    cardUid: string,
    merchantId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<Transaction> {
    cardUid = normalizeUid(cardUid);
    const existing = await this.repo.findOne({ where: { idempotencyKey } });
    if (existing) {
      return this.validateIdempotentReplay(
        existing,
        {
          studentCode: existing.studentCode,
          cardUid,
          amount,
          idempotencyKey,
        },
        merchantId,
      );
    }
    const card = await this.cardsService.findByUid(cardUid);
    if (card.status !== CardStatus.ACTIVE)
      throw new BadRequestException('Card is not active');
    if (!card.student) throw new BadRequestException('Invalid student');
    return this.pay(
      {
        studentCode: card.student.studentCode,
        cardUid,
        amount,
        idempotencyKey,
      },
      merchantId,
    );
  }

  async findPayment(
    idempotencyKey: string,
    merchantId: string,
  ): Promise<Transaction> {
    const tx = await this.repo.findOne({
      where: { idempotencyKey, merchantId, type: TransactionType.DEBIT },
    });
    if (!tx)
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message:
          'Payment not found. Retry the original request with the same key.',
      });
    return tx;
  }

  async findByStudent(studentCode: string): Promise<Transaction[]> {
    return this.repo.find({
      where: { studentCode, status: TransactionStatus.SUCCESS },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findAll(): Promise<Transaction[]> {
    return this.repo.find({
      withDeleted: true,
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
      .addSelect(
        "COUNT(CASE WHEN tx.status = 'success' THEN 1 END)",
        'successCount',
      )
      .where('tx.createdAt >= :today', { today })
      .getRawOne();

    const dailyKeys = await this.redis.get('stats:daily:keys');
    return {
      ...result,
      realtimeTxCount: dailyKeys ? parseInt(dailyKeys, 10) : 0,
    };
  }

  async getStats(): Promise<{
    totalTransactions: number;
    totalRevenue: number;
    todayTransactions: number;
    todayRevenue: number;
    totalStudents: number;
    totalMerchants: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total transactions & revenue
    const totalStats = await this.repo
      .createQueryBuilder('tx')
      .select('COUNT(*)', 'totalTransactions')
      .addSelect(
        "COALESCE(SUM(CASE WHEN tx.status = 'success' AND tx.type = 'debit' THEN tx.amount ELSE 0 END), 0)",
        'totalRevenue',
      )
      .getRawOne();

    // Today's transactions & revenue
    const todayStats = await this.repo
      .createQueryBuilder('tx')
      .select('COUNT(*)', 'todayTransactions')
      .addSelect(
        "COALESCE(SUM(CASE WHEN tx.status = 'success' AND tx.type = 'debit' THEN tx.amount ELSE 0 END), 0)",
        'todayRevenue',
      )
      .where('tx.createdAt >= :today', { today })
      .getRawOne();

    // Count students & merchants via DataSource (entity class, không dùng string)
    const studentCount = await this.dataSource.getRepository(Student).count();
    const merchantCount = await this.dataSource.getRepository(Merchant).count();

    return {
      totalTransactions: parseInt(totalStats.totalTransactions, 10) || 0,
      totalRevenue: parseInt(totalStats.totalRevenue, 10) || 0,
      todayTransactions: parseInt(todayStats.todayTransactions, 10) || 0,
      todayRevenue: parseInt(todayStats.todayRevenue, 10) || 0,
      totalStudents: studentCount,
      totalMerchants: merchantCount,
    };
  }

  /**
   * Trả dữ liệu doanh thu + số giao dịch theo từng ngày trong N ngày gần nhất.
   * Dùng cho biểu đồ Admin Dashboard.
   */
  async getChartData(days = 7): Promise<
    {
      date: string;
      revenue: number;
      transactions: number;
      topups: number;
    }[]
  > {
    const result: {
      date: string;
      revenue: number;
      transactions: number;
      topups: number;
    }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const from = new Date();
      from.setDate(from.getDate() - i);
      from.setHours(0, 0, 0, 0);

      const to = new Date(from);
      to.setHours(23, 59, 59, 999);

      const row = await this.repo
        .createQueryBuilder('tx')
        .select(
          "COALESCE(SUM(CASE WHEN tx.status = 'success' AND tx.type = 'debit' THEN tx.amount ELSE 0 END), 0)",
          'revenue',
        )
        .addSelect(
          "COUNT(CASE WHEN tx.status = 'success' AND tx.type = 'debit' THEN 1 END)",
          'transactions',
        )
        .addSelect(
          "COUNT(CASE WHEN tx.status = 'success' AND tx.type = 'credit' THEN 1 END)",
          'topups',
        )
        .where('tx.createdAt BETWEEN :from AND :to', { from, to })
        .getRawOne();

      result.push({
        date: from.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
        }),
        revenue: parseInt(row.revenue, 10) || 0,
        transactions: parseInt(row.transactions, 10) || 0,
        topups: parseInt(row.topups, 10) || 0,
      });
    }

    return result;
  }
}
