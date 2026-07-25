'use client';
import { useEffect, useState, useRef } from 'react';
import { Search, FileSpreadsheet } from 'lucide-react';
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
          <button onClick={() => fileRef.current?.click()} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <DataTable columns={columns} data={students} loading={loading} emptyMessage="Không có sinh viên nào" />
      </div>
    </AdminLayout>
  );
}
