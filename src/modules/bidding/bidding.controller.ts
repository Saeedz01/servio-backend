import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { BiddingService } from './bidding.service.js';
import { CreateBiddingDto } from './dto/create-bidding.dto.js';

@Controller('bidding')
@UseGuards(JwtAuthGuard)
export class BiddingController {
  constructor(private readonly biddingService: BiddingService) {}

  @Post()
  create(@Body() dto: CreateBiddingDto, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can place bids.');
    }
    return this.biddingService.create(dto, user);
  }

  /** Seeker accepts a bid → creates a booked booking. */
  @Post(':bidId/accept')
  accept(@Param('bidId') bidId: string, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can accept bids.');
    }
    return this.biddingService.accept(bidId, user);
  }

  /** Seeker lists bids for a job they posted. */
  @Get('job/:jobId')
  findForJob(@Param('jobId') jobId: string, @CurrentUser() user: JwtPayload) {
    return this.biddingService.findForJobAsSeeker(jobId, user);
  }

  /** Provider reads their own bid on a job. */
  @Get('my-bid/:jobId')
  findMyBid(@Param('jobId') jobId: string, @CurrentUser() user: JwtPayload) {
    return this.biddingService.findMyBidOnJob(jobId, user);
  }
}
