import api from './axios';
import type { ApiResponse } from '@/types';

export type TopupPendingStatus = 'pending' | 'matched' | 'ignored';

export interface TopupPending {
  id: string;
  transferId: string;
  amount: number;
  content: string;
  sender: string | null;
  bankRef: string | null;
  bankName: string | null;
  status: TopupPendingStatus;
  note: string | null;
  createdAt: string;
}

export const topupPendingApi = {
  list: (status?: TopupPendingStatus) =>
    api.get<ApiResponse<TopupPending[]>>('/topup-pending', {
      params: status ? { status } : {},
    }),

  match: (id: string, studentCode: string) =>
    api.post<ApiResponse<TopupPending>>(`/topup-pending/${id}/match`, { studentCode }),

  ignore: (id: string) =>
    api.post<ApiResponse<TopupPending>>(`/topup-pending/${id}/ignore`),
};
