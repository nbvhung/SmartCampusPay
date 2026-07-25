import api from './axios';
import type { ApiResponse, Account } from '@/types';

export const accountApi = {
  getBalance: (studentId: string) =>
    api.get<ApiResponse<Account>>(`/accounts/${studentId}`),

  topup: (data: { studentCode: string; amount: number; idempotencyKey: string }) =>
    api.post<ApiResponse<Account>>('/accounts/topup', data),
};
