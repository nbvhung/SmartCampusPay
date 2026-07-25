'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, CheckCircle, Loader2 } from 'lucide-react';
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
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Đổi mật khẩu thất bại';
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
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Đặt mật khẩu mới</h1>
          <p className="text-red-200 text-sm mt-2">
            Bạn đang đăng nhập lần đầu. Vui lòng đặt mật khẩu mới để bảo mật tài khoản.
          </p>
        </div>

        {success ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 border border-green-400/40 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-white font-semibold">Đổi mật khẩu thành công!</p>
            <p className="text-red-200 text-sm mt-1">Đang chuyển về trang đăng nhập...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-red-100 mb-1">
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
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-red-100 mb-1">
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
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition"
              />
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
                  Đang xử lý...
                </span>
              ) : 'Xác nhận đổi mật khẩu'}
            </button>

            <p className="text-center text-xs text-red-300 mt-2">
              Sau khi đổi mật khẩu, bạn sẽ được yêu cầu đăng nhập lại.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
