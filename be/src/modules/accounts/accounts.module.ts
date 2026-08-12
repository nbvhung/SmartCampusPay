import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsTask } from './accounts.task';
import { Account } from './account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), ScheduleModule.forRoot()],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsTask],
  exports: [AccountsService],
})
export class AccountsModule {}
