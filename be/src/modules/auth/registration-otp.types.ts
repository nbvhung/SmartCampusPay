export type RegistrationOtpStatus = 'pending' | 'verified' | 'exhausted';

export interface RegistrationOtpChallenge {
  version: 1;
  registrationId: string;
  studentId: string;
  phone: string;
  otpDigest?: string;
  attemptsRemaining: number;
  expiresAt: number;
  resendAvailableAt: number;
  status: RegistrationOtpStatus;
  verifiedAt?: number;
}

export interface RequestRegistrationOtpInput {
  studentId: string;
  phone: string;
  clientId?: string;
}

export interface RegistrationOtpResponse {
  registrationId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface VerifiedRegistrationIdentity {
  registrationId: string;
  studentId: string;
  phone: string;
  verifiedAt: number;
}
