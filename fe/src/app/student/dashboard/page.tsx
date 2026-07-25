'use client';
import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, Receipt } from 'lucide-react';
import { StudentLayout } from '@/components/layout/student-layout';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';
import { accountApi } from '@/lib/account-api';
import { useAuth } from '@/contexts/auth-context';
import type { Transaction } from '@/types';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      accountApi.getBalance(user.id).then((r) => setBalance(r.data.data.balance)).catch(() => {}),
      transactionApi.listByStudent(user.id, { limit: 10 }).then((r) => setRecentTxs(r.data.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [user]);

  if (loading || !user) return <StudentLayout><PageLoading /></StudentLayout>;

  const todayTxs = recentTxs.filter(t => new Date(t.createdAt).toDateString() === new Date().toDateString());

  const columns: Column<Transaction>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (t) => new Date(t.createdAt).toLocaleString('vi-VN') },
    { key: 'type', header: 'Loại', render: (t) => t.type === 'credit' ? 'Nạp tiền' : 'Thanh toán' },
    { key: 'amount', header: 'Số tiền', render: (t) => (
      <span className={t.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
        {t.type === 'credit' ? '+' : '-'}{t.amount.toLocaleString()}đ
      </span>
    )},
    { key: 'status', header: 'Trạng thái', render: (t) => {
      const map: Record<string, string> = { success: 'text-green-600', pending: 'text-yellow-600', failed: 'text-red-600', refunded: 'text-gray-500' };
      return <span className={map[t.status] || ''}>{t.status}</span>;
    }},
    { key: 'description', header: 'Mô tả' },
  ];

  return (
    <StudentLayout>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard title="Số dư ví" value={`${balance.toLocaleString()}đ`} icon={<Wallet className="w-6 h-6" />} />
        <StatCard title="Giao dịch hôm nay" value={todayTxs.length.toString()} icon={<TrendingUp className="w-6 h-6" />} />
        <StatCard title="Chi tiêu hôm nay" value={`${todayTxs.filter(t => t.type === 'debit' && t.status === 'success').reduce((s, t) => s + t.amount, 0).toLocaleString()}đ`} icon={<Receipt className="w-6 h-6" />} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Giao dịch gần đây</h2>
        </div>
        <DataTable columns={columns} data={recentTxs} emptyMessage="Chưa có giao dịch nào" />
      </div>
    </StudentLayout>
  );
}
