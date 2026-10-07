// Auth types cho SmartCampusPay

export type UserRole = 'student' | 'admin' | 'super_admin';

export interface StudentUser {
  id: string;
  studentCode: string;
  fullName: string | null;
  role: 'student';
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'super_admin';
}

export type AuthUser = StudentUser | AdminUser;

export interface LoginResponse {
  mustChangePassword?: boolean;
  user: AuthUser;
}

export interface RegistrationOtpResponse {
  registrationId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface RegistrationResult {
  studentCode: string;
  registeredAt: string;
  mustChangePassword: true;
}

export interface AuthState {
  user: AuthUser | null;
  mustChangePassword: boolean;
  isLoading: boolean;
}
