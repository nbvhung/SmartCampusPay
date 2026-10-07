export interface SendRegistrationOtpMessage {
  phone: string;
  otp: string;
  expiresInSeconds: number;
}

export abstract class SmsSender {
  abstract sendRegistrationOtp(
    message: SendRegistrationOtpMessage,
  ): Promise<void>;
}
