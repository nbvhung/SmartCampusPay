import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TopupPendingStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  IGNORED = 'ignored',
}

@Entity('topup_pendings')
export class TopupPending {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  transferId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ length: 255 })
  content: string;

  @Column({ length: 100, nullable: true })
  sender: string;

  @Column({ length: 64, nullable: true })
  bankRef: string;

  @Column({ length: 100, nullable: true })
  bankName: string;

  @Column({
    type: 'enum',
    enum: TopupPendingStatus,
    default: TopupPendingStatus.PENDING,
  })
  status: TopupPendingStatus;

  @Column({ nullable: true })
  studentId: string;

  @Column({ nullable: true })
  adminId: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ type: 'timestamptz', nullable: true })
  matchedAt: Date;

  @Column({ length: 255, nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
