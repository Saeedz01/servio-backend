import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JobMatchingModule } from '../jobs/job-matching.module.js';
import { TokensModule } from '../tokens/tokens.module.js';
import { BiddingController } from './bidding.controller.js';
import { BiddingGateway } from './bidding.gateway.js';
import { BiddingService } from './bidding.service.js';

@Module({
  imports: [
    JobMatchingModule,
    TokensModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>('JWT_EXPIRES_IN', '7d');
        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: expiresIn as `${number}d` | `${number}h` | `${number}m`,
          },
        };
      },
    }),
  ],
  controllers: [BiddingController],
  providers: [BiddingService, BiddingGateway],
  exports: [BiddingService, BiddingGateway],
})
export class BiddingModule {}
