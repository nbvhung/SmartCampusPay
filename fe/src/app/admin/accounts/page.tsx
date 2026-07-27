'use client';
import { useState, useEffect, useCallback } from 'react';
import { Wallet, Snowflake } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { accountApi } from '@/lib/account-api';
import type { Account } from '@/types';

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await accountApi.list();
      setAccounts(res.data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function handleToggleFreeze(account: Account) {
    try {
      await accountApi.toggleFreeze(account.id);
      fetchAccounts();
    } catch {}
  }

  if (loading) return <AdminLayout><PageLoading /></AdminLayout>;

  const columns: Column<Account>[] = [
    { key: 'student', header: 'Sinh viên', render: (a) => a.student?.fullName || a.studentId },
    { key: 'balance', header: 'Số dư', render: (a) => <span className="font-semibold">{a.balance.toLocaleString()}đ</span> },
    { key: 'dailyLimit', header: 'Hạn mức/ngày', render: (a) => `${a.dailyLimit.toLocaleString()}đ` },
    { key: 'dailySpent', header: 'Đã chi hôm nay', render: (a) => `${a.dailySpent.toLocaleString()}đ` },
    {
      key: 'status', header: 'Trạng thái',
      render: (a) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700' : a.status === 'frozen' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
          {a.status === 'active' ? 'Hoạt động' : a.status === 'frozen' ? 'Đóng băng' : 'Đã đóng'}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (a) => (
        a.status !== 'closed' ? (
          <button onClick={() => handleToggleFreeze(a)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${a.status === 'active' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
            <Snowflake className="w-3 h-3" />
            {a.status === 'active' ? 'Đóng băng' : 'Mở'}
          </button>
        ) : null
      ),
    },
  ];

  return (
    <AdminLayout title="Quản lý ví">
      <DataTable columns={columns} data={accounts} emptyMessage="Chưa có tài khoản nào" />
    </AdminLayout>
  );
}
