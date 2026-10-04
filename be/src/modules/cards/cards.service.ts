import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeUid } from '../../common/utils/payment';
import { Card, CardStatus } from './card.entity';
import { Student } from '../students/student.entity';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private readonly repo: Repository<Card>,
  ) {}

  async create(data: Partial<Card>): Promise<Card> {
    try {
      return await this.repo.manager.transaction(async (manager) => {
        const studentId = data.studentId ?? data.student?.id;
        if (!studentId) throw new NotFoundException('Không tìm thấy sinh viên');
        const student = await manager.findOne(Student, {
          where: { id: studentId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!student) throw new NotFoundException('Không tìm thấy sinh viên');
        return manager.save(Card, {
          ...data,
          studentId,
          uid: normalizeUid(data.uid!),
        });
      });
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23505'
      ) {
        throw new ConflictException('UID thẻ đã tồn tại, kể cả thẻ đã lưu trữ');
      }
      throw error;
    }
  }

  async findAll(): Promise<Card[]> {
    return this.repo.find({ relations: { student: true } });
  }

  async findByUid(uid: string): Promise<Card> {
    const card = await this.repo.findOne({
      where: { uid: normalizeUid(uid) },
      relations: { student: { accounts: true } },
    });
    if (!card) throw new NotFoundException('Card not found');
    return card;
  }

  async findByStudentId(studentId: string): Promise<Card[]> {
    return this.repo.find({ where: { studentId } });
  }

  async updateStatus(id: string, status: CardStatus): Promise<Card> {
    const card = await this.repo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Card not found');
    card.status = status;
    return this.repo.save(card);
  }

  async updateLastUsed(uid: string): Promise<void> {
    await this.repo.update({ uid }, { lastUsedAt: new Date() });
  }

  async remove(id: string): Promise<void> {
    const card = await this.repo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Card not found');
    await this.repo.remove(card);
  }
}
