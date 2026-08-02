import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Account } from '../accounts/account.entity';
import { CardStatus } from '../cards/card.entity';
import { SePayService } from '../sepay/sepay.service';
import { CardsService } from '../cards/cards.service';
import { StudentsService } from '../students/students.service';
import { TopupQrDto } from './dto/topup-qr.dto';

@Injectable()
export class HardwareDeviceService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly sepayService: SePayService,
    private readonly cardsService: CardsService,
    private readonly studentsService: StudentsService,
  ) {}

  async getStudentByUid(uid: string): Promise<{
    studentCode: string;
    fullName: string;
  }> {
    const card = await this.cardsService.findByUid(uid);
    if (card.status !== CardStatus.ACTIVE) {
      throw new BadRequestException('Thẻ không hoạt động');
    }
    const student = card.student;
    if (!student) throw new NotFoundException('Thẻ chưa liên kết sinh viên');
    if (!student.isActive) throw new BadRequestException('Sinh viên bị khóa');

    return { studentCode: student.studentCode, fullName: student.fullName };
  }

  async createTopupQr(body: TopupQrDto): Promise<{
    referenceCode: string;
    qrUrl: string;
    amount: number;
    expiresAt: string;
  }> {
    const studentCode = await this.resolveStudentCode(body);
    return this.sepayService.createDevicePayment(studentCode);
  }

  async getTopupStatus(refCode: string): Promise<{
    status: string;
    amount: number;
    balance: number | null;
    studentCode: string;
  }> {
    const tx = await this.txRepo.findOne({
      where: { referenceCode: refCode },
    });
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch nạp tiền');

    const account = await this.accountRepo.findOne({
      where: { studentId: tx.studentId },
    });

    return {
      status: tx.status,
      amount: tx.amount,
      balance: account ? account.balance : null,
      studentCode: tx.studentCode,
    };
  }

  getStaticQr() {
    return this.sepayService.createStaticQr();
  }

  private async resolveStudentCode(body: TopupQrDto): Promise<string> {
    if (body.studentCode) {
      const student = await this.studentsService.findByCode(body.studentCode);
      if (!student || !student.isActive) {
        throw new BadRequestException('Sinh viên không tồn tại hoặc bị khóa');
      }
      return student.studentCode;
    }

    if (body.cardUid) {
      const card = await this.cardsService.findByUid(body.cardUid);
      if (card.status !== CardStatus.ACTIVE) {
        throw new BadRequestException('Thẻ không hoạt động');
      }
      const student = card.student;
      if (!student || !student.isActive) {
        throw new BadRequestException('Sinh viên bị khóa');
      }
      return student.studentCode;
    }

    throw new BadRequestException('Cần cung cấp cardUid hoặc studentCode');
  }
}
