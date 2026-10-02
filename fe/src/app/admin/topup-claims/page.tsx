'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { CheckCircle, FileCheck2, Loader2, RefreshCw, Search } from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { ClaimDetails } from '@/components/topup-claims/claim-details';
import { DataTable, type Column } from '@/components/ui/data-table';
import { topupClaimsApi, claimStatusLabels, type TopupClaim, type TopupClaimStatus } from '@/lib/topup-claims-api';
import type { TopupPending } from '@/lib/topup-pending-api';
import type { PaginatedResponse } from '@/types';

function errorMessage(error: unknown, fallback: string) {
  const message = axios.isAxiosError<{ message?: string | string[] }>(error) ? error.response?.data?.message : undefined;
  return Array.isArray(message) ? message.join('. ') : message || fallback;
}

function ReviewClaim({ initial, onReviewed }: { initial: TopupClaim; onReviewed: () => void }) {
  const [claim, setClaim] = useState(initial);
  const [candidates, setCandidates] = useState<TopupPending[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejection, setShowRejection] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const actingRef = useRef(false);
  const selected = candidates.find(candidate => candidate.id === selectedId);
  const missingSteps = [
    ...(!selected ? ['Chọn một giao dịch ngân hàng trong danh sách phía trên.'] : []),
    ...(!confirmed ? ['Tích xác nhận đã xem minh chứng và đối chiếu giao dịch.'] : []),
  ];

  const loadCandidates = useCallback((query = '') => {
    if (claim.status !== 'pending') return;
    return topupClaimsApi.candidates(claim.id, query).then(({ data }) => { setCandidates(data.data); })
      .catch((err: unknown) => { setCandidates([]); setError(errorMessage(err, 'Không tải được giao dịch ngân hàng.')); })
      .finally(() => { setLoading(false); });
  }, [claim.id, claim.status]);
  useEffect(() => { void loadCandidates(); }, [loadCandidates]);

  async function review(action: 'match' | 'reject') {
    if (actingRef.current || loading) return;
    if (action === 'match' && missingSteps.length) { setError(missingSteps.join(' ')); return; }
    if (action === 'reject' && rejectionReason.trim().length < 5) { setError('Vui lòng nhập lý do từ chối ít nhất 5 ký tự.'); return; }
    const prompt = action === 'match'
      ? `Khớp giao dịch ${selected!.transferId} và cộng ${claim.amount.toLocaleString('vi-VN')}đ vào ví ${claim.studentCode} — ${claim.fullName}?`
      : `Từ chối hồ sơ của ${claim.studentCode}? Sinh viên sẽ nhìn thấy lý do bạn đã nhập.`;
    if (!window.confirm(prompt)) return;
    actingRef.current = true; setActing(true); setError(''); setNotice('');
    try {
      const { data } = action === 'match'
        ? await topupClaimsApi.match(claim.id, selectedId)
        : await topupClaimsApi.reject(claim.id, rejectionReason.trim());
      setClaim(data.data);
      setNotice(action === 'match' ? 'Đã khớp hồ sơ và cộng tiền vào ví sinh viên.' : 'Đã từ chối hồ sơ và lưu phản hồi cho sinh viên.');
      onReviewed();
    } catch (err) {
      setError(errorMessage(err, 'Không xử lý được hồ sơ. Vui lòng làm mới để kiểm tra trạng thái.'));
    } finally { actingRef.current = false; setActing(false); }
  }

  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
    <div><ClaimDetails claim={claim} /></div>
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">{notice}</p>}
      {claim.status === 'pending' ? <>
        <div><h3 className="font-semibold">Đối chiếu khoản tiền thực nhận</h3><p className="text-sm text-gray-500 mt-1">Các giao dịch dưới đây đang chờ khớp và có cùng số tiền. Kiểm tra ảnh, mã giao dịch, thời gian, người gửi và tài khoản nhận trước khi chọn.</p></div>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); setLoading(true); setError(''); setSelectedId(''); setConfirmed(false); void loadCandidates(search); }} className="flex gap-2"><input aria-label="Tìm giao dịch thực nhận" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="Mã giao dịch, nội dung hoặc người gửi…" className="min-w-0 flex-1 border border-gray-300 rounded-lg p-2 text-sm" /><button type="submit" disabled={loading || acting} className="inline-flex items-center gap-1 border border-gray-300 px-3 rounded-lg text-sm disabled:opacity-50"><Search size={16} /> Tìm</button></form>
        {loading ? <p role="status" className="text-sm text-gray-500">Đang tải giao dịch…</p> : candidates.length === 0 ? <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">Chưa có giao dịch phù hợp. Giữ hồ sơ chờ đối soát để kiểm tra lại khi ngân hàng cập nhật, hoặc từ chối kèm lý do nếu minh chứng không hợp lệ.</div> : <fieldset disabled={acting} className="space-y-2 max-h-96 overflow-y-auto"><legend className="sr-only">Chọn khoản tiền thực nhận</legend>{candidates.map(candidate => <label key={candidate.id} className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${selectedId === candidate.id ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}><input type="radio" name="pending" value={candidate.id} checked={selectedId === candidate.id} onChange={() => { setSelectedId(candidate.id); setConfirmed(false); }} className="mt-1" /><span className="min-w-0 text-sm"><strong>{candidate.amount.toLocaleString('vi-VN')}đ · {candidate.transferId}</strong><span className="block text-xs text-gray-500 mt-1">Ghi nhận: {new Date(candidate.createdAt).toLocaleString('vi-VN')}</span><span className="block mt-1 break-words">{candidate.content || '(Không có nội dung)'}</span><span className="block text-xs text-gray-500 mt-1">Người gửi: {candidate.sender || 'Không có'} · Ngân hàng: {candidate.bankName || 'Không có'}</span><span className="block text-xs mt-1 break-words">Tham chiếu ngân hàng: {candidate.bankRef || 'Không có'}</span>{candidate.bankRef?.toUpperCase() === claim.bankReference.toUpperCase() && <span className="block text-xs text-green-700 mt-1">Trùng mã giao dịch đã khai báo</span>}{candidate.note && <span className="block text-xs text-red-700 mt-1">Ghi chú hệ thống: {candidate.note}</span>}</span></label>)}</fieldset>}
        {candidates.length === 100 && <p className="text-xs text-gray-500">Đang hiển thị tối đa 100 giao dịch. Dùng ô tìm kiếm để thu hẹp kết quả.</p>}
        <div id="match-requirements" className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm" aria-live="polite">
          {loading ? <p>Đang tải giao dịch ngân hàng…</p> : missingSteps.length ? <><p className="font-semibold">Để chấp nhận khớp, còn thiếu:</p><ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600">{missingSteps.map(step => <li key={step}>{step}</li>)}</ul></> : <p className="font-medium text-green-700">Đã đủ thông tin. Bấm “Khớp và cộng tiền” để xác nhận cộng {claim.amount.toLocaleString('vi-VN')}đ cho {claim.studentCode}.</p>}
        </div>
        <label className="flex gap-2 text-sm text-gray-600"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!selected || acting} className="mt-1" /> Tôi đã xem minh chứng và xác nhận khoản tiền thực nhận đã chọn thuộc hồ sơ này.</label>
        <div className="flex flex-wrap gap-3"><button type="button" onClick={() => review('match')} disabled={acting || loading} aria-describedby="match-requirements" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-40">{acting ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle size={17} />}Khớp và cộng tiền</button><button type="button" onClick={() => { setShowRejection(true); setError(''); }} disabled={acting || loading} className="px-4 py-2.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium disabled:opacity-40">Từ chối hồ sơ</button></div>
        {showRejection && <div className="border border-red-200 rounded-lg p-4 space-y-3">
          <label className="block text-sm font-medium">Lý do từ chối<textarea value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} disabled={acting} minLength={5} maxLength={1000} rows={3} placeholder="Nhập lý do để sinh viên biết cần sửa hoặc bổ sung gì (ít nhất 5 ký tự)." className="block w-full mt-2 p-3 text-sm border border-gray-300 rounded-lg" /></label>
          <div className="flex gap-3"><button type="button" onClick={() => review('reject')} disabled={acting || loading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-40">Xác nhận từ chối</button><button type="button" onClick={() => setShowRejection(false)} disabled={acting} className="text-sm text-gray-600">Hủy</button></div>
        </div>}
      </> : <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm">Hồ sơ đã được xử lý. Kết quả đã hiển thị cho sinh viên.</div>}
    </div>
  </div>;
}

export default function AdminTopupClaimsPage() {
  const [tab, setTab] = useState<TopupClaimStatus | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedResponse<TopupClaim>>({ items: [], total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TopupClaim | null>(null);
  const [opening, setOpening] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const load = useCallback(() => {
    return topupClaimsApi.list(page, tab === 'all' ? undefined : tab).then(({ data }) => { setResult(data.data); })
      .catch((err: unknown) => { setError(errorMessage(err, 'Không tải được danh sách hồ sơ.')); })
      .finally(() => { setLoading(false); });
  }, [page, tab]);
  useEffect(() => { void load(); }, [load]);
  async function open(id: string) {
    setOpening(true); setError('');
    try { const { data } = await topupClaimsApi.detail(id); setSelected(data.data); requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
    catch (err) { setError(errorMessage(err, 'Không tải được chi tiết hồ sơ.')); }
    finally { setOpening(false); }
  }
  const columns: Column<TopupClaim>[] = [
    { key: 'createdAt', header: 'Ngày nộp', render: claim => new Date(claim.createdAt).toLocaleString('vi-VN') },
    { key: 'studentCode', header: 'Sinh viên', render: claim => <div><strong>{claim.studentCode}</strong><p className="text-xs text-gray-500 mt-1">{claim.fullName}</p></div> },
    { key: 'amount', header: 'Số tiền', render: claim => `${claim.amount.toLocaleString('vi-VN')}đ` },
    { key: 'bankReference', header: 'Mã giao dịch ngân hàng' },
    { key: 'status', header: 'Trạng thái', render: claim => claimStatusLabels[claim.status] },
    { key: 'actions', header: 'Hồ sơ', render: claim => <button type="button" disabled={opening} onClick={() => open(claim.id)} className="text-red-600 underline disabled:opacity-50">Xem minh chứng / xử lý</button> },
  ];
  return <AdminLayout title="Hồ sơ khớp nạp">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5"><div><h1 className="text-xl font-semibold flex items-center gap-2"><FileCheck2 size={22} /> Yêu cầu đối soát từ sinh viên</h1><p className="text-sm text-gray-500 mt-2">Mở hồ sơ để xem minh chứng, chọn giao dịch ngân hàng rồi xác nhận cộng tiền.</p></div><Link href="/admin/topup-pending" className="text-sm text-red-600 underline">Xem tiền ngân hàng chờ khớp</Link></div>
    <div className="flex flex-wrap items-center gap-2 mb-4">{(['pending', 'matched', 'rejected', 'all'] as const).map(status => <button type="button" key={status} onClick={() => { setLoading(true); setError(''); setTab(status); setPage(1); if (tab === status && page === 1) void load(); }} className={`px-4 py-2 rounded-lg text-sm border ${tab === status ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 text-gray-600'}`}>{status === 'all' ? 'Tất cả' : claimStatusLabels[status]}</button>)}<button type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); void load(); }} className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 disabled:opacity-50"><RefreshCw size={16} /> Làm mới</button></div>
    {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg mb-4">{error}</p>}
    <div className="bg-white rounded-xl border border-gray-200"><DataTable columns={columns} data={result.items} loading={loading} emptyMessage="Không có hồ sơ trong danh sách này" /></div>
    <div className="flex items-center justify-end gap-3 mt-4 text-sm"><button type="button" disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage(value => value - 1); }} className="disabled:opacity-40">Trang trước</button><span>Trang {page} · {result.total} hồ sơ</span><button type="button" disabled={page * result.limit >= result.total || loading} onClick={() => { setLoading(true); setPage(value => value + 1); }} className="disabled:opacity-40">Trang sau</button></div>
    {selected && <section ref={detailRef} className="bg-white rounded-xl border border-gray-200 p-5 mt-6 scroll-mt-20"><div className="flex justify-between gap-3 mb-5"><h2 className="text-lg font-semibold">Hồ sơ của {selected.studentCode}</h2><button type="button" onClick={() => setSelected(null)} className="text-sm text-gray-500 underline">Đóng chi tiết</button></div><ReviewClaim key={`${selected.id}:${selected.updatedAt ?? selected.status}`} initial={selected} onReviewed={load} /></section>}
  </AdminLayout>;
}
