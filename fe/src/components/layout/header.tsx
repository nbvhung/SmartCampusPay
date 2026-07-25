'use client';
import { LogOut } from 'lucide-react';
import { authApi } from '@/lib/auth-api';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title: string;
  user?: { fullName?: string; studentCode?: string; role?: string } | null;
}

export function Header({ title, user }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    router.push('/login');
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

      {user && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user.fullName || user.studentCode}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role === 'student' ? 'Sinh viên' : 'Quản trị'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      )}
    </header>
  );
}
