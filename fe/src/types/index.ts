export type { AuthUser, StudentUser, AdminUser, LoginResponse, AuthState, UserRole } from './auth';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  email: string;
  phone?: string;
  faculty: string;
  isActive: boolean;
  dateOfBirth?: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  accounts?: Account[];
  cards?: Card[];
}

export interface Account {
  id: string;
  balance: number;
  dailyLimit: number;
  dailySpent: number;
  status: 'active' | 'frozen' | 'closed';
  studentId: string;
  createdAt: string;
}

export type CardStatus = 'active' | 'inactive' | 'lost' | 'frozen';

export interface Card {
  id: string;
  uid: string;
  chipType: string;
  chipData?: Record<string, any>;
  status: CardStatus;
  lastUsedAt?: string;
  studentId: string;
  createdAt: string;
  updatedAt: string;
}

export type MerchantType = 'canteen' | 'library' | 'parking' | 'printing' | 'other';

export interface Merchant {
  id: string;
  name: string;
  type: MerchantType;
  location?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantCreate {
  name: string;
  type: MerchantType;
  location?: string;
}

export type TransactionType = 'debit' | 'credit';
export type TransactionStatus = 'pending' | 'success' | 'failed' | 'refunded';

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  idempotencyKey: string;
  referenceCode?: string;
  description?: string;
  studentCode?: string;
  studentId: string;
  accountId: string;
  merchantId?: string;
  merchant?: Merchant;
  createdAt: string;
}

export interface PayRequest {
  studentCode: string;
  amount: number;
  idempotencyKey: string;
  description?: string;
}

export interface DashboardStats {
  totalTransactions: number;
  totalRevenue: number;
  totalStudents: number;
  activeStudents: number;
  totalMerchants: number;
  activeMerchants: number;
  todayTransactions: number;
  todayRevenue: number;
}
