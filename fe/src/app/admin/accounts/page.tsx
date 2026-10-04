'use client';
import { useState, useEffect, useCallback } from 'react';
import { Snowflake, Trash2, Loader2 } from 'lucide-react';
import axios from 'axios';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { accountApi } from '@/lib/account-api';
import type { Account } from '@/types';

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  function message(error: unknown, fallback: string) {
    return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;
  }

  const fetchAccounts = useCallback(() => {
    return accountApi.list().then(res => setAccounts(res.data.data))
      .catch((err: unknown) => setError(message(err, 'Không tải được danh sách ví.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function handleToggleFreeze(account: Account) {
    if (actingId) return;
    setActingId(account.id); setError(''); setNotice('');
    try {
      await accountApi.toggleFreeze(account.id);
      await fetchAccounts();
    } catch (err) { setError(message(err, 'Không cập nhật được trạng thái ví.')); }
    finally { setActingId(null); }
  }

  async function handleDelete() {
    if (!deleting || actingId) return;
    setActingId(deleting.id); setError(''); setNotice('');
    try {
      const { data } = await accountApi.remove(deleting.id);
      setDeleting(null);
      setNotice(data.data.message);
      await fetchAccounts();
    } catch (err) { setError(message(err, 'Không xóa được ví.')); }
    finally { setActingId(null); }
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
        <div className="flex items-center gap-2">{a.status !== 'closed' && (
          <button onClick={() => handleToggleFreeze(a)} disabled={actingId !== null}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${a.status === 'active' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
            <Snowflake className="w-3 h-3" />
            {a.status === 'active' ? 'Đóng băng' : 'Mở'}
          </button>
        )}<button type="button" onClick={() => { setDeleting(a); setError(''); }} disabled={actingId !== null} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"><Trash2 size={13} />Xóa vĩnh viễn</button></div>
      ),
    },
  ];

  return (
    <AdminLayout title="Quản lý ví">
      {error && !deleting && <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">{notice}</p>}
      <DataTable columns={columns} data={accounts} emptyMessage="Chưa có tài khoản nào" />
      {deleting && <div role="dialog" aria-modal="true" aria-labelledby="delete-wallet-title" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 id="delete-wallet-title" className="text-lg font-semibold mb-3">Xóa vĩnh viễn ví</h2>
        <p className="text-sm text-gray-600">Xóa ví của <strong>{deleting.student?.fullName || deleting.studentId}</strong>?</p>
        <p className="text-sm text-gray-600 mt-2">Số dư hiện tại: <strong>{deleting.balance.toLocaleString('vi-VN')}đ</strong>.</p>
        <p className="text-sm text-gray-600 mt-2">Ví sẽ bị xóa vĩnh viễn. Chỉ có thể xóa khi số dư bằng 0 và ví chưa có lịch sử giao dịch. Nếu cần ngừng sử dụng, hãy chọn “Đóng băng”.</p>
        {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-5"><button type="button" disabled={actingId !== null} onClick={() => { setDeleting(null); setError(''); }} className="px-4 py-2 border border-gray-300 rounded-lg">Hủy</button><button type="button" disabled={actingId !== null} onClick={handleDelete} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">{actingId && <Loader2 size={16} className="animate-spin" />}{actingId ? 'Đang xóa…' : 'Xóa vĩnh viễn'}</button></div>
      </div></div>}
    </AdminLayout>
  );
}
