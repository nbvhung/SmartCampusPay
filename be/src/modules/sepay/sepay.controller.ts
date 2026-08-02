import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SePayService } from './sepay.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('sepay')
export class SePayController {
  constructor(private readonly service: SePayService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() body: any, @Headers('authorization') auth: string) {
    this.service.verifyApiKey(auth);
    return this.service.handleWebhook(body);
  }

  @Post('create-payment')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async createPayment(
    @Body() dto: { amount: number },
    @CurrentUser() user: any,
  ) {
    if (user.role !== 'student') {
      return { success: false, message: 'Chỉ sinh viên mới được nạp tiền' };
    }
    return this.service.createPayment(user.studentCode, dto.amount);
  }

  @Post('static-qr')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  getStaticQr() {
    return this.service.createStaticQr();
  }

  @Post('cancel-payment')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async cancelPayment(
    @Body() dto: { referenceCode: string },
    @CurrentUser() user: any,
  ) {
    await this.service.cancelPayment(dto.referenceCode, user.id);
    return { message: 'Đã hủy giao dịch' };
  }

  @Get('status/:referenceCode')
  @UseGuards(AuthGuard('jwt'))
  async checkStatus(
    @Param('referenceCode') referenceCode: string,
    @CurrentUser() user: any,
  ) {
    return this.service.checkStatus(referenceCode, user);
  }
}
