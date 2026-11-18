import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OrderType } from '../enums/table-enums';
import { AddTabOrderRequestDto } from './add-tab-order-request.dto';
import { OrderDeliveryAddressRequestDto } from './order-delivery-address-request.dto';

export class CreateAdminOrderRequestDto extends AddTabOrderRequestDto {
  @IsIn([OrderType.PICKUP, OrderType.DELIVERY])
  type: OrderType.PICKUP | OrderType.DELIVERY;

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
