import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AdminsService } from './admins.service';
import { Admin } from './admin.entity';

describe('AdminsService', () => {
  let service: AdminsService;
  let repo: jest.Mocked<Repository<Admin>>;

  const mockAdmin: Admin = {
    id: 'uuid-1',
    username: 'admin',
    passwordHash: 'hashed-password',
    fullName: 'System Admin',
    role: 'super_admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminsService,
        {
          provide: getRepositoryToken(Admin),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminsService>(AdminsService);
    repo = module.get(getRepositoryToken(Admin));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUsername', () => {
    it('should return admin if found', async () => {
      repo.findOne.mockResolvedValue(mockAdmin);
      const result = await service.findByUsername('admin');
      expect(result).toEqual(mockAdmin);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { username: 'admin' },
        select: expect.any(Object),
      });
    });

    it('should return null if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.findByUsername('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return admin by id', async () => {
      repo.findOne.mockResolvedValue(mockAdmin);
      const result = await service.findById('uuid-1');
      expect(result).toEqual(mockAdmin);
    });
  });

  describe('findAll', () => {
    it('should return all admins', async () => {
      repo.find.mockResolvedValue([mockAdmin]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should create admin successfully', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockAdmin);
      repo.save.mockResolvedValue(mockAdmin);

      const result = await service.create(
        'newadmin',
        'password123',
        'New Admin',
        'admin',
      );
      expect(result).toEqual(mockAdmin);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'newadmin',
          fullName: 'New Admin',
          role: 'admin',
        }),
      );
    });

    it('should throw ConflictException if username exists', async () => {
      repo.findOne.mockResolvedValue(mockAdmin);
      await expect(
        service.create('admin', 'password123', 'Dup', 'admin'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should throw ForbiddenException when removing super_admin', async () => {
      repo.findOne.mockResolvedValue(mockAdmin);
      await expect(service.remove('uuid-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if admin not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
