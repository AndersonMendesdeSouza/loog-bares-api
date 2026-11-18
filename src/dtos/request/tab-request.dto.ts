import { IsUUID } from 'class-validator';

export class TabRequestDto {
  @IsUUID()
  tableId: string;
}
