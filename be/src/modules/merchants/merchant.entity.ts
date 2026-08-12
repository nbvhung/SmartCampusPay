import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MerchantType {
  CANTEEN = 'canteen',
  LIBRARY = 'library',
  PARKING = 'parking',
  PRINTING = 'printing',
  OTHER = 'other',
}

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: MerchantType, default: MerchantType.OTHER })
  type: MerchantType;

  @Column({ length: 200, nullable: true })
  location: string;

  @Column({ length: 255, select: false })
  apiKey: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
