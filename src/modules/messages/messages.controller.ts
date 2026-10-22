import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OpenThreadDto } from './dto/open-thread.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { MessagesService } from './messages.service.js';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('threads')
  listThreads(@CurrentUser() user: JwtPayload) {
    return this.messagesService.listThreads(user);
  }

  @Get('threads/:threadId')
  getThread(
    @Param('threadId') threadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.getThread(threadId, user);
  }

  @Get('threads/:threadId/messages')
  listMessages(
    @Param('threadId') threadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.listMessages(threadId, user);
  }

  @Post('threads')
  openThread(@Body() dto: OpenThreadDto, @CurrentUser() user: JwtPayload) {
    return this.messagesService.openThread(dto, user);
  }

  @Post('threads/:threadId/messages')
  sendMessage(
    @Param('threadId') threadId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.sendMessage(threadId, dto, user);
  }

  @Post('threads/:threadId/read')
  markRead(
    @Param('threadId') threadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.markRead(threadId, user);
  }
}
