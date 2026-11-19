import type { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrderEntity } from '../entities/order.entity';
import { AddressEntity } from '../entities/address.entity';
import { TableEntity } from '../entities/table.entity';
import { TabEntity } from '../entities/tab.entity';
import { ChatService } from './chat.service';
import { MessageService } from './message.service';
import { ProductsService } from './products.service';
import { OrdersGateway } from '../websocket/orders.gateway';
import { OrderType } from '../dtos/enums/table-enums';
import { UserRole } from '../dtos/enums/user-role.enum';
import { PaymentMethodEnum } from '../dtos/enums/payment-method.enum';
import { ProductStatusEnum } from '../dtos/enums/product-status.enum';
import { OrderRequestDto } from '../dtos/request/order-request.dto';

describe('Evento de pedido criado', () => {
  let service: OrdersService;
  let savedOrder: OrderEntity;
  const originalSecret = process.env.GUEST_ORDER_SECRET;
  const table = { id: 'table-id', number: 1, isActive: true };
  const manager = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const chat = { create: jest.fn() };
  const whatsapp = { sendMessage: jest.fn() };
  const gateway = { notifyNewOrder: jest.fn() };
  const products = { findOne: jest.fn() };
  const customer = {
    id: 'customer-id',
    email: 'cliente@example.com',
    role: UserRole.CUSTOMER,
  };
  const address = {
    street: 'Rua 1',
    number: '10',
    neighborhood: 'Centro',
    city: 'Buriti Alegre',
    state: 'GO',
    zipCode: '75660-000',
  };

  function payload(type: OrderType): OrderRequestDto {
    return {
      type,
      tableId: type === OrderType.DINE_IN ? table.id : undefined,
      deliveryAddress: type === OrderType.DELIVERY ? address : undefined,
      customerName: 'Cliente',
      customerPhone: '64999999999',
      paymentMethod:
        type === OrderType.DINE_IN ? undefined : PaymentMethodEnum.PIX,
      subtotal: 25,
      total: 25,
      deliveryFee: 0,
      discount: 0,
      items: [
        {
          id: 'product-id',
          name: 'Hambúrguer',
          quantity: 1,
          unitPrice: 25,
          totalPrice: 25,
        },
      ],
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GUEST_ORDER_SECRET = 'notification-test-secret';
    service = new OrdersService(
      repo as unknown as Repository<OrderEntity>,
      {} as Repository<AddressEntity>,
      chat as unknown as ChatService,
      whatsapp as unknown as MessageService,
      gateway as unknown as OrdersGateway,
      products as unknown as ProductsService,
      {
        findOne: jest.fn().mockResolvedValue(table),
      } as unknown as Repository<TableEntity>,
    );
    repo.create.mockImplementation((data: Partial<OrderEntity>) =>
      Object.assign(new OrderEntity(), data, {
        id: data.id ?? 'order-id',
        code: 64,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    repo.save.mockImplementation((order: OrderEntity) => {
      savedOrder = order;
      return Promise.resolve(order);
    });
    repo.findOne.mockImplementation(() => Promise.resolve(savedOrder));
    chat.create.mockResolvedValue({ id: 'chat-id' });
    whatsapp.sendMessage.mockResolvedValue(undefined);
    repo.manager.transaction.mockImplementation(
      (work: (value: typeof manager) => Promise<unknown>) => work(manager),
    );
    manager.findOne.mockImplementation(
      (entity: typeof TableEntity | typeof TabEntity) =>
        Promise.resolve(entity === TableEntity ? table : null),
    );
    manager.create.mockImplementation(
      (entity: typeof OrderEntity | typeof TabEntity, data: object) =>
        Object.assign(new entity(), data, {
          id: entity === TabEntity ? 'tab-id' : 'order-id',
          code: 64,
        }),
    );
    manager.save.mockImplementation(
      (
        _entity: typeof OrderEntity | typeof TabEntity,
        value: OrderEntity | TabEntity,
      ) => Promise.resolve(value),
    );
    products.findOne.mockResolvedValue({
      id: 'product-id',
      name: 'Hambúrguer',
      price: '25.00',
      isActive: ProductStatusEnum.ACTIVED,
      images: [],
    });
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.GUEST_ORDER_SECRET;
    else process.env.GUEST_ORDER_SECRET = originalSecret;
  });

  it.each([OrderType.DINE_IN, OrderType.DELIVERY, OrderType.PICKUP])(
    'notifica pedido %s de cliente logado uma única vez',
    async (type) => {
      const response = await service.create(payload(type), customer);
      expect(gateway.notifyNewOrder).toHaveBeenCalledTimes(1);
      expect(gateway.notifyNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({ id: response.id, type }),
      );
      expect(response).not.toHaveProperty('guestToken');
      expect(chat.create).toHaveBeenCalledWith(
        { orderId: response.id },
        customer,
      );
      expect(gateway.notifyNewOrder.mock.invocationCallOrder[0]).toBeLessThan(
        whatsapp.sendMessage.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([OrderType.DINE_IN, OrderType.DELIVERY, OrderType.PICKUP])(
    'notifica pedido %s de visitante sem transmitir a chave de acesso',
    async (type) => {
      const response = await service.create(payload(type));
      expect(response.guestToken).toBeTruthy();
      expect(gateway.notifyNewOrder).toHaveBeenCalledTimes(1);
      expect(gateway.notifyNewOrder.mock.calls[0][0]).not.toHaveProperty(
        'guestToken',
      );
      expect(chat.create).not.toHaveBeenCalled();
    },
  );

  it('emite o evento enquanto o WhatsApp ainda está pendente', async () => {
    let releaseWhatsapp!: () => void;
    const blockedWhatsapp = new Promise<void>((resolve) => {
      releaseWhatsapp = resolve;
    });
    let eventEmitted!: () => void;
    const notification = new Promise<void>((resolve) => {
      eventEmitted = resolve;
    });
    whatsapp.sendMessage.mockReturnValueOnce(blockedWhatsapp);
    gateway.notifyNewOrder.mockImplementationOnce(() => eventEmitted());
    const request = service.create(payload(OrderType.PICKUP), customer);
    await notification;
    expect(whatsapp.sendMessage).toHaveBeenCalled();
    releaseWhatsapp();
    await request;
    expect(gateway.notifyNewOrder).toHaveBeenCalledTimes(1);
  });

  it('não emite evento quando o pedido não foi salvo', async () => {
    repo.save.mockRejectedValueOnce(new Error('Falha simulada'));
    await expect(
      service.create(payload(OrderType.PICKUP), customer),
    ).rejects.toThrow('Falha simulada');
    expect(gateway.notifyNewOrder).not.toHaveBeenCalled();
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });

  it('notifica o pedido do admin somente após confirmar a transação', async () => {
    let releaseCommit!: () => void;
    const commit = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    let workFinished!: () => void;
    const saved = new Promise<void>((resolve) => {
      workFinished = resolve;
    });
    repo.manager.transaction.mockImplementationOnce(
      async (work: (value: typeof manager) => Promise<unknown>) => {
        const result = await work(manager);
        workFinished();
        await commit;
        return result;
      },
    );
    const request = service.createAdmin({
      type: OrderType.PICKUP,
      items: [{ productId: 'product-id', quantity: 1 }],
    });
    await saved;
    expect(gateway.notifyNewOrder).not.toHaveBeenCalled();
    releaseCommit();
    const response = await request;
    expect(gateway.notifyNewOrder).toHaveBeenCalledTimes(1);
    expect(gateway.notifyNewOrder).toHaveBeenCalledWith(response);
  });

  it('não notifica o admin se a transação falhar no commit', async () => {
    repo.manager.transaction.mockImplementationOnce(
      async (work: (value: typeof manager) => Promise<unknown>) => {
        await work(manager);
        throw new Error('Commit não confirmado');
      },
    );
    await expect(
      service.createAdmin({
        type: OrderType.PICKUP,
        items: [{ productId: 'product-id', quantity: 1 }],
      }),
    ).rejects.toThrow('Commit não confirmado');
    expect(gateway.notifyNewOrder).not.toHaveBeenCalled();
  });
});
