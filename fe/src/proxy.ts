import { NextRequest, NextResponse } from 'next/server';
import { jwtDecode } from 'jwt-decode';

interface JwtPayload {
  sub: string;
  role: string;
  mustChangePassword?: boolean;
  exp: number;
}

const PROTECTED_STUDENT = ['/student'];
const PROTECTED_ADMIN = ['/admin'];
const AUTH_ROUTES = ['/login', '/login/student', '/login/admin', '/register', '/change-password'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  const isProtectedStudent = PROTECTED_STUDENT.some((p) => pathname.startsWith(p));
  const isProtectedAdmin = PROTECTED_ADMIN.some((p) => pathname.startsWith(p));
  const isProtected = isProtectedStudent || isProtectedAdmin || pathname === '/change-password';

  if (isProtected && !accessToken) {
    const loginUrl = new URL(isProtectedAdmin ? '/login/admin' : '/login/student', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (accessToken) {
    try {
      const payload = jwtDecode<JwtPayload>(accessToken);
      const now = Math.floor(Date.now() / 1000);

      if (!['student', 'admin', 'super_admin'].includes(payload.role) || !Number.isFinite(payload.exp)) throw new Error('Invalid session');
      // AuthBoundary waits for backend verification and refresh before mounting pages.
      if (payload.exp <= now) {
        return NextResponse.next();
      }

      if (payload.mustChangePassword && pathname !== '/change-password') {
        return NextResponse.redirect(new URL('/change-password', request.url));
      }

      if (AUTH_ROUTES.includes(pathname) && !payload.mustChangePassword) {
        if (payload.role === 'student') {
          return NextResponse.redirect(new URL('/student/dashboard', request.url));
        }
        if (payload.role === 'admin' || payload.role === 'super_admin') {
          return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        }
      }

      if (isProtectedAdmin && payload.role === 'student') {
        return NextResponse.redirect(new URL('/student/dashboard', request.url));
      }
      if (isProtectedStudent && payload.role !== 'student') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    } catch {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('access_token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/student/:path*', '/admin/:path*', '/login/:path*', '/register/:path*', '/change-password',
  ],
};
