import api from './axios';
import type { LoginResponse } from '../types/auth';

export const authApi = {
  /**
   * Đăng nhập unified — tự detect student (studentCode) hay admin (username)
   */
  login: (identifier: string, password: string) =>
    api.post<{ success: boolean; data: LoginResponse }>('/auth/login/unified', { identifier, password }),

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
