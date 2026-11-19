import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from 'src/controller/chat.controller';
import { ChatMessageEntity } from 'src/entities/chat-messages.entity';
import { ChatEntity } from 'src/entities/chat.entity';
import { OrderEntity } from 'src/entities/order.entity';
import { ChatService } from 'src/services/chat.service';
import { GatewayModule } from 'src/websocket/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatEntity, ChatMessageEntity, OrderEntity]),
    GatewayModule
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
