import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TopupClaimStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  REJECTED = 'rejected',
}

@Entity('topup_claims')
@Index('IDX_topup_claims_student_created', ['studentId', 'createdAt'])
@Index(
  'UQ_topup_claims_open_reference',
  ['studentId', 'bankName', 'bankReference'],
  { unique: true, where: "status IN ('pending', 'matched')" },
)
export class TopupClaim {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) studentId: string;
  @Column({ length: 100 }) fullName: string;
  @Column({ length: 20 }) studentCode: string;
  @Column({ length: 50 }) cardUid: string;
  @Column({ type: 'int' }) amount: number;
  @Column({ type: 'timestamptz' }) transferredAt: Date;
  @Column({ length: 100 }) senderName: string;
  @Column({ length: 100 }) bankName: string;
  @Column({ length: 100 }) bankReference: string;
  @Column({ length: 1000 }) description: string;
  @Column({ type: 'bytea', select: false }) evidence: Buffer;
  @Column({ length: 30 }) evidenceMime: string;
  @Column({ type: 'int' }) evidenceSize: number;
  @Column({
    type: 'enum',
    enum: TopupClaimStatus,
    default: TopupClaimStatus.PENDING,
  })
  status: TopupClaimStatus;
  @Column({ type: 'uuid', nullable: true, unique: true }) pendingId:
    string | null;
  @Column({ type: 'uuid', nullable: true }) transactionId: string | null;
  @Column({ type: 'uuid', nullable: true }) reviewedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) reviewNote:
    string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
