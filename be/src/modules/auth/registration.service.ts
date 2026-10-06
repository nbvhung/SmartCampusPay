import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Account, AccountStatus } from '../accounts/account.entity';
import { Card, CardStatus } from '../cards/card.entity';
import { Student } from '../students/student.entity';
import { RegistrationOtpResponse } from './registration-otp.types';
import { RegistrationOtpService } from './registration-otp.service';

export interface RegistrationResult {
  studentCode: string;
  registeredAt: Date;
  mustChangePassword: true;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly otp: RegistrationOtpService,
  ) {}

  async requestOtp(
    studentCode: string,
    phone: string,
    clientId?: string,
  ): Promise<RegistrationOtpResponse> {
    const normalizedCode = this.normalizeStudentCode(studentCode);
    const normalizedPhone = phone.trim();
    const student = await this.students
      .createQueryBuilder('student')
      .addSelect('student.passwordHash')
      .where('UPPER(TRIM(student.studentCode)) = :studentCode', {
        studentCode: normalizedCode,
      })
      .getOne();

    this.assertStudentAvailable(student);
    await this.assertNoAccount(this.dataSource.manager, student.id);
    await this.assertPhysicalCard(this.dataSource.manager, student.id);

    return this.otp.requestOtp({
      studentId: student.id,
      phone: normalizedPhone,
      clientId: clientId?.trim() || undefined,
    });
  }

  async verify(
    registrationId: string,
    otp: string,
  ): Promise<RegistrationResult> {
    const identity = await this.otp.verifyOtp(registrationId, otp);

    let result: RegistrationResult;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const student = await manager
          .getRepository(Student)
          .createQueryBuilder('student')
          .addSelect('student.passwordHash')
          .where('student.id = :studentId', { studentId: identity.studentId })
          .setLock('pessimistic_write')
          .getOne();

        this.assertStudentAvailable(student);
        await this.assertNoAccount(manager, student.id);
        await this.assertPhysicalCard(manager, student.id);

        const registeredAt = new Date();
        student.phone = identity.phone;
        student.passwordHash = await bcrypt.hash(identity.phone, 10);
        student.mustChangePassword = true;
        student.registeredAt = registeredAt;
        await manager.save(Student, student);

        await manager.save(
          Account,
          manager.create(Account, {
            studentId: student.id,
            balance: 0,
            dailyLimit: 500000,
            dailySpent: 0,
            dailySpentDate: null,
            status: AccountStatus.ACTIVE,
          }),
        );

        return {
          studentCode: student.studentCode,
          registeredAt,
          mustChangePassword: true as const,
        };
      });
    } catch (error) {
      await this.releaseChallengeAfterRollback(registrationId);
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23505'
      ) {
        throw this.alreadyRegistered();
      }
      throw error;
    }

    try {
      await this.otp.consumeVerifiedOtp(registrationId);
    } catch {
      // PostgreSQL is authoritative after commit. Eligibility checks prevent the
      // unconsumed challenge from creating a second account.
      this.logger.error('Registration committed but OTP cleanup failed');
    }

    return result;
  }

  private assertStudentAvailable(
    student: Student | null,
  ): asserts student is Student {
    if (!student) {
      throw new NotFoundException({
        code: 'REGISTRATION_STUDENT_NOT_FOUND',
        message: 'Không tìm thấy sinh viên được cấp phát',
      });
    }
    if (!student.isActive) {
      throw new ForbiddenException({
        code: 'REGISTRATION_STUDENT_INACTIVE',
        message: 'Sinh viên đã ngừng hoạt động',
      });
    }
    if (student.registeredAt || student.passwordHash) {
      throw this.alreadyRegistered();
    }
  }

  private async assertNoAccount(
    manager: EntityManager,
    studentId: string,
  ): Promise<void> {
    const accountExists = await manager
      .getRepository(Account)
      .createQueryBuilder('account')
      .withDeleted()
      .where('account.studentId = :studentId', { studentId })
      .getExists();
    if (accountExists) throw this.alreadyRegistered();
  }

  private async assertPhysicalCard(
    manager: EntityManager,
    studentId: string,
  ): Promise<void> {
    const hasPhysicalCard = await manager
      .getRepository(Card)
      .createQueryBuilder('card')
      .where('card.studentId = :studentId', { studentId })
      .andWhere('card.status = :status', { status: CardStatus.ACTIVE })
      .andWhere('UPPER(card.uid) NOT LIKE :mockPrefix', {
        mockPrefix: 'MOCK-%',
      })
      .getExists();
    if (!hasPhysicalCard) {
      throw new ConflictException({
        code: 'REGISTRATION_PHYSICAL_CARD_REQUIRED',
        message: 'Sinh viên chưa có thẻ vật lý đang hoạt động',
      });
    }
  }

  private normalizeStudentCode(studentCode: string): string {
    return studentCode.trim().toUpperCase();
  }

  private alreadyRegistered(): ConflictException {
    return new ConflictException({
      code: 'REGISTRATION_ALREADY_COMPLETED',
      message: 'Sinh viên đã đăng ký tài khoản',
    });
  }

  private async releaseChallengeAfterRollback(
    registrationId: string,
  ): Promise<void> {
    try {
      await this.otp.releaseVerifiedOtp(registrationId);
    } catch {
      this.logger.error('Database rollback completed but OTP release failed');
    }
  }
}
