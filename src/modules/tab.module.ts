import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TabController } from 'src/controller/tab.controller';
import { TabEntity } from 'src/entities/tab.entity';
import { TableEntity } from 'src/entities/table.entity';
import { OrderEntity } from 'src/entities/order.entity';
import { TabService } from 'src/services/tab.service';
import { ProductsModule } from './products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TabEntity, TableEntity, OrderEntity]),
    ProductsModule,
  ],
  controllers: [TabController],
  providers: [TabService],
  exports: [TabService],
})
export class TabModule {}
