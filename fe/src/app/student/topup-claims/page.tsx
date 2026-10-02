'use client';
/* eslint-disable @next/next/no-img-element -- Local preview of the uploaded evidence uses a blob URL. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { FileCheck2, Loader2, RefreshCw, Upload } from 'lucide-react';
import { StudentLayout } from '@/components/layout/student-layout';
import { ClaimDetails } from '@/components/topup-claims/claim-details';
import { authApi } from '@/lib/auth-api';
import { topupClaimsApi, claimStatusLabels, type TopupClaim } from '@/lib/topup-claims-api';
import type { Card, PaginatedResponse, StudentUser } from '@/types';

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500';
function errorMessage(error: unknown, fallback: string) {
  const message = axios.isAxiosError<{ message?: string | string[] }>(error) ? error.response?.data?.message : undefined;
  return Array.isArray(message) ? message.join('. ') : message || fallback;
}

export default function StudentTopupClaimsPage() {
  const [profile, setProfile] = useState<(StudentUser & { cards?: Card[] }) | null>(null);
  const [profileError, setProfileError] = useState('');
  const [result, setResult] = useState<PaginatedResponse<TopupClaim>>({ items: [], total: 0, page: 1, limit: 20 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [selected, setSelected] = useState<TopupClaim | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const submitLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrl = useRef<string | null>(null);

  const loadProfile = useCallback(() => {
    return authApi.me().then(({ data }) => {
      if (data.data.role !== 'student') throw new Error('Invalid role');
      setProfile(data.data);
      setProfileError('');
    }).catch(() => { setProfileError('Không tải được thông tin sinh viên và thẻ. Vui lòng thử lại.'); });
  }, []);
  const load = useCallback(() => {
    return topupClaimsApi.list(page).then(({ data }) => { setResult(data.data); })
      .catch((err: unknown) => { setError(errorMessage(err, 'Không tải được hồ sơ đã nộp.')); })
      .finally(() => { setLoading(false); });
  }, [page]);
  useEffect(() => { void loadProfile(); }, [loadProfile]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function chooseFile(nextFile: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = nextFile ? URL.createObjectURL(nextFile) : null;
    setFile(nextFile);
    setPreview(previewUrl.current ?? '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    if (!file) { setError('Vui lòng chọn ảnh minh chứng chuyển khoản.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
      setError('Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB.'); return;
    }
    const form = new FormData(event.currentTarget);
    const date = new Date(String(form.get('transferredAt')));
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) { setError('Thời điểm chuyển tiền phải hợp lệ và không nằm trong tương lai.'); return; }
    form.set('transferredAt', date.toISOString());
    form.set('evidence', file);
    submitLock.current = true;
    setSubmitting(true); setError(''); setNotice('');
    try {
      await topupClaimsApi.submit(form);
      setNotice('Đã gửi hồ sơ. Bạn có thể theo dõi kết quả bên dưới; tiền được cộng khi quản trị viên đối chiếu và xác nhận khớp.');
      formRef.current?.reset(); chooseFile(null); setSelected(null); setLoading(true);
      if (page === 1) await load(); else setPage(1);
    } catch (err) { setError(errorMessage(err, 'Không gửi được hồ sơ. Vui lòng thử lại.')); }
    finally { submitLock.current = false; setSubmitting(false); }
  }
  async function open(claim: TopupClaim) {
    setOpening(claim.id); setError('');
    try { const { data } = await topupClaimsApi.detail(claim.id); setSelected(data.data); }
    catch (err) { setError(errorMessage(err, 'Không mở được hồ sơ.')); }
    finally { setOpening(null); }
  }

  return <StudentLayout title="Yêu cầu khớp nạp tiền">
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h2 className="font-semibold flex items-center gap-2"><FileCheck2 size={20} /> Đã chuyển tiền nhưng ví chưa nhận?</h2>
      <p className="text-sm text-gray-600 mt-2 leading-relaxed">Nếu bạn quên ghi mã sinh viên hoặc nội dung chuyển khoản không được nhận diện, hãy nộp hồ sơ kèm ảnh lịch sử giao dịch thành công. Quản trị viên sẽ đối chiếu với khoản tiền ngân hàng đã nhận.</p>
      <p className="text-xs text-gray-500 mt-2">Mỗi khoản chuyển tiền nộp một hồ sơ. Ảnh cần thể hiện số tiền, thời gian, mã giao dịch và tài khoản nhận. Có thể che thông tin không liên quan.</p>
      <Link href="/student/topup" className="text-sm text-red-600 underline inline-block mt-3">Quay lại nạp tiền</Link>
    </div>
    {error && <div role="alert" className="p-3 mb-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}
    {notice && <div role="status" className="p-3 mb-4 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">{notice}</div>}
    <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h2 className="text-lg font-semibold mb-4">Nộp hồ sơ đối soát</h2>
      {profileError ? <p role="alert" className="text-sm text-red-700">{profileError} <button type="button" className="underline" onClick={loadProfile}>Thử lại</button></p> : !profile ? <p role="status" className="text-sm text-gray-500">Đang tải thông tin sinh viên…</p> : !profile.cards?.length ? <p className="text-sm text-gray-600">Tài khoản chưa có thẻ. Vui lòng liên hệ quản trị viên để kiểm tra thông tin thẻ trước khi nộp hồ sơ.</p> : <form ref={formRef} onSubmit={submit}>
        <fieldset disabled={submitting} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm font-medium">Họ tên sinh viên<input name="fullName" value={profile.fullName} readOnly required className={`${inputClass} mt-1 bg-gray-50`} /></label>
          <label className="text-sm font-medium">Mã sinh viên<input name="studentCode" value={profile.studentCode} readOnly required className={`${inputClass} mt-1 bg-gray-50`} /></label>
          <label className="text-sm font-medium">Số thẻ sinh viên (UID)<select name="cardUid" required className={`${inputClass} mt-1`}>{profile.cards.map(card => <option key={card.id} value={card.uid}>{card.uid}</option>)}</select><span className="block text-xs text-gray-500 mt-1">Thẻ thuộc tài khoản của bạn, không phải số thẻ ngân hàng.</span></label>
          <label className="text-sm font-medium">Số tiền đã chuyển (đ)<input name="amount" type="number" required min="1000" max="5000000" step="1" placeholder="Ví dụ: 100000" className={`${inputClass} mt-1`} /></label>
          <label className="text-sm font-medium">Thời điểm chuyển tiền<input name="transferredAt" type="datetime-local" required className={`${inputClass} mt-1`} /></label>
          <label className="text-sm font-medium">Họ tên người chuyển tiền<input name="senderName" required minLength={2} maxLength={100} placeholder="Tên chủ tài khoản chuyển tiền" className={`${inputClass} mt-1`} /></label>
          <label className="text-sm font-medium">Ngân hàng chuyển tiền<input name="bankName" required minLength={2} maxLength={100} placeholder="Ví dụ: Vietcombank" className={`${inputClass} mt-1`} /></label>
          <label className="text-sm font-medium">Mã giao dịch ngân hàng<input name="bankReference" required maxLength={100} placeholder="Mã trên biên lai / lịch sử giao dịch" className={`${inputClass} mt-1`} /></label>
          <label className="text-sm font-medium md:col-span-2">Nội dung chuyển khoản và lý do yêu cầu<textarea name="description" required minLength={5} maxLength={1000} rows={3} placeholder="Ghi nội dung đã chuyển và vấn đề gặp phải, ví dụ quên ghi mã sinh viên." className={`${inputClass} mt-1`} /></label>
          <div className="md:col-span-2"><label htmlFor="evidence" className="block text-sm font-medium mb-1">Ảnh minh chứng giao dịch thành công <span className="text-red-600">*</span></label><input id="evidence" name="evidence" type="file" accept="image/jpeg,image/png,image/webp" required className={`${inputClass} file:mr-3`} onChange={event => chooseFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-gray-500 mt-2">JPG, PNG hoặc WebP · tối đa 5 MB · bắt buộc có ảnh minh chứng.</p>{file && preview && <img src={preview} alt="Ảnh minh chứng bạn sắp gửi" className="mt-3 max-h-64 max-w-full object-contain rounded-lg border border-gray-200" />}</div>
          <label className="md:col-span-2 flex gap-2 text-sm text-gray-600"><input type="checkbox" required className="mt-1" /> Tôi xác nhận thông tin và minh chứng là của giao dịch này, chưa được cộng tiền vào ví.</label>
          <button type="submit" className="md:col-span-2 justify-self-start inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg text-sm font-semibold disabled:opacity-50">{submitting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}{submitting ? 'Đang gửi hồ sơ…' : 'Gửi yêu cầu khớp nạp'}</button>
        </fieldset>
      </form>}
    </section>
    <section className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-semibold">Hồ sơ đã nộp ({result.total})</h2><button type="button" onClick={() => { setLoading(true); setError(''); void load(); }} disabled={loading} className="inline-flex items-center gap-2 text-sm text-red-600 disabled:opacity-50"><RefreshCw size={16} /> Làm mới</button></div>
      {loading ? <p className="text-sm text-gray-500" role="status">Đang tải hồ sơ…</p> : result.items.length === 0 ? <p className="text-sm text-gray-500">Bạn chưa nộp hồ sơ nào.</p> : <div className="space-y-3">{result.items.map(claim => <div key={claim.id} className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 rounded-lg p-4"><div><p className="font-semibold text-sm">{claim.amount.toLocaleString('vi-VN')}đ · {claim.bankName}</p><p className="text-xs text-gray-500 mt-1">Mã giao dịch: {claim.bankReference} · {new Date(claim.createdAt).toLocaleString('vi-VN')}</p><p className={`text-xs mt-2 ${claim.status === 'matched' ? 'text-green-700' : claim.status === 'rejected' ? 'text-red-700' : 'text-yellow-700'}`}>{claimStatusLabels[claim.status]}</p>{claim.reviewNote && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{claim.reviewNote}</p>}</div><button type="button" disabled={opening !== null} onClick={() => open(claim)} className="text-sm text-red-600 underline disabled:opacity-50">{opening === claim.id ? 'Đang mở…' : 'Xem hồ sơ / minh chứng'}</button></div>)}</div>}
      <div className="flex items-center justify-end gap-3 mt-4 text-sm"><button type="button" disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage(value => value - 1); }} className="disabled:opacity-40">Trang trước</button><span>Trang {page}</span><button type="button" disabled={page * result.limit >= result.total || loading} onClick={() => { setLoading(true); setPage(value => value + 1); }} className="disabled:opacity-40">Trang sau</button></div>
    </section>
    {selected && <section className="bg-white border border-gray-200 rounded-xl p-5 mt-6"><div className="flex items-center justify-between gap-3 mb-5"><h2 className="text-lg font-semibold">Chi tiết hồ sơ</h2><button type="button" className="text-sm text-gray-500 underline" onClick={() => setSelected(null)}>Đóng chi tiết</button></div><ClaimDetails claim={selected} /></section>}
  </StudentLayout>;
}
