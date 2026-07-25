import api from './axios';
import type { ApiResponse } from '@/types';

export const accountApi = {
  getBalance: (studentId: string) =>
    api.get<ApiResponse<{ balance: number }>>(`/accounts/balance/${studentId}`),
};
