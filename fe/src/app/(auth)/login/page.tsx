'use client';

import { useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import axios from 'axios';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, CreditCard, Eye, EyeOff, Fingerprint, Info, Loader2, LockKeyhole, ShieldCheck, Sparkles, UserRound, Wifi } from 'lucide-react';
import { authApi } from '@/lib/auth-api';
import { useAuth } from '@/contexts/auth-context';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { PtitBrand } from '@/components/ui/ptit-brand';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const submitting = useRef(false);
  const helpRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const portal = pathname === '/login/student' ? 'student' : pathname === '/login/admin' ? 'admin' : null;
  const { setUser, setMustChangePassword } = useAuth();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portal) return;
    if (submitting.current) return;
    const form = event.currentTarget;
    const identifier = (form.elements.namedItem('identifier') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (!identifier || !password) { setError('Vui lòng nhập tên đăng nhập và mật khẩu.'); return; }
    submitting.current = true;
    setError('');
    setIsLoading(true);
    try {
      const res = await (portal === 'student' ? authApi.login(identifier, password) : authApi.adminLogin(identifier, password));
      const data = res.data?.data;
      if (!data?.user) throw new Error('Không nhận được thông tin tài khoản. Vui lòng thử lại.');
      setUser(data.user);
      setMustChangePassword(data.mustChangePassword ?? false);
      router.replace(data.user.role === 'student'
        ? data.mustChangePassword ? '/change-password' : '/student/dashboard'
        : '/admin/dashboard');
    } catch (err: unknown) {
      const message = axios.isAxiosError<{ message?: string | string[] }>(err) ? err.response?.data?.message : undefined;
      setError(Array.isArray(message) ? message.join('. ') : message || (axios.isAxiosError(err) && !err.response
        ? 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.' : 'Tên đăng nhập hoặc mật khẩu chưa đúng. Vui lòng thử lại.'));
      submitting.current = false;
      setIsLoading(false);
    }
  }

  function openHelp() {
    setHelpOpen(true);
    requestAnimationFrame(() => helpRef.current?.querySelector('summary')?.focus());
  }

  return (
    <main className="login-page">
      <section className="login-form-panel" aria-label="Đăng nhập SmartCampusPay">
        <header className="login-header">
          <Link href="/" className="login-brand" aria-label="SmartCampusPay — trang chủ">
            <PtitBrand />
          </Link>
          <ThemeToggle />
        </header>

        <div className="login-content">
          <div className="login-welcome">
            <div className="login-eyebrow"><span /> KẾT NỐI VỚI KHUÔN VIÊN CỦA BẠN</div>
            <h1>Chào mừng<br />trở lại<span className="login-heading-dot">.</span></h1>
            <p>{portal === 'admin' ? 'Đăng nhập cổng quản trị để quản lý hệ thống.' : portal === 'student' ? 'Đăng nhập cổng sinh viên để quản lý ví và giao dịch của bạn.' : 'Chọn cổng đăng nhập phù hợp với tài khoản được cấp.'}</p>
          </div>

          {!portal ? <div className="login-portal-options">
            <Link href="/login/student" className="login-portal-option"><UserRound size={23} /><div><strong>Sinh viên</strong><small>Xem ví, nạp tiền và giao dịch của bạn.</small></div><ArrowRight size={20} /></Link>
            <Link href="/login/admin" className="login-portal-option"><ShieldCheck size={23} /><div><strong>Quản trị viên</strong><small>Quản lý sinh viên, thẻ, ví và điểm thanh toán.</small></div><ArrowRight size={20} /></Link>
          </div> : <><div className="login-portal-heading"><strong>{portal === 'student' ? 'Cổng sinh viên' : 'Cổng quản trị'}</strong><Link href="/login">Đổi cổng đăng nhập</Link></div>
          <form key={portal} onSubmit={handleSubmit} className="login-form" aria-busy={isLoading}>
            <div className="login-field">
              <label htmlFor="identifier">{portal === 'student' ? 'Mã sinh viên' : 'Tên đăng nhập quản trị'}</label>
              <div className="login-input-wrap">
                <UserRound size={19} aria-hidden="true" />
                <input id="identifier" name="identifier" type="text" placeholder={portal === 'student' ? 'Nhập mã sinh viên' : 'Nhập tài khoản quản trị'}
                  required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={50}
                  disabled={isLoading} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
              </div>
            </div>

            <div className="login-field">
              <div className="login-label-row"><label htmlFor="password">Mật khẩu</label><button type="button" onClick={openHelp} className="login-text-button">Quên mật khẩu?</button></div>
              <div className="login-input-wrap">
                <LockKeyhole size={19} aria-hidden="true" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Nhập mật khẩu của bạn"
                  required autoComplete="current-password" disabled={isLoading} aria-invalid={!!error}
                  aria-describedby={[error ? 'login-error' : '', capsLock ? 'login-caps-lock' : ''].filter(Boolean).join(' ') || undefined}
                  onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))}
                  onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} />
                <button className="login-password-toggle" type="button" onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} aria-controls="password">
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {capsLock && <p id="login-caps-lock" className="login-caps-lock">Caps Lock đang bật.</p>}
            </div>

            {error && <div id="login-error" className="login-error" role="alert"><Info size={18} /><span>{error}</span></div>}

            <button type="submit" disabled={isLoading} className="login-submit">
              <span>{isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
              {isLoading ? <Loader2 size={20} className="login-spinner" /> : <ArrowRight size={20} />}
            </button>
          </form>
          {portal === 'student' && <div className="register-login-link"><span>Chưa có tài khoản?</span><Link href="/register">Đăng ký</Link></div>}
          </>}

          <div className="login-divider"><span /> MỘT TÀI KHOẢN, MỌI TIỆN ÍCH <span /></div>
          <div className="login-account-note"><span className="login-note-icon"><ShieldCheck size={21} /></span><p>{portal === 'admin' ? 'Quyền quản trị theo tài khoản được cấp' : 'Truy cập đúng cổng tài khoản'}<small>{portal === 'admin' ? 'Chỉ quản trị cấp cao được tạo, sửa, khóa và xóa quản trị viên.' : 'Sinh viên chỉ truy cập ví và giao dịch cá nhân.'}</small></p></div>

          <details className="login-help" ref={helpRef} open={helpOpen} onToggle={event => setHelpOpen(event.currentTarget.open)}>
            <summary><span><Info size={16} /> Lần đầu đăng nhập hoặc cần hỗ trợ?</span><ChevronDown size={16} /></summary>
            <div>{portal === 'student' ? <><p>Sinh viên mới chọn <strong>Đăng ký</strong>, nhập mã sinh viên và số điện thoại để nhận OTP. MSSV và thẻ vật lý cần được nhà trường cấp phát trước.</p><p>Sau khi đăng ký thành công, đăng nhập bằng <strong>mã sinh viên</strong> và dùng <strong>số điện thoại đã xác minh</strong> làm mật khẩu ban đầu. Hệ thống sẽ yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.</p></> : <p>Quản trị viên đăng nhập bằng tài khoản được cấp. Nếu quên mật khẩu hoặc không thể truy cập, hãy liên hệ quản trị viên cấp cao để được hỗ trợ.</p>}</div>
          </details>
        </div>

        <footer className="login-footer"><span>© {new Date().getFullYear()} SmartCampusPay</span><span><LockKeyhole size={13} /> Kết nối trong khuôn viên</span></footer>
      </section>

      <aside className="login-story-panel" aria-label="Thanh toán trong khuôn viên PTIT">
        <div className="login-story-grid" aria-hidden="true" />
        <div className="login-story-top"><span className="login-campus-tag"><span /> PTIT CAMPUS</span><span className="login-story-edition">ĐƠN GIẢN HƠN MỖI NGÀY <ArrowUpRight size={16} /></span></div>

        <div className="login-artwork" aria-hidden="true">
          <div className="login-orbit login-orbit-outer" /><div className="login-orbit login-orbit-inner" />
          <span className="login-orbit-dot login-orbit-dot-one" /><span className="login-orbit-dot login-orbit-dot-two" />
          <div className="login-logo-disc"><Image src="/ptit-logo.png" alt="" width={306} height={247} preload className="login-ptit-logo" /></div>
          <div className="login-floating-card"><div className="login-card-top"><span>THẺ SINH VIÊN</span><Wifi size={21} /></div><div className="login-card-chip"><span /><span /><span /><span /></div><div className="login-card-bottom"><span>PTIT<span>SMART CAMPUS</span></span><Fingerprint size={28} strokeWidth={1.4} /></div></div>
          <div className="login-tap-badge"><span><Check size={16} /></span><div>Một chạm, thật tiện<small>Thanh toán bằng thẻ sinh viên</small></div></div>
          <span className="login-art-spark"><Sparkles size={24} strokeWidth={1.5} /></span>
        </div>

        <div className="login-story-copy"><div className="login-story-kicker">THẺ SINH VIÊN. THÊM NHIỀU KHẢ NĂNG.</div><h2>Một chạm.<br />Cả khuôn viên.</h2><p>Từ căng tin đến những tiện ích hằng ngày.<br />Trải nghiệm thanh toán gọn gàng, ngay trên thẻ của bạn.</p><div className="login-story-pills"><span><CreditCard size={15} /> Thanh toán NFC</span><span><ShieldCheck size={15} /> Quản lý ví</span></div></div>

        <div className="login-story-bottom"><span>HỌC VIỆN CÔNG NGHỆ<br />BƯU CHÍNH VIỄN THÔNG</span><span className="login-bottom-symbol">scp<span>↗</span></span></div>
      </aside>
    </main>
  );
}
