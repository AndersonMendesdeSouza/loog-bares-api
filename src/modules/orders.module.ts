import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from 'src/controller/orders.controller';
import { ImageEntity } from 'src/entities/image.entity';
import { AddressEntity } from 'src/entities/address.entity';
import { OrderEntity } from 'src/entities/order.entity';
import { ProductEntity } from 'src/entities/product-entity';
import { ProductsModule } from './products.module';
import { OrdersService } from 'src/services/orders.service';
import { ChatModule } from './chat.module';
import { MessageModule } from './message.module';
import { TableEntity } from 'src/entities/table.entity';
import { TabEntity } from 'src/entities/tab.entity';
import { OrderGatewayModule } from 'src/websocket/order.gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      ProductEntity,
      ImageEntity,
      AddressEntity,
      TableEntity,
      TabEntity,
    ]),
    ProductsModule,
    ChatModule,
    MessageModule,
    OrderGatewayModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
