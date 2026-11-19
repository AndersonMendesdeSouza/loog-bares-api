import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OrderType } from 'src/dtos/enums/table-enums';
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

  notifyNewMessage(
    orderId: string,
    customerName: string,
    message: ChatMessageResponseDto,
    orderType: OrderType,
    mesaId: string | null,
  ) {
    this.server.emit('message.created', {
      orderId,
      customerName,
      orderType,
      mesaId,
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
