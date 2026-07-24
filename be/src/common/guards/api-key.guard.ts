import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../../modules/merchants/merchant.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) throw new UnauthorizedException('Missing API key');

    const merchants = await this.merchantRepo.find({ select: { id: true, apiKey: true, isActive: true } });
    for (const merchant of merchants) {
      if (await bcrypt.compare(apiKey, merchant.apiKey)) {
        if (!merchant.isActive) throw new UnauthorizedException('Merchant is inactive');
        request.merchant = merchant;
        return true;
      }
    }
    throw new UnauthorizedException('Invalid API key');
  }
}
