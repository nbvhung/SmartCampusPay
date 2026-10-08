import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Card } from '../cards/card.entity';
import { Account } from '../accounts/account.entity';
import { Transaction } from '../transactions/transaction.entity';

@Entity('students')
export class Student {
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  studentCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', unique: true, length: 100, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  faculty: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ default: true })
  mustChangePassword: boolean;

  @Column({ nullable: true, select: false })
  passwordHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  registeredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  profileCompletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Card, (card) => card.student)
  cards: Card[];

  @OneToMany(() => Account, (acc) => acc.student)
  accounts: Account[];

  @OneToMany(() => Transaction, (tx) => tx.student)
  transactions: Transaction[];
}
