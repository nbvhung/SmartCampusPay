'use client';
import { useEffect, useState, useRef } from 'react';
import { Search, FileSpreadsheet, Plus, X, Loader2, Eye, Pencil, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { studentApi } from '@/lib/student-api';
import { cardApi } from '@/lib/card-api';
import { accountApi } from '@/lib/account-api';
import { transactionApi } from '@/lib/transaction-api';
import type { Student, Card, Account, Transaction } from '@/types';

type ModalMode = 'add' | 'edit' | 'detail' | 'delete';

export default function AdminStudentsPage() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    studentCode: '',
    fullName: '',
    email: '',
    faculty: '',
    phone: '',
    dateOfBirth: '',
    isActive: true,
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Detail modal data
  const [detailCards, setDetailCards] = useState<Card[]>([]);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [detailTransactions, setDetailTransactions] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetch = () => {
    setLoading(true);
    studentApi.list({ search: search || undefined }).then((r) => setStudents(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  function resetForm() {
    setFormData({ studentCode: '', fullName: '', email: '', faculty: '', phone: '', dateOfBirth: '', isActive: true });
    setFormError('');
    setFormSuccess('');
  }

  function openAdd() {
    resetForm();
    setSelectedStudent(null);
    setModalMode('add');
  }

  function openEdit(s: Student) {
    setSelectedStudent(s);
    setFormData({
      studentCode: s.studentCode,
      fullName: s.fullName,
      email: s.email,
      faculty: s.faculty,
      phone: s.phone || '',
      dateOfBirth: s.dateOfBirth || '',
      isActive: s.isActive,
    });
    setFormError('');
    setFormSuccess('');
    setModalMode('edit');
  }

  function openDelete(s: Student) {
    setSelectedStudent(s);
    setFormError('');
    setModalMode('delete');
  }

  async function openDetail(s: Student) {
    setSelectedStudent(s);
    setModalMode('detail');
    setDetailCards([]);
    setDetailAccount(null);
    setDetailTransactions([]);
    setDetailLoading(true);

    try {
      const [cardsRes, acctRes, txRes] = await Promise.all([
        cardApi.findByStudent(s.id),
        accountApi.findByStudent(s.id),
        transactionApi.listByStudent(s.studentCode, { limit: 10 }),
      ]);
      setDetailCards(cardsRes.data.data);
      setDetailAccount(acctRes.data.data);
      setDetailTransactions(txRes.data.data);
    } catch {
    } finally {
      setDetailLoading(false);
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelectedStudent(null);
    resetForm();
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      if (modalMode === 'add') {
        await studentApi.create(formData);
        setFormSuccess('Thêm sinh viên thành công!');
      } else if (modalMode === 'edit' && selectedStudent) {
        await studentApi.update(selectedStudent.id, {
          fullName: formData.fullName,
          email: formData.email,
          faculty: formData.faculty,
          phone: formData.phone || undefined,
        });
        setFormSuccess('Cập nhật thành công!');
      }
      setTimeout(() => {
        closeModal();
        fetch();
      }, 1500);
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await studentApi.remove(selectedStudent.id);
      closeModal();
      fetch();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Xoá thất bại');
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
      <div className="flex items-center gap-2">
        <button onClick={() => openDetail(s)} className="p-1 text-blue-600 hover:text-blue-800 rounded hover:bg-blue-50" title="Chi tiết">
          <Eye className="w-4 h-4" />
        </button>
        <button onClick={() => openEdit(s)} className="p-1 text-amber-600 hover:text-amber-800 rounded hover:bg-amber-50" title="Sửa">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => handleToggle(s.id)} className="p-1 text-indigo-600 hover:text-indigo-800 rounded hover:bg-indigo-50" title={s.isActive ? 'Khoá' : 'Mở'}>
          {s.isActive ? 'Khoá' : 'Mở'}
        </button>
        <button onClick={() => openDelete(s)} className="p-1 text-red-600 hover:text-red-800 rounded hover:bg-red-50" title="Xoá">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
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
            onClick={openAdd}
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

      {/* Modal: Add / Edit */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{modalMode === 'add' ? 'Thêm sinh viên mới' : 'Sửa thông tin sinh viên'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalMode === 'add' && (
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
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên *</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {modalMode === 'edit' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span>Kích hoạt</span>
                </label>
              )}

              {formError && <div className="text-red-600 text-sm">{formError}</div>}
              {formSuccess && <div className="text-green-600 text-sm">{formSuccess}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete confirm */}
      {modalMode === 'delete' && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-red-600 mb-2">Xác nhận xoá</h2>
            <p className="text-gray-600 text-sm mb-6">
              Bạn có chắc muốn xoá sinh viên <strong>{selectedStudent.fullName}</strong> ({selectedStudent.studentCode})? Hành động này không thể hoàn tác.
            </p>
            {formError && <div className="text-red-600 text-sm mb-4">{formError}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button type="button" onClick={handleDelete} disabled={submitting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detail view */}
      {modalMode === 'detail' && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">Chi tiết sinh viên</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Personal Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">MSSV</p>
                  <p className="font-medium">{selectedStudent.studentCode}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Họ tên</p>
                  <p className="font-medium">{selectedStudent.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-medium">{selectedStudent.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Khoa</p>
                  <p className="font-medium">{selectedStudent.faculty}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Số điện thoại</p>
                  <p className="font-medium">{selectedStudent.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ngày sinh</p>
                  <p className="font-medium">{selectedStudent.dateOfBirth || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Trạng thái</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedStudent.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {selectedStudent.isActive ? 'Hoạt động' : 'Đã khoá'}
                  </span>
                </div>
              </div>

              <hr />

              {/* Wallet */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Ví điện tử</h3>
                {detailLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : detailAccount ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Số dư</p>
                      <p className="text-lg font-bold text-green-600">{detailAccount.balance.toLocaleString('vi-VN')}đ</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Hạn mức / ngày</p>
                      <p className="text-lg font-bold">{detailAccount.dailyLimit.toLocaleString('vi-VN')}đ</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Đã chi hôm nay</p>
                      <p className="text-lg font-bold text-amber-600">{detailAccount.dailySpent.toLocaleString('vi-VN')}đ</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Chưa có ví</p>
                )}
              </div>

              {/* Cards */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Thẻ NFC</h3>
                {detailLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : detailCards.length > 0 ? (
                  <div className="space-y-2">
                    {detailCards.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{c.uid}</p>
                          <p className="text-xs text-gray-500">{c.chipType}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === 'active' ? 'bg-green-100 text-green-700' :
                          c.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                          c.status === 'frozen' ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {c.status === 'active' ? 'Hoạt động' :
                           c.status === 'inactive' ? 'Ngừng' :
                           c.status === 'frozen' ? 'Đóng băng' : 'Mất'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Chưa có thẻ</p>
                )}
              </div>

              {/* Recent Transactions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Giao dịch gần đây</h3>
                {detailLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : detailTransactions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 font-medium">Thời gian</th>
                          <th className="pb-2 font-medium">Loại</th>
                          <th className="pb-2 font-medium">Số tiền</th>
                          <th className="pb-2 font-medium">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailTransactions.map((tx) => (
                          <tr key={tx.id} className="border-b last:border-0">
                            <td className="py-2 text-gray-600">{new Date(tx.createdAt).toLocaleString('vi-VN')}</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${tx.type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {tx.type === 'credit' ? 'Nạp' : 'Chi'}
                              </span>
                            </td>
                            <td className="py-2 font-medium">{tx.amount.toLocaleString('vi-VN')}đ</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                tx.status === 'success' ? 'bg-green-100 text-green-700' :
                                tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {tx.status === 'success' ? 'Thành công' : tx.status === 'pending' ? 'Chờ' : 'Thất bại'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Chưa có giao dịch</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
