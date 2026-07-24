import { NextRequest, NextResponse } from 'next/server';
import { jwtDecode } from 'jwt-decode';

interface JwtPayload {
  sub: string;
  role: string;
  mustChangePassword?: boolean;
  exp: number;
}

// Routes yêu cầu đăng nhập
const PROTECTED_STUDENT = ['/student'];
const PROTECTED_ADMIN = ['/admin'];
const AUTH_ROUTES = ['/login', '/change-password'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  const isProtectedStudent = PROTECTED_STUDENT.some((p) => pathname.startsWith(p));
  const isProtectedAdmin = PROTECTED_ADMIN.some((p) => pathname.startsWith(p));
  const isProtected = isProtectedStudent || isProtectedAdmin;

  // Nếu không có token mà truy cập route bảo vệ → login
  if (isProtected && !accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Có token → decode (không verify, việc verify là của BE)
  if (accessToken) {
    try {
      const payload = jwtDecode<JwtPayload>(accessToken);
      const now = Math.floor(Date.now() / 1000);

      // Token hết hạn → để axios interceptor tự refresh, không block ở đây
      if (payload.exp < now) {
        // Cho qua, axios sẽ refresh khi nhận 401 từ BE
        return NextResponse.next();
      }

      // mustChangePassword=true → chỉ được vào /change-password
      if (payload.mustChangePassword && pathname !== '/change-password') {
        return NextResponse.redirect(new URL('/change-password', request.url));
      }

      // Đã login mà vào trang login → redirect về dashboard
      if (AUTH_ROUTES.includes(pathname) && !payload.mustChangePassword) {
        if (payload.role === 'student') {
          return NextResponse.redirect(new URL('/student/dashboard', request.url));
        }
        if (payload.role === 'admin' || payload.role === 'super_admin') {
          return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        }
      }

      // Admin route nhưng role là student → 403
      if (isProtectedAdmin && payload.role === 'student') {
        return NextResponse.redirect(new URL('/student/dashboard', request.url));
      }
    } catch {
      // Token không decode được → xoá cookie và về login
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
