import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import {
  CreateServiceCityDto,
  UpdateServiceCityDto,
} from './dto/city.dto.js';
import { ServicesService } from './services.service.js';

@Controller('service-cities')
export class ServiceCitiesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.servicesService.findCities(includeInactive === 'true');
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateServiceCityDto) {
    this.requireAdmin(user);
    return this.servicesService.createCity(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateServiceCityDto,
  ) {
    this.requireAdmin(user);
    return this.servicesService.updateCity(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.requireAdmin(user);
    return this.servicesService.removeCity(id);
  }

  private requireAdmin(user: JwtPayload) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }
}
