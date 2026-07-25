'use client';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';
import type { Transaction } from '@/types';

const statusLabels: Record<string, string> = { success: 'Thành công', pending: 'Đang xử lý', failed: 'Thất bại', refunded: 'Đã hoàn' };

export default function AdminTransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetch = () => {
    setLoading(true);
    transactionApi.list({
      studentCode: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }).then((r) => setTxs(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const columns: Column<Transaction>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (t) => new Date(t.createdAt).toLocaleString('vi-VN'), sortable: true },
    { key: 'studentCode', header: 'MSSV' },
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
    <AdminLayout title="Quản lý giao dịch">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetch()}
            placeholder="Tìm MSSV..."
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <button onClick={fetch} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">Tìm</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <DataTable columns={columns} data={txs} loading={loading} emptyMessage="Không có giao dịch nào" />
      </div>
    </AdminLayout>
  );
}
