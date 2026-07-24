import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private readonly repo: Repository<Merchant>,
  ) {}

  private generateApiKey(): string {
    return `mcp_${crypto.randomBytes(24).toString('hex')}`;
  }

  async create(dto: CreateMerchantDto): Promise<{ merchant: Merchant; rawApiKey: string }> {
    const rawKey = this.generateApiKey();
    const hashedKey = await bcrypt.hash(rawKey, 10);
    const merchant = this.repo.create({ ...dto, apiKey: hashedKey });
    return { merchant: await this.repo.save(merchant), rawApiKey: rawKey };
  }

  async findAll(): Promise<Merchant[]> {
    return this.repo.find();
  }

  async findById(id: string): Promise<Merchant> {
    const merchant = await this.repo.findOne({ where: { id } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  async regenerateApiKey(id: string): Promise<{ rawApiKey: string }> {
    const merchant = await this.findById(id);
    const rawKey = this.generateApiKey();
    merchant.apiKey = await bcrypt.hash(rawKey, 10);
    await this.repo.save(merchant);
    return { rawApiKey: rawKey };
  }

  async toggleActive(id: string): Promise<Merchant> {
    const merchant = await this.findById(id);
    merchant.isActive = !merchant.isActive;
    return this.repo.save(merchant);
  }
}
