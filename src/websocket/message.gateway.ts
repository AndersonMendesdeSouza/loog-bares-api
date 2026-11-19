import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ChatMessageResponseDto } from 'src/dtos/response/chat-message-response.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MessageGateway {
  @WebSocketServer()
  server: Server;

  notifyNewMessage(orderId: string, message: ChatMessageResponseDto) {
    this.server.emit('message.created', {
      orderId,
      message: {
        id: message.id,
        chatId: message.chatId,
        senderType: message.senderType,
        text: message.text,
        createdAt: message.createdAt,
      },
    });
  }
}
