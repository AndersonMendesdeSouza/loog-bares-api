import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})

export class OrdersGateway {
  @WebSocketServer()
  server: Server;

  notifyNewOrder(order: any) {
    this.server.emit('order.created', order);
  }
}


@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class OrdersGatewayUpdateStatus {
  @WebSocketServer()
  server: Server;

  notifyNewOrderStatus(order: any) {
    this.server.emit('order-status.created', order);
  }
}