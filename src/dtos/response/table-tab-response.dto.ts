import { Expose, Type } from 'class-transformer';
import { TabStatus } from '../enums/table-enums';
import { OrderResponseDto } from './orders-response.dto';

export class TableTabResponseDto {
  @Expose()
  id: string;

  @Expose()
  status: TabStatus;

  @Expose()
  @Type(() => OrderResponseDto)
  orders: OrderResponseDto[];

  @Expose()
  subtotal: string;

  @Expose()
  total: string;

  @Expose()
  openedAt: Date;

  @Expose()
  closedAt: Date | null;

  @Expose()
  closingTotal: string | null;

  @Expose()
  paymentMethod: string | null;
}
