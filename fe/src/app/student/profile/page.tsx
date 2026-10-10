"use client";
import { useCallback, useEffect, useState } from "react";
import {
  User,
  Lock,
  Save,
  Loader2,
  ShieldAlert,
  X,
  AlertTriangle,
} from "lucide-react";
import { StudentLayout } from "@/components/layout/student-layout";
import { authApi } from "@/lib/auth-api";
import { cardApi } from "@/lib/card-api";
import { studentApi } from "@/lib/student-api";
import { useAuth } from "@/contexts/auth-context";
import type { Student, Card } from "@/types";

const emptyProfileForm = {
  fullName: "",
  email: "",
  faculty: "",
  dateOfBirth: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  return Array.isArray(message) ? message.join(", ") : message || fallback;
}

export default function StudentProfilePage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<Student | null>(
    user as Student | null,
  );
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const student = profile;

  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [pwForm, setPwForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // --- Khóa thẻ khẩn cấp ---
  const [lockTarget, setLockTarget] = useState<Card | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");
  const [lockSuccess, setLockSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const response = await studentApi.getMe();
      setProfile(response.data.data);
    } catch (error: unknown) {
      setProfileError(getErrorMessage(error, "Không thể tải hồ sơ"));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    studentApi
      .getMe()
      .then((response) => {
        if (!cancelled) setProfile(response.data.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileError(getErrorMessage(error, "Không thể tải hồ sơ"));
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function beginEditing() {
    if (!student) return;
    setProfileForm({
      fullName: student.fullName || "",
      email: student.email || "",
      faculty: student.faculty || "",
      dateOfBirth: student.dateOfBirth?.slice(0, 10) || "",
    });
    setProfileError("");
    setProfileSuccess("");
    setEditing(true);
  }

  async function handleUpdateProfile() {
    const entries = Object.entries(profileForm).filter(([, value]) =>
      value.trim(),
    );
    if (entries.length === 0) {
      setProfileError("Vui lòng nhập ít nhất một thông tin cần cập nhật");
      return;
    }

    setUpdating(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      const payload = Object.fromEntries(
        entries.map(([key, value]) => [key, value.trim()]),
      );
      const response = await studentApi.updateMe(payload);
      setProfile(response.data.data);
      setEditing(false);
      setProfileSuccess("Cập nhật hồ sơ thành công");
      await refresh();
    } catch (error: unknown) {
      setProfileError(getErrorMessage(error, "Cập nhật hồ sơ thất bại"));
    } finally {
      setUpdating(false);
    }
  }

  async function handleLockCard() {
    if (!lockTarget) return;
    setLocking(true);
    setLockError("");
    try {
      await cardApi.updateStatus(lockTarget.id, "frozen");
      setLockSuccess(`Đã khóa thẻ ${lockTarget.uid} thành công!`);
      setLockTarget(null);
      await refresh();
      await loadProfile();
      setTimeout(() => setLockSuccess(null), 5000);
    } catch (error: unknown) {
      setLockError(getErrorMessage(error, "Khóa thẻ thất bại"));
    } finally {
      setLocking(false);
    }
  }

  async function handleChangePassword() {
    setPwError("");
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("Mật khẩu xác nhận không khớp");
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    setPwLoading(true);
    try {
      await authApi.changePassword({
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess(true);
      setPwForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (error: unknown) {
      setPwError(getErrorMessage(error, "Đổi mật khẩu thất bại"));
    } finally {
      setPwLoading(false);
    }
  }

  if (profileLoading && !student)
    return (
      <StudentLayout>
        <div className="text-center py-20 text-gray-500">Đang tải...</div>
      </StudentLayout>
    );

  if (!student)
    return (
      <StudentLayout>
        <div className="text-center py-20 text-red-600">
          {profileError || "Không thể tải hồ sơ"}
        </div>
      </StudentLayout>
    );

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
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${student.profileCompletedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
              >
                {student.profileCompletedAt
                  ? "Đã hoàn thiện"
                  : "Chưa hoàn thiện"}
              </span>
              {!editing && (
                <button
                  onClick={beginEditing}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Chỉnh sửa
                </button>
              )}
            </div>
          </div>
          <div className="p-5 space-y-4">
            {profileSuccess && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {profileSuccess}
              </div>
            )}
            {profileError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {profileError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Mã sinh viên</label>
                <p className="font-medium text-gray-900">
                  {student.studentCode}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Họ tên</label>
                {editing ? (
                  <input
                    value={profileForm.fullName}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    maxLength={100}
                    autoComplete="name"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                ) : (
                  <p className="font-medium text-gray-900">
                    {student.fullName || "Chưa cập nhật"}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                {editing ? (
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    maxLength={100}
                    autoComplete="email"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                ) : (
                  <p className="font-medium text-gray-900 break-all">
                    {student.email || "Chưa cập nhật"}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Khoa</label>
                {editing ? (
                  <input
                    value={profileForm.faculty}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        faculty: event.target.value,
                      }))
                    }
                    maxLength={50}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                ) : (
                  <p className="font-medium text-gray-900">
                    {student.faculty || "Chưa cập nhật"}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Số điện thoại</label>
                <p className="font-medium text-gray-900">
                  {student.phone || "Chưa cập nhật"}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Ngày sinh</label>
                {editing ? (
                  <input
                    type="date"
                    value={profileForm.dateOfBirth}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        dateOfBirth: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                ) : (
                  <p className="font-medium text-gray-900">
                    {student.dateOfBirth
                      ? new Date(student.dateOfBirth).toLocaleDateString(
                          "vi-VN",
                        )
                      : "Chưa cập nhật"}
                  </p>
                )}
              </div>
            </div>
            {editing && (
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    setEditing(false);
                    setProfileError("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={handleUpdateProfile}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {updating ? "Đang lưu..." : "Lưu hồ sơ"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Thông tin ví */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            <h2 className="font-semibold text-gray-900">Thông tin ví</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500">Số dư</label>
                <p className="text-xl font-bold text-gray-900">
                  {(student.account?.balance ?? 0).toLocaleString()}đ
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Hạn mức/ngày</label>
                <p className="font-medium text-gray-900">
                  {(student.account?.dailyLimit ?? 0).toLocaleString()}đ
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Đã chi hôm nay</label>
                <p className="font-medium text-gray-900">
                  {(student.account?.dailySpent ?? 0).toLocaleString()}đ
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Trạng thái ví</label>
              <p className="font-medium">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${student.account?.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                >
                  {student.account?.status === "active"
                    ? "Hoạt động"
                    : "Đã khoá"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Thông tin thẻ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                />
              </svg>
              <h2 className="font-semibold text-gray-900">Thẻ NFC</h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Khóa ngay nếu mất thẻ</span>
            </div>
          </div>

          {lockSuccess && (
            <div className="mx-5 mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              {lockSuccess}
            </div>
          )}

          <div className="p-5">
            {student?.cards && student.cards.length > 0 ? (
              <div className="space-y-3">
                {student.cards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
                  >
                    <div>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {card.uid}
                      </p>
                      <p className="text-xs text-gray-500">{card.chipType}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          card.status === "active"
                            ? "bg-green-100 text-green-700"
                            : card.status === "frozen"
                              ? "bg-yellow-100 text-yellow-700"
                              : card.status === "inactive"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {card.status === "active"
                          ? "Hoạt động"
                          : card.status === "inactive"
                            ? "Không HĐ"
                            : card.status === "frozen"
                              ? "Đóng băng"
                              : "Mất"}
                      </span>
                      {card.status === "active" && (
                        <button
                          onClick={() => {
                            setLockTarget(card);
                            setLockError("");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                        >
                          <Lock className="w-3 h-3" />
                          Khóa khẩn cấp
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                Chưa có thẻ NFC
              </p>
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
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm mb-4">
                {pwError}
              </div>
            )}
            <div className="space-y-3 max-w-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu cũ
                </label>
                <input
                  type="password"
                  value={pwForm.oldPassword}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, oldPassword: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu mới
                </label>
                <input
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) =>
                    setPwForm((p) => ({ ...p, newPassword: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Xác nhận mật khẩu
                </label>
                <input
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) =>
                    setPwForm((p) => ({
                      ...p,
                      confirmPassword: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={pwLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {pwLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Đổi mật khẩu
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal xác nhận khóa thẻ ────────────────────────────────────── */}
      {lockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-lg font-bold">Khóa thẻ khẩn cấp</h3>
              </div>
              <button
                onClick={() => setLockTarget(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning box */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
              <p className="text-sm font-semibold text-red-800 mb-1">
                Thẻ sẽ bị đóng băng ngay lập tức!
              </p>
              <p className="text-xs text-red-600">
                Sau khi khóa, thẻ{" "}
                <span className="font-mono font-bold">{lockTarget.uid}</span> sẽ
                không thể thanh toán được nữa. Liên hệ admin để mở khóa.
              </p>
            </div>

            {lockError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm mb-4">
                {lockError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setLockTarget(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleLockCard}
                disabled={locking}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {locking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {locking ? "Đang khóa..." : "Xác nhận khóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}
