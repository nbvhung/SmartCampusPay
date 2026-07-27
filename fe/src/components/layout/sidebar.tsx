'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Store, Receipt, Shield, Monitor, LogOut } from 'lucide-react';
import { authApi } from '@/lib/auth-api';

const navItems = [
  { href: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/admin/students', label: 'Sinh viên', icon: Users },
  { href: '/admin/merchants', label: 'Điểm thanh toán', icon: Store },
  { href: '/admin/transactions', label: 'Giao dịch', icon: Receipt },
  { href: '/admin/admins', label: 'Quản trị viên', icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    router.push('/login');
  }

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="p-5 border-b border-gray-800">
        <h1 className="text-lg font-bold">SmartCampusPay</h1>
        <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        <div className="pt-3 mt-3 border-t border-gray-800">
          <Link
            href="/pos"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-green-400 hover:bg-gray-800 hover:text-green-300 transition-colors"
          >
            <Monitor className="w-5 h-5 shrink-0" />
            POS (Test)
          </Link>
        </div>
      </nav>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
