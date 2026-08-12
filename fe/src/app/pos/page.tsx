'use client';
import { useState } from 'react';
import { CreditCard, Loader2, CheckCircle, XCircle, Store } from 'lucide-react';
import { posApi } from '@/lib/pos-api';
import type { Transaction } from '@/types';

export default function PosPage() {
  const [apiKey, setApiKey] = useState('');
  const [uid, setUid] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; tx?: Transaction; error?: string } | null>(null);

  async function handlePay() {
    if (paid || !apiKey.trim() || !uid.trim() || !amount) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await posApi.payByCard(apiKey.trim(), uid.trim(), Number(amount));
      setResult({ ok: true, tx: res.data.data });
      setPaid(true);
    } catch (err: any) {
      setResult({ ok: false, error: err?.response?.data?.message || 'Lỗi kết nối' });
    }
    setLoading(false);
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
              disabled={paid}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UID thẻ</label>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              disabled={paid}
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
              disabled={paid}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>

          <button
            onClick={handlePay}
            disabled={loading || paid || !apiKey.trim() || !uid.trim() || !amount}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="animate-spin w-5 h-5" />Đang xử lý...</>
            ) : (
              <><CreditCard className="w-5 h-5" />Thanh toán</>
            )}
          </button>

          {result && (
            <div className={`rounded-xl p-4 ${result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.ok ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                <span className={`font-semibold ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
                  {result.ok ? 'Thanh toán thành công' : 'Thanh toán thất bại'}
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
