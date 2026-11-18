import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { TableStatus, TabStatus } from 'src/dtos/enums/table-enums';
import { OrderStatusEnum } from 'src/dtos/enums/order-status.enum';
import { TableRequestDto } from 'src/dtos/request/table-request.dto';
import { TableResponseDto } from 'src/dtos/response/table-response.dto';
import { TableEntity } from 'src/entities/table.entity';
import { TabEntity } from 'src/entities/tab.entity';
import { toResponse } from 'src/utils/transform-response';
import { TableOptionResponseDto } from 'src/dtos/response/table-option-response.dto';

@Injectable()
export class TableService {
  constructor(
    @InjectRepository(TableEntity)
    private readonly repo: Repository<TableEntity>,
    @InjectRepository(TabEntity)
    private readonly tabRepo: Repository<TabEntity>,
  ) {}

  async create(dto: TableRequestDto): Promise<TableResponseDto> {
    const existing = await this.repo.findOne({ where: { number: dto.number } });
    if (existing) {
      throw new ConflictException('Já existe uma mesa com esse número');
    }

    const table = this.repo.create({
      number: dto.number,
      isActive: dto.isActive ?? true,
    });

    return this.saveTable(table);
  }

  async findAll(): Promise<TableResponseDto[]> {
    const tables = await this.repo.find({
      relations: { tabs: { orders: true } },
      order: { number: 'ASC' },
    });
    return tables.map((table) => this.toTableResponse(table));
  }

  async findActive(): Promise<TableOptionResponseDto[]> {
    const tables = await this.repo.find({
      where: { isActive: true },
      select: { id: true, number: true, isActive: true },
      order: { number: 'ASC' },
    });
    return toResponse(TableOptionResponseDto, tables);
  }

  async findOne(id: string): Promise<TableResponseDto> {
    const table = await this.findTable(id);
    return this.toTableResponse(table);
  }

  async update(id: string, dto: TableRequestDto): Promise<TableResponseDto> {
    const table = await this.findTable(id);
    const existing = await this.repo.findOne({ where: { number: dto.number } });
    if (existing && existing.id !== id) {
      throw new ConflictException('Já existe uma mesa com esse número');
    }

    if (dto.number !== table.number || dto.isActive === false) {
      const openTab = await this.tabRepo.findOne({
        where: { table: { id }, status: TabStatus.OPEN },
      });
      if (openTab) {
        throw new ConflictException(
          'Não é possível renumerar ou desativar uma mesa com comanda aberta',
        );
      }
    }

    table.number = dto.number;
    if (dto.isActive !== undefined) table.isActive = dto.isActive;
    return this.saveTable(table);
  }

  async remove(id: string): Promise<{ message: string }> {
    const table = await this.findTable(id);
    const tab = await this.tabRepo.findOne({ where: { table: { id } } });
    if (tab) {
      throw new ConflictException(
        'Esta mesa possui histórico de comandas. Desative a mesa em vez de excluí-la',
      );
    }

    try {
      await this.repo.remove(table);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23503'
      ) {
        throw new ConflictException(
          'Esta mesa possui pedidos ou comandas. Desative a mesa em vez de excluí-la',
        );
      }
      throw error;
    }
    return { message: 'Mesa removida com sucesso' };
  }

  private async findTable(id: string): Promise<TableEntity> {
    const table = await this.repo.findOne({
      where: { id },
      relations: { tabs: { orders: true } },
    });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    return table;
  }

  private async saveTable(table: TableEntity): Promise<TableResponseDto> {
    try {
      const saved = await this.repo.save(table);
      return await this.findOne(saved.id);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Já existe uma mesa com esse número');
      }
      throw error;
    }
  }

  private toTableResponse(table: TableEntity): TableResponseDto {
    const tabs = (table.tabs ?? []).map((tab) => {
      let subtotalInCents = 0;
      let totalInCents = 0;
      for (const order of tab.orders ?? []) {
        if (order.status === OrderStatusEnum.CANCELED) continue;
        subtotalInCents += Math.round(Number(order.subtotal) * 100);
        totalInCents += Math.round(Number(order.total) * 100);
      }
      return {
        ...tab,
        subtotal: (subtotalInCents / 100).toFixed(2),
        total: (totalInCents / 100).toFixed(2),
      };
    });
    const occupied = tabs.some((tab) => tab.status === TabStatus.OPEN);
    let status = TableStatus.AVAILABLE;
    if (!table.isActive) {
      status = TableStatus.INACTIVE;
    } else if (occupied) {
      status = TableStatus.OCCUPIED;
    }
    return toResponse(TableResponseDto, { ...table, status, tabs });
  }
}
