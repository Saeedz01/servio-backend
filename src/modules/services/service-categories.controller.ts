import { Controller, Get, Query } from '@nestjs/common';
import { ServicesService } from './services.service.js';

@Controller('service-categories')
export class ServiceCategoriesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findActive(
    @Query('search') search?: string,
    @Query('parentId') parentId?: string,
    @Query('rootsOnly') rootsOnly?: string,
  ) {
    return this.servicesService.findActiveCategories({
      search,
      parentId,
      rootsOnly: rootsOnly === 'true',
    });
  }
}
