'use client';
/* eslint-disable @next/next/no-img-element -- Evidence is fetched with authentication and displayed from a private blob URL. */
import { useEffect, useState } from 'react';
import { topupClaimsApi, claimStatusLabels, type TopupClaim } from '@/lib/topup-claims-api';

export function ClaimEvidence({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    topupClaimsApi.evidence(id).then(({ data }) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, retry]);
  if (failed) return <div className="text-sm text-red-700" role="alert">Không tải được minh chứng. <button type="button" className="underline" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>Thử lại</button></div>;
  if (!url) return <p className="text-sm text-gray-500" role="status">Đang tải ảnh minh chứng…</p>;
  return <div className="space-y-2"><a href={url} target="_blank" rel="noreferrer" className="text-sm text-red-600 underline">Mở ảnh kích thước đầy đủ</a><img src={url} alt="Minh chứng chuyển khoản do sinh viên nộp" className="w-full max-h-[560px] object-contain rounded-xl border border-gray-200 bg-gray-50" /></div>;
}

export function ClaimDetails({ claim }: { claim: TopupClaim }) {
  const fields = [
    ['Họ tên sinh viên', claim.fullName], ['Mã sinh viên', claim.studentCode], ['Số thẻ (UID)', claim.cardUid],
    ['Số tiền đã chuyển', `${claim.amount.toLocaleString('vi-VN')}đ`], ['Thời điểm chuyển', new Date(claim.transferredAt).toLocaleString('vi-VN')],
    ['Người chuyển tiền', claim.senderName], ['Ngân hàng chuyển', claim.bankName], ['Mã giao dịch ngân hàng', claim.bankReference],
    ['Nộp lúc', new Date(claim.createdAt).toLocaleString('vi-VN')], ['Trạng thái', claimStatusLabels[claim.status]],
  ];
  return <div className="space-y-5">
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500 mb-1">{label}</dt><dd className="text-sm font-medium break-words">{value}</dd></div>)}</dl>
    <div><h3 className="text-sm font-semibold mb-1">Nội dung / lý do yêu cầu</h3><p className="text-sm whitespace-pre-wrap break-words text-gray-600">{claim.description}</p></div>
    {claim.reviewedAt && <div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><h3 className="text-sm font-semibold">Kết quả xử lý</h3>{claim.reviewNote && <p className="text-sm whitespace-pre-wrap break-words mt-1">{claim.reviewNote}</p>}<p className="text-xs text-gray-500 mt-2">{new Date(claim.reviewedAt).toLocaleString('vi-VN')}</p>{claim.transactionId && <p className="text-xs text-gray-500 mt-1 break-all">Mã giao dịch ví: {claim.transactionId}</p>}</div>}
    <div><h3 className="text-sm font-semibold mb-3">Ảnh minh chứng giao dịch</h3><ClaimEvidence key={claim.id} id={claim.id} /></div>
  </div>;
}
