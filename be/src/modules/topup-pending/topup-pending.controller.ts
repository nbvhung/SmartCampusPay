import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TopupPendingService } from './topup-pending.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('topup-pending')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'super_admin')
export class TopupPendingController {
  constructor(private readonly service: TopupPendingService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status ? { status } : undefined);
  }

  @Post(':id/match')
  async match(
    @Param('id') id: string,
    @Body('studentCode') studentCode: string,
    @CurrentUser() user: any,
  ) {
    if (!studentCode) throw new BadRequestException('Thiếu mã sinh viên');
    return this.service.match(id, studentCode, user.id);
  }

  @Post(':id/ignore')
  async ignore(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.ignore(id, user.id);
  }
}
