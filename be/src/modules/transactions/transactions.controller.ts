import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import { PayDto } from './dto/pay.dto';
import { TopupDto } from './dto/topup.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post('pay')
  @UseGuards(ApiKeyGuard)
  async pay(@Body() dto: PayDto, @Body('merchantId') _unused: any) {
    return this.service.pay(dto, dto.merchantId);
  }

  @Post('pay/card')
  @UseGuards(ApiKeyGuard)
  async payByCard(@Body() dto: { cardUid: string; merchantId: string; amount: number; idempotencyKey: string }) {
    return this.service.payByCard(dto.cardUid, dto.merchantId, dto.amount, dto.idempotencyKey);
  }

  @Post('topup')
  @UseGuards(AuthGuard('jwt'))
  async topup(@Body() dto: TopupDto) {
    return this.service.topup(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll() {
    return this.service.findAll();
  }

  @Get('student/:code')
  async findByStudent(@Param('code') code: string) {
    return this.service.findByStudent(code);
  }

  @Get('stats/daily')
  @UseGuards(AuthGuard('jwt'))
  async getDailyStats() {
    return this.service.getDailyStats();
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt'))
  async getStats() {
    return this.service.getStats();
  }
}
