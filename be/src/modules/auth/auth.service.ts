import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Student } from '../students/student.entity';
import { Admin } from '../admins/admin.entity';
import { AdminsService } from '../admins/admins.service';
import { AccountsService } from '../accounts/accounts.service';
import { CardsService } from '../cards/cards.service';
import { RedisService } from '../redis/redis.service';

const ACCESS_TTL_SEC = 15 * 60;       // 15 phút
const REFRESH_TTL_SEC = 7 * 24 * 3600; // 7 ngày

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly adminsService: AdminsService,
    private readonly redis: RedisService,
    private readonly accountsService: AccountsService,
    private readonly cardsService: CardsService,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  // ─── STUDENT LOGIN ──────────────────────────────────────────────────────────

  async studentLogin(studentCode: string, password: string) {
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

    const valid = student.passwordHash && await bcrypt.compare(password, student.passwordHash);
    if (!valid) throw new UnauthorizedException('Mã sinh viên hoặc mật khẩu không đúng');

    // Tự động tạo account nếu chưa có
    await this.accountsService.createAccountIfNotExists(student.id);

    // Tự động tạo thẻ ảo nếu chưa có (cho SV cũ)
    const existingCards = await this.studentRepo.manager.query(
      `SELECT id FROM cards WHERE "studentId" = $1 LIMIT 1`,
      [student.id],
    );
    if (existingCards.length === 0) {
      await this.studentRepo.manager.query(
        `INSERT INTO cards (id, uid, "chipType", status, "studentId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'MIFARE', 'active', $2, NOW(), NOW())`,
        [`MOCK-${student.studentCode}`, student.id],
      );
    }

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

    const valid = admin.passwordHash && await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');

    const { accessToken, refreshToken } = await this.issueTokenPair(admin.id, admin.role);

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
    // Thử student trước
    const student = await this.studentRepo.findOne({
      where: { studentCode: identifier },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        passwordHash: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (student && student.isActive) {
      const valid = student.passwordHash && await bcrypt.compare(password, student.passwordHash);
      if (valid) {
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
            role: 'student' as const,
          },
        };
      }
    }

    // Thử admin
    const admin = await this.adminsService.findByUsername(identifier);
    if (admin && admin.isActive) {
      const valid = admin.passwordHash && await bcrypt.compare(password, admin.passwordHash);
      if (valid) {
        const { accessToken, refreshToken } = await this.issueTokenPair(admin.id, admin.role);
        return {
          accessToken,
          refreshToken,
          mustChangePassword: false,
          user: {
            id: admin.id,
            username: admin.username,
            fullName: admin.fullName,
            role: admin.role as 'admin' | 'super_admin',
          },
        };
      }
    }

    throw new UnauthorizedException('Mã sinh viên/tên đăng nhập hoặc mật khẩu không đúng');
  }

  // ─── REFRESH TOKEN ──────────────────────────────────────────────────────────

  async refresh(incomingRefreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(incomingRefreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const userId = payload.sub;
    const storedHash = await this.redis.get(`refresh_token:${userId}`);
    if (!storedHash) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
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
    newPassword: string,
    oldPassword?: string,
  ) {
    if (role === 'student') {
      const student = await this.studentRepo.findOne({
        where: { id: userId },
        select: { id: true, passwordHash: true, mustChangePassword: true },
      });
      if (!student) throw new UnauthorizedException('Không tìm thấy tài khoản');

      // Nếu không phải lần đổi bắt buộc → cần xác nhận mật khẩu cũ
      if (!student.mustChangePassword) {
        if (!oldPassword) {
          throw new BadRequestException('Vui lòng nhập mật khẩu cũ');
        }
        const valid = await bcrypt.compare(oldPassword, student.passwordHash);
        if (!valid) throw new BadRequestException('Mật khẩu cũ không đúng');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await this.studentRepo.update(userId, { passwordHash, mustChangePassword: false });

      // Xoá toàn bộ session cũ (force re-login)
      await this.redis.del(`refresh_token:${userId}`);
      return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
    }

    // Admin change password (luôn cần old password)
    const admin = await this.adminsService.findById(userId);
    if (!admin) throw new UnauthorizedException('Không tìm thấy tài khoản');

    throw new ForbiddenException('Chức năng chưa hỗ trợ cho admin');
  }

  // ─── GET ME ─────────────────────────────────────────────────────────────────

  async getMe(userId: string, role: string) {
    if (role === 'student') {
      const student = await this.studentRepo.findOne({
        where: { id: userId },
        relations: { accounts: true, cards: true },
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
}
