import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { TabRequestDto } from 'src/dtos/request/tab-request.dto';
import { UpdateTabRequestDto } from 'src/dtos/request/update-tab-request.dto';
import { AddTabOrderRequestDto } from 'src/dtos/request/add-tab-order-request.dto';
import { CreateTabOrderRequestDto } from 'src/dtos/request/create-tab-order-request.dto';
import { TabResponseDto } from 'src/dtos/response/tab-response.dto';
import { TabService } from 'src/services/tab.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('tabs')
export class TabController {
  constructor(private readonly tabService: TabService) {}

  @Post()
  create(@Body() dto: TabRequestDto): Promise<TabResponseDto> {
    return this.tabService.create(dto);
  }

  @Post('orders')
  createOrder(@Body() dto: CreateTabOrderRequestDto): Promise<TabResponseDto> {
    return this.tabService.createOrder(dto);
  }

  @Post(':id/orders')
  addOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTabOrderRequestDto,
  ): Promise<TabResponseDto> {
    return this.tabService.addOrder(id, dto);
  }

  @Get('find-all')
  findAll(): Promise<TabResponseDto[]> {
    return this.tabService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TabResponseDto> {
    return this.tabService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTabRequestDto,
  ): Promise<TabResponseDto> {
    return this.tabService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.tabService.remove(id);
  }
}
