import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TopupPendingService } from './topup-pending.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListTopupDto } from './dto/match-topup.dto';

@Controller('topup-pending')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'super_admin')
export class TopupPendingController {
  constructor(private readonly service: TopupPendingService) {}

  @Get()
  findAll(@Query() dto: ListTopupDto) {
    return this.service.findAll(dto);
  }

  @Post(':id/ignore')
  async ignore(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.ignore(id, user.id);
  }
}
