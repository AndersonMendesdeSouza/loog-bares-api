import { TabStatus } from 'src/dtos/enums/table-enums';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OrderEntity } from './order.entity';
import { TableEntity } from './table.entity';

@Entity('tabs')
@Index('IDX_OPEN_TAB_PER_TABLE', ['table'], {
  unique: true,
  where: `"status" = 'OPEN'`,
})
export class TabEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tableId: string;

  @ManyToOne(() => TableEntity, (table) => table.tabs, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tableId' })
  table: TableEntity;

  @Column({
    type: 'enum',
    enum: TabStatus,
    default: TabStatus.OPEN,
  })
  status: TabStatus;

  @OneToMany(() => OrderEntity, (order) => order.tab)
  orders: OrderEntity[];

  @CreateDateColumn()
  openedAt: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  closedAt: Date | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  closingTotal: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  paymentMethod: string | null;
}
