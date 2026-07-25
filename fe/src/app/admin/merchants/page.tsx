'use client';
import { useEffect, useState } from 'react';
import { Key } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { merchantApi } from '@/lib/merchant-api';
import type { Merchant } from '@/types';

const typeLabels: Record<string, string> = { canteen: 'Căng tin', library: 'Thư viện', parking: 'Bãi xe', printing: 'In ấn', other: 'Khác' };

export default function AdminMerchantsPage() {
  const [loading, setLoading] = useState(true);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);

  const fetch = () => {
    setLoading(true);
    merchantApi.list().then((r) => setMerchants(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  async function handleToggle(id: string) {
    await merchantApi.toggleActive(id);
    fetch();
  }

  async function handleRegen(id: string) {
    const res = await merchantApi.regenerateKey(id);
    setNewKey(res.data.data.apiKey);
  }

  const columns: Column<Merchant>[] = [
    { key: 'name', header: 'Tên', sortable: true },
    { key: 'type', header: 'Loại', render: (m) => typeLabels[m.type] || m.type },
    { key: 'location', header: 'Địa điểm' },
    { key: 'isActive', header: 'Trạng thái', render: (m) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {m.isActive ? 'Hoạt động' : 'Đã khoá'}
      </span>
    )},
    { key: 'actions', header: '', render: (m) => (
      <div className="flex gap-2">
        <button onClick={() => handleToggle(m.id)} className="text-sm text-red-600 hover:text-red-800">{m.isActive ? 'Khoá' : 'Mở'}</button>
        <button onClick={() => handleRegen(m.id)} className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"><Key className="w-3 h-3" />Cấp lại key</button>
      </div>
    )},
  ];

  return (
    <AdminLayout title="Quản lý điểm thanh toán">
      {newKey && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-medium text-red-800">API Key mới:</p>
          <code className="block mt-1 text-sm bg-white border border-red-300 rounded-lg px-3 py-2">{newKey}</code>
          <p className="text-xs text-red-600 mt-1">Lưu lại key này — sau khi đóng sẽ không xem lại được.</p>
          <button onClick={() => setNewKey(null)} className="mt-2 text-sm text-red-700 hover:text-red-900 underline">Đóng</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <DataTable columns={columns} data={merchants} loading={loading} emptyMessage="Không có điểm thanh toán nào" />
      </div>
    </AdminLayout>
  );
}
