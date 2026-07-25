'use client';
import { useEffect, useState, useRef } from 'react';
import { Search, FileSpreadsheet, Plus, X, Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageLoading } from '@/components/ui/loading-spinner';
import { studentApi } from '@/lib/student-api';
import type { Student } from '@/types';

export default function AdminStudentsPage() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    studentCode: '',
    fullName: '',
    email: '',
    faculty: '',
    phone: '',
    dateOfBirth: '',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const fetch = () => {
    setLoading(true);
    studentApi.list({ search: search || undefined }).then((r) => setStudents(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  async function handleToggle(id: string) {
    await studentApi.toggleActive(id);
    fetch();
  }

  async function handleImport(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    await studentApi.import(fd);
    fetch();
  }

  async function handleSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      await studentApi.create(formData);
      setFormSuccess('Thêm sinh viên thành công!');
      setFormData({ studentCode: '', fullName: '', email: '', faculty: '', phone: '', dateOfBirth: '' });
      setTimeout(() => {
        setShowModal(false);
        setFormSuccess('');
        fetch();
      }, 1500);
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Thêm sinh viên thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  const columns: Column<Student>[] = [
    { key: 'studentCode', header: 'MSSV', sortable: true },
    { key: 'fullName', header: 'Họ tên', sortable: true },
    { key: 'email', header: 'Email' },
    { key: 'faculty', header: 'Khoa' },
    { key: 'isActive', header: 'Trạng thái', render: (s) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {s.isActive ? 'Hoạt động' : 'Đã khoá'}
      </span>
    )},
    { key: 'actions', header: '', render: (s) => (
      <button onClick={() => handleToggle(s.id)} className="text-sm text-red-600 hover:text-red-800">
        {s.isActive ? 'Khoá' : 'Mở'}
      </button>
    )},
  ];

  return (
    <AdminLayout title="Quản lý sinh viên">
      {/* Header with search and actions */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetch()}
            placeholder="Tìm kiếm MSSV, họ tên..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Thêm sinh viên
          </button>
          <button onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
        </div>
      </div>

      {/* Data table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <DataTable columns={columns} data={students} loading={loading} emptyMessage="Không có sinh viên nào" />
      </div>

      {/* Modal for adding single student */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Thêm sinh viên mới</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNew} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã sinh viên *</label>
                <input
                  type="text"
                  value={formData.studentCode}
                  onChange={(e) => setFormData({ ...formData, studentCode: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="VD: SV001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên *</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="VD: Nguyễn Văn A"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="VD: sv001@student.edu.vn"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khoa *</label>
                <input
                  type="text"
                  value={formData.faculty}
                  onChange={(e) => setFormData({ ...formData, faculty: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="VD: Công nghệ thông tin"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="VD: 0912345678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh *</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {formError && <div className="text-red-600 text-sm">{formError}</div>}
              {formSuccess && <div className="text-green-600 text-sm">{formSuccess}</div>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
