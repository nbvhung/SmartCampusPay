import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Raw } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Student } from './student.entity';
import { Account } from '../accounts/account.entity';
import { Card, CardStatus } from '../cards/card.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TopupClaim } from '../topup-claims/topup-claim.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { BulkImportResult, ImportStudentRow } from './dto/import-student.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { campusDate, normalizeUid } from '../../common/utils/payment';

interface StudentQuery {
  search?: string;
  faculty?: string;
  isActive?: string;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateStudentDto): Promise<Student> {
    const studentCode = dto.studentCode.trim().toUpperCase();
    if (!studentCode) {
      throw new BadRequestException('Mã sinh viên không được để trống');
    }
    const cardUid = this.normalizePhysicalCardUid(dto.cardUid);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const codeExists = await manager.findOne(Student, {
          withDeleted: true,
          where: {
            studentCode: Raw(
              (alias) => `UPPER(TRIM(${alias})) = :studentCode`,
              { studentCode },
            ),
          },
        });
        if (codeExists) {
          throw new ConflictException('Mã sinh viên đã tồn tại');
        }

        const cardExists = await manager.findOne(Card, {
          withDeleted: true,
          where: { uid: cardUid },
        });
        if (cardExists) {
          throw new ConflictException(
            'UID thẻ đã tồn tại, kể cả thẻ đã lưu trữ',
          );
        }

        const student = manager.create(Student, {
          studentCode,
          fullName: null,
          email: null,
          faculty: null,
          isActive: true,
          mustChangePassword: true,
        });
        const savedStudent = await manager.save(student);

        await manager.save(
          manager.create(Card, {
            studentId: savedStudent.id,
            uid: cardUid,
            chipType: 'MIFARE',
            status: CardStatus.ACTIVE,
          }),
        );

        return savedStudent;
      });
    } catch (err: unknown) {
      if (
        err instanceof ConflictException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      const driverError = (
        err as {
          driverError?: { code?: string; constraint?: string };
        }
      ).driverError;
      if (driverError?.code === '23505') {
        if (driverError.constraint === 'UQ_7f8186b57a1bbb3ae0db6bd6262') {
          throw new ConflictException('Mã sinh viên đã tồn tại');
        }
        if (driverError.constraint === 'UQ_710a28e78c2bc8acd03cdb1a5f7') {
          throw new ConflictException(
            'UID thẻ đã tồn tại, kể cả thẻ đã lưu trữ',
          );
        }
        throw new ConflictException('Thông tin provisioning đã tồn tại');
      }
      throw err;
    }
  }
  //chức năng tìm kiếm sinh viên theo các tiêu chí: search, faculty, isActive
  async findAll(query: StudentQuery = {}): Promise<Student[]> {
    const { search, faculty, isActive } = query;

    const qb = this.repo
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.cards', 'cards')
      .leftJoinAndSelect('student.accounts', 'accounts');

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(student.studentCode ILIKE :term OR student.fullName ILIKE :term OR student.email ILIKE :term OR student.phone ILIKE :term OR student.faculty ILIKE :term)',
        { term },
      );
    }

    if (faculty) {
      qb.andWhere('student.faculty ILIKE :faculty', {
        faculty: `%${faculty}%`,
      });
    }

    if (isActive === 'true' || isActive === 'false') {
      qb.andWhere('student.isActive = :isActive', {
        isActive: isActive === 'true',
      });
    }

    qb.orderBy('student.createdAt', 'DESC');
    return qb.getMany();
  }

  async findById(id: string): Promise<Student> {
    const student = await this.repo.findOne({
      where: { id },
      relations: { cards: true, accounts: true },
    });
    if (!student) throw new NotFoundException('Không tìm thấy sinh viên');
    return student;
  }

  async findMyProfile(studentId: string): Promise<Student> {
    const student = await this.repo.findOne({
      where: { id: studentId },
      relations: { cards: true, accounts: true },
    });
    if (!student) throw new NotFoundException('Không tìm thấy sinh viên');
    return student;
  }

  async updateMyProfile(
    studentId: string,
    dto: UpdateMyProfileDto,
  ): Promise<Student> {
    if (
      dto.fullName === undefined &&
      dto.email === undefined &&
      dto.faculty === undefined &&
      dto.dateOfBirth === undefined
    ) {
      throw new BadRequestException('Không có thông tin hồ sơ để cập nhật');
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const student = await manager.findOne(Student, {
          where: { id: studentId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!student) throw new NotFoundException('Không tìm thấy sinh viên');

        if (dto.email !== undefined && dto.email !== student.email) {
          const emailOwner = await manager
            .createQueryBuilder(Student, 'student')
            .withDeleted()
            .where('LOWER(student.email) = :email', { email: dto.email })
            .andWhere('student.id <> :studentId', { studentId })
            .getOne();
          if (emailOwner) throw new ConflictException('Email đã được sử dụng');
        }

        if (dto.dateOfBirth !== undefined) {
          const today = campusDate();
          if (dto.dateOfBirth > today) {
            throw new BadRequestException('Ngày sinh không thể ở tương lai');
          }
        }

        if (dto.fullName !== undefined) student.fullName = dto.fullName;
        if (dto.email !== undefined) student.email = dto.email;
        if (dto.faculty !== undefined) student.faculty = dto.faculty;
        if (dto.dateOfBirth !== undefined) {
          student.dateOfBirth = new Date(`${dto.dateOfBirth}T00:00:00.000Z`);
        }

        if (
          !student.profileCompletedAt &&
          student.fullName &&
          student.email &&
          student.faculty &&
          student.dateOfBirth
        ) {
          student.profileCompletedAt = new Date();
        }

        await manager.save(student);
      });

      return this.findMyProfile(studentId);
    } catch (err: unknown) {
      if (
        err instanceof ConflictException ||
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      const driverCode = (err as { driverError?: { code?: string } })
        .driverError?.code;
      if (driverCode === '23505') {
        throw new ConflictException('Email đã được sử dụng');
      }
      throw err;
    }
  }

  async findByCode(code: string): Promise<Student | null> {
    return this.repo.findOne({
      where: {
        studentCode: Raw((alias) => `UPPER(TRIM(${alias})) = :studentCode`, {
          studentCode: code.trim().toUpperCase(),
        }),
      },
      relations: { cards: true, accounts: true },
    });
  }

  async toggleActive(id: string): Promise<Student> {
    const student = await this.findById(id);
    student.isActive = !student.isActive;
    return this.repo.save(student);
  }

  async update(id: string, dto: Partial<Student>): Promise<Student> {
    const student = await this.findById(id);
    if (dto.studentCode && dto.studentCode !== student.studentCode) {
      const exists = await this.repo.findOne({
        withDeleted: true,
        where: { studentCode: dto.studentCode },
      });
      if (exists) throw new ConflictException('Mã sinh viên đã tồn tại');
    }
    Object.assign(student, dto);
    return this.repo.save(student);
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Match the payment lock order: student, cards, then wallets.
      const student = await manager.findOne(Student, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!student) throw new NotFoundException('Không tìm thấy sinh viên');
      await manager
        .createQueryBuilder(Card, 'card')
        .where('card.studentId = :id', { id })
        .orderBy('card.id')
        .setLock('pessimistic_write')
        .getMany();
      const accounts = await manager
        .createQueryBuilder(Account, 'account')
        .where('account.studentId = :id', { id })
        .orderBy('account.id')
        .setLock('pessimistic_write')
        .getMany();
      if (accounts.some((account) => account.balance !== 0)) {
        throw new ConflictException(
          'Không thể xóa vĩnh viễn vì sinh viên còn số dư trong ví',
        );
      }
      const [transactionCount, claimCount] = await Promise.all([
        manager.count(Transaction, { where: { studentId: id } }),
        manager.count(TopupClaim, { where: { studentId: id } }),
      ]);
      if (transactionCount > 0 || claimCount > 0) {
        throw new ConflictException(
          'Sinh viên đã có lịch sử giao dịch hoặc hồ sơ khớp nạp. Hãy dùng “Ngừng hoạt động” để giữ dữ liệu đối soát',
        );
      }
      await manager.delete(Card, { studentId: id });
      await manager.delete(Account, { studentId: id });
      await manager.delete(Student, id);
    });
  }

  // ─── BULK IMPORT TỪ FILE EXCEL ─────────────────────────────────────────────

  async bulkImport(fileBuffer: Buffer): Promise<BulkImportResult> {
    const result: BulkImportResult = { created: 0, skipped: 0, errors: [] };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const sheet = workbook.worksheets[0];

    // Dòng 1 là header, bắt đầu từ dòng 2
    const rows: ImportStudentRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const studentCode = row.getCell(1).text.trim();
      const cardUid = row.getCell(2).text.trim();

      if (!studentCode || !cardUid) {
        result.errors.push({
          row: rowNumber,
          studentCode: studentCode || '?',
          reason: 'Thiếu thông tin bắt buộc (MSSV, UID thẻ vật lý)',
        });
        return;
      }

      rows.push({
        studentCode,
        cardUid,
        rowNumber,
      });
    });

    // Mỗi dòng dùng đúng transaction provisioning Student + physical Card.
    for (const row of rows) {
      try {
        await this.create({
          studentCode: row.studentCode,
          cardUid: row.cardUid,
        });
        result.created++;
      } catch (err: unknown) {
        if (err instanceof ConflictException) {
          result.skipped++;
        }
        result.errors.push({
          row: row.rowNumber,
          studentCode: row.studentCode,
          reason: err instanceof Error ? err.message : 'Lỗi không xác định',
        });
      }
    }

    return result;
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private normalizePhysicalCardUid(uid: string): string {
    const value = uid.trim().toUpperCase();
    if (value.startsWith('MOCK-')) {
      throw new BadRequestException({
        code: 'PHYSICAL_CARD_REQUIRED',
        message:
          'Provisioning chỉ chấp nhận UID thẻ vật lý, không nhận MOCK Card',
      });
    }
    return normalizeUid(value);
  }
}
