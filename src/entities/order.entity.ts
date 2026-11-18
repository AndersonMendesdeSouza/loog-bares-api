import { OrderStatusEnum } from 'src/dtos/enums/order-status.enum';
import { PaymentMethodEnum } from 'src/dtos/enums/payment-method.enum';
import { OrderType } from 'src/dtos/enums/table-enums';
import { OrderItem } from 'src/types/order-Item-type';
import type { OrderDeliveryAddress } from 'src/types/order-delivery-address-type';
import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AddressEntity } from './address.entity';
import { ChatEntity } from './chat.entity';
import { TabEntity } from './tab.entity';
import { UserEntity } from './user.entity';
import { TableEntity } from './table.entity';

type OrderHistory = {
  status: OrderStatusEnum;
  label: string;
  time?: string;
  createdAt: string;
};

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  mesaId: string | null;

  @Column({ type: 'uuid', nullable: true })
  tableId: string | null;

  @ManyToOne(() => TableEntity, (table) => table.orders, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tableId' })
  table: TableEntity | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity | null;

  @Column({ type: 'uuid', nullable: true })
  chatId?: string;

  @OneToOne(() => ChatEntity, (chat) => chat.order)
  @JoinColumn({ name: 'chatId' })
  chat?: ChatEntity;

  @Index()
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  code: number;

  @Index()
  @Column({
    type: 'enum',
    enum: OrderStatusEnum,
    default: OrderStatusEnum.RECEIVED,
  })
  status: OrderStatusEnum;

  @Column({ type: 'enum', enum: PaymentMethodEnum, nullable: true })
  paymentMethod: PaymentMethodEnum | null;

  @Column({ type: 'uuid', nullable: true })
  addressId?: string;

  @ManyToOne(() => AddressEntity, (address) => address.orders, {
    nullable: true,
  })
  @JoinColumn({ name: 'addressId' })
  address?: AddressEntity;

  @Column({ type: 'jsonb', nullable: true })
  deliveryAddress: OrderDeliveryAddress | null;

  @Column({ type: 'varchar', length: 160 })
  customerName: string;

  @Column({ type: 'varchar', length: 30 })
  customerPhone: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  deliveryFee: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items: OrderItem[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  history: OrderHistory[];

  @Column({
    type: 'enum',
    enum: OrderType,
    default: OrderType.DELIVERY,
  })
  type: OrderType;

  @ManyToOne(() => TabEntity, (tab) => tab.orders, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tabId' })
  tab: TabEntity | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
