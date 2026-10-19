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
  OptionalCurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { BiddingService } from './bidding.service.js';
import { AcceptBiddingDto } from './dto/accept-bidding.dto.js';
import { CreateBiddingDto } from './dto/create-bidding.dto.js';
import { GuestJobBidsDto } from './dto/guest-job-bids.dto.js';

@Controller('bidding')
export class BiddingController {
  constructor(private readonly biddingService: BiddingService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateBiddingDto, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can place bids.');
    }
    return this.biddingService.create(dto, user);
  }

  /** Seeker (JWT or guest) accepts a bid → creates a booked booking. */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':bidId/accept')
  accept(
    @Param('bidId') bidId: string,
    @Body() dto: AcceptBiddingDto,
    @OptionalCurrentUser() user?: JwtPayload,
  ) {
    return this.biddingService.accept(bidId, dto, user);
  }

  /** Seeker lists bids for a job they posted. */
  @UseGuards(JwtAuthGuard)
  @Get('job/:jobId')
  findForJob(@Param('jobId') jobId: string, @CurrentUser() user: JwtPayload) {
    return this.biddingService.findForJobAsSeeker(jobId, user);
  }

  /** Guest job owner lists bids with phone verification. */
  @Post('job/:jobId/guest-lookup')
  findForJobAsGuest(
    @Param('jobId') jobId: string,
    @Body() dto: GuestJobBidsDto,
  ) {
    return this.biddingService.findForJobAsGuest(jobId, dto);
  }

  /** Provider reads their own bid on a job. */
  @UseGuards(JwtAuthGuard)
  @Get('my-bid/:jobId')
  findMyBid(@Param('jobId') jobId: string, @CurrentUser() user: JwtPayload) {
    return this.biddingService.findMyBidOnJob(jobId, user);
  }
}
