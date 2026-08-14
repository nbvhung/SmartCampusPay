import api from './axios';
import type { ApiResponse } from '@/types';

export interface SePayPayment {
  referenceCode: string;
  qrUrl: string;
  amount: number;
  expiresAt: string;
}

export interface SePayStatus {
  status: string;
  amount: number;
  createdAt: string;
}

export interface SePayStaticQr {
  qrUrl: string;
  bankName: string;
  accountNumber: string;
  description: string;
}

export const sepayApi = {
  createPayment: (amount: number) =>
    api.post<ApiResponse<SePayPayment>>('/sepay/create-payment', { amount }),

  staticQr: () =>
    api.post<ApiResponse<SePayStaticQr>>('/sepay/static-qr'),

  cancelPayment: (referenceCode: string) =>
    api.post<ApiResponse<{ message: string }>>('/sepay/cancel-payment', { referenceCode }),

  checkStatus: (referenceCode: string) =>
    api.get<ApiResponse<SePayStatus>>(`/sepay/status/${referenceCode}`),
};
