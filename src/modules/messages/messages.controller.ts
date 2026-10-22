import {
  Body,
  Controller,
  Delete,
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
import { DeliverMessagesDto } from './dto/deliver-messages.dto.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';
import { ListThreadsQueryDto } from './dto/list-threads-query.dto.js';
import { OpenThreadDto } from './dto/open-thread.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { MessagesService } from './messages.service.js';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('threads')
  listThreads(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListThreadsQueryDto,
  ) {
    return this.messagesService.listThreads(user, query.q);
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
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.listMessages(threadId, user, query);
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

  @Patch('threads/:threadId/messages/:messageId')
  editMessage(
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.editMessage(threadId, messageId, dto, user);
  }

  @Delete('threads/:threadId/messages/:messageId')
  deleteMessage(
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.deleteMessage(threadId, messageId, user);
  }

  @Post('threads/:threadId/delivered')
  markDelivered(
    @Param('threadId') threadId: string,
    @Body() dto: DeliverMessagesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.markDelivered(threadId, dto, user);
  }

  @Post('threads/:threadId/read')
  markRead(
    @Param('threadId') threadId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messagesService.markRead(threadId, user);
  }
}
