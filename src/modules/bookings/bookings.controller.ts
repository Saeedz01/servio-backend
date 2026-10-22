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
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { GuestLookupDto } from './dto/guest-lookup.dto.js';
import { MarkBookingsSeenDto } from './dto/mark-bookings-seen.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { WithdrawBookingDto } from './dto/withdraw-booking.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(
    @Body() dto: CreateBookingDto,
    @OptionalCurrentUser() user?: JwtPayload,
  ) {
    return this.bookingsService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can list their bookings.');
    }
    return this.bookingsService.findMineAsSeeker(user.sub);
  }

  @Post('guest-lookup')
  guestLookup(@Body() dto: GuestLookupDto) {
    return this.bookingsService.guestLookup(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('provider/mine')
  findProviderMine(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can list provider bookings.');
    }
    return this.bookingsService.findMineAsProvider(user.sub);
  }

  /** Provider opens Bookings list — clear “New” / unread for accepted bookings. */
  @UseGuards(JwtAuthGuard)
  @Post('provider/mark-seen')
  markSeen(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MarkBookingsSeenDto,
  ) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can mark bookings seen.');
    }
    return this.bookingsService.markSeenAsProvider(user.sub, dto.bookingIds);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookingsService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can update booking status.');
    }
    return this.bookingsService.updateStatus(id, user.sub, dto.status);
  }

  /** Seeker (JWT) or guest (phone) withdraws a request — deletes the booking row. */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/withdraw')
  withdraw(
    @Param('id') id: string,
    @Body() dto: WithdrawBookingDto,
    @OptionalCurrentUser() user?: JwtPayload,
  ) {
    return this.bookingsService.withdraw(id, user, dto);
  }
}
