import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import { Student } from './student.entity';
import { Account } from '../accounts/account.entity';
import { Card } from '../cards/card.entity';
import { CardsService } from '../cards/cards.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { BulkImportResult, ImportStudentRow } from './dto/import-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly cardsService: CardsService,
  ) {}

  async create(dto: CreateStudentDto): Promise<Student> {
    const exists = await this.repo.findOne({ where: { studentCode: dto.studentCode } });
    if (exists) throw new ConflictException('Mã sinh viên đã tồn tại');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const student = queryRunner.manager.create(Student, dto as Partial<Student>);

      // Nếu có dateOfBirth thì sinh password mặc định ddmmyyyy
      if (dto.dateOfBirth) {
        const dob = new Date(dto.dateOfBirth);
        const defaultPassword = this.formatDobPassword(dob);
        student.passwordHash = await bcrypt.hash(defaultPassword, 10);
        student.mustChangePassword = true;
      }

      const savedStudent = await queryRunner.manager.save(student);

      // Tạo tài khoản cho sinh viên
      const account = queryRunner.manager.create(Account, {
        studentId: savedStudent.id,
        balance: 0,
        dailyLimit: 500000,
        dailySpent: 0,
      });
      await queryRunner.manager.save(account);

      // Tạo thẻ ảo cho sinh viên
      const card = queryRunner.manager.create(Card, {
        studentId: savedStudent.id,
        uid: `MOCK-${dto.studentCode}`,
        chipType: 'MIFARE',
        status: 'active' as any,
      });
      await queryRunner.manager.save(card);

      await queryRunner.commitTransaction();
      return savedStudent;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(): Promise<Student[]> {
    return this.repo.find({ relations: { cards: true, accounts: true } });
  }

  async findById(id: string): Promise<Student> {
    const student = await this.repo.findOne({
      where: { id },
      relations: { cards: true, accounts: true },
    });
    if (!student) throw new NotFoundException('Không tìm thấy sinh viên');
    return student;
  }

  async findByCode(code: string): Promise<Student | null> {
    return this.repo.findOne({
      where: { studentCode: code },
      relations: { cards: true, accounts: true },
    });
  }

  async toggleActive(id: string): Promise<Student> {
    const student = await this.findById(id);
    student.isActive = !student.isActive;
    return this.repo.save(student);
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

      const studentCode = String(row.getCell(1).value ?? '').trim();
      const fullName = String(row.getCell(2).value ?? '').trim();
      const email = String(row.getCell(3).value ?? '').trim();
      const phone = String(row.getCell(4).value ?? '').trim() || undefined;
      const faculty = String(row.getCell(5).value ?? '').trim() || undefined;
      const dobRaw = row.getCell(6).value;

      if (!studentCode || !fullName || !email || !dobRaw) {
        result.errors.push({
          row: rowNumber,
          studentCode: studentCode || '?',
          reason: 'Thiếu thông tin bắt buộc (MSV, họ tên, email, ngày sinh)',
        });
        return;
      }

      rows.push({ studentCode, fullName, email, phone, faculty, dateOfBirth: String(dobRaw) });
    });

    // Xử lý từng row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const exists = await queryRunner.manager.findOne(Student, { where: { studentCode: row.studentCode } });
        if (exists) {
          result.skipped++;
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
          continue;
        }

        const dob = this.parseDob(row.dateOfBirth);
        const defaultPassword = this.formatDobPassword(dob);
        const passwordHash = await bcrypt.hash(defaultPassword, 10);

        const student = queryRunner.manager.create(Student, {
          studentCode: row.studentCode,
          fullName: row.fullName,
          email: row.email,
          phone: row.phone,
          faculty: row.faculty,
          dateOfBirth: dob,
          passwordHash,
          mustChangePassword: true,
          isActive: true,
        });

        const savedStudent = await queryRunner.manager.save(student);

        // Tạo tài khoản cho sinh viên
        const account = queryRunner.manager.create(Account, {
          studentId: savedStudent.id,
          balance: 0,
          dailyLimit: 500000,
          dailySpent: 0,
        });
        await queryRunner.manager.save(account);

        // Tạo thẻ ảo cho sinh viên
        const card = queryRunner.manager.create(Card, {
          studentId: savedStudent.id,
          uid: `MOCK-${row.studentCode}`,
          chipType: 'MIFARE',
          status: 'active' as any,
        });
        await queryRunner.manager.save(card);

        await queryRunner.commitTransaction();
        result.created++;
      } catch (err: any) {
        await queryRunner.rollbackTransaction();
        result.errors.push({
          row: i + 2,
          studentCode: row.studentCode,
          reason: err?.message || 'Lỗi không xác định',
        });
      } finally {
        await queryRunner.release();
      }
    }

    return result;
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  /**
   * Parse ngày sinh từ string (dd/mm/yyyy hoặc Excel date number)
   */
  private parseDob(raw: string): Date {
    // Nếu là số (Excel serial date)
    if (/^\d+$/.test(raw)) {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + parseInt(raw) * 86400000);
    }
    // dd/mm/yyyy
    const parts = raw.split('/');
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
    }
    // yyyy-mm-dd
    return new Date(raw);
  }

  /**
   * Tạo password mặc định dạng ddmmyyyy từ Date
   */
  private formatDobPassword(dob: Date): string {
    const dd = String(dob.getDate()).padStart(2, '0');
    const mm = String(dob.getMonth() + 1).padStart(2, '0');
    const yyyy = dob.getFullYear();
    return `${dd}${mm}${yyyy}`;
  }
}
