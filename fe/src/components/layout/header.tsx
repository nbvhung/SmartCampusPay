'use client';
import { useState } from 'react';
import { LogOut, Menu, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/auth-api';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/theme-toggle';
interface HeaderProps {
  title: string;
  user?: { fullName?: string; studentCode?: string; role?: string } | null;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
}
export function Header({ title, user, menuOpen, onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  async function handleLogout() {
    if (leaving) return;
    setLeaving(true);
    try { await authApi.logout(); } catch { /* return to login */ }
    router.push('/login');
  }
  const name = user?.fullName || user?.studentCode || 'Quản trị viên';
  return <header className="app-header">
    <div className="header-title"><button className="mobile-menu icon-button" onClick={onMenuToggle} aria-label="Mở menu điều hướng" aria-expanded={menuOpen} aria-controls="admin-navigation"><Menu size={21} /></button><div><span className="header-eyebrow">SMARTCAMPUSPAY</span><h2>{title}</h2></div></div>
    <div className="header-actions"><ThemeToggle />{user && <><div className="header-user"><span className="user-avatar">{name.slice(0, 1).toUpperCase()}</span><div><p>{name}</p><small>{user.role === 'student' ? 'Sinh viên' : 'Quản trị viên'}</small></div></div><button disabled={leaving} onClick={handleLogout} className="icon-button logout-button" aria-label="Đăng xuất" title="Đăng xuất">{leaving ? <Loader2 className="animate-spin" size={19} /> : <LogOut size={19} />}</button></>}</div>
  </header>;
}
