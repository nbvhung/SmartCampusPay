'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { PtitBrand } from '@/components/ui/ptit-brand';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { authApi } from '@/lib/auth-api';

export default function ChangePasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const form = e.currentTarget;
    const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.changePassword({ newPassword });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message || 'Đổi mật khẩu thất bại' : 'Đổi mật khẩu thất bại';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="standalone-shell">
      <header className="standalone-header"><PtitBrand /><ThemeToggle /></header>
      <main className="standalone-content"><div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-7 w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Đặt mật khẩu mới</h1>
          <p className="text-gray-500 text-sm mt-3 leading-relaxed">
            Bạn đang đăng nhập lần đầu. Vui lòng đặt mật khẩu mới để bảo mật tài khoản.
          </p>
        </div>

        {success ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 border border-green-400/40 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-gray-900 font-semibold" role="status">Đổi mật khẩu thành công!</p>
            <p className="text-gray-500 text-sm mt-1">Đang chuyển về trang đăng nhập...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu mới
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Ít nhất 6 ký tự"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-400 transition"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Xác nhận mật khẩu
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-400 transition"
              />
            </div>

            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  Đang xử lý...
                </span>
              ) : 'Xác nhận đổi mật khẩu'}
            </button>

            <p className="text-center text-xs text-gray-500 mt-2 leading-relaxed">
              Sau khi đổi mật khẩu, bạn sẽ được yêu cầu đăng nhập lại.
            </p>
          </form>
        )}
      </div></main>
    </div>
  );
}
