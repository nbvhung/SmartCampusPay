import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendRegistrationOtpMessage, SmsSender } from './sms-sender';

@Injectable()
export class MockSmsSender extends SmsSender {
  private readonly logger = new Logger(MockSmsSender.name);
  private readonly messages = new Map<string, SendRegistrationOtpMessage>();

  constructor(private readonly config: ConfigService) {
    super();
  }

  sendRegistrationOtp(message: SendRegistrationOtpMessage): Promise<void> {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error('MockSmsSender cannot send messages in production');
    }
    this.messages.set(message.phone, { ...message });

    if (this.config.get('SMS_MOCK_LOG_OTP') === 'true') {
      const maskedPhone = message.phone.replace(/.(?=.{4})/g, '*');
      this.logger.warn(
        `[DEVELOPMENT ONLY] Registration OTP ${message.otp} for ${maskedPhone}`,
      );
    }
    return Promise.resolve();
  }

  getLastMessage(phone: string): SendRegistrationOtpMessage | undefined {
    const message = this.messages.get(phone);
    return message ? { ...message } : undefined;
  }
}
