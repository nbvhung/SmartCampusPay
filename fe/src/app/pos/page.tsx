'use client';
import { PtitBrand } from '@/components/ui/ptit-brand';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CreditCard, Loader2, CheckCircle, XCircle, Store } from 'lucide-react';
import { posApi } from '@/lib/pos-api';
import type { Transaction } from '@/types';
import { readPendingPayment, preparePayment, finishPayment, recoverPendingPayment, type PendingPayment } from '@/lib/pos-payment';

const TERMINAL_CODES = new Set(['CARD_INACTIVE', 'CARD_NOT_FOUND', 'STUDENT_INACTIVE', 'ACCOUNT_NOT_FOUND', 'ACCOUNT_FROZEN', 'INSUFFICIENT_BALANCE', 'DAILY_LIMIT_EXCEEDED', 'INVALID_CARD_UID', 'INVALID_AMOUNT', 'VALIDATION_ERROR']);
const POS_TEST_CONSOLE_ENABLED = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_POS_TEST_CONSOLE === 'true';

export default function PosPage() {
  const [apiKey, setApiKey] = useState('');
  const [uid, setUid] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [ready, setReady] = useState(false);
  const sending = useRef(false);
  const [result, setResult] = useState<{
    ok: boolean;
    tx?: Transaction;
    error?: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    if (!POS_TEST_CONSOLE_ENABLED) return;
    let active = true;
    // Restore before enabling payment; never overwrite an unresolved key.
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = readPendingPayment(localStorage);
        if (saved) {
          setPending(saved);
          setUid(saved.cardUid);
          setAmount(String(saved.amount));
          setResult({
            ok: false,
            error: 'Có giao dịch chưa rõ kết quả. Nhập lại API key của thiết bị và xác minh bằng nút bên dưới.',
          });
        }
        setReady(true);
      } catch {
        setResult({
          ok: false,
          error: 'Không thể khôi phục/lưu giao dịch. Cần kiểm tra dữ liệu trình duyệt trước khi thanh toán.',
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!POS_TEST_CONSOLE_ENABLED) {
    return (
      <div className="standalone-shell">
        <header className="standalone-header">
          <PtitBrand />
          <ThemeToggle />
        </header>
        <main className="standalone-content">
          <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Store className="mx-auto mb-4 h-10 w-10 text-red-600" />
            <h1 className="text-2xl font-bold text-gray-900">POS production dùng thiết bị NFC</h1>
            <p className="mt-3 text-sm text-gray-600">Web POS là test console và bị tắt mặc định trong production. API key merchant phải được provision vào NVS của thiết bị, không nhập trong trình duyệt công khai.</p>
          </div>
        </main>
      </div>
    );
  }

  async function handlePay() {
    if (sending.current) return;
    // Serialize POS tabs sharing this browser's pending transaction.
    if (!navigator.locks) {
      setResult({
        ok: false,
        error: 'Trình duyệt cần hỗ trợ Web Locks qua HTTPS hoặc localhost.',
      });
      return;
    }
    sending.current = true;
    try {
      await navigator.locks.request('smartcampuspay.pos-payment', { ifAvailable: true }, (lock) => {
        if (!lock) {
          setResult({
            ok: false,
            error: 'Một tab POS khác đang xử lý giao dịch. Chờ kết quả trước khi thử lại.',
          });
          return;
        }
        return pending ? verifyPendingPayment() : sendPayment();
      });
    } finally {
      sending.current = false;
    }
  }

  async function verifyPendingPayment() {
    if (!pending || !apiKey.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      // Reuse preparePayment to verify that the operator entered the same
      // merchant key that created the pending request.
      const request = await preparePayment(localStorage, apiKey, pending.cardUid, pending.amount);
      const res = await recoverPendingPayment(
        request,
        (idempotencyKey) => posApi.findPayment(apiKey.trim(), idempotencyKey),
        (saved) => posApi.payByCard(apiKey.trim(), saved.cardUid, saved.amount, saved.idempotencyKey),
      );
      finishPayment(localStorage, request.idempotencyKey);
      setPending(null);
      setResult({ ok: true, tx: res.data.data });
      setPaid(true);
    } catch (err: unknown) {
      const response = axios.isAxiosError<{ code?: string; message?: string }>(err) ? err.response : undefined;
      if (response?.data?.code && TERMINAL_CODES.has(response.data.code)) {
        finishPayment(localStorage, pending.idempotencyKey);
        setPending(null);
        setResult({
          ok: false,
          title: 'Thanh toán bị từ chối',
          error: response.data.message || 'Thanh toán bị từ chối',
        });
      } else {
        const message = response?.data?.message;
        setResult({
          ok: false,
          title: 'Chưa thể xác minh',
          error: message || (err instanceof Error && !axios.isAxiosError(err) ? err.message : 'Giữ nguyên giao dịch, kiểm tra API Key/kết nối rồi thử lại.'),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendPayment() {
    if (!ready || paid || !apiKey.trim() || !uid.trim() || !amount) return;
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) < 100 || Number(amount) > 10000000) {
      setResult({
        ok: false,
        error: 'Nhập số tiền nguyên từ 100 đến 10.000.000 đồng.',
      });
      return;
    }
    setLoading(true);
    setResult(null);
    let request: PendingPayment | null = null;
    try {
      request = await preparePayment(localStorage, apiKey, uid, Number(amount));
      setPending(request);
      setUid(request.cardUid);
      setAmount(String(request.amount));
      const res = await posApi.payByCard(apiKey.trim(), request.cardUid, request.amount, request.idempotencyKey);
      finishPayment(localStorage, request.idempotencyKey);
      setPending(null);
      setResult({ ok: true, tx: res.data.data });
      setPaid(true);
    } catch (err: unknown) {
      const response = axios.isAxiosError<{ code?: string; message?: string }>(err) ? err.response : undefined;
      const detail = response?.data;
      if (request && (response?.status === 401 || (detail?.code && TERMINAL_CODES.has(detail.code)))) {
        finishPayment(localStorage, request.idempotencyKey);
        setPending(null);
        setResult({
          ok: false,
          title: response?.status === 401 ? 'API Key không hợp lệ' : 'Thanh toán bị từ chối',
          error: detail?.message || 'Thanh toán bị từ chối',
        });
      } else {
        setResult({
          ok: false,
          error: 'Chưa xác định kết quả. Giữ nguyên giao dịch và thử xác minh lại. ' + (detail?.message || (err instanceof Error && !axios.isAxiosError(err) ? err.message : '')),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDiscardPending() {
    if (!pending || loading) return;
    const confirmed = window.confirm('Chỉ xóa dữ liệu chờ khi bạn đã kiểm tra giao dịch chưa trừ tiền. Tiếp tục?');
    if (!confirmed) return;
    finishPayment(localStorage, pending.idempotencyKey);
    setPending(null);
    setUid('');
    setAmount('');
    setResult({
      ok: false,
      title: 'Đã xóa dữ liệu chờ',
      error: 'Bạn có thể nhập lại UID thẻ và số tiền.',
    });
  }

  function handleReset() {
    setPaid(false);
    setResult(null);
    setUid('');
    setAmount('');
  }

  return (
    <div className="standalone-shell">
      <header className="standalone-header">
        <PtitBrand />
        <ThemeToggle />
      </header>
      <main className="standalone-content">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 text-red-600 rounded-2xl mb-3">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">POS Thanh toán</h1>
          <p className="text-sm text-gray-500 mt-1">Test console — không dùng làm POS production</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={paid || loading} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UID thẻ</label>
            <input value={uid} onChange={(e) => setUid(e.target.value)} disabled={paid || loading || !!pending} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1000} disabled={paid || loading || !!pending} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100" />
          </div>

          <button onClick={handlePay} disabled={!ready || loading || paid || !apiKey.trim() || !uid.trim() || !amount} className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            {loading ? (
              <>
                <Loader2 className="animate-spin w-5 h-5" />
                Đang xử lý...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                {pending ? 'Xác minh lại giao dịch' : 'Thanh toán'}
              </>
            )}
          </button>

          {pending && !loading && (
            <button type="button" onClick={handleDiscardPending} className="w-full text-sm text-gray-500 hover:text-red-500 underline underline-offset-2">
              Xóa dữ liệu giao dịch đang chờ
            </button>
          )}

          {result && (
            <div className={`rounded-xl p-4 ${result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.ok ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                <span className={`font-semibold ${result.ok ? 'text-green-700' : 'text-red-700'}`}>{result.title || (result.ok ? 'Thanh toán thành công' : pending ? 'Chưa xác định kết quả' : 'Thanh toán bị từ chối')}</span>
              </div>
              {result.ok && result.tx && (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>
                    Mã GD: <span className="font-mono text-xs">{result.tx.id.slice(0, 8)}...</span>
                  </p>
                  <p>
                    Số tiền: <strong>{result.tx.amount.toLocaleString()}đ</strong>
                  </p>
                  <p>
                    Trạng thái: <span className="text-green-600 font-medium">Thành công</span>
                  </p>
                </div>
              )}
              {!result.ok && <p className="text-sm text-red-600">{result.error}</p>}
            </div>
          )}

          {paid && (
            <button onClick={handleReset} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors">
              Thanh toán tiếp
            </button>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">Dùng API Key từ trang quản lý điểm thanh toán để test</p>
        </div>
      </main>
    </div>
  );
}
