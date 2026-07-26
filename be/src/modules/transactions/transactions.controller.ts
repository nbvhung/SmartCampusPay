import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import { PayDto } from './dto/pay.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post('pay')
  @UseGuards(ApiKeyGuard)
  async pay(@Body() dto: PayDto, @Req() req: any) {
    return this.service.pay(dto, req.merchant.id);
  }

  @Post('pay/card')
  @UseGuards(ApiKeyGuard)
  async payByCard(@Body() dto: { cardUid: string; amount: number; idempotencyKey: string }, @Req() req: any) {
    return this.service.payByCard(dto.cardUid, req.merchant.id, dto.amount, dto.idempotencyKey);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll() {
    return this.service.findAll();
  }

  @Get('student/:code')
  @UseGuards(AuthGuard('jwt'))
  async findByStudent(@Param('code') code: string, @CurrentUser() user: any) {
    const targetCode = user.role === 'student' ? user.studentCode : code;
    return this.service.findByStudent(targetCode);
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
