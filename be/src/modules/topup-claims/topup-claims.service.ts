import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Student } from '../students/student.entity';
import { Card } from '../cards/card.entity';
import { TopupPending, TopupPendingStatus } from '../topup-pending/topup-pending.entity';
import { TopupPendingService } from '../topup-pending/topup-pending.service';
import { TopupClaim, TopupClaimStatus } from './topup-claim.entity';
import { CreateTopupClaimDto, ListTopupClaimsDto } from './dto/topup-claim.dto';
import { EvidenceUpload, validateEvidence } from './evidence';
import { normalizeUid, validateTopupAmount } from '../../common/utils/payment';

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('vi');

@Injectable()
export class TopupClaimsService {
  constructor(
    @InjectRepository(TopupClaim) private readonly repo: Repository<TopupClaim>,
    private readonly dataSource: DataSource,
    private readonly pendingService: TopupPendingService,
  ) {}

  async submit(studentId: string, dto: CreateTopupClaimDto, file?: EvidenceUpload) {
    const mime = validateEvidence(file);
    validateTopupAmount(dto.amount);
    const transferredAt = new Date(dto.transferredAt);
    if (!Number.isFinite(transferredAt.getTime()) || transferredAt.getTime() > Date.now()) {
      throw new BadRequestException('Thời điểm chuyển tiền không hợp lệ hoặc nằm trong tương lai');
    }
    const student = await this.dataSource.getRepository(Student).findOneBy({ id: studentId });
    if (!student?.isActive) throw new BadRequestException('Tài khoản sinh viên không hoạt động');
    if (dto.studentCode.trim().toUpperCase() !== student.studentCode.toUpperCase() || normalizeName(dto.fullName) !== normalizeName(student.fullName)) {
      throw new BadRequestException('Họ tên và mã sinh viên phải khớp tài khoản đang đăng nhập');
    }
    const card = await this.dataSource.getRepository(Card).findOneBy({ studentId, uid: normalizeUid(dto.cardUid) });
    if (!card) throw new BadRequestException('Số thẻ không thuộc tài khoản sinh viên này');
    try {
      const claim = await this.repo.save(this.repo.create({
        studentId, fullName: student.fullName, studentCode: student.studentCode,
        cardUid: card.uid, amount: dto.amount, transferredAt,
        senderName: dto.senderName.trim(), bankName: dto.bankName.trim().toUpperCase(),
        bankReference: dto.bankReference.trim().toUpperCase(), description: dto.description.trim(),
        evidence: file!.buffer, evidenceMime: mime, evidenceSize: file!.buffer.length,
        status: TopupClaimStatus.PENDING,
      }));
      return this.detail(claim.id, studentId);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Bạn đã nộp hồ sơ cho mã giao dịch này. Vui lòng theo dõi hồ sơ đã gửi.');
      throw error;
    }
  }

  async list(dto: ListTopupClaimsDto, studentId?: string) {
    const where = { ...(studentId ? { studentId } : {}), ...(dto.status ? { status: dto.status } : {}) };
    const [items, total] = await this.repo.findAndCount({ where, order: { createdAt: 'DESC', id: 'DESC' }, skip: (dto.page - 1) * dto.limit, take: dto.limit });
    return { items, total, page: dto.page, limit: dto.limit };
  }

  async detail(id: string, studentId?: string) {
    const claim = await this.repo.findOneBy({ id, ...(studentId ? { studentId } : {}) });
    if (!claim) throw new NotFoundException('Không tìm thấy hồ sơ');
    return claim;
  }

  async evidence(id: string, studentId?: string) {
    const claim = await this.repo.createQueryBuilder('claim').addSelect('claim.evidence')
      .where('claim.id = :id', { id })
      .andWhere(studentId ? 'claim.studentId = :studentId' : '1 = 1', { studentId }).getOne();
    if (!claim) throw new NotFoundException('Không tìm thấy minh chứng');
    return { buffer: claim.evidence, mime: claim.evidenceMime };
  }

  async candidates(id: string, search?: string) {
    const claim = await this.detail(id);
    if (claim.status !== TopupClaimStatus.PENDING) throw new BadRequestException('Hồ sơ đã được xử lý');
    const query = this.dataSource.getRepository(TopupPending).createQueryBuilder('pending')
      .where('pending.status = :status', { status: TopupPendingStatus.PENDING })
      .andWhere('pending.amount = :amount', { amount: claim.amount });
    if (search) {
      query.andWhere('(pending.transferId ILIKE :search OR pending.bankRef ILIKE :search OR pending.content ILIKE :search OR pending.sender ILIKE :search)', { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` });
    }
    return query.orderBy('CASE WHEN UPPER(pending.bankRef) = :reference THEN 0 ELSE 1 END', 'ASC')
      .setParameter('reference', claim.bankReference).addOrderBy('pending.createdAt', 'DESC').take(100).getMany();
  }

  async match(id: string, pendingId: string, adminId: string, note: string) {
    await this.dataSource.transaction(async (manager) => {
      const claim = await manager.findOne(TopupClaim, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!claim) throw new NotFoundException('Không tìm thấy hồ sơ');
      if (claim.status !== TopupClaimStatus.PENDING) throw new ConflictException('Hồ sơ đã được xử lý');
      const pending = await this.pendingService.matchWithManager(manager, pendingId, claim.studentCode, adminId, claim.amount);
      // Never let client-supplied student identifiers choose the recipient.
      if (pending.studentId !== claim.studentId) throw new ConflictException('Thông tin sinh viên đã thay đổi, cần kiểm tra lại hồ sơ');
      claim.status = TopupClaimStatus.MATCHED;
      claim.pendingId = pending.id;
      claim.transactionId = pending.transactionId;
      claim.reviewedBy = adminId;
      claim.reviewedAt = new Date();
      claim.reviewNote = note;
      await manager.save(claim);
    });
    return this.detail(id);
  }

  async reject(id: string, adminId: string, reason: string) {
    await this.dataSource.transaction(async (manager) => {
      const claim = await manager.findOne(TopupClaim, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!claim) throw new NotFoundException('Không tìm thấy hồ sơ');
      if (claim.status !== TopupClaimStatus.PENDING) throw new ConflictException('Hồ sơ đã được xử lý');
      claim.status = TopupClaimStatus.REJECTED;
      claim.reviewedBy = adminId;
      claim.reviewedAt = new Date();
      claim.reviewNote = reason;
      await manager.save(claim);
    });
    return this.detail(id);
  }
}
