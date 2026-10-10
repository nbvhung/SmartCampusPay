import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  Check,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Transaction } from '../transactions/transaction.entity';

export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed',
}

@Entity('accounts')
@Check(
  'CHK_accounts_money',
  '"balance" >= 0 AND "dailySpent" >= 0 AND "dailyLimit" >= 0',
)
export class Account {
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', default: 0 })
  balance: number;

  @Column({ type: 'int', default: 0 })
  dailyLimit: number;

  @Column({ type: 'int', default: 0 })
  dailySpent: number;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ type: 'date', nullable: true })
  dailySpentDate: string | null;

  @Column({ unique: true })
  studentId: string;

  @OneToOne(() => Student, (student) => student.account)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @OneToMany(() => Transaction, (tx) => tx.account)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
