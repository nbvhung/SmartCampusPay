import api from './axios';
import type { ApiResponse, PaginatedResponse } from '@/types';
import type { TopupPending } from './topup-pending-api';

export type TopupClaimStatus = 'pending' | 'matched' | 'rejected';
export const claimStatusLabels: Record<TopupClaimStatus, string> = { pending: 'Chờ đối soát', matched: 'Đã khớp · đã cộng tiền', rejected: 'Cần bổ sung / bị từ chối' };
export interface TopupClaim {
  id: string;
  studentId: string;
  fullName: string;
  studentCode: string;
  cardUid: string;
  amount: number;
  transferredAt: string;
  senderName: string;
  bankName: string;
  bankReference: string;
  description: string;
  evidenceMime: string;
  evidenceSize: number;
  status: TopupClaimStatus;
  pendingId: string | null;
  transactionId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export const topupClaimsApi = {
  submit: (form: FormData) => api.post<ApiResponse<TopupClaim>>('/topup-claims', form, { headers: { 'Content-Type': undefined } }),
  list: (page = 1, status?: TopupClaimStatus) => api.get<ApiResponse<PaginatedResponse<TopupClaim>>>('/topup-claims', { params: { page, limit: 20, status } }),
  detail: (id: string) => api.get<ApiResponse<TopupClaim>>(`/topup-claims/${id}`),
  evidence: (id: string) => api.get<Blob>(`/topup-claims/${id}/evidence`, { responseType: 'blob' }),
  candidates: (id: string, search?: string) => api.get<ApiResponse<TopupPending[]>>(`/topup-claims/${id}/candidates`, { params: { search } }),
  match: (id: string, pendingId: string) => api.post<ApiResponse<TopupClaim>>(`/topup-claims/${id}/match`, { pendingId }),
  reject: (id: string, reason: string) => api.post<ApiResponse<TopupClaim>>(`/topup-claims/${id}/reject`, { reason }),
};
