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
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can post jobs.');
    }
    return this.jobsService.create(dto, user);
  }

  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can list their jobs.');
    }
    return this.jobsService.findMineAsSeeker(user.sub);
  }

  @Get('provider/feed')
  findProviderFeed(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can browse the job feed.');
    }
    return this.jobsService.findFeedForProvider(user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.jobsService.findOne(id, user);
  }

  @Patch(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can close jobs.');
    }
    return this.jobsService.close(id, user.sub);
  }
}
