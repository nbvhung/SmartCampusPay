import api from './axios';
import type { ApiResponse, Student } from '@/types';

export const studentApi = {
  list: (params?: { page?: number; limit?: number; faculty?: string; search?: string }) =>
    api.get<ApiResponse<Student[]>>('/students', { params }),

  get: (id: string) =>
    api.get<ApiResponse<Student>>(`/students/${id}`),

  create: (data: { studentCode: string; fullName: string; email: string; faculty: string; phone?: string; dateOfBirth?: string }) =>
    api.post<ApiResponse<Student>>('/students', data),

  update: (id: string, data: { fullName?: string; email?: string; phone?: string; faculty?: string }) =>
    api.patch<ApiResponse<Student>>(`/students/${id}`, data),

  toggleActive: (id: string) =>
    api.patch<ApiResponse<Student>>(`/students/${id}/toggle`),

  remove: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/students/${id}`),

  import: (file: FormData) =>
    api.post<ApiResponse<{ imported: number }>>('/students/import', file, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
