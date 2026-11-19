import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5174', 'https://burguer-admin-beta.vercel.app'],
  },
})
export class MessageGateway {
  @WebSocketServer()
  server: Server;

  notifyNewMessage(order: any) {
    this.server.emit('message.created', order);
  }
}