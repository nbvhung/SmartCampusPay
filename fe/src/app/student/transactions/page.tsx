'use client';
import { useEffect, useState } from 'react';
import { StudentLayout } from '@/components/layout/student-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';
import { useAuth } from '@/contexts/auth-context';
import type { Transaction } from '@/types';

const statusLabels: Record<string, string> = { success: 'Thành công', pending: 'Đang xử lý', failed: 'Thất bại', refunded: 'Đã hoàn' };

export default function StudentTransactionsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');

  useEffect(() => {
    if (!user) return;
    transactionApi.listByStudent(user.id).then((r) => setTxs(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  if (loading || !user) return <StudentLayout><PageLoading /></StudentLayout>;

  const filtered = filter === 'all' ? txs : txs.filter((t) => t.type === filter);

  const columns: Column<Transaction>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (t) => new Date(t.createdAt).toLocaleString('vi-VN'), sortable: true },
    { key: 'type', header: 'Loại', render: (t) => t.type === 'credit' ? 'Nạp tiền' : 'Thanh toán' },
    { key: 'amount', header: 'Số tiền', render: (t) => (
      <span className={`font-medium ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
        {t.type === 'credit' ? '+' : '-'}{t.amount.toLocaleString()}đ
      </span>
    ), sortable: true },
    { key: 'status', header: 'Trạng thái', render: (t) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        t.status === 'success' ? 'bg-green-100 text-green-700' :
        t.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
        t.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
      }`}>{statusLabels[t.status] || t.status}</span>
    )},
    { key: 'description', header: 'Mô tả' },
  ];

  return (
    <StudentLayout>
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'credit', 'debit'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'Tất cả' : f === 'credit' ? 'Nạp tiền' : 'Thanh toán'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <DataTable columns={columns} data={filtered} emptyMessage="Không có giao dịch nào" />
      </div>
    </StudentLayout>
  );
}
