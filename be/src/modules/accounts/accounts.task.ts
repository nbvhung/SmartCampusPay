import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountsService } from './accounts.service';

@Injectable()
export class AccountsTask {
  private readonly logger = new Logger(AccountsTask.name);

  constructor(private readonly accountsService: AccountsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleResetDailySpent() {
    this.logger.log('Resetting daily spent for all accounts...');
    await this.accountsService.resetDailySpent();
    this.logger.log('Daily spent reset completed');
  }
}
