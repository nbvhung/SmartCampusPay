import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClaimCandidatesDto, CreateTopupClaimDto, ListTopupClaimsDto, MatchTopupClaimDto, RejectTopupClaimDto } from './dto/topup-claim.dto';
import { EvidenceUpload, MAX_EVIDENCE_SIZE } from './evidence';
import { TopupClaimsService } from './topup-claims.service';

interface ClaimUser { id: string; role: 'student' | 'admin' | 'super_admin'; }

@Controller('topup-claims')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student', 'admin', 'super_admin')
export class TopupClaimsController {
  constructor(private readonly service: TopupClaimsService) {}

  @Post()
  @Roles('student')
  @UseInterceptors(FileInterceptor('evidence', { limits: { fileSize: MAX_EVIDENCE_SIZE, files: 1, fields: 10 } }))
  submit(@CurrentUser() user: ClaimUser, @Body() dto: CreateTopupClaimDto, @UploadedFile() file?: EvidenceUpload) {
    return this.service.submit(user.id, dto, file);
  }

  @Get()
  list(@CurrentUser() user: ClaimUser, @Query() dto: ListTopupClaimsDto) {
    return this.service.list(dto, user.role === 'student' ? user.id : undefined);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: ClaimUser) {
    return this.service.detail(id, user.role === 'student' ? user.id : undefined);
  }

  // Binary response is owned by Express, without passthrough or a second JSON reply.
  @Get(':id/evidence')
  async evidence(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: ClaimUser, @Res() res: Response) {
    const evidence = await this.service.evidence(id, user.role === 'student' ? user.id : undefined);
    res.set({ 'Content-Type': evidence.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="evidence"' });
    res.send(evidence.buffer);
  }

  @Get(':id/candidates')
  @Roles('admin', 'super_admin')
  candidates(@Param('id', ParseUUIDPipe) id: string, @Query() dto: ClaimCandidatesDto) {
    return this.service.candidates(id, dto.search);
  }

  @Post(':id/match')
  @Roles('admin', 'super_admin')
  match(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: ClaimUser, @Body() dto: MatchTopupClaimDto) {
    return this.service.match(id, dto.pendingId, user.id, dto.note);
  }

  @Post(':id/reject')
  @Roles('admin', 'super_admin')
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: ClaimUser, @Body() dto: RejectTopupClaimDto) {
    return this.service.reject(id, user.id, dto.reason);
  }
}
