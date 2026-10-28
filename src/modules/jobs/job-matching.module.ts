import { Module } from '@nestjs/common';
import { JobMatchingService } from './job-matching.service.js';

@Module({
  providers: [JobMatchingService],
  exports: [JobMatchingService],
})
export class JobMatchingModule {}
