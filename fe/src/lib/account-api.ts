import api from './axios';
import type { ApiResponse, Account } from '@/types';

export const accountApi = {
  getBalance: (studentId: string) =>
    api.get<ApiResponse<{ balance: number }>>(`/accounts/balance/${studentId}`),

  topup: (data: { studentCode: string; amount: number; description?: string }) =>
    api.post<ApiResponse<{ transaction: import('@/types').Transaction; newBalance: number }>>('/transactions/topup', data),
};
