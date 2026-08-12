import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Account } from '../accounts/account.entity';
import { Merchant } from '../merchants/merchant.entity';

export enum TransactionType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ unique: true, length: 64 })
  idempotencyKey: string;

  @Column({ unique: true, length: 32, nullable: true })
  referenceCode: string;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ length: 20, nullable: true })
  studentCode: string;

  @Column()
  studentId: string;

  @Column({ nullable: true })
  accountId: string;

  @Column({ nullable: true })
  merchantId: string;

  @ManyToOne(() => Student, (s) => s.transactions)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @ManyToOne(() => Account, (a) => a.transactions)
  @JoinColumn({ name: 'accountId' })
  account: Account;

  @ManyToOne(() => Merchant)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @CreateDateColumn()
  createdAt: Date;
}
