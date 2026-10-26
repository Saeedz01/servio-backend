import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { UnlockContactDto } from './dto/unlock-contact.dto.js';
import { TokensService } from './tokens.service.js';

@Controller('tokens')
@UseGuards(JwtAuthGuard)
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get('me')
  getMyBalance(@CurrentUser() user: JwtPayload) {
    return this.tokensService.getMyBalance(user);
  }

  @Post('unlock')
  unlock(@Body() dto: UnlockContactDto, @CurrentUser() user: JwtPayload) {
    return this.tokensService.unlockContact(
      user,
      dto.targetType,
      dto.targetId,
    );
  }
}
