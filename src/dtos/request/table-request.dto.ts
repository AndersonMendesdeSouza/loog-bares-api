import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator';

export class TableRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  number: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
