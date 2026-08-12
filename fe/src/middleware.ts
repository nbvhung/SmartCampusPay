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
const AUTH_ROUTES = ['/login', '/change-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  const isProtectedStudent = PROTECTED_STUDENT.some((p) => pathname.startsWith(p));
  const isProtectedAdmin = PROTECTED_ADMIN.some((p) => pathname.startsWith(p));
  const isProtected = isProtectedStudent || isProtectedAdmin;

  if (isProtected && !accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (accessToken) {
    try {
      const payload = jwtDecode<JwtPayload>(accessToken);
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp < now) {
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
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
