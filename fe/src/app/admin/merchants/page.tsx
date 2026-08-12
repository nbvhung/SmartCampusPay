'use client';
import { useEffect, useState } from 'react';
import { Key, Plus, Edit3, X } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { merchantApi } from '@/lib/merchant-api';
import type { Merchant, MerchantType } from '@/types';

const typeLabels: Record<string, string> = { canteen: 'Căng tin', library: 'Thư viện', parking: 'Bãi xe', printing: 'In ấn', other: 'Khác' };
const typeOptions: { value: MerchantType; label: string }[] = [
  { value: 'canteen', label: 'Căng tin' },
  { value: 'library', label: 'Thư viện' },
  { value: 'parking', label: 'Bãi xe' },
  { value: 'printing', label: 'In ấn' },
  { value: 'other', label: 'Khác' },
];

export default function AdminMerchantsPage() {
  const [loading, setLoading] = useState(true);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Merchant | null>(null);
  const [form, setForm] = useState({ name: '', type: 'canteen' as MerchantType, location: '' });
  const [saving, setSaving] = useState(false);

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
    setNewKey(res.data.data.rawApiKey);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', type: 'canteen', location: '' });
    setShowModal(true);
  }

  function openEdit(m: Merchant) {
    setEditing(m);
    setForm({ name: m.name, type: m.type, location: m.location || '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await merchantApi.update(editing.id, form);
      } else {
        const res = await merchantApi.create(form);
        setNewKey(res.data.data.rawApiKey);
      }
      setShowModal(false);
      fetch();
    } catch {}
    setSaving(false);
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
        <button onClick={() => openEdit(m)} className="text-sm text-gray-600 hover:text-gray-800"><Edit3 className="w-3.5 h-3.5 inline" /></button>
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

      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />Thêm điểm thanh toán
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <DataTable columns={columns} data={merchants} loading={loading} emptyMessage="Không có điểm thanh toán nào" />
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Sửa điểm thanh toán' : 'Thêm điểm thanh toán'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MerchantType })} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400">
                  {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa điểm</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Huỷ</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
                {saving ? 'Đang lưu...' : editing ? 'Lưu' : 'Tạo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
