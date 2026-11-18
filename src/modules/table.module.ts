import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TableController } from 'src/controller/table.controller';
import { TabEntity } from 'src/entities/tab.entity';
import { TableEntity } from 'src/entities/table.entity';
import { TableService } from 'src/services/table.service';
import { PublicTablesController } from 'src/controller/public-tables.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TableEntity, TabEntity])],
  controllers: [TableController, PublicTablesController],
  providers: [TableService],
  exports: [TableService],
})
export class TableModule {}
