'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/auth-api';

export default function LoginPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const form = e.currentTarget;
    const identifier = (form.elements.namedItem('identifier') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      if (isAdmin) {
        await authApi.adminLogin(identifier, password);
        router.push('/admin/dashboard');
      } else {
        const res = await authApi.studentLogin(identifier, password);
        const data = res.data?.data;
        if (data?.mustChangePassword) {
          router.push('/change-password');
        } else {
          router.push('/student/dashboard');
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Đăng nhập thất bại';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-red-950">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500 rounded-2xl mb-4 shadow-lg">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SmartCampusPay</h1>
          <p className="text-red-200 text-sm mt-1">
            {isAdmin ? 'Đăng nhập quản trị' : 'Cổng sinh viên'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-red-100 mb-1">
              {isAdmin ? 'Tên đăng nhập' : 'Mã sinh viên'}
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder={isAdmin ? 'admin' : 'Nhập mã sinh viên...'}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-red-100 mb-1">
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder={isAdmin ? '••••••••' : 'Ngày sinh (ddmmyyyy) hoặc mật khẩu mới'}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition"
            />
            {!isAdmin && (
              <p className="mt-1 text-xs text-red-300">
                Đăng nhập lần đầu: dùng ngày sinh theo định dạng <strong>ddmmyyyy</strong> (VD: 15032004)
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400/40 rounded-lg px-4 py-3 text-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-red-500 hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-red-500/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin w-4 h-4" />
                Đang đăng nhập...
              </span>
            ) : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setIsAdmin(!isAdmin); setError(''); }}
            className="text-sm text-red-300 hover:text-white transition-colors underline underline-offset-2"
          >
            {isAdmin ? '← Đăng nhập sinh viên' : 'Đăng nhập quản trị →'}
          </button>
        </div>
      </div>
    </div>
  );
}
