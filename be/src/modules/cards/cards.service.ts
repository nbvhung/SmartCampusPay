import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card, CardStatus } from './card.entity';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private readonly repo: Repository<Card>,
  ) {}

  async create(data: Partial<Card>): Promise<Card> {
    return this.repo.save(data);
  }

  async findByUid(uid: string): Promise<Card> {
    const card = await this.repo.findOne({
      where: { uid },
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
}
