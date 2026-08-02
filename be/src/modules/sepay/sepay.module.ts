import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SePayController } from './sepay.controller';
import { SePayService } from './sepay.service';
import { Transaction } from '../transactions/transaction.entity';
import { Account } from '../accounts/account.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { StudentsModule } from '../students/students.module';
import { TopupPendingModule } from '../topup-pending/topup-pending.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Account]),
    AccountsModule,
    StudentsModule,
    TopupPendingModule,
  ],
  controllers: [SePayController],
  providers: [SePayService],
})
export class SePayModule {}
