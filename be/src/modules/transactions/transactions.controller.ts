import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import { PayDto } from './dto/pay.dto';
import { PayByCardDto } from './dto/pay-by-card.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(200)
  @Post('pay')
  async pay(@Body() dto: PayDto, @Req() req: any) {
    return this.service.pay(dto, req.merchant.id);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(200)
  @Post('pay/card')
  async payByCard(@Body() dto: PayByCardDto, @Req() req: any) {
    return this.service.payByCard(
      dto.cardUid,
      req.merchant.id,
      dto.amount,
      dto.idempotencyKey,
    );
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('payments/:key')
  findPayment(
    @Param('key', new ParseUUIDPipe({ version: '4' })) key: string,
    @Req() req: any,
  ) {
    return this.service.findPayment(key, req.merchant.id);
  }

  @Get()
  @Roles('admin', 'super_admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
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
  @Roles('admin', 'super_admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDailyStats() {
    return this.service.getDailyStats();
  }

  @Get('stats')
  @Roles('admin', 'super_admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getStats() {
    return this.service.getStats();
  }

  @Get('chart')
  @Roles('admin', 'super_admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getChartData(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    if (days < 1 || days > 90)
      throw new BadRequestException('days must be between 1 and 90');
    return this.service.getChartData(days);
  }
}
