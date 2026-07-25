import api from './axios';
import type { ApiResponse, Card, CardStatus } from '@/types';

export const cardApi = {
  create: (data: { uid: string; studentId: string; chipType?: string }) =>
    api.post<ApiResponse<Card>>('/cards', data),

  findByUid: (uid: string) =>
    api.get<ApiResponse<Card>>(`/cards/uid/${uid}`),

  findByStudent: (studentId: string) =>
    api.get<ApiResponse<Card[]>>(`/cards/student/${studentId}`),

  updateStatus: (id: string, status: CardStatus) =>
    api.patch<ApiResponse<Card>>(`/cards/${id}/status`, { status }),
};
