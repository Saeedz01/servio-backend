import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MessagesController } from './messages.controller.js';
import { MessagesGateway } from './messages.gateway.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [
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
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesService],
})
export class MessagesModule {}
