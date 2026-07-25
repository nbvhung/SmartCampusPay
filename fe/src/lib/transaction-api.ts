import api from './axios';
import type { ApiResponse, Transaction, PayRequest, TopupRequest } from '@/types';

export const transactionApi = {
  list: (params?: { page?: number; limit?: number; studentCode?: string; startDate?: string; endDate?: string }) =>
    api.get<ApiResponse<Transaction[]>>('/transactions', { params }),

  listByStudent: (studentId: string, params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<Transaction[]>>(`/transactions/student/${studentId}`, { params }),

  pay: (data: PayRequest) =>
    api.post<ApiResponse<Transaction>>('/transactions/pay', data),

  payByCard: (data: { cardUid: string; amount: number; idempotencyKey: string; description?: string }) =>
    api.post<ApiResponse<Transaction>>('/transactions/pay-by-card', data),

  topup: (data: TopupRequest) =>
    api.post<ApiResponse<Transaction>>('/transactions/topup', data),

  stats: () =>
    api.get<ApiResponse<{
      totalTransactions: number;
      totalRevenue: number;
      todayTransactions: number;
      todayRevenue: number;
      totalStudents: number;
      totalMerchants: number;
    }>>('/transactions/stats'),
};
