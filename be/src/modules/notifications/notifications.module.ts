import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockSmsSender } from './mock-sms.sender';
import { SmsSender } from './sms-sender';

@Module({
  imports: [ConfigModule],
  providers: [
    MockSmsSender,
    {
      provide: SmsSender,
      inject: [ConfigService, MockSmsSender],
      useFactory: (config: ConfigService, mock: MockSmsSender): SmsSender => {
        const provider = config
          .get<string>('SMS_PROVIDER', 'mock')
          .toLowerCase();
        const environment = config.get<string>('NODE_ENV', 'development');

        if (provider === 'mock') {
          if (environment === 'production') {
            throw new Error(
              'SMS_PROVIDER=mock is not allowed in production. Configure a production SmsSender implementation.',
            );
          }
          return mock;
        }

        throw new Error(
          `Unsupported SMS_PROVIDER "${provider}". No production SMS vendor is configured.`,
        );
      },
    },
  ],
  exports: [SmsSender],
})
export class NotificationsModule {}
