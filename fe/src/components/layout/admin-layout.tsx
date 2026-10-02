'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuth } from '@/contexts/auth-context';

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AdminLayout({ children, title = 'Dashboard' }: AdminLayoutProps) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [menuOpen]);

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="admin-workspace">
        <Header title={title} user={user} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((value) => !value)} />
        <main id="main-content" className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}
