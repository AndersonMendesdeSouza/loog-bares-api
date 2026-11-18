import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Unique,
} from 'typeorm';
import { TabEntity } from './tab.entity';
import { OrderEntity } from './order.entity';
@Entity('restaurant_tables')
// Quando CompanyEntity for utilizada, a unicidade poderá incluir a empresa.
// @Unique(['company', 'number'])
@Unique(['number'])
export class TableEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  number: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => TabEntity, (tab) => tab.table)
  tabs: TabEntity[];

  @OneToMany(() => OrderEntity, (order) => order.table)
  orders: OrderEntity[];
}
