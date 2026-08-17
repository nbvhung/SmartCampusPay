'use client';
import { useCallback, useEffect, useState } from 'react';
import { Inbox, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { topupPendingApi, type TopupPending, type TopupPendingStatus } from '@/lib/topup-pending-api';

const statusTabs: { value: TopupPendingStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Chờ khớp' },
  { value: 'matched', label: 'Đã khớp' },
  { value: 'ignored', label: 'Bỏ qua' },
  { value: 'all', label: 'Tất cả' },
];

const statusLabels: Record<TopupPendingStatus, string> = {
  pending: 'Chờ khớp',
  matched: 'Đã khớp',
  ignored: 'Bỏ qua',
};

export default function AdminTopupPendingPage() {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<TopupPending[]>([]);
  const [tab, setTab] = useState<TopupPendingStatus | 'all'>('pending');
  const [studentCode, setStudentCode] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetch = useCallback((status: TopupPendingStatus | 'all') => {
    setLoading(true);
    setError('');
    topupPendingApi.list(status === 'all' ? undefined : status)
      .then((r) => setList(r.data.data))
      .catch(() => setError('Không tải được danh sách'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(tab); }, [fetch, tab]);

  async function handleMatch(id: string) {
    const code = (studentCode[id] || '').trim();
    if (!code) { setError('Nhập mã sinh viên cần khớp'); return; }
    setError('');
    setNotice('');
    setActingId(id);
    try {
      await topupPendingApi.match(id, code);
      setNotice(`Đã khớp ${code} — tiền đã cộng vào ví.`);
      setStudentCode((s) => ({ ...s, [id]: '' }));
      fetch(tab);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Khớp thất bại');
    } finally {
      setActingId(null);
    }
  }

  async function handleIgnore(id: string) {
    if (!window.confirm('Chắc chắn bỏ qua giao dịch này?')) return;
    setError('');
    setNotice('');
    setActingId(id);
    try {
      await topupPendingApi.ignore(id);
      setNotice('Đã bỏ qua giao dịch.');
      fetch(tab);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setActingId(null);
    }
  }

  const columns: Column<TopupPending>[] = [
    { key: 'createdAt', header: 'Thời gian', render: (p) => new Date(p.createdAt).toLocaleString('vi-VN'), sortable: true },
    { key: 'content', header: 'Nội dung CK' },
    { key: 'amount', header: 'Số tiền', render: (p) => <span className="font-medium text-green-600">+{p.amount.toLocaleString()}đ</span>, sortable: true },
    { key: 'sender', header: 'Người gửi', render: (p) => p.sender || '—' },
    { key: 'bankName', header: 'Ngân hàng', render: (p) => p.bankName || '—' },
    {
      key: 'note',
      header: 'Ghi chú',
      render: (p) => p.note === 'amount_out_of_range'
        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tiền ngoài phạm vi</span>
        : <span className="text-gray-500">{p.note || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (p) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
          p.status === 'matched' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>{statusLabels[p.status]}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Xử lý',
      render: (p) =>
        p.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <input
              value={studentCode[p.id] || ''}
              onChange={(e) => setStudentCode((s) => ({ ...s, [p.id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleMatch(p.id)}
              placeholder="MSSV..."
              disabled={actingId === p.id}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={() => handleMatch(p.id)}
              disabled={actingId === p.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
            >
              {actingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Khớp
            </button>
            <button
              type="button"
              onClick={() => handleIgnore(p.id)}
              disabled={actingId === p.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 text-xs font-medium rounded-lg"
            >
              <XCircle className="w-3.5 h-3.5" />
              Bỏ qua
            </button>
          </div>
        ) : null,
    },
  ];

  if (loading && list.length === 0) return <AdminLayout title="Nạp chờ khớp"><PageLoading /></AdminLayout>;

  return (
    <AdminLayout title="Nạp chờ khớp">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {statusTabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === t.value
                ? 'bg-red-600 border-red-600 text-white'
                : 'border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>
      )}
      {notice && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm">{notice}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Inbox className="w-10 h-10 mb-2" />
            <p className="text-sm">Không có giao dịch nào trong danh sách này</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={list}
            loading={loading}
            emptyMessage="Không có giao dịch"
          />
        )}
      </div>
    </AdminLayout>
  );
}
