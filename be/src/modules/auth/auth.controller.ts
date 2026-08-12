import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginDto, AdminLoginDto, UnifiedLoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  // ─── STUDENT LOGIN ───────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const result = await this.service.studentLogin(
      dto.studentCode,
      dto.password,
    );
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return {
      mustChangePassword: result.mustChangePassword,
      user: result.user,
    };
  }

  // ─── UNIFIED LOGIN ──────────────────────────────────────────────────────────

  @Public()
  @Post('login/unified')
  @HttpCode(HttpStatus.OK)
  async unifiedLogin(
    @Body() dto: UnifiedLoginDto,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.service.unifiedLogin(
      dto.identifier,
      dto.password,
    );
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return {
      mustChangePassword: result.mustChangePassword,
      user: result.user,
    };
  }

  // ─── ADMIN LOGIN ─────────────────────────────────────────────────────────────

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.service.adminLogin(dto.username, dto.password);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  // ─── REFRESH TOKEN ───────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'Không có refresh token',
      });
      return;
    }
    const result = await this.service.refresh(refreshToken);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { message: 'Làm mới token thành công' };
  }

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: any) {
    await this.service.logout(user.id, user.jti, user.exp);
    this.clearTokenCookies(res);
    return { message: 'Đăng xuất thành công' };
  }

  // ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.service.changePassword(
      user.id,
      user.role,
      dto.newPassword,
      dto.oldPassword,
    );
    // Xoá cookie vì session bị invalidate sau khi đổi MK
    this.clearTokenCookies(res);
    return result;
  }

  // ─── GET ME ───────────────────────────────────────────────────────────────────

  @Get('me')
  async me(@CurrentUser() user: any) {
    return this.service.getMe(user.id, user.role);
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

  private setTokenCookies(res: any, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000, // 15 phút
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
      path: '/api/v1/auth/refresh',
    });
  }

  private clearTokenCookies(res: any) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
  }
}
