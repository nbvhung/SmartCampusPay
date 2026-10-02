import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) throw err || new UnauthorizedException();
    const request = context.switchToHttp().getRequest();
    const path = request.path.replace(/\/$/, '');
    const passwordSetupRoute =
      (request.method === 'GET' && path.endsWith('/auth/me')) ||
      (request.method === 'POST' &&
        (path.endsWith('/auth/change-password') || path.endsWith('/auth/logout')));
    if (user.mustChangePassword && !passwordSetupRoute) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Vui lòng đổi mật khẩu trước khi sử dụng hệ thống',
      });
    }
    return user;
  }
}
