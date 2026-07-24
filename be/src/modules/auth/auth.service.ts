import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Student } from '../students/student.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  async login(studentCode: string, password: string) {
    const student = await this.studentRepo.findOne({
      where: { studentCode },
      select: { id: true, studentCode: true, passwordHash: true, isActive: true },
    });
    if (!student || !student.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = student.passwordHash && await bcrypt.compare(password, student.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: student.id, studentCode: student.studentCode, role: 'student' as const };
    return { accessToken: this.jwtService.sign(payload), studentCode: student.studentCode };
  }

  async adminLogin(username: string, password: string) {
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'admin123';
    if (username !== adminUser || password !== adminPass) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    const payload = { sub: 'admin', role: 'admin' as const };
    return { accessToken: this.jwtService.sign(payload) };
  }

  async register(studentCode: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    await this.studentRepo.update({ studentCode }, { passwordHash: hash });
    return { message: 'Password set successfully' };
  }
}
