import api from './axios';
import type { ApiResponse } from '@/types';

export interface Admin {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'super_admin';
  isActive: boolean;
  createdAt: string;
}

export const adminApi = {
  list: () => api.get<ApiResponse<Admin[]>>('/admins'),
  getById: (id: string) => api.get<ApiResponse<Admin>>(`/admins/${id}`),
  create: (data: { username: string; password: string; fullName: string }) =>
    api.post<ApiResponse<Admin>>('/admins', data),
  update: (id: string, data: { fullName?: string; isActive?: boolean }) =>
    api.patch<ApiResponse<Admin>>(`/admins/${id}`, data),
  remove: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/admins/${id}`),
};
