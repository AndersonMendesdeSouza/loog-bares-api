import { Expose, Type } from 'class-transformer';
import { TableStatus } from '../enums/table-enums';
import { TableTabResponseDto } from './table-tab-response.dto';

export class TableResponseDto {
  @Expose()
  id: string;

  @Expose()
  number: number;

  @Expose()
  isActive: boolean;

  @Expose()
  status?: TableStatus;

  @Expose()
  @Type(() => TableTabResponseDto)
  tabs?: TableTabResponseDto[];
}
