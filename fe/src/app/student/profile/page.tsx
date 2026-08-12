'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Save, Loader2 } from 'lucide-react';
import { StudentLayout } from '@/components/layout/student-layout';
import { authApi } from '@/lib/auth-api';
import { useAuth } from '@/contexts/auth-context';
import type { Student } from '@/types';

export default function StudentProfilePage() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const student = user as Student | null;

  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword() {
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Mật khẩu xác nhận không khớp'); return; }
    if (pwForm.newPassword.length < 6) { setPwError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    setPwLoading(true);
    try {
      await authApi.changePassword({ oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword });
      setPwSuccess(true);
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err?.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally { setPwLoading(false); }
  }

  if (!student) return <StudentLayout><div className="text-center py-20 text-gray-500">Đang tải...</div></StudentLayout>;

  return (
    <StudentLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Thông tin cá nhân */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-red-500" />
              <h2 className="font-semibold text-gray-900">Thông tin cá nhân</h2>
            </div>
            <button onClick={() => setEditing(!editing)}
              className="text-sm text-red-600 hover:text-red-700 font-medium">
              {editing ? 'Huỷ' : 'Chỉnh sửa'}
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Mã sinh viên</label>
                <p className="font-medium text-gray-900">{student.studentCode}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Họ tên</label>
                <p className="font-medium text-gray-900">{student.fullName}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <p className="font-medium text-gray-900">{student.email}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Khoa</label>
                <p className="font-medium text-gray-900">{student.faculty}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Số điện thoại</label>
                <p className="font-medium text-gray-900">{student.phone || 'Chưa cập nhật'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Ngày sinh</label>
                <p className="font-medium text-gray-900">{student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Thông tin ví */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            <h2 className="font-semibold text-gray-900">Thông tin ví</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500">Số dư</label>
                <p className="text-xl font-bold text-gray-900">{(student.accounts?.[0]?.balance ?? 0).toLocaleString()}đ</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Hạn mức/ngày</label>
                <p className="font-medium text-gray-900">{(student.accounts?.[0]?.dailyLimit ?? 0).toLocaleString()}đ</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Đã chi hôm nay</label>
                <p className="font-medium text-gray-900">{(student.accounts?.[0]?.dailySpent ?? 0).toLocaleString()}đ</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Trạng thái ví</label>
              <p className="font-medium">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${student.accounts?.[0]?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {student.accounts?.[0]?.status === 'active' ? 'Hoạt động' : 'Đã khoá'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Thông tin thẻ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
            <h2 className="font-semibold text-gray-900">Thẻ NFC</h2>
          </div>
          <div className="p-5">
            {student.cards && student.cards.length > 0 ? (
              <div className="space-y-3">
                {student.cards.map(card => (
                  <div key={card.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <div>
                      <p className="font-mono text-sm font-medium text-gray-900">{card.uid}</p>
                      <p className="text-xs text-gray-500">{card.chipType}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      card.status === 'active' ? 'bg-green-100 text-green-700' :
                      card.status === 'inactive' ? 'bg-gray-100 text-gray-700' :
                      card.status === 'frozen' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {card.status === 'active' ? 'Hoạt động' : card.status === 'inactive' ? 'Không hoạt động' : card.status === 'frozen' ? 'Đóng băng' : 'Mất'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Chưa có thẻ NFC</p>
            )}
          </div>
        </div>

        {/* Đổi mật khẩu */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-500" />
            <h2 className="font-semibold text-gray-900">Đổi mật khẩu</h2>
          </div>
          <div className="p-5">
            {pwSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm mb-4">
                Đổi mật khẩu thành công!
              </div>
            )}
            {pwError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm mb-4">{pwError}</div>
            )}
            <div className="space-y-3 max-w-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu cũ</label>
                <input type="password" value={pwForm.oldPassword} onChange={(e) => setPwForm(p => ({ ...p, oldPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
                <input type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" />
              </div>
              <button onClick={handleChangePassword} disabled={pwLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 transition-colors">
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Đổi mật khẩu
              </button>
            </div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
