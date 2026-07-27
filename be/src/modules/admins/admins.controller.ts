import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminsService } from './admins.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('admins')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'super_admin')
export class AdminsController {
  constructor(private readonly service: AdminsService) {}

  @Post()
  @Roles('super_admin')
  async create(@Body() body: { username: string; password: string; fullName: string; role?: 'admin' | 'super_admin' }) {
    return this.service.create(body.username, body.password, body.fullName, body.role);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles('super_admin')
  async update(@Param('id') id: string, @Body() body: { fullName?: string; isActive?: boolean }) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Roles('super_admin')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { message: 'Xoá admin thành công' };
  }

  @Get('me/profile')
  getProfile(@CurrentUser() user: any) {
    return this.service.findById(user.id);
  }
}
