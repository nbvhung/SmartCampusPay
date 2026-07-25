'use client';
import { useState, useEffect, FormEvent } from 'react';
import { Wallet, History, Loader2 } from 'lucide-react';
import { StudentLayout } from '@/components/layout/student-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';
import { accountApi } from '@/lib/account-api';
import { useAuth } from '@/contexts/auth-context';
import type { Transaction } from '@/types';

export default function StudentTopupPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      accountApi.getBalance(user.id).then((r) => setBalance(r.data.data.balance)).catch(() => {}),
      transactionApi.listByStudent((user as any).studentCode, { limit: 20 }).then((r) => setTxs(r.data.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const num = Number(amount);
    if (!num || num < 10000) { setError('Số tiền tối thiểu 10.000đ'); return; }
    if (num > 5000000) { setError('Số tiền tối đa 5.000.000đ'); return; }

    setSubmitting(true);
    try {
      const res = await accountApi.topup({
        studentCode: (user as any).studentCode,
        amount: num,
      });
      setBalance(res.data.data.newBalance);
      setSuccess(`Nạp thành công ${num.toLocaleString()}đ`);
      setAmount('');
      const txsRes = await transactionApi.listByStudent((user as any).studentCode, { limit: 20 });
      setTxs(txsRes.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nạp tiền thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) return <StudentLayout><PageLoading /></StudentLayout>;

  const columns: Column<Transaction>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (t) => new Date(t.createdAt).toLocaleString('vi-VN') },
    { key: 'amount', header: 'Số tiền', render: (t) => <span className="text-green-600">+{t.amount.toLocaleString()}đ</span> },
    { key: 'status', header: 'Trạng thái', render: (t) => <span className={t.status === 'success' ? 'text-green-600' : 'text-yellow-600'}>{t.status === 'success' ? 'Thành công' : 'Đang xử lý'}</span> },
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

        <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chọn số tiền nhanh</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[50000, 100000, 200000, 500000, 1000000, 2000000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Hoặc nhập số tiền khác</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Nhập số tiền..."
              min={10000}
              max={5000000}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm">{success}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin w-4 h-4" /> : null}
            {submitting ? 'Đang xử lý...' : 'Nạp tiền'}
          </button>
        </form>
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
