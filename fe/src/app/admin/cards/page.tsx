'use client';
import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { cardApi } from '@/lib/card-api';
import { studentApi } from '@/lib/student-api';
import type { Card, CardStatus, Student } from '@/types';

const STATUS_LABELS: Record<CardStatus, string> = { active: 'Hoạt động', inactive: 'Không hoạt động', lost: 'Mất', frozen: 'Đóng băng' };
const STATUS_COLORS: Record<CardStatus, string> = { active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-700', lost: 'bg-red-100 text-red-700', frozen: 'bg-yellow-100 text-yellow-700' };

export default function AdminCardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ uid: '', studentCode: '', chipType: 'MIFARE' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([cardApi.list(), studentApi.list()]);
      setCards(c.data.data);
      setStudents(s.data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  async function handleCreate() {
    if (!form.uid || !form.studentCode) { setError('Vui lòng nhập UID và mã sinh viên'); return; }
    setError('');
    setSubmitting(true);
    try {
      const student = students.find(s => s.studentCode === form.studentCode);
      if (!student) { setError('Không tìm thấy sinh viên'); setSubmitting(false); return; }
      await cardApi.create({ uid: form.uid, studentId: student.id, chipType: form.chipType });
      setShowModal(false);
      setForm({ uid: '', studentCode: '', chipType: 'MIFARE' });
      fetchCards();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Tạo thẻ thất bại');
    } finally { setSubmitting(false); }
  }

  async function handleUpdateStatus(card: Card, status: CardStatus) {
    try { await cardApi.updateStatus(card.id, status); fetchCards(); } catch {}
  }

  async function handleDelete(card: Card) {
    if (!confirm(`Xoá thẻ ${card.uid}?`)) return;
    try { await cardApi.remove(card.id); fetchCards(); } catch {}
  }

  if (loading) return <AdminLayout><PageLoading /></AdminLayout>;

  const columns: Column<Card>[] = [
    { key: 'uid', header: 'UID thẻ' },
    { key: 'chipType', header: 'Loại chip' },
    { key: 'student', header: 'Sinh viên', render: (c) => c.student?.fullName || c.student?.studentCode || c.studentId },
    {
      key: 'status', header: 'Trạng thái',
      render: (c) => (
        <select value={c.status} onChange={(e) => handleUpdateStatus(c, e.target.value as CardStatus)}
          className={`px-2 py-0.5 rounded text-xs font-medium border-none outline-none cursor-pointer ${STATUS_COLORS[c.status]}`}>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      ),
    },
    {
      key: 'lastUsedAt', header: 'Lần cuối',
      render: (c) => c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString('vi-VN') : '-',
    },
    {
      key: 'actions', header: '',
      render: (c) => (
        <button onClick={() => handleDelete(c)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <AdminLayout title="Quản lý thẻ">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">Quản lý thẻ NFC của sinh viên</p>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Thêm thẻ
        </button>
      </div>

      <DataTable columns={columns} data={cards} emptyMessage="Chưa có thẻ nào" />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-semibold">Thêm thẻ mới</h2>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 text-red-700 text-sm">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UID thẻ</label>
                <input value={form.uid} onChange={(e) => setForm(p => ({ ...p, uid: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã sinh viên</label>
                <input list="student-list" value={form.studentCode} onChange={(e) => setForm(p => ({ ...p, studentCode: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" />
                <datalist id="student-list">
                  {students.map(s => <option key={s.id} value={s.studentCode}>{s.fullName} - {s.studentCode}</option>)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại chip</label>
                <select value={form.chipType} onChange={(e) => setForm(p => ({ ...p, chipType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none">
                  <option value="MIFARE">MIFARE</option>
                  <option value="MIFARE_Classic">MIFARE Classic</option>
                  <option value="MIFARE_Plus">MIFARE Plus</option>
                  <option value="NTAG">NTAG</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">Huỷ</button>
              <button onClick={handleCreate} disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 transition-colors">
                {submitting ? 'Đang tạo...' : 'Tạo thẻ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
