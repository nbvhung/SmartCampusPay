'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Wallet, History, QrCode, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { StudentLayout } from '@/components/layout/student-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';
import { accountApi } from '@/lib/account-api';
import { sepayApi, type SePayPayment } from '@/lib/sepay-api';
import { useAuth } from '@/contexts/auth-context';
import type { Transaction } from '@/types';

export default function StudentTopupPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [txs, setTxs] = useState<Transaction[]>([]);

  const [payment, setPayment] = useState<SePayPayment | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'creating' | 'pending' | 'success' | 'expired'>('idle');
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const studentCode = (user as any)?.studentCode;

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [balRes, txRes] = await Promise.all([
      accountApi.getBalance(user.id).then(r => r.data.data).catch(() => null),
      transactionApi.listByStudent(studentCode, { limit: 20 }).then(r => r.data.data).catch(() => []),
    ]);
    if (balRes) setBalance(balRes.balance);
    setTxs(txRes);
    setLoading(false);
  }, [user, studentCode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleCreateQr() {
    const num = Number(amount);
    if (!num || num < 1000) { setError('Số tiền tối thiểu 1.000đ'); return; }
    if (num > 5000000) { setError('Số tiền tối đa 5.000.000đ'); return; }
    setError('');
    setPaymentStatus('creating');

    try {
      const res = await sepayApi.createPayment(num);
      const data = res.data.data;
      setPayment(data);
      setPaymentStatus('pending');
      setPollCount(0);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await sepayApi.checkStatus(data.referenceCode);
          const st = statusRes.data.data;
          if (st.status === 'success') {
            clearInterval(pollRef.current);
            await fetchData();
            setPaymentStatus('success');
            setTimeout(() => {
              setPayment(null);
              setPaymentStatus('idle');
              setAmount('');
            }, 2000);
          }
        } catch {}
        setPollCount(c => c + 1);
      }, 5000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Tạo mã QR thất bại');
      setPaymentStatus('idle');
    }
  }

  async function handleCancel() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (payment?.referenceCode) {
      try { await sepayApi.cancelPayment(payment.referenceCode); } catch {}
    }
    setPayment(null);
    setPaymentStatus('idle');
    fetchData();
  }

  if (loading || !user) return <StudentLayout><PageLoading /></StudentLayout>;

  const columns: Column<Transaction>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (t) => new Date(t.createdAt).toLocaleString('vi-VN') },
    { key: 'amount', header: 'Số tiền', render: (t) => <span className="text-green-600">+{t.amount.toLocaleString()}đ</span> },
    { key: 'status', header: 'Trạng thái', render: (t) => {
      const map: Record<string, string> = { success: 'Thành công', pending: 'Chờ thanh toán', failed: 'Đã hủy' };
      const cls = t.status === 'success' ? 'text-green-600' : t.status === 'pending' ? 'text-yellow-600' : 'text-red-600';
      return <span className={cls}>{map[t.status] || t.status}</span>;
    }},
    { key: 'description', header: 'Mô tả' },
  ];

  return (
    <StudentLayout>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500">Số dư hiện tại</p>
          <p className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
            <Wallet className="w-7 h-7 text-red-500" />
            {balance.toLocaleString()}đ
          </p>
        </div>

        <div className="max-w-sm mx-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chọn số tiền</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[50000, 100000, 200000, 500000, 1000000, 2000000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setAmount(String(v)); setPaymentStatus('idle'); }}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    Number(amount) === v
                      ? 'bg-red-50 border-red-500 text-red-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {v.toLocaleString()}đ
                </button>
              ))}
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setPaymentStatus('idle'); }}
              placeholder="Nhập số tiền..."
              min={1000}
              max={5000000}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>
          )}

          {paymentStatus === 'idle' && (
            <button
              onClick={handleCreateQr}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <QrCode className="w-5 h-5" />
              Tạo mã QR nạp tiền
            </button>
          )}

          {paymentStatus === 'creating' && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="animate-spin w-6 h-6 text-red-500" />
            </div>
          )}

          {payment && paymentStatus !== 'idle' && paymentStatus !== 'creating' && (
            <div className="bg-gray-50 rounded-xl p-6 text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                {paymentStatus === 'success' ? (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                ) : (
                  <Clock className="w-6 h-6 text-yellow-500" />
                )}
                <span className={`font-semibold ${paymentStatus === 'success' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {paymentStatus === 'success' ? 'Nạp tiền thành công!' : 'Đang chờ thanh toán...'}
                </span>
              </div>

              <div className="bg-white inline-block p-3 rounded-xl shadow-sm">
                <img src={payment.qrUrl} alt="QR thanh toán" className="w-48 h-48" />
              </div>

              <div className="text-sm text-gray-600 space-y-1">
                <p>Số tiền: <strong className="text-gray-900">{payment.amount.toLocaleString()}đ</strong></p>
                <p>Nội dung CK: <code className="bg-gray-200 px-2 py-0.5 rounded text-red-700 font-mono text-xs">{payment.referenceCode}</code></p>
                <p className="text-xs text-gray-400">Mở app ngân hàng quét mã QR để thanh toán</p>
              </div>

              {paymentStatus === 'pending' && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handleCancel}
                    className="text-sm text-gray-500 hover:text-red-500 underline underline-offset-2"
                  >
                    Hủy
                  </button>
                </div>
              )}

              {paymentStatus === 'success' && (
                <button
                  onClick={handleCancel}
                  className="text-sm text-gray-500 hover:text-red-500 underline underline-offset-2"
                >
                  Nạp thêm
                </button>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Lịch sử nạp tiền</h2>
        </div>
        <DataTable columns={columns} data={txs.filter(t => t.type === 'credit')} emptyMessage="Chưa có giao dịch nạp tiền" />
      </div>
    </StudentLayout>
  );
}
