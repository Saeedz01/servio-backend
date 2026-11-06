import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BiddingModule } from '../bidding/bidding.module.js';
import { JobMatchingModule } from '../jobs/job-matching.module.js';
import { TokensController } from './tokens.controller.js';
import { TokensService } from './tokens.service.js';

@Module({
  imports: [
    JobMatchingModule,
    forwardRef(() => BiddingModule),
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
  controllers: [TokensController],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}