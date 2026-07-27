import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Admin } from './admin.entity';

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(Admin)
    private readonly repo: Repository<Admin>,
  ) {}

  async findByUsername(username: string): Promise<Admin | null> {
    return this.repo.findOne({
      where: { username },
      select: { id: true, username: true, passwordHash: true, role: true, isActive: true, fullName: true },
    });
  }

  async findById(id: string): Promise<Admin | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(): Promise<Admin[]> {
    return this.repo.find();
  }

  async create(username: string, password: string, fullName: string, role: 'admin' | 'super_admin' = 'admin'): Promise<Admin> {
    const exists = await this.repo.findOne({ where: { username } });
    if (exists) throw new ConflictException('Tên đăng nhập đã tồn tại');

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = this.repo.create({ username, passwordHash, fullName, role });
    return this.repo.save(admin);
  }

  async update(id: string, data: { fullName?: string; isActive?: boolean }): Promise<Admin> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Admin không tồn tại');

    if (data.fullName !== undefined) admin.fullName = data.fullName;
    if (data.isActive !== undefined) admin.isActive = data.isActive;

    return this.repo.save(admin);
  }

  async remove(id: string): Promise<void> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Admin không tồn tại');
    if (admin.role === 'super_admin') throw new ForbiddenException('Không thể xoá super admin');

    await this.repo.remove(admin);
  }

  async seedDefaultAdmin(): Promise<void> {
    const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const exists = await this.repo.findOne({ where: { username: defaultUsername } });
    if (exists) return;

    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
    await this.create(defaultUsername, defaultPassword, 'System Admin', 'super_admin');
  }
}
