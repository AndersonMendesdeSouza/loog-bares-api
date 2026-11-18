import { Controller, Get } from '@nestjs/common';
import { TableService } from 'src/services/table.service';
import { TableOptionResponseDto } from 'src/dtos/response/table-option-response.dto';

@Controller('tables/public')
export class PublicTablesController {
  constructor(private readonly tableService: TableService) {}

  @Get('find-all')
  findAll(): Promise<TableOptionResponseDto[]> {
    return this.tableService.findActive();
  }
}
