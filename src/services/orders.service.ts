import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import type { FindOptionsWhere, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderEntity } from 'src/entities/order.entity';
import { AddressEntity } from 'src/entities/address.entity';
import {
  AlterStatusDto,
  OrderRequestDto,
} from 'src/dtos/request/order-request.dto';
import {
  OrderCreatedResponseDto,
  OrderResponseDto,
} from 'src/dtos/response/orders-response.dto';
import { OrderStatusEnum } from 'src/dtos/enums/order-status.enum';
import { UserRole } from 'src/dtos/enums/user-role.enum';
import { ChatService } from './chat.service';
import { toResponse } from 'src/utils/transform-response';
import {
  createGuestOrderToken,
  verifyGuestOrderToken,
} from 'src/utils/guest-order-token';
import { MessageService } from './message.service';
import { ProductsService } from './products.service';
import { CreateAdminOrderRequestDto } from 'src/dtos/request/create-admin-order-request.dto';
import { OrderType } from 'src/dtos/enums/table-enums';
import { ProductStatusEnum } from 'src/dtos/enums/product-status.enum';
import type { OrderItem } from 'src/types/order-Item-type';
import { TableEntity } from 'src/entities/table.entity';
import { TabEntity } from 'src/entities/tab.entity';
import { TabStatus } from 'src/dtos/enums/table-enums';
import { OrdersGateway } from 'src/websocket/orders.gateway';

type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
    @InjectRepository(AddressEntity)
    private readonly addressRepo: Repository<AddressEntity>,
    private readonly chatService: ChatService,
    private readonly messageService: MessageService,
    private readonly ordersGateway: OrdersGateway,
    private readonly productsService: ProductsService,
    @InjectRepository(TableEntity)
    private readonly tableRepo: Repository<TableEntity>,
  ) {}

  async create(
    dto: OrderRequestDto,
    user?: AuthenticatedUser,
  ): Promise<OrderCreatedResponseDto> {
    let mesaId = dto.mesaId?.trim() || null;
    const hasTable = Boolean(dto.tableId || mesaId);
    const addressId = dto.addressId;
    const deliveryAddress = dto.deliveryAddress;
    const type =
      dto.type ?? (hasTable ? OrderType.DINE_IN : OrderType.DELIVERY);

    if (!hasTable && !dto.paymentMethod) {
      throw new BadRequestException('Informe a forma de pagamento');
    }

    if (
      !hasTable &&
      !addressId &&
      !deliveryAddress &&
      type !== OrderType.PICKUP
    ) {
      throw new BadRequestException('Informe a mesa ou o endereço de entrega');
    }

    if (addressId && deliveryAddress) {
      throw new BadRequestException(
        'Informe apenas addressId ou deliveryAddress',
      );
    }

    if (hasTable && (addressId || deliveryAddress)) {
      throw new BadRequestException(
        'Informe apenas a mesa ou o endereço de entrega',
      );
    }

    if (type === OrderType.DINE_IN && !hasTable) {
      throw new BadRequestException('Informe a mesa do pedido');
    }
    if (
      type === OrderType.DELIVERY &&
      (hasTable || (!addressId && !deliveryAddress))
    ) {
      throw new BadRequestException('Informe o endereço de entrega');
    }
    if (
      type === OrderType.PICKUP &&
      (hasTable || addressId || deliveryAddress)
    ) {
      throw new BadRequestException(
        'Retirada no balcão não deve ter mesa ou endereço',
      );
    }

    if (type !== OrderType.DELIVERY && dto.deliveryFee !== 0) {
      throw new BadRequestException(
        type === OrderType.PICKUP
          ? 'Retirada no balcão não deve ter taxa de entrega'
          : 'Pedido em mesa não deve ter taxa de entrega',
      );
    }

    let address: AddressEntity | undefined;
    let table: TableEntity | undefined;

    if (hasTable) {
      let savedTable: TableEntity | null;
      if (dto.tableId) {
        savedTable = await this.tableRepo.findOne({
          where: { id: dto.tableId },
        });
      } else {
        const number = Number(mesaId);
        if (!Number.isInteger(number) || number <= 0)
          throw new BadRequestException('Selecione uma mesa cadastrada');
        savedTable = await this.tableRepo.findOne({ where: { number } });
      }
      if (!savedTable) throw new NotFoundException('Mesa não encontrada');
      if (!savedTable.isActive)
        throw new ConflictException('Esta mesa está inativa');
      if (dto.tableId && mesaId && mesaId !== String(savedTable.number))
        throw new BadRequestException(
          'O número informado não corresponde à mesa selecionada',
        );
      table = savedTable;
      mesaId = String(table.number);
    }

    if (addressId) {
      if (!user?.id) {
        throw new UnauthorizedException('Faça login para pedir entrega');
      }

      const savedAddress = await this.addressRepo.findOne({
        where: { id: addressId, userId: user.id },
      });

      if (!savedAddress) {
        throw new NotFoundException('Endereço não encontrado');
      }

      address = savedAddress;
    }

    const guestOrderId = user ? undefined : randomUUID();
    const guestToken = guestOrderId
      ? createGuestOrderToken(guestOrderId)
      : undefined;

    const order = this.repo.create({
      ...dto,
      id: guestOrderId,
      mesaId,
      tableId: table?.id ?? null,
      table: table ?? null,
      type,
      addressId: address?.id,
      deliveryAddress: deliveryAddress ?? null,
      userId: user?.id ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      status: OrderStatusEnum.RECEIVED,
      address,
    });
    order.history = [
      {
        status: OrderStatusEnum.RECEIVED,
        label: 'Pedido recebido',
        createdAt: new Date().toISOString(),
      },
    ];

    const savedOrder = await this.repo.save(order);

    if (type === OrderType.DINE_IN && table) {
      await this.attachOrderToTable(savedOrder, table);
    }

    if (user) {
      await this.chatService.create({ orderId: savedOrder.id }, user);
    }

    const response = await this.findById(savedOrder.id, user, guestToken);
    this.ordersGateway.notifyNewOrder(response);

    const productList = savedOrder.items
      .slice(0, 3)
      .map((item) => `• ${item.quantity}x ${item.name}`)
      .join('\n');

    const message =
      `🍔 Olá, ${dto.customerName.trim()}!\n\n` +
      `*Recebemos seu pedido!* 🎉\n\n` +
      `*Uma prévia do que vem por aí:*\n${productList}\n\n` +
      `Em breve, começaremos a preparar tudo com carinho.\n\n` +
      `Obrigado pela preferência! 😋`;

    try {
      await this.messageService.sendMessage(dto.customerPhone, message);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error(
        `Falha ao enviar WhatsApp do pedido ${savedOrder.id}: ${reason}`,
      );
    }

    if (guestToken) return { ...response, guestToken };
    return response;
  }

  async createAdmin(
    dto: CreateAdminOrderRequestDto,
  ): Promise<OrderResponseDto> {
    if (
      dto.type === OrderType.DELIVERY &&
      (!dto.deliveryAddress || !dto.customerName?.trim() || !dto.customerPhone)
    ) {
      throw new BadRequestException(
        'Informe o cliente, telefone e endereço da entrega',
      );
    }
    if (dto.type === OrderType.PICKUP && dto.deliveryAddress) {
      throw new BadRequestException('Retirada no balcão não deve ter endereço');
    }
    if (dto.items.length === 0)
      throw new BadRequestException('Adicione pelo menos um produto');
    if (dto.type === OrderType.DINE_IN && !dto.tableId && !dto.mesaId) {
      throw new BadRequestException('Informe a mesa do pedido');
    }

    const response = await this.repo.manager.transaction(async (manager) => {
      let table: TableEntity | null = null;
      if (dto.type === OrderType.DINE_IN) {
        table = dto.tableId
          ? await manager.findOne(TableEntity, {
              where: { id: dto.tableId },
              lock: { mode: 'pessimistic_write' },
            })
          : await manager.findOne(TableEntity, {
              where: { number: Number(dto.mesaId) },
              lock: { mode: 'pessimistic_write' },
            });
        if (!table) throw new NotFoundException('Mesa não encontrada');
        if (!table.isActive)
          throw new ConflictException('Esta mesa está inativa');
      }
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
        const totalPriceInCents = unitPriceInCents * quantity;
        if (
          !Number.isSafeInteger(unitPriceInCents) ||
          unitPriceInCents < 0 ||
          !Number.isSafeInteger(totalPriceInCents) ||
          subtotalInCents + totalPriceInCents > 999_999_999_999
        ) {
          throw new BadRequestException(
            'O valor do pedido é inválido ou ultrapassa o limite permitido',
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
          if (!Number.isSafeInteger(combinedQuantity))
            throw new BadRequestException('Quantidade de produto inválida');
          existingItem.quantity = combinedQuantity;
          existingItem.totalPrice =
            (existingItem.quantity * unitPriceInCents) / 100;
          continue;
        }
        const image =
          product.images?.find((image) => image.isPrimary) ??
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
      let tab: TabEntity | null = null;
      if (table) {
        tab = await manager.findOne(TabEntity, {
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
          tab = await manager.save(TabEntity, tab);
        }
      }

      const order = manager.create(OrderEntity, {
        type: dto.type,
        tableId: table?.id ?? null,
        table: table ?? null,
        userId: null,
        mesaId: table ? String(table.number) : null,
        tab,
        customerName: table
          ? `Mesa ${table.number}`
          : dto.customerName?.trim() || 'Retirada no balcão',
        customerPhone: dto.customerPhone ?? '',
        deliveryAddress: dto.deliveryAddress ?? null,
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
      const saved = await manager.save(OrderEntity, order);
      return toResponse(OrderResponseDto, {
        ...saved,
        subtotal: (subtotalInCents / 100).toFixed(2),
        total: (subtotalInCents / 100).toFixed(2),
        deliveryFee: '0.00',
        discount: '0.00',
      });
    });

    // A busca do admin precisa enxergar o pedido já confirmado no banco.
    this.ordersGateway.notifyNewOrder(response);
    return response;
  }

  async findAll(user: AuthenticatedUser): Promise<OrderResponseDto[]> {
    const where = user.role === UserRole.ADMIN ? {} : { userId: user.id };
    const orders = await this.repo.find({
      where,
      relations: {
        user: true,
        table: true,
        address: true,
        chat: { messages: { sender: true } },
      },
    });
    return toResponse(OrderResponseDto, orders);
  }

  async findById(
    id: string,
    user?: AuthenticatedUser,
    guestToken?: string,
  ): Promise<OrderResponseDto> {
    const where = this.getOrderWhere(id, user, guestToken);

    const order = await this.repo.findOne({
      where,
      relations: {
        user: true,
        table: true,
        address: true,
        chat: guestToken ? false : { messages: { sender: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return toResponse(OrderResponseDto, order);
  }

  async alterStatus(
    id: string,
    status: AlterStatusDto,
    user?: AuthenticatedUser,
    guestToken?: string,
  ): Promise<OrderResponseDto> {
    const where = this.getOrderWhere(id, user, guestToken);

    const order = await this.repo.findOne({
      where,
      relations: {
        user: true,
        table: true,
        address: true,
        chat: guestToken ? false : { messages: { sender: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (
      (guestToken || user?.role !== UserRole.ADMIN) &&
      status.status !== OrderStatusEnum.CANCELED
    ) {
      throw new BadRequestException('Cliente só pode cancelar o pedido');
    }

    const isTableOrder =
      order.type === OrderType.DINE_IN ||
      Boolean(order.tableId || order.mesaId?.trim());
    const isPickupOrder = order.type === OrderType.PICKUP;
    const isFinished = order.status === OrderStatusEnum.DELIVERED;
    let nextStatus: OrderStatusEnum;
    let label: string;

    if (status.status === OrderStatusEnum.CANCELED) {
      if (
        isFinished ||
        order.status === OrderStatusEnum.READY ||
        ((isTableOrder || isPickupOrder) &&
          order.status === OrderStatusEnum.ON_ROUTE)
      ) {
        throw new BadRequestException(
          'Pedido pronto ou entregue não pode ser cancelado',
        );
      }
      if (order.status === OrderStatusEnum.CANCELED) {
        return toResponse(OrderResponseDto, order);
      }
      nextStatus = OrderStatusEnum.CANCELED;
      label = 'Pedido cancelado';
    } else {
      if (isFinished || order.status === OrderStatusEnum.CANCELED) {
        throw new BadRequestException(
          'Pedido finalizado ou cancelado não pode ser alterado',
        );
      }
      // Os cards enviam a etapa atual. Uma tela desatualizada não pode pular etapas.
      if (status.status !== order.status) {
        throw new ConflictException(
          'O pedido foi atualizado. Recarregue os dados antes de continuar',
        );
      }
      if (order.status === OrderStatusEnum.RECEIVED) {
        nextStatus = OrderStatusEnum.PREPARING;
        label = 'Pedido em preparação';
      } else if (order.status === OrderStatusEnum.PREPARING) {
        if (isTableOrder || isPickupOrder) {
          nextStatus = OrderStatusEnum.READY;
          label = 'Pedido pronto';
        } else {
          nextStatus = OrderStatusEnum.ON_ROUTE;
          label = 'Pedido em rota';
        }
      } else if (
        order.status === OrderStatusEnum.ON_ROUTE ||
        ((isTableOrder || isPickupOrder) &&
          order.status === OrderStatusEnum.READY)
      ) {
        nextStatus = OrderStatusEnum.DELIVERED;
        label = 'Pedido entregue';
      } else {
        throw new BadRequestException('Etapa inválida para este pedido');
      }
    }

    const history = [
      ...(order.history ?? []),
      { status: nextStatus, label, createdAt: new Date().toISOString() },
    ];
    // Atualiza apenas se outro atendimento ainda não tiver alterado a etapa.
    const result = await this.repo.update(
      { id: order.id, status: order.status },
      { status: nextStatus, history },
    );
    if (result.affected !== 1) {
      throw new ConflictException(
        'O pedido foi atualizado por outro atendimento. Recarregue os dados',
      );
    }
    return this.findById(id, user, guestToken);
  }

  // async update(id: string, dto: UpdateProductDto) {
  //   const product = await this.findOne(id);

  //   Object.assign(product, dto);
  //   return this.repo.save(product);
  // }

  async remove(id: string) {
    const product = await this.repo.find({ where: { id } });
    await this.repo.remove(product);

    return { message: 'Produto removido com sucesso' };
  }

  private getOrderWhere(
    id: string,
    user?: AuthenticatedUser,
    guestToken?: string,
  ): FindOptionsWhere<OrderEntity> {
    if (guestToken) {
      verifyGuestOrderToken(guestToken, id);

      return { id, userId: IsNull() };
    }

    if (!user?.id) {
      throw new UnauthorizedException('Faça login ou use a chave do pedido');
    }

    if (user.role === UserRole.ADMIN) return { id };

    return { id, userId: user.id };
  }

  private async attachOrderToTable(
    order: OrderEntity,
    table: TableEntity,
  ): Promise<TabEntity> {
    return this.repo.manager.transaction(async (manager) => {
      await manager.findOne(TableEntity, {
        where: { id: table.id },
        lock: { mode: 'pessimistic_write' },
      });

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
        tab = await manager.save(TabEntity, tab);
      }

      order.tab = tab;
      order.table = table;
      order.tableId = table.id;
      order.mesaId = String(table.number);
      order.type = OrderType.DINE_IN;
      await manager.save(OrderEntity, order);
      return tab;
    });
  }
}
