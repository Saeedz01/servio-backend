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
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { MarkBookingsSeenDto } from './dto/mark-bookings-seen.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can create booking requests.');
    }
    return this.bookingsService.create(dto, user);
  }

  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can list their bookings.');
    }
    return this.bookingsService.findMineAsSeeker(user.sub);
  }

  @Get('provider/mine')
  findProviderMine(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can list provider bookings.');
    }
    return this.bookingsService.findMineAsProvider(user.sub);
  }

  /** Provider opens Bookings list — clear “New” / unread for accepted bookings. */
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

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookingsService.findOne(id, user);
  }

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

  /** Seeker withdraws a request — deletes the booking row. */
  @Post(':id/withdraw')
  withdraw(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can withdraw booking requests.');
    }
    return this.bookingsService.withdraw(id, user);
  }
}
