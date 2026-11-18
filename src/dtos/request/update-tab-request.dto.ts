import { IsIn } from 'class-validator';
import { TabStatus } from '../enums/table-enums';

export class UpdateTabRequestDto {
  @IsIn([TabStatus.CLOSED, TabStatus.CANCELLED], {
    message: 'O status deve ser CLOSED ou CANCELLED',
  })
  status: TabStatus.CLOSED | TabStatus.CANCELLED;
}
