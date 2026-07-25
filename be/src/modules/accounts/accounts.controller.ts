import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccountsService } from './accounts.service';

@Controller('accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get('balance/:studentId')
  getBalance(@Param('studentId') studentId: string) {
    return this.service.getBalance(studentId);
  }

  @Patch(':id/freeze')
  toggleFreeze(@Param('id') id: string) {
    return this.service.toggleFreeze(id);
  }
}
