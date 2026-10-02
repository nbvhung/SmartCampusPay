'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, Plus, History, User, Monitor, LogOut, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/auth-api';
import { PtitBrand } from '@/components/ui/ptit-brand';
import { ThemeToggle } from '@/components/ui/theme-toggle';
const navItems = [
  { href: '/student/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/student/topup', label: 'Nạp tiền', icon: Plus },
  { href: '/student/transactions', label: 'Lịch sử', icon: History },
  { href: '/student/profile', label: 'Hồ sơ', icon: User },
];
export function StudentLayout({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const { setUser, setMustChangePassword } = useAuth();
  const [leaving, setLeaving] = useState(false);
  async function handleLogout() {
    if (leaving) return;
    setLeaving(true);
    try { await authApi.logout(); } catch { /* return to login */ }
    setUser(null);
    setMustChangePassword(false);
    window.location.href = '/login/student';
  }
  return <div className="student-shell">
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    <header className="student-header"><div className="student-header-inner">
      <Link href="/student/dashboard" aria-label="SmartCampusPay — trang sinh viên"><PtitBrand /></Link>
      <nav className="student-desktop-nav" aria-label="Điều hướng sinh viên">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'student-nav-link is-active' : 'student-nav-link'} aria-current={pathname === href ? 'page' : undefined}><Icon size={17} />{label}</Link>)}</nav>
      <div className="header-actions"><Link href="/pos" className="icon-button student-pos-link" aria-label="Thiết bị POS" title="Thiết bị POS"><Monitor size={19} /></Link><ThemeToggle /><button disabled={leaving} onClick={handleLogout} className="icon-button logout-button" aria-label="Đăng xuất" title="Đăng xuất">{leaving ? <Loader2 className="animate-spin" size={19} /> : <LogOut size={19} />}</button></div>
    </div></header>
    <main id="main-content" className="student-content">{title && <div className="page-heading"><span className="header-eyebrow">KHÔNG GIAN SINH VIÊN</span><h1>{title}</h1></div>}{children}</main>
    <footer className="student-footer">SmartCampusPay · PTIT<span>Thanh toán gọn gàng, mỗi ngày.</span></footer>
    <nav className="student-mobile-nav" aria-label="Điều hướng sinh viên">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'is-active' : ''} aria-current={pathname === href ? 'page' : undefined}><Icon size={20} /><span>{label}</span></Link>)}</nav>
  </div>;
}
