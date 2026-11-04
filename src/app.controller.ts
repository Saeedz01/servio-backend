import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Also available at `/api` via global prefix. */
  @Get()
  getHello(): { status: string; service: string; docs: string } {
    return this.appService.getStatus();
  }
}
