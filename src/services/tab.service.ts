import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { OrderType, TabStatus } from 'src/dtos/enums/table-enums';
import { TabRequestDto } from 'src/dtos/request/tab-request.dto';
import { UpdateTabRequestDto } from 'src/dtos/request/update-tab-request.dto';
import { AddTabOrderRequestDto } from 'src/dtos/request/add-tab-order-request.dto';
import { CreateTabOrderRequestDto } from 'src/dtos/request/create-tab-order-request.dto';
import { TabResponseDto } from 'src/dtos/response/tab-response.dto';
import { TabEntity } from 'src/entities/tab.entity';
import { TableEntity } from 'src/entities/table.entity';
import { OrderEntity } from 'src/entities/order.entity';
import { OrderStatusEnum } from 'src/dtos/enums/order-status.enum';
import { ProductStatusEnum } from 'src/dtos/enums/product-status.enum';
import { OrderItem } from 'src/types/order-Item-type';
import { toResponse } from 'src/utils/transform-response';
import { ProductsService } from './products.service';

@Injectable()
export class TabService {
  constructor(
    @InjectRepository(TabEntity)
    private readonly repo: Repository<TabEntity>,
    @InjectRepository(TableEntity)
    private readonly tableRepo: Repository<TableEntity>,
    private readonly productsService: ProductsService,
  ) {}

  async create(dto: TabRequestDto): Promise<TabResponseDto> {
    const table = await this.tableRepo.findOne({ where: { id: dto.tableId } });
    if (!table) throw new NotFoundException('Mesa não encontrada');
    if (!table.isActive) {
      throw new ConflictException(
        'Não é possível abrir uma comanda em mesa inativa',
      );
    }

    const openTab = await this.repo.findOne({
      where: { table: { id: dto.tableId }, status: TabStatus.OPEN },
    });
    if (openTab) {
      throw new ConflictException('Esta mesa já possui uma comanda aberta');
    }

    const tab = this.repo.create({
      table,
      status: TabStatus.OPEN,
      closedAt: null,
      closingTotal: null,
      paymentMethod: null,
      orders: [],
    });

    try {
      const saved = await this.repo.save(tab);
      return this.toResponse(saved);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Esta mesa já possui uma comanda aberta');
      }
      throw error;
    }
  }

  async findAll(): Promise<TabResponseDto[]> {
    const tabs = await this.repo.find({
      relations: { table: true, orders: true },
      order: { openedAt: 'DESC' },
    });
    return tabs.map((tab) => this.toResponse(tab));
  }

  async findOne(id: string): Promise<TabResponseDto> {
    const tab = await this.repo.findOne({
      where: { id },
      relations: { table: true, orders: true },
    });
    if (!tab) throw new NotFoundException('Comanda não encontrada');
    return this.toResponse(tab);
  }

  async createOrder(dto: CreateTabOrderRequestDto): Promise<TabResponseDto> {
    return this.repo.manager.transaction(async (manager) => {
      // Serializa a abertura de comandas para a mesma mesa.
      const table = await manager.findOne(TableEntity, {
        where: { id: dto.tableId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException('Mesa não encontrada');
      if (!table.isActive) throw new ConflictException('A mesa está inativa');

      let tab = await manager.findOne(TabEntity, {
        where: { tableId: table.id, status: TabStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tab) {
        tab = manager.create(TabEntity, {
          tableId: table.id,
          table,
          status: TabStatus.OPEN,
          closedAt: null,
          closingTotal: null,
          paymentMethod: null,
        });
        try {
          tab = await manager.save(TabEntity, tab);
        } catch (error) {
          if (
            error instanceof QueryFailedError &&
            (error.driverError as { code?: string }).code === '23505'
          ) {
            throw new ConflictException(
              'A mesa recebeu outra comanda. Atualize a página e tente novamente',
            );
          }
          throw error;
        }
      }

      return this.saveOrder(manager, tab, table, dto);
    });
  }

  async addOrder(
    id: string,
    dto: AddTabOrderRequestDto,
  ): Promise<TabResponseDto> {
    return this.repo.manager.transaction(async (manager) => {
      // O fechamento também atualiza esta linha e aguarda esta operação terminar.
      const tab = await manager.findOne(TabEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tab) throw new NotFoundException('Comanda não encontrada');
      if (tab.status !== TabStatus.OPEN) {
        throw new ConflictException('A comanda já foi encerrada ou cancelada');
      }

      const table = await manager.findOne(TableEntity, {
        where: { id: tab.tableId },
      });
      if (!table) throw new NotFoundException('Mesa não encontrada');
      if (!table.isActive) throw new ConflictException('A mesa está inativa');

      return this.saveOrder(manager, tab, table, dto);
    });
  }

  async update(id: string, dto: UpdateTabRequestDto): Promise<TabResponseDto> {
    const tab = await this.repo.findOne({ where: { id } });
    if (!tab) throw new NotFoundException('Comanda não encontrada');
    if (tab.status !== TabStatus.OPEN) {
      throw new ConflictException('A comanda já foi encerrada ou cancelada');
    }

    // A condição OPEN impede sobrescrever o encerramento feito por outro atendente.
    const result = await this.repo.update(
      { id, status: TabStatus.OPEN },
      { status: dto.status, closedAt: new Date() },
    );
    if (result.affected !== 1) {
      throw new ConflictException(
        'A comanda foi alterada por outro atendimento. Atualize a página',
      );
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    return this.repo.manager.transaction(async (manager) => {
      const tab = await manager.findOne(TabEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tab) throw new NotFoundException('Comanda não encontrada');

      // Preserva os pedidos e retira somente o vínculo com a comanda excluída.
      await manager.update(OrderEntity, { tab: { id } }, { tab: null });
      await manager.delete(TabEntity, id);
      return { message: 'Comanda excluída com sucesso' };
    });
  }

  private async saveOrder(
    manager: EntityManager,
    tab: TabEntity,
    table: TableEntity,
    dto: AddTabOrderRequestDto,
  ): Promise<TabResponseDto> {
    if (dto.items.length === 0)
      throw new BadRequestException('Adicione pelo menos um produto');

    const items: OrderItem[] = [];
    let subtotalInCents = 0;

    for (const requestedItem of dto.items) {
      const quantity = requestedItem.quantity;
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new BadRequestException('Quantidade de produto inválida');
      }

      const product = await this.productsService.findOne(
        requestedItem.productId.toLowerCase(),
        manager,
      );
      if (product.isActive !== ProductStatusEnum.ACTIVED) {
        throw new ConflictException(
          `O produto ${product.name} está indisponível`,
        );
      }

      const unitPriceInCents = Math.round(
        Number(product.promoPrice ?? product.price) * 100,
      );
      if (!Number.isSafeInteger(unitPriceInCents) || unitPriceInCents < 0) {
        throw new ConflictException(
          `O produto ${product.name} está com preço inválido`,
        );
      }
      const totalPriceInCents = unitPriceInCents * quantity;
      // Limite dos campos numeric(12, 2) usados pelos pedidos.
      if (
        !Number.isSafeInteger(totalPriceInCents) ||
        subtotalInCents + totalPriceInCents > 999_999_999_999
      ) {
        throw new BadRequestException(
          'O valor do pedido ultrapassa o limite permitido',
        );
      }
      subtotalInCents += totalPriceInCents;

      const existingItem = items.find(
        (item) =>
          item.productId === product.id &&
          item.unitPrice === unitPriceInCents / 100,
      );
      if (existingItem) {
        const combinedQuantity = existingItem.quantity + quantity;
        if (!Number.isSafeInteger(combinedQuantity)) {
          throw new BadRequestException('Quantidade de produto inválida');
        }
        existingItem.quantity = combinedQuantity;
        existingItem.totalPrice = (unitPriceInCents * combinedQuantity) / 100;
        continue;
      }

      const image =
        product.images?.find((current) => current.isPrimary) ??
        product.images?.[0];

      items.push({
        id: product.id,
        productId: product.id,
        name: product.name,
        description: product.description,
        imageUrl: image?.imageUrl ?? undefined,
        quantity,
        unitPrice: unitPriceInCents / 100,
        totalPrice: totalPriceInCents / 100,
      });
    }

    const order = manager.create(OrderEntity, {
      tab,
      mesaId: String(table.number),
      tableId: table.id,
      table,
      type: OrderType.DINE_IN,
      userId: null,
      customerName: `Mesa ${table.number}`,
      customerPhone: '',
      paymentMethod: null,
      status: OrderStatusEnum.RECEIVED,
      items,
      subtotal: subtotalInCents / 100,
      total: subtotalInCents / 100,
      deliveryFee: 0,
      discount: 0,
      history: [
        {
          status: OrderStatusEnum.RECEIVED,
          label: 'Pedido recebido',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await manager.save(OrderEntity, order);

    const updated = await manager.findOne(TabEntity, {
      where: { id: tab.id },
      relations: { table: true, orders: true },
      order: { orders: { createdAt: 'ASC' } },
    });
    if (!updated) throw new NotFoundException('Comanda não encontrada');
    return this.toResponse(updated);
  }

  private toResponse(tab: TabEntity): TabResponseDto {
    let subtotalInCents = 0;
    let totalInCents = 0;
    for (const order of tab.orders ?? []) {
      if (order.status === OrderStatusEnum.CANCELED) continue;
      subtotalInCents += Math.round(Number(order.subtotal) * 100);
      totalInCents += Math.round(Number(order.total) * 100);
    }

    return toResponse(TabResponseDto, {
      ...tab,
      subtotal: (subtotalInCents / 100).toFixed(2),
      total: (totalInCents / 100).toFixed(2),
    });
  }
}
