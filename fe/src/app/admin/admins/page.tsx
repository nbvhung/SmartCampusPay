'use client';
import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Pencil, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { adminApi, type Admin } from '@/lib/admin-api';
import { useAuth } from '@/contexts/auth-context';

export default function AdminAdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [form, setForm] = useState({ username: '', password: '', fullName: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentUserId = (user as any)?.id;

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await adminApi.list();
      setAdmins(res.data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  function openCreateModal() {
    setEditingAdmin(null);
    setForm({ username: '', password: '', fullName: '' });
    setError('');
    setShowModal(true);
  }

  function openEditModal(admin: Admin) {
    setEditingAdmin(admin);
    setForm({ username: admin.username, password: '', fullName: admin.fullName });
    setError('');
    setShowModal(true);
  }

  async function handleCreate() {
    if (!form.fullName) {
      setError('Vui lòng nhập họ tên');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (editingAdmin) {
        await adminApi.update(editingAdmin.id, { fullName: form.fullName });
      } else {
        if (!form.username || !form.password) {
          setError('Vui lòng điền đầy đủ thông tin');
          setSubmitting(false);
          return;
        }
        await adminApi.create(form);
      }
      setShowModal(false);
      setEditingAdmin(null);
      setForm({ username: '', password: '', fullName: '' });
      fetchAdmins();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(admin: Admin) {
    try {
      await adminApi.update(admin.id, { isActive: !admin.isActive });
      fetchAdmins();
    } catch {}
  }

  async function handleDelete(admin: Admin) {
    if (!confirm(`Xoá admin "${admin.fullName}"?`)) return;
    try {
      await adminApi.remove(admin.id);
      fetchAdmins();
    } catch {}
  }

  if (loading) return <AdminLayout><PageLoading /></AdminLayout>;

  const columns: Column<Admin>[] = [
    { key: 'username', header: 'Tên đăng nhập' },
    { key: 'fullName', header: 'Họ tên' },
    {
      key: 'role', header: 'Vai trò',
      render: (a) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
          {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
        </span>
      ),
    },
    {
      key: 'isActive', header: 'Trạng thái',
      render: (a) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {a.isActive ? 'Hoạt động' : 'Đã khoá'}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Thao tác',
      render: (a) => (
        <div className="flex gap-2">
          {(a.role !== 'super_admin' || currentUserId === a.id) && (
            <button
              onClick={() => handleToggleActive(a)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${a.isActive ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            >
              {a.isActive ? 'Khoá' : 'Mở'}
            </button>
          )}
          <button
            onClick={() => openEditModal(a)}
            className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {a.role !== 'super_admin' && (
            <button
              onClick={() => handleDelete(a)}
              className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Quản lý admin">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">Quản lý tài khoản quản trị hệ thống</p>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Thêm admin
        </button>
      </div>

      <DataTable columns={columns} data={admins} emptyMessage="Chưa có admin nào" />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-semibold">{editingAdmin ? 'Sửa thông tin admin' : 'Thêm admin mới'}</h2>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 text-red-700 text-sm">{error}</div>}

            <div className="space-y-3">
              {!editingAdmin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
                    <input value={form.username} onChange={(e) => setForm(p => ({ ...p, username: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                    <input type="password" value={form.password} onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
                <input value={form.fullName} onChange={(e) => setForm(p => ({ ...p, fullName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Huỷ
              </button>
              <button onClick={handleCreate} disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 transition-colors">
                {submitting ? 'Đang xử lý...' : editingAdmin ? 'Lưu thay đổi' : 'Tạo admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
