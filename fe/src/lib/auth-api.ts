import api from './axios';
import type { LoginResponse } from '../types/auth';

export const authApi = {
  /**
   * Đăng nhập sinh viên bằng MSV + mật khẩu
   * BE set httpOnly cookie access_token + refresh_token
   */
  studentLogin: (studentCode: string, password: string) =>
    api.post<{ success: boolean; data: LoginResponse }>('/auth/login', { studentCode, password }),

  /**
   * Đăng nhập admin bằng username + mật khẩu
   */
  adminLogin: (username: string, password: string) =>
    api.post<{ success: boolean; data: LoginResponse }>('/auth/admin/login', { username, password }),

  /**
   * Làm mới access token (refresh_token đọc từ httpOnly cookie)
   */
  refresh: () =>
    api.post('/auth/refresh'),

  /**
   * Đăng xuất — BE xoá cookie + blacklist token
   */
  logout: () =>
    api.post('/auth/logout'),

  /**
   * Đổi mật khẩu
   * - mustChangePassword=true: chỉ cần newPassword
   * - mustChangePassword=false: cần oldPassword + newPassword
   */
  changePassword: (data: { oldPassword?: string; newPassword: string }) =>
    api.post('/auth/change-password', data),

  /**
   * Lấy thông tin user hiện tại
   */
  me: () =>
    api.get<{ success: boolean; data: any }>('/auth/me'),
};
