import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from './student.entity';
import { CreateStudentDto } from './dto/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
  ) {}

  async create(dto: CreateStudentDto): Promise<Student> {
    const exists = await this.repo.findOne({ where: { studentCode: dto.studentCode } });
    if (exists) throw new ConflictException('Student code already exists');
    return this.repo.save(dto as Student);
  }

  async findAll(): Promise<Student[]> {
    return this.repo.find({ relations: { cards: true, accounts: true } });
  }

  async findById(id: string): Promise<Student> {
    const student = await this.repo.findOne({
      where: { id },
      relations: { cards: true, accounts: true },
    });
    if (!student) throw new NotFoundException('Student not found');
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
}
