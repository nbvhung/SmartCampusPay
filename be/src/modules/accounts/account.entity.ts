import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Transaction } from '../transactions/transaction.entity';

export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed',
}

@Entity('accounts')
export class Account {
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

  @Column()
  studentId: string;

  @ManyToOne(() => Student, (student) => student.accounts)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @OneToMany(() => Transaction, (tx) => tx.account)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
