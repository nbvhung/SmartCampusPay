import { Controller, Get, Post, Body, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CardsService } from './cards.service';
import { CardStatus } from './card.entity';

@Controller('cards')
@UseGuards(AuthGuard('jwt'))
export class CardsController {
  constructor(private readonly service: CardsService) {}

  @Post()
  create(@Body() data: any) {
    return this.service.create(data);
  }

  @Get('uid/:uid')
  findByUid(@Param('uid') uid: string) {
    return this.service.findByUid(uid);
  }

  @Get('student/:studentId')
  findByStudent(@Param('studentId') studentId: string) {
    return this.service.findByStudentId(studentId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: CardStatus) {
    return this.service.updateStatus(id, status);
  }
}
