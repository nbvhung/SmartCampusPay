import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { Student } from '../students/student.entity';
import { AdminsModule } from '../admins/admins.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CardsModule } from '../cards/cards.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationOtpService } from './registration-otp.service';
import { RegistrationOtpStore } from './registration-otp.store';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student]),
    PassportModule,
    AdminsModule,
    AccountsModule,
    CardsModule,
    RedisModule,
    NotificationsModule,
    // JwtModule dùng cho access token (sign/verify trong service dùng config trực tiếp)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET') || 'access-dev-secret',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RegistrationOtpStore,
    RegistrationOtpService,
  ],
  exports: [AuthService, RegistrationOtpService],
})
export class AuthModule {}
