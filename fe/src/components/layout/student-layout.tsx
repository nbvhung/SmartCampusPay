'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Plus, History, Monitor, LogOut } from 'lucide-react';
import { authApi } from '@/lib/auth-api';

interface StudentLayoutProps {
  children: ReactNode;
  title?: string;
}

const navItems = [
  { href: '/student/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/student/topup', label: 'Nạp tiền', icon: Plus },
  { href: '/student/transactions', label: 'Lịch sử', icon: History },
];

export function StudentLayout({ children, title }: StudentLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/student/dashboard" className="font-bold text-lg text-gray-900">
              SmartCampusPay
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/pos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-green-600 hover:bg-green-50 transition-colors"
              >
                <Monitor className="w-4 h-4" />
                POS
              </Link>
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {title && <h1 className="text-2xl font-bold text-gray-900 mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
