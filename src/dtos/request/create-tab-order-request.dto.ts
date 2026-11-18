import { IsUUID } from 'class-validator';
import { AddTabOrderRequestDto } from './add-tab-order-request.dto';

export class CreateTabOrderRequestDto extends AddTabOrderRequestDto {
  @IsUUID()
  tableId: string;
}
