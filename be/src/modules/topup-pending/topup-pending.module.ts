import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopupPendingController } from './topup-pending.controller';
import { TopupPendingService } from './topup-pending.service';
import { TopupPending } from './topup-pending.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Account } from '../accounts/account.entity';
import { Student } from '../students/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TopupPending, Transaction, Account, Student]),
  ],
  controllers: [TopupPendingController],
  providers: [TopupPendingService],
  exports: [TopupPendingService],
})
export class TopupPendingModule {}
