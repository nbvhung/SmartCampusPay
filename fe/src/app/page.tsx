import Link from 'next/link';
import { ArrowUpRight, GraduationCap, ShieldCheck, Monitor, Wifi } from 'lucide-react';
import { PtitBrand } from '@/components/ui/ptit-brand';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function HomePage() {
  return (
    <div className="standalone-shell">
      <header className="standalone-header"><PtitBrand /><ThemeToggle /></header>
      <main className="home-content">
        <span className="home-kicker"><Wifi size={15} /> KẾT NỐI TRONG KHUÔN VIÊN</span>
        <h1>Một chạm.<br /><span>Mọi tiện ích.</span></h1>
        <p>Ví sinh viên, thẻ NFC và thanh toán nội bộ.<br />Tất cả trong một không gian, dành cho cộng đồng PTIT.</p>
        <div className="home-portals">{[
          { href: '/student/dashboard', icon: GraduationCap, title: 'Cổng sinh viên', description: 'Quản lý ví, nạp tiền và lịch sử thanh toán.' },
          { href: '/admin/dashboard', icon: ShieldCheck, title: 'Không gian quản trị', description: 'Theo dõi hoạt động và quản lý hệ thống.' },
          { href: '/pos', icon: Monitor, title: 'Thiết bị POS', description: 'Thanh toán bằng thẻ tại điểm bán.' },
        ].map(({ href, icon: Icon, title, description }) => <Link href={href} key={href} className="home-portal"><span className="stat-icon"><Icon size={24} /></span><h2>{title}<ArrowUpRight size={19} /></h2><p>{description}</p></Link>)}</div>
      </main>
      <footer className="student-footer">SmartCampusPay · PTIT<span>Thanh toán gọn gàng, mỗi ngày.</span></footer>
    </div>
  );
}
