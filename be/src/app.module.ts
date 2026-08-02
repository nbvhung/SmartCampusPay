import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import databaseConfig from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { AdminsModule } from './modules/admins/admins.module';
import { CardsModule } from './modules/cards/cards.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { HardwareModule } from './modules/hardware/hardware.module';
import { HardwareDeviceModule } from './modules/hardware-device/hardware-device.module';
import { RedisModule } from './modules/redis/redis.module';
import { SePayModule } from './modules/sepay/sepay.module';
import { TopupPendingModule } from './modules/topup-pending/topup-pending.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.getOrThrow('database'),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    StudentsModule,
    AdminsModule,
    CardsModule,
    AccountsModule,
    TransactionsModule,
    MerchantsModule,
    HardwareModule,
    HardwareDeviceModule,
    RedisModule,
    SePayModule,
    TopupPendingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
