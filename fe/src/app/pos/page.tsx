'use client';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CreditCard, Loader2, CheckCircle, XCircle, Store } from 'lucide-react';
import { posApi } from '@/lib/pos-api';
import type { Transaction } from '@/types';
import { readPendingPayment, preparePayment, finishPayment, type PendingPayment } from '@/lib/pos-payment';

const TERMINAL_CODES = new Set(['CARD_INACTIVE', 'CARD_NOT_FOUND', 'STUDENT_INACTIVE', 'ACCOUNT_NOT_FOUND', 'ACCOUNT_FROZEN', 'INSUFFICIENT_BALANCE', 'DAILY_LIMIT_EXCEEDED', 'INVALID_CARD_UID', 'INVALID_AMOUNT', 'VALIDATION_ERROR']);

export default function PosPage() {
  const [apiKey, setApiKey] = useState('');
  const [uid, setUid] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [ready, setReady] = useState(false);
  const sending = useRef(false);
  const [result, setResult] = useState<{ ok: boolean; tx?: Transaction; error?: string } | null>(null);

  useEffect(() => {
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
          setResult({ ok: false, error: 'Có giao dịch chưa rõ kết quả. Nhập lại API key của thiết bị và xác minh bằng nút bên dưới.' });
        }
        setReady(true);
      } catch {
        setResult({ ok: false, error: 'Không thể khôi phục/lưu giao dịch. Cần kiểm tra dữ liệu trình duyệt trước khi thanh toán.' });
      }
    });
    return () => { active = false; };
  }, []);

  async function handlePay() {
    if (sending.current) return;
    // Serialize POS tabs sharing this browser's pending transaction.
    if (!navigator.locks) {
      setResult({ ok: false, error: 'Trình duyệt cần hỗ trợ Web Locks qua HTTPS hoặc localhost.' });
      return;
    }
    sending.current = true;
    try {
      await navigator.locks.request('smartcampuspay.pos-payment', { ifAvailable: true }, lock => {
        if (!lock) {
          setResult({ ok: false, error: 'Một tab POS khác đang xử lý giao dịch. Chờ kết quả trước khi thử lại.' });
          return;
        }
        return sendPayment();
      });
    } finally {
      sending.current = false;
    }
  }

  async function sendPayment() {
    if (!ready || paid || !apiKey.trim() || !uid.trim() || !amount) return;
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) < 100 || Number(amount) > 10000000) {
      setResult({ ok: false, error: 'Nhập số tiền nguyên từ 100 đến 10.000.000 đồng.' });
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
      const detail = axios.isAxiosError<{ code?: string; message?: string }>(err) ? err.response?.data : undefined;
      if (request && detail?.code && TERMINAL_CODES.has(detail.code)) {
        finishPayment(localStorage, request.idempotencyKey);
        setPending(null);
        setResult({ ok: false, error: detail.message || 'Thanh toán bị từ chối' });
      } else {
        setResult({ ok: false, error: 'Chưa xác định kết quả. Giữ nguyên giao dịch và thử xác minh lại. ' + (detail?.message || (err instanceof Error && !axios.isAxiosError(err) ? err.message : '')) });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setPaid(false);
    setResult(null);
    setUid('');
    setAmount('');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-500 rounded-2xl mb-3 shadow-lg">
            <Store className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">POS Thanh toán</h1>
          <p className="text-sm text-gray-500 mt-1">Thiết bị điểm thanh toán</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={paid || loading}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UID thẻ</label>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              disabled={paid || loading || !!pending}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1000}
              disabled={paid || loading || !!pending}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>

          <button
            onClick={handlePay}
            disabled={!ready || loading || paid || !apiKey.trim() || !uid.trim() || !amount}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="animate-spin w-5 h-5" />Đang xử lý...</>
            ) : (
              <><CreditCard className="w-5 h-5" />{pending ? 'Xác minh lại giao dịch' : 'Thanh toán'}</>
            )}
          </button>

          {result && (
            <div className={`rounded-xl p-4 ${result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.ok ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                <span className={`font-semibold ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
                  {result.ok ? 'Thanh toán thành công' : pending ? 'Chưa xác định kết quả' : 'Thanh toán bị từ chối'}
                </span>
              </div>
              {result.ok && result.tx && (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Mã GD: <span className="font-mono text-xs">{result.tx.id.slice(0, 8)}...</span></p>
                  <p>Số tiền: <strong>{result.tx.amount.toLocaleString()}đ</strong></p>
                  <p>Trạng thái: <span className="text-green-600 font-medium">Thành công</span></p>
                </div>
              )}
              {!result.ok && (
                <p className="text-sm text-red-600">{result.error}</p>
              )}
            </div>
          )}

          {paid && (
            <button onClick={handleReset} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors">
              Thanh toán tiếp
            </button>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Dùng API Key từ trang quản lý điểm thanh toán để test
          </p>
        </div>
      </div>
    </div>
  );
}
