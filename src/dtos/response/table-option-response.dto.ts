import { Expose } from 'class-transformer';

export class TableOptionResponseDto {
  @Expose()
  id: string;

  @Expose()
  number: number;

  @Expose()
  isActive: boolean;
}
