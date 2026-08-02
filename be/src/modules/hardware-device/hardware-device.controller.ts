import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HardwareDeviceService } from './hardware-device.service';
import { TopupQrDto } from './dto/topup-qr.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('hardware-device')
@Controller('hardware')
export class HardwareDeviceController {
  constructor(private readonly service: HardwareDeviceService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('students/by-uid/:uid')
  getStudentByUid(@Param('uid') uid: string) {
    return this.service.getStudentByUid(uid);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('topup/qr')
  @HttpCode(HttpStatus.OK)
  createTopupQr(@Body() dto: TopupQrDto) {
    return this.service.createTopupQr(dto);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('topup/status/:refCode')
  getTopupStatus(@Param('refCode') refCode: string) {
    return this.service.getTopupStatus(refCode);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('static-qr')
  getStaticQr() {
    return this.service.getStaticQr();
  }
}
