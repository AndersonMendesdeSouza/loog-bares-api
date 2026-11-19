import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { ProductsModule } from './modules/products.module';
import { UserModule } from './modules/user.module';
import { OrdersModule } from './modules/orders.module';
import { SystemSettingsModule } from './modules/system-settings.module';
import { AddressModule } from './modules/address.module';
import { ChatModule } from './modules/chat.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { TableModule } from './modules/table.module';
import { TabModule } from './modules/tab.module';
import { OrderGatewayModule } from './websocket/order.gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.development',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmConfig,
    }),

    ProductsModule,
    OrdersModule,
    UserModule,
    SystemSettingsModule,
    AddressModule,
    ChatModule,
    CloudinaryModule,
    TableModule,
    TabModule,
    OrderGatewayModule
  ],
})
export class AppModule {}
