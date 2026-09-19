import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './transaction.entity';
import { Student } from '../students/student.entity';
import { Merchant } from '../merchants/merchant.entity';
import { StudentsService } from '../students/students.service';
import { AccountsService } from '../accounts/accounts.service';
import { CardsService } from '../cards/cards.service';
import { RedisService } from '../redis/redis.service';
import { PayDto } from './dto/pay.dto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly studentsService: StudentsService,
    private readonly accountsService: AccountsService,
    private readonly cardsService: CardsService,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async pay(dto: PayDto, merchantId: string): Promise<Transaction> {
    const lockKey = `idem:${dto.idempotencyKey}`;
    const locked = await this.redis.acquireLock(lockKey, 5);
    if (!locked) {
      this.logger.warn(`Contention on idempotencyKey: ${dto.idempotencyKey}`);
      const existing = await this.repo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
      throw new BadRequestException('Request in progress. Try again.');
    }

    try {
      const existing = await this.repo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        this.logger.warn(`Duplicate transaction: ${dto.idempotencyKey}`);
        return existing;
      }

      const student = await this.studentsService.findByCode(dto.studentCode);
      if (!student || !student.isActive)
        throw new BadRequestException('Invalid student');

      const account = await this.accountsService.findByStudentId(student.id);
      if (account.status !== 'active')
        throw new BadRequestException('Account is frozen');

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

  async payByCard(
    cardUid: string,
    merchantId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<Transaction> {
    const card = await this.cardsService.findByUid(cardUid);
    if (card.status !== 'active')
      throw new BadRequestException('Card is not active');

    return this.pay(
      {
        studentCode: card.student.studentCode,
        merchantId,
        amount,
        idempotencyKey,
      },
      merchantId,
    );
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
        "COALESCE(SUM(CASE WHEN tx.status = 'success' THEN tx.amount ELSE 0 END), 0)",
        'totalRevenue',
      )
      .getRawOne();

    // Today's transactions & revenue
    const todayStats = await this.repo
      .createQueryBuilder('tx')
      .select('COUNT(*)', 'todayTransactions')
      .addSelect(
        "COALESCE(SUM(CASE WHEN tx.status = 'success' THEN tx.amount ELSE 0 END), 0)",
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
    const result: { date: string; revenue: number; transactions: number; topups: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const from = new Date();
      from.setDate(from.getDate() - i);
      from.setHours(0, 0, 0, 0);

      const to = new Date(from);
      to.setHours(23, 59, 59, 999);

      const row = await this.repo
        .createQueryBuilder('tx')
        .select("COALESCE(SUM(CASE WHEN tx.status = 'success' AND tx.type = 'debit' THEN tx.amount ELSE 0 END), 0)", 'revenue')
        .addSelect("COUNT(CASE WHEN tx.status = 'success' AND tx.type = 'debit' THEN 1 END)", 'transactions')
        .addSelect("COUNT(CASE WHEN tx.status = 'success' AND tx.type = 'credit' THEN 1 END)", 'topups')
        .where('tx.createdAt BETWEEN :from AND :to', { from, to })
        .getRawOne();

      result.push({
        date: from.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: parseInt(row.revenue, 10) || 0,
        transactions: parseInt(row.transactions, 10) || 0,
        topups: parseInt(row.topups, 10) || 0,
      });
    }

    return result;
  }
}
