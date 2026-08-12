import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { StudentsService } from './students.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('students')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'super_admin')
export class StudentsController {
  constructor(
    private readonly service: StudentsService,
    private readonly accountsService: AccountsService,
  ) {}

  @Post()
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.service.update(id, dto as any);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { message: 'Xoá sinh viên thành công' };
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  // Endpoint tạm để tạo account cho student (sau khi xóa)
  @Post(':id/create-account')
  async createAccount(@Param('id') id: string) {
    await this.accountsService.createAccountIfNotExists(id);
    return { message: 'Account created' };
  }

  // Endpoint tạm: tạo account cho tất cả student chưa có
  @Post('create-all-accounts')
  async createAllAccounts() {
    const students = await this.service.findAll();
    let created = 0;
    for (const student of students) {
      await this.accountsService.createAccountIfNotExists(student.id);
      created++;
    }
    return { message: `Created ${created} accounts` };
  }

  /**
   * POST /api/v1/students/import
   * Upload file Excel để import danh sách sinh viên hàng loạt
   * File .xlsx với các cột: MSV | Họ tên | Email | Điện thoại | Khoa | Ngày sinh (dd/mm/yyyy)
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImport(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.bulkImport(file.buffer);
  }
}
