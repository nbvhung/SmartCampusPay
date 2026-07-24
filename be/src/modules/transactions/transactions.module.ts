import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { Transaction } from './transaction.entity';
import { Merchant } from '../merchants/merchant.entity';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { StudentsModule } from '../students/students.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CardsModule } from '../cards/cards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Merchant]),
    StudentsModule,
    AccountsModule,
    CardsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, ApiKeyGuard],
  exports: [TransactionsService],
})
export class TransactionsModule {}
