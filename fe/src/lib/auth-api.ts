import api from './axios';
import type { AuthUser, LoginResponse, RegistrationOtpResponse, RegistrationResult } from '../types/auth';
import type { Account, Card } from '../types';

export const authApi = {
  /**
   * Mỗi cổng đăng nhập chỉ xác thực loại tài khoản tương ứng.
   */
  login: (studentCode: string, password: string) =>
    api.post<{ success: boolean; data: LoginResponse }>('/auth/login', { studentCode, password }),
  adminLogin: (username: string, password: string) =>
    api.post<{ success: boolean; data: LoginResponse }>('/auth/admin/login', { username, password }),

  requestRegistrationOtp: (studentCode: string, phone: string) =>
    api.post<{ success: boolean; data: RegistrationOtpResponse }>('/auth/register/request-otp', { studentCode, phone }),

  verifyRegistration: (registrationId: string, otp: string) =>
    api.post<{ success: boolean; data: RegistrationResult }>('/auth/register/verify', { registrationId, otp }),

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

  /** Đổi mật khẩu luôn yêu cầu mật khẩu hiện tại và thu hồi session. */
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),

  /**
   * Lấy thông tin user hiện tại
   */
  me: () =>
    api.get<{ success: boolean; data: AuthUser & { mustChangePassword?: boolean; accounts?: Account[]; cards?: Card[] } }>('/auth/me'),
};
