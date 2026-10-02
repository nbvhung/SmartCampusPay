import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('Password setup permissions', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const user = { role: 'student', mustChangePassword: true };
  function context(path: string, method = 'GET') {
    return { switchToHttp: () => ({ getRequest: () => ({ path, method }) }) } as ExecutionContext;
  }
  it.each([
    ['/api/v1/auth/me', 'GET'],
    ['/api/v1/auth/change-password', 'POST'],
    ['/api/v1/auth/logout', 'POST'],
  ])('allows %s during password setup', (path, method) => {
    expect(guard.handleRequest(null, user, null, context(path, method))).toBe(user);
  });
  it('blocks business endpoints until password has changed', () => {
    expect(() => guard.handleRequest(null, user, null, context('/api/v1/transactions/student/SV001'))).toThrow(ForbiddenException);
  });
  it('allows normal sessions and rejects anonymous users', () => {
    const normal = { role: 'student', mustChangePassword: false };
    expect(guard.handleRequest(null, normal, null, context('/api/v1/transactions/student/SV001'))).toBe(normal);
    expect(() => guard.handleRequest(null, null, null, context('/api/v1/auth/me'))).toThrow(UnauthorizedException);
  });
});
