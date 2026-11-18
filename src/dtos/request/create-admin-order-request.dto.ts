import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OrderType } from '../enums/table-enums';
import { AddTabOrderRequestDto } from './add-tab-order-request.dto';
import { OrderDeliveryAddressRequestDto } from './order-delivery-address-request.dto';

export class CreateAdminOrderRequestDto extends AddTabOrderRequestDto {
  @IsIn([OrderType.PICKUP, OrderType.DELIVERY, OrderType.DINE_IN])
  type: OrderType.PICKUP | OrderType.DELIVERY | OrderType.DINE_IN;

  @ValidateIf((dto) => dto.type === OrderType.DINE_IN)
  @IsUUID()
  tableId?: string;

  @ValidateIf((dto) => dto.type === OrderType.DINE_IN)
  @IsString()
  @Matches(/^\d+$/, { message: 'Informe o número da mesa' })
  mesaId?: string;

  @ValidateIf(
    (dto: CreateAdminOrderRequestDto, value: unknown) =>
      dto.type === OrderType.DELIVERY || value !== undefined,
  )
  @IsString()
  @Matches(/\S/, { message: 'Informe o nome do cliente' })
  @MaxLength(160)
  customerName?: string;

  @ValidateIf(
    (dto: CreateAdminOrderRequestDto, value: unknown) =>
      dto.type === OrderType.DELIVERY || value !== undefined,
  )
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Informe um telefone com DDD válido' })
  customerPhone?: string;

  @ValidateIf(
    (dto: CreateAdminOrderRequestDto, value: unknown) =>
      dto.type === OrderType.DELIVERY || value !== undefined,
  )
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderDeliveryAddressRequestDto)
  deliveryAddress?: OrderDeliveryAddressRequestDto;
}
