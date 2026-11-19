import { Module } from '@nestjs/common';
import { OrdersGateway } from './orders.gateway';
import { MessageGateway } from './message.gateway';

@Module({
  providers: [OrdersGateway, MessageGateway],
  exports: [OrdersGateway,MessageGateway],
})
export class GatewayModule { }
