"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  LockKeyhole,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { PtitBrand } from "@/components/ui/ptit-brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { authApi } from "@/lib/auth-api";

type RegisterStep = "identity" | "otp" | "success";

interface ApiErrorBody {
  code?: string;
  message?: string | string[];
  retryAfterSeconds?: number;
}

function errorDetails(error: unknown, fallback: string) {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return { code: undefined, message: fallback, retryAfterSeconds: undefined };
  }
  if (!error.response) {
    return {
      code: undefined,
      message: "Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.",
      retryAfterSeconds: undefined,
    };
  }
  const data = error.response.data;
  const message = Array.isArray(data?.message)
    ? data.message.join(". ")
    : data?.message;
  return {
    code: data?.code,
    message: message || fallback,
    retryAfterSeconds: data?.retryAfterSeconds,
  };
}

function secondsRemaining(deadline: number, now: number) {
  return Math.max(Math.ceil((deadline - now) / 1000), 0);
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep>("identity");
  const [studentCode, setStudentCode] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [registrationId, setRegistrationId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestLock = useRef(false);
  const verifyLock = useRef(false);

  const expiresIn = secondsRemaining(expiresAt, clock);
  const resendIn = secondsRemaining(resendAt, clock);
  const expired = step === "otp" && expiresIn === 0;

  useEffect(() => {
    if (step !== "otp") return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(
      () => router.replace("/login/student"),
      1800,
    );
    return () => window.clearTimeout(timer);
  }, [router, step]);

  async function requestOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (requestLock.current) return;
    const normalizedCode = studentCode.trim().toUpperCase();
    const normalizedPhone = phone.trim();
    if (!/^[A-Z0-9]{5,20}$/.test(normalizedCode)) {
      setError("Mã sinh viên phải gồm 5–20 chữ cái hoặc chữ số.");
      return;
    }
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      setError("Số điện thoại phải có 10 chữ số và bắt đầu bằng 0.");
      return;
    }

    requestLock.current = true;
    setRequesting(true);
    setError("");
    setNotice("");
    try {
      const response = await authApi.requestRegistrationOtp(
        normalizedCode,
        normalizedPhone,
      );
      const challenge = response.data.data;
      const now = Date.now();
      setStudentCode(normalizedCode);
      setPhone(normalizedPhone);
      setRegistrationId(challenge.registrationId);
      setExpiresAt(now + challenge.expiresInSeconds * 1000);
      setResendAt(now + challenge.resendAfterSeconds * 1000);
      setClock(now);
      setOtp("");
      setNotice(
        step === "otp"
          ? "Đã gửi một mã OTP mới. Mã cũ không còn hiệu lực."
          : `Mã OTP đã được gửi đến số ${normalizedPhone}.`,
      );
      setStep("otp");
    } catch (caught) {
      const details = errorDetails(
        caught,
        "Không thể gửi OTP lúc này. Vui lòng thử lại.",
      );
      if (details.code === "OTP_RESEND_COOLDOWN" && details.retryAfterSeconds) {
        const now = Date.now();
        setClock(now);
        setResendAt(now + details.retryAfterSeconds * 1000);
      }
      setError(details.message);
    } finally {
      requestLock.current = false;
      setRequesting(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifyLock.current) return;
    if (expired) {
      setError("Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("OTP phải gồm đúng 6 chữ số.");
      return;
    }

    verifyLock.current = true;
    setVerifying(true);
    setError("");
    try {
      await authApi.verifyRegistration(registrationId, otp);
      setStep("success");
    } catch (caught) {
      const details = errorDetails(
        caught,
        "Không thể xác minh OTP. Vui lòng thử lại.",
      );
      if (
        details.code === "OTP_EXPIRED" ||
        details.code === "OTP_ATTEMPTS_EXHAUSTED"
      ) {
        setExpiresAt(Date.now());
      }
      setError(details.message);
    } finally {
      verifyLock.current = false;
      setVerifying(false);
    }
  }

  function editIdentity() {
    if (requesting || verifying) return;
    setStep("identity");
    setOtp("");
    setError("");
    setNotice("");
  }

  return (
    <main className="login-page register-page">
      <section className="login-form-panel" aria-label="Đăng ký SmartCampusPay">
        <header className="login-header">
          <Link
            href="/"
            className="login-brand"
            aria-label="SmartCampusPay — trang chủ"
          >
            <PtitBrand />
          </Link>
          <ThemeToggle />
        </header>

        <div className="login-content register-content">
          <div className="login-welcome">
            <div className="login-eyebrow">
              <span /> TỰ ĐĂNG KÝ TÀI KHOẢN SINH VIÊN
            </div>
            <h1>
              Khởi tạo
              <br />
              tài khoản<span className="login-heading-dot">.</span>
            </h1>
            <p>
              Xác minh số điện thoại để kích hoạt MSSV đã được nhà trường
              provision cùng thẻ NFC.
            </p>
          </div>

          <ol className="register-progress" aria-label="Tiến trình đăng ký">
            <li className={step === "identity" ? "is-current" : "is-complete"}>
              <span>1</span>Thông tin
            </li>
            <li
              className={
                step === "otp"
                  ? "is-current"
                  : step === "success"
                    ? "is-complete"
                    : ""
              }
            >
              <span>2</span>Xác minh OTP
            </li>
            <li className={step === "success" ? "is-current" : ""}>
              <span>3</span>Hoàn tất
            </li>
          </ol>

          {step === "identity" && (
            <form
              onSubmit={requestOtp}
              className="login-form"
              aria-busy={requesting}
            >
              <div className="login-field">
                <label htmlFor="studentCode">Mã sinh viên</label>
                <div className="login-input-wrap">
                  <UserRound size={19} aria-hidden="true" />
                  <input
                    id="studentCode"
                    value={studentCode}
                    onChange={(event) =>
                      setStudentCode(event.target.value.toUpperCase())
                    }
                    type="text"
                    placeholder="VD: B21DCCN001"
                    required
                    minLength={5}
                    maxLength={20}
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={requesting}
                  />
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="phone">Số điện thoại</label>
                <div className="login-input-wrap">
                  <Phone size={19} aria-hidden="true" />
                  <input
                    id="phone"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value.replace(/\D/g, "").slice(0, 10),
                      )
                    }
                    type="tel"
                    inputMode="numeric"
                    placeholder="VD: 0912345678"
                    required
                    pattern="0[0-9]{9}"
                    autoComplete="tel"
                    disabled={requesting}
                  />
                </div>
                <p className="register-field-help">
                  Số điện thoại này sẽ nhận OTP và trở thành mật khẩu đăng nhập
                  ban đầu.
                </p>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <Info size={18} />
                  <span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={requesting}
                className="login-submit"
              >
                <span>{requesting ? "Đang gửi OTP..." : "Nhận mã OTP"}</span>
                {requesting ? (
                  <Loader2 size={20} className="login-spinner" />
                ) : (
                  <ArrowRight size={20} />
                )}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form
              onSubmit={verifyOtp}
              className="login-form"
              aria-busy={verifying || requesting}
            >
              <div className="register-identity-summary">
                <div>
                  <small>Mã sinh viên</small>
                  <strong>{studentCode}</strong>
                </div>
                <div>
                  <small>Số điện thoại</small>
                  <strong>{phone}</strong>
                </div>
                <button
                  type="button"
                  onClick={editIdentity}
                  disabled={verifying || requesting}
                >
                  Thay đổi
                </button>
              </div>
              <div className="login-field">
                <div className="login-label-row">
                  <label htmlFor="otp">Mã OTP</label>
                  <span
                    className={
                      expired ? "register-expired" : "register-countdown"
                    }
                  >
                    {expired ? "Đã hết hạn" : `Còn ${expiresIn}s`}
                  </span>
                </div>
                <div className="login-input-wrap register-otp-input">
                  <LockKeyhole size={19} aria-hidden="true" />
                  <input
                    id="otp"
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Nhập 6 chữ số"
                    required
                    minLength={6}
                    maxLength={6}
                    disabled={verifying || requesting}
                    autoFocus
                  />
                </div>
              </div>

              {notice && (
                <div className="register-notice" role="status">
                  <Check size={18} />
                  <span>{notice}</span>
                </div>
              )}
              {error && (
                <div className="login-error" role="alert">
                  <Info size={18} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || requesting || expired}
                className="login-submit"
              >
                <span>
                  {verifying ? "Đang xác minh..." : "Xác minh và đăng ký"}
                </span>
                {verifying ? (
                  <Loader2 size={20} className="login-spinner" />
                ) : (
                  <ShieldCheck size={20} />
                )}
              </button>
              <button
                type="button"
                className="register-resend"
                onClick={() => void requestOtp()}
                disabled={requesting || verifying || resendIn > 0}
              >
                {requesting ? (
                  <Loader2 size={16} className="login-spinner" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {resendIn > 0 ? `Gửi lại sau ${resendIn}s` : "Gửi lại mã OTP"}
              </button>
            </form>
          )}

          {step === "success" && (
            <div className="register-success" role="status">
              <span>
                <CheckCircle2 size={34} />
              </span>
              <h2>Đăng ký thành công</h2>
              <p>
                Tài khoản <strong>{studentCode}</strong> đã được kích hoạt. Dùng
                số điện thoại đã xác minh làm mật khẩu ban đầu.
              </p>
              <div className="register-redirect">
                <Loader2 size={16} className="login-spinner" /> Đang chuyển về
                trang đăng nhập...
              </div>
              <Link href="/login/student">Đến trang đăng nhập ngay</Link>
            </div>
          )}

          <div className="register-login-link">
            <span>Đã có tài khoản?</span>
            <Link href="/login/student">
              <ArrowLeft size={15} /> Quay lại đăng nhập
            </Link>
          </div>
        </div>

        <footer className="login-footer">
          <span>© {new Date().getFullYear()} SmartCampusPay</span>
          <span>
            <LockKeyhole size={13} /> Xác minh bảo mật
          </span>
        </footer>
      </section>

      <aside
        className="login-story-panel register-story-panel"
        aria-label="Các bước đăng ký tài khoản"
      >
        <div className="login-story-grid" aria-hidden="true" />
        <div className="login-story-top">
          <span className="login-campus-tag">
            <span /> PTIT CAMPUS
          </span>
        </div>
        <div className="register-story">
          <div className="register-story-icon">
            <ShieldCheck size={38} />
          </div>
          <div className="login-story-kicker">
            ĐĂNG KÝ AN TOÀN, KHÔNG TỰ ĐỘNG ĐĂNG NHẬP
          </div>
          <h2>
            Ba bước.
            <br />
            Một tài khoản.
          </h2>
          <div className="register-story-steps">
            <div>
              <span>01</span>
              <p>
                <strong>Nhập MSSV và số điện thoại</strong>
                <small>MSSV và thẻ vật lý phải được cấp phát trước.</small>
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Xác minh mã OTP</strong>
                <small>Mã chỉ có hiệu lực trong thời gian hiển thị.</small>
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Đăng nhập lần đầu</strong>
                <small>
                  Dùng số điện thoại và đổi mật khẩu theo hướng dẫn.
                </small>
              </p>
            </div>
          </div>
        </div>
        <div className="login-story-bottom">
          <span>
            HỌC VIỆN CÔNG NGHỆ
            <br />
            BƯU CHÍNH VIỄN THÔNG
          </span>
          <span className="login-bottom-symbol">
            scp<span>↗</span>
          </span>
        </div>
      </aside>
    </main>
  );
}
