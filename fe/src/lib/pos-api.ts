import axios from 'axios';
import type { ApiResponse, Transaction } from '@/types';

export const posApi = {
  payByCard: (apiKey: string, cardUid: string, amount: number, idempotencyKey: string) => {
    return axios.post<ApiResponse<Transaction>>(
      '/api/v1/transactions/pay/card',
      { cardUid, amount, idempotencyKey },
      { headers: { 'X-API-Key': apiKey }, timeout: 10000 },
    );
  },

  pay: (apiKey: string, studentCode: string, amount: number, idempotencyKey: string) => {
    return axios.post<ApiResponse<Transaction>>(
      '/api/v1/transactions/pay',
      { studentCode, amount, idempotencyKey },
      { headers: { 'X-API-Key': apiKey }, timeout: 10000 },
    );
  },
};
