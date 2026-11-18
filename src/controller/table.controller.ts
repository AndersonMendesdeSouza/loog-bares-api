import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { TableRequestDto } from 'src/dtos/request/table-request.dto';
import { TableResponseDto } from 'src/dtos/response/table-response.dto';
import { TableService } from 'src/services/table.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  create(@Body() dto: TableRequestDto): Promise<TableResponseDto> {
    return this.tableService.create(dto);
  }

  @Get('find-all')
  findAll(): Promise<TableResponseDto[]> {
    return this.tableService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TableResponseDto> {
    return this.tableService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TableRequestDto,
  ): Promise<TableResponseDto> {
    return this.tableService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.tableService.remove(id);
  }
}
