import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Student } from '../students/student.entity';
import { AdminsService } from '../admins/admins.service';
import { RedisService } from '../redis/redis.service';

export interface JwtPayload {
  sub: string;
  role: 'student' | 'admin' | 'super_admin';
  mustChangePassword?: boolean;
  jti?: string;
  exp?: number;
}

// Đọc access_token từ httpOnly cookie, fallback sang Authorization header
function cookieOrBearerExtractor(req: Request): string | null {
  if (req?.cookies?.access_token) return req.cookies.access_token;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    private readonly adminsService: AdminsService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: cookieOrBearerExtractor,
      secretOrKey: config.get('JWT_ACCESS_SECRET') || 'access-dev-secret',
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    // Kiểm tra blacklist (token đã bị logout)
    if (payload.jti) {
      const isBlacklisted = await this.redis.get(`blacklist:${payload.jti}`);
      if (isBlacklisted) throw new UnauthorizedException('Token đã bị thu hồi');
    }

    if (payload.role === 'admin' || payload.role === 'super_admin') {
      const admin = await this.adminsService.findById(payload.sub);
      if (!admin || !admin.isActive) throw new UnauthorizedException('Tài khoản không tồn tại');
      return {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        jti: payload.jti,
        exp: payload.exp,
      };
    }

    // Student
    const student = await this.studentRepo.findOne({ where: { id: payload.sub } });
    if (!student || !student.isActive) throw new UnauthorizedException('Tài khoản không tồn tại');

    return {
      id: student.id,
      studentCode: student.studentCode,
      role: 'student',
      mustChangePassword: student.mustChangePassword,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
