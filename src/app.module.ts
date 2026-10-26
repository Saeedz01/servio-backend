import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BiddingModule } from './modules/bidding/bidding.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { TokensModule } from './modules/tokens/tokens.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'servio-backend',
    }),
    PrismaModule,
    AuthModule,
    ServicesModule,
    BookingsModule,
    JobsModule,
    BiddingModule,
    NotificationsModule,
    MessagesModule,
    TokensModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
