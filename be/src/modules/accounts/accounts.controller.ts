import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccountsService } from './accounts.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('accounts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'super_admin')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('balance/:studentId')
  getBalance(@Param('studentId') studentId: string) {
    return this.service.getBalance(studentId);
  }

  @Get('student/:studentId')
  findByStudent(@Param('studentId') studentId: string) {
    return this.service.findByStudentId(studentId);
  }

  @Patch(':id/freeze')
  toggleFreeze(@Param('id') id: string) {
    return this.service.toggleFreeze(id);
  }
}
