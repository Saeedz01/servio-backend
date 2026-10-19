import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  OptionalCurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { GuestLookupDto } from './dto/guest-lookup.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(@Body() dto: CreateJobDto, @OptionalCurrentUser() user?: JwtPayload) {
    return this.jobsService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can list their jobs.');
    }
    return this.jobsService.findMineAsSeeker(user.sub);
  }

  @Post('guest-lookup')
  guestLookup(@Body() dto: GuestLookupDto) {
    return this.jobsService.guestLookup(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('provider/feed')
  findProviderFeed(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can browse the job feed.');
    }
    return this.jobsService.findFeedForProvider(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.jobsService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can close jobs.');
    }
    return this.jobsService.close(id, user.sub);
  }
}
