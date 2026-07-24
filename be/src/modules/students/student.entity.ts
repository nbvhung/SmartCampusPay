import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { Card } from '../cards/card.entity';
import { Account } from '../accounts/account.entity';
import { Transaction } from '../transactions/transaction.entity';

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  studentCode: string;

  @Column({ length: 100 })
  fullName: string;

  @Column({ unique: true, length: 100 })
  email: string;

  @Column({ length: 15, nullable: true })
  phone: string;

  @Column({ length: 50 })
  faculty: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, select: false })
  passwordHash: string;

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
