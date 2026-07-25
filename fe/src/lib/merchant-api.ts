import api from './axios';
import type { ApiResponse, Merchant, MerchantCreate } from '@/types';

export const merchantApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<Merchant[]>>('/merchants', { params }),

  get: (id: string) =>
    api.get<ApiResponse<Merchant>>(`/merchants/${id}`),

  create: (data: MerchantCreate) =>
    api.post<ApiResponse<Merchant>>('/merchants', data),

  regenerateKey: (id: string) =>
    api.post<ApiResponse<{ apiKey: string }>>(`/merchants/${id}/regenerate-key`),

  toggleActive: (id: string) =>
    api.patch<ApiResponse<Merchant>>(`/merchants/${id}/toggle-active`),
};
