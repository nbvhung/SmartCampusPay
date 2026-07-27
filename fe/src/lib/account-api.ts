import api from './axios';
import type { ApiResponse, Account } from '@/types';

export const accountApi = {
  list: () => api.get<ApiResponse<Account[]>>('/accounts'),

  getBalance: (studentId: string) =>
    api.get<ApiResponse<{ balance: number }>>(`/accounts/balance/${studentId}`),

  findByStudent: (studentId: string) =>
    api.get<ApiResponse<Account>>(`/accounts/student/${studentId}`),

  toggleFreeze: (id: string) =>
    api.patch<ApiResponse<Account>>(`/accounts/${id}/freeze`),
};
