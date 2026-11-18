import { Expose, Type } from 'class-transformer';
import { TableResponseDto } from './table-response.dto';
import { TableTabResponseDto } from './table-tab-response.dto';

export class TabResponseDto extends TableTabResponseDto {
  @Expose()
  @Type(() => TableResponseDto)
  table: TableResponseDto;
}
