import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';

export enum CardStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  LOST = 'lost',
  FROZEN = 'frozen',
}

@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  uid: string;

  @Column({ length: 20, default: 'MIFARE' })
  chipType: string;

  @Column({ type: 'simple-json', nullable: true })
  chipData: Record<string, any>;

  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.ACTIVE })
  status: CardStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date;

  @Column()
  studentId: string;

  @ManyToOne(() => Student, (student) => student.cards)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
