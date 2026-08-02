import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HardwareDeviceController } from './hardware-device.controller';
import { HardwareDeviceService } from './hardware-device.service';
import { Transaction } from '../transactions/transaction.entity';
import { Account } from '../accounts/account.entity';
import { Merchant } from '../merchants/merchant.entity';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SePayModule } from '../sepay/sepay.module';
import { CardsModule } from '../cards/cards.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Account, Merchant]),
    SePayModule,
    CardsModule,
    StudentsModule,
  ],
  controllers: [HardwareDeviceController],
  providers: [HardwareDeviceService, ApiKeyGuard],
})
export class HardwareDeviceModule {}
