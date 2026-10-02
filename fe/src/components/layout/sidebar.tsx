'use client';
import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Store, Receipt, Shield, CreditCard, Wallet, Monitor, Inbox, X } from 'lucide-react';
import { PtitBrand } from '@/components/ui/ptit-brand';
const navItems = [
  { href: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/admin/students', label: 'Sinh viên', icon: Users },
  { href: '/admin/cards', label: 'Thẻ sinh viên', icon: CreditCard },
  { href: '/admin/accounts', label: 'Ví điện tử', icon: Wallet },
  { href: '/admin/merchants', label: 'Điểm thanh toán', icon: Store },
  { href: '/admin/transactions', label: 'Giao dịch', icon: Receipt },
  { href: '/admin/topup-pending', label: 'Nạp chờ khớp', icon: Inbox },
  { href: '/admin/admins', label: 'Quản trị viên', icon: Shield },
];
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia('(max-width: 900px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const mobile = useSyncExternalStore(subscribeViewport, () => window.matchMedia('(max-width: 900px)').matches, () => false);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = ref.current;
    const elements = sidebar?.querySelectorAll<HTMLElement>('a, button');
    elements?.[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    sidebar?.addEventListener('keydown', trap);
    return () => { sidebar?.removeEventListener('keydown', trap); previous?.focus(); };
  }, [open, mobile]);
  return <>
    {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Đóng menu điều hướng" />}
    <aside ref={ref} inert={mobile && !open} id="admin-navigation" className={open ? 'app-sidebar is-open' : 'app-sidebar'} aria-label="Điều hướng quản trị">
      <div className="sidebar-brand"><Link href="/admin/dashboard" onClick={onClose}><PtitBrand /></Link><button className="sidebar-close icon-button" onClick={onClose} aria-label="Đóng menu"><X size={20} /></button></div>
      <div className="sidebar-caption">KHÔNG GIAN QUẢN TRỊ</div>
      <nav className="sidebar-nav">{navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return <Link key={href} href={href} onClick={onClose} className={active ? 'sidebar-link is-active' : 'sidebar-link'} aria-current={active ? 'page' : undefined}><Icon size={19} /><span>{label}</span>{active && <span className="nav-dot" />}</Link>;
      })}</nav>
      <div className="sidebar-bottom"><Link href="/pos" className="sidebar-link" onClick={onClose}><Monitor size={19} /><span>Thiết bị POS</span></Link><div className="sidebar-note"><Shield size={16} /><span>SmartCampusPay · PTIT<small>Quản lý thanh toán trong khuôn viên</small></span></div></div>
    </aside>
  </>;
}
