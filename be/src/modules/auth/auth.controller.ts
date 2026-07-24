import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: { studentCode: string; password: string }) {
    return this.service.login(dto.studentCode, dto.password);
  }

  @Public()
  @Post('admin/login')
  adminLogin(@Body() dto: { username: string; password: string }) {
    return this.service.adminLogin(dto.username, dto.password);
  }

  @Public()
  @Post('register')
  register(@Body() dto: { studentCode: string; password: string }) {
    return this.service.register(dto.studentCode, dto.password);
  }
}
