import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class OrderDeliveryAddressRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(160)
  street: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  number: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  neighborhood: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  state: string;

  @IsString()
  @Matches(/^\d{5}-?\d{3}$/)
  zipCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  block?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  lot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  complement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reference?: string;
}
