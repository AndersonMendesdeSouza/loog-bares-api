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
export class OrdersGateway {
  @WebSocketServer()
  server: Server;

  notifyNewOrder(order: any) {
    this.server.emit('order.created', order);
  }
}