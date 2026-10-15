import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Student } from '../students/student.entity';
import { AdminsService } from '../admins/admins.service';
import { RedisService } from '../redis/redis.service';
import { Account } from '../accounts/account.entity';
import { assertStrongPassword } from './password-policy';

const ACCESS_TTL_SEC = 15 * 60; // 15 phút
const REFRESH_TTL_SEC = 7 * 24 * 3600; // 7 ngày

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly adminsService: AdminsService,
    private readonly redis: RedisService,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  // ─── STUDENT LOGIN ──────────────────────────────────────────────────────────

  async studentLogin(studentCode: string, password: string) {
    studentCode = studentCode.trim().toUpperCase();
    const student = await this.studentRepo.findOne({
      where: { studentCode },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        passwordHash: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (!student || !student.isActive) {
      throw new UnauthorizedException('Mã sinh viên hoặc mật khẩu không đúng');
    }

    if (student.mustChangePassword && password !== studentCode) {
      throw new UnauthorizedException('Mã sinh viên hoặc mật khẩu không đúng');
    }

    // Accounts provisioned under older rules may have an initial DOB/phone hash.
    // Only accounts still flagged for their first password change accept MSSV.
    if (
      student.mustChangePassword &&
      password === studentCode &&
      (!student.passwordHash ||
        !(await bcrypt.compare(password, student.passwordHash)))
    ) {
      await this.studentRepo.manager.transaction(async (manager) => {
        const locked = await manager
          .createQueryBuilder(Student, 'student')
          .addSelect('student.passwordHash')
          .where('student.id = :id', { id: student.id })
          .setLock('pessimistic_write')
          .getOne();
        if (!locked || !locked.isActive || !locked.mustChangePassword)
          throw new UnauthorizedException('Vui lòng đăng nhập lại');
        locked.passwordHash = await bcrypt.hash(studentCode, 10);
        await manager.save(locked);
        student.passwordHash = locked.passwordHash;
      });
    }
    const valid =
      student.passwordHash &&
      (await bcrypt.compare(password, student.passwordHash));
    if (!valid)
      throw new UnauthorizedException('Mã sinh viên hoặc mật khẩu không đúng');

    await this.studentRepo.manager.transaction(async (manager) => {
      const locked = await manager.findOne(Student, {
        where: { id: student.id, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new UnauthorizedException();
      const existing = await manager.findOne(Account, {
        where: { studentId: student.id },
        withDeleted: true,
      });
      if (!existing)
        await manager.save(
          Account,
          manager.create(Account, {
            studentId: student.id,
            balance: 0,
            dailyLimit: 500000,
            dailySpent: 0,
          }),
        );
    });

    const { accessToken, refreshToken } = await this.issueTokenPair(
      student.id,
      'student',
      student.mustChangePassword,
    );

    return {
      accessToken,
      refreshToken,
      mustChangePassword: student.mustChangePassword,
      user: {
        id: student.id,
        studentCode: student.studentCode,
        fullName: student.fullName,
        role: 'student',
      },
    };
  }

  // ─── ADMIN LOGIN ────────────────────────────────────────────────────────────

  async adminLogin(username: string, password: string) {
    const admin = await this.adminsService.findByUsername(username);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    const valid =
      admin.passwordHash &&
      (await bcrypt.compare(password, admin.passwordHash));
    if (!valid)
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');

    const { accessToken, refreshToken } = await this.issueTokenPair(
      admin.id,
      admin.role,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: admin.id,
        username: admin.username,
        fullName: admin.fullName,
        role: admin.role,
      },
    };
  }

  // ─── UNIFIED LOGIN ─────────────────────────────────────────────────────────

  async unifiedLogin(identifier: string, password: string) {
    identifier = identifier.trim();
    // Thử student trước
    const student = await this.studentRepo.findOne({
      where: { studentCode: identifier.toUpperCase() },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        passwordHash: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (student && student.isActive)
      return this.studentLogin(identifier, password);

    // Thử admin
    const admin = await this.adminsService.findByUsername(identifier);
    if (admin && admin.isActive) {
      const valid =
        admin.passwordHash &&
        (await bcrypt.compare(password, admin.passwordHash));
      if (valid) {
        const { accessToken, refreshToken } = await this.issueTokenPair(
          admin.id,
          admin.role,
        );
        return {
          accessToken,
          refreshToken,
          mustChangePassword: false,
          user: {
            id: admin.id,
            username: admin.username,
            fullName: admin.fullName,
            role: admin.role,
          },
        };
      }
    }

    throw new UnauthorizedException(
      'Mã sinh viên/tên đăng nhập hoặc mật khẩu không đúng',
    );
  }

  // ─── REFRESH TOKEN ──────────────────────────────────────────────────────────

  async refresh(incomingRefreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(incomingRefreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const userId = payload.sub;
    if (payload.role === 'student') {
      const student = await this.studentRepo.findOneBy({
        id: userId,
        isActive: true,
      });
      if (!student)
        throw new UnauthorizedException('Sinh viên đã ngừng hoạt động');
    }
    const storedHash = await this.redis.get(`refresh_token:${userId}`);
    if (!storedHash) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      );
    }

    const match = await bcrypt.compare(incomingRefreshToken, storedHash);
    if (!match) throw new UnauthorizedException('Refresh token không hợp lệ');

    // Rotation: xoá cũ, cấp mới
    const { accessToken, refreshToken } = await this.issueTokenPair(
      userId,
      payload.role,
      payload.mustChangePassword,
    );

    return { accessToken, refreshToken };
  }

  // ─── LOGOUT ─────────────────────────────────────────────────────────────────

  async logout(userId: string, jti: string, accessTokenExp: number) {
    // Xoá refresh token
    await this.redis.del(`refresh_token:${userId}`);

    // Blacklist access token theo jti (TTL = thời gian còn lại)
    const ttl = Math.max(accessTokenExp - Math.floor(Date.now() / 1000), 1);
    await this.redis.set(`blacklist:${jti}`, '1', ttl);
  }

  // ─── CHANGE PASSWORD ────────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    role: string,
    oldPassword: string,
    newPassword: string,
    jti: string,
    accessTokenExp: number,
  ) {
    assertStrongPassword(newPassword);
    if (!jti || !Number.isFinite(accessTokenExp)) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    if (role === 'student') {
      const student = await this.studentRepo.findOne({
        where: { id: userId },
        select: { id: true, passwordHash: true, mustChangePassword: true, registeredAt: true },
      });
      if (!student) throw new UnauthorizedException('Không tìm thấy tài khoản');

      await this.validatePasswordChange(
        oldPassword,
        newPassword,
        student.passwordHash,
      );

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await this.studentRepo.update(userId, {
        passwordHash,
        mustChangePassword: false,
        ...(!student.registeredAt ? { registeredAt: new Date() } : {}),
      });

      await this.logout(userId, jti, accessTokenExp);
      return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
    }

    // Admin change password (luôn cần old password)
    const admin = await this.adminsService.findById(userId);
    if (!admin) throw new UnauthorizedException('Không tìm thấy tài khoản');

    await this.validatePasswordChange(
      oldPassword,
      newPassword,
      admin.passwordHash,
    );

    const adminPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.adminsService.updatePassword(userId, adminPasswordHash);

    await this.logout(userId, jti, accessTokenExp);
    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  // ─── GET ME ─────────────────────────────────────────────────────────────────

  async getMe(userId: string, role: string) {
    if (role === 'student') {
      const student = await this.studentRepo.findOne({
        where: { id: userId },
        relations: { account: true, cards: true },
      });
      if (!student) throw new UnauthorizedException();
      return { ...student, role: 'student' };
    }

    const admin = await this.adminsService.findById(userId);
    if (!admin) throw new UnauthorizedException();
    return { ...admin, role: admin.role };
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  private async issueTokenPair(
    userId: string,
    role: string,
    mustChangePassword = false,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = uuidv4();

    const accessToken = this.jwtService.sign(
      { sub: userId, role, mustChangePassword, jti },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, role, mustChangePassword },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    // Lưu hash của refresh token vào Redis (TTL 7 ngày)
    const hash = await bcrypt.hash(refreshToken, 8); // salt 8 cho nhanh
    await this.redis.set(`refresh_token:${userId}`, hash, REFRESH_TTL_SEC);

    return { accessToken, refreshToken };
  }

  private async validatePasswordChange(
    oldPassword: string,
    newPassword: string,
    passwordHash: string,
  ): Promise<void> {
    if (!oldPassword) {
      throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại');
    }
    const currentPasswordValid = await bcrypt.compare(
      oldPassword,
      passwordHash,
    );
    if (!currentPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    if (await bcrypt.compare(newPassword, passwordHash)) {
      throw new BadRequestException({
        code: 'PASSWORD_REUSE_NOT_ALLOWED',
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
      });
    }
  }
}
