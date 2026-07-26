import axios from 'axios';
import type { ApiResponse, Transaction } from '@/types';

export const posApi = {
  payByCard: (apiKey: string, cardUid: string, amount: number) => {
    const idempotencyKey = crypto.randomUUID();
    return axios.post<ApiResponse<Transaction>>(
      '/api/v1/transactions/pay/card',
      { cardUid, amount, idempotencyKey },
      { headers: { 'X-API-Key': apiKey } },
    );
  },

  pay: (apiKey: string, studentCode: string, amount: number) => {
    const idempotencyKey = crypto.randomUUID();
    return axios.post<ApiResponse<Transaction>>(
      '/api/v1/transactions/pay',
      { studentCode, amount, idempotencyKey },
      { headers: { 'X-API-Key': apiKey } },
    );
  },
};
