import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopupPendingModule } from '../topup-pending/topup-pending.module';
import { TopupClaim } from './topup-claim.entity';
import { TopupClaimsController } from './topup-claims.controller';
import { TopupClaimsService } from './topup-claims.service';

@Module({
  imports: [TypeOrmModule.forFeature([TopupClaim]), TopupPendingModule],
  controllers: [TopupClaimsController],
  providers: [TopupClaimsService],
  exports: [TopupClaimsService],
})
export class TopupClaimsModule {}
