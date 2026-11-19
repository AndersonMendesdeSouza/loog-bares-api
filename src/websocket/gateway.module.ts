import { Module } from '@nestjs/common';
import { OrdersGateway, OrdersGatewayUpdateStatus } from './orders.gateway';
import { MessageGateway } from './message.gateway';

@Module({
  providers: [OrdersGateway, MessageGateway, OrdersGatewayUpdateStatus],
  exports: [OrdersGateway, MessageGateway, OrdersGatewayUpdateStatus],
})
export class GatewayModule { }
