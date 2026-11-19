import { EntityManager, Repository } from 'typeorm';
import { TabService } from './tab.service';
import { ProductsService } from './products.service';
import { OrderResponseDto } from '../dtos/response/orders-response.dto';
import { OrdersGateway } from '../websocket/orders.gateway';
import { TabEntity } from '../entities/tab.entity';
import { TableEntity } from '../entities/table.entity';
import { OrderEntity } from '../entities/order.entity';
import { OrderType, TabStatus } from '../dtos/enums/table-enums';
import { ProductStatusEnum } from '../dtos/enums/product-status.enum';

describe('Notificações de pedidos em comandas', () => {
  const table = { id: 'table-id', number: 3, isActive: true };
  const tab = {
    id: 'tab-id',
    tableId: table.id,
    status: TabStatus.OPEN,
    table,
    orders: [],
  };
  const manager = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  const repo = { manager: { transaction: jest.fn() } };
  const products = { findOne: jest.fn() };
  const gateway = { notifyNewOrder: jest.fn<void, [OrderResponseDto]>() };
  const payload = { items: [{ productId: 'product-id', quantity: 1 }] };
  let committed = false;
  let savedOrder: Partial<OrderEntity>;
  const service = new TabService(
    repo as unknown as Repository<TabEntity>,
    {} as Repository<TableEntity>,
    products as unknown as ProductsService,
    gateway as unknown as OrdersGateway,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    committed = false;
    repo.manager.transaction.mockImplementation(
      async (work: (manager: EntityManager) => Promise<unknown>) => {
        const result = await work(manager as unknown as EntityManager);
        committed = true;
        return result;
      },
    );
    manager.findOne.mockImplementation(
      (entity: unknown, options: { relations?: unknown }) => {
        if (entity === TableEntity) return Promise.resolve(table);
        if (options.relations)
          return Promise.resolve({ ...tab, orders: [savedOrder] });
        return Promise.resolve(tab);
      },
    );
    manager.create.mockImplementation(
      (_entity: unknown, value: Partial<OrderEntity>) => value,
    );
    manager.save.mockImplementation(
      (_entity: unknown, value: Partial<OrderEntity>) => {
        savedOrder = { ...value, id: 'order-id', code: 1053 };
        return Promise.resolve(savedOrder);
      },
    );
    products.findOne.mockResolvedValue({
      id: 'product-id',
      name: 'Hambúrguer',
      price: '25.00',
      isActive: ProductStatusEnum.ACTIVED,
      images: [],
    });
    gateway.notifyNewOrder.mockImplementation(() =>
      expect(committed).toBe(true),
    );
  });

  it.each(['create', 'add'])(
    'emite dados do pedido e da mesa após commit no fluxo %s',
    async (flow) => {
      const response =
        flow === 'create'
          ? await service.createOrder({ tableId: table.id, ...payload })
          : await service.addOrder(tab.id, payload);
      expect(response.id).toBe(tab.id);
      expect(gateway.notifyNewOrder).toHaveBeenCalledTimes(1);
      expect(gateway.notifyNewOrder.mock.calls[0][0]).toMatchObject({
        id: 'order-id',
        code: 1053,
        type: OrderType.DINE_IN,
        mesaId: '3',
        table: { id: table.id, number: 3 },
      });
    },
  );

  it('não emite quando salvar o pedido falha', async () => {
    manager.save.mockRejectedValueOnce(new Error('Falha ao salvar'));
    await expect(service.addOrder(tab.id, payload)).rejects.toThrow(
      'Falha ao salvar',
    );
    expect(gateway.notifyNewOrder).not.toHaveBeenCalled();
  });

  it('não emite quando a confirmação da transação falha', async () => {
    repo.manager.transaction.mockImplementation(
      async (work: (manager: EntityManager) => Promise<unknown>) => {
        await work(manager as unknown as EntityManager);
        throw new Error('Falha no commit');
      },
    );
    await expect(
      service.createOrder({ tableId: table.id, ...payload }),
    ).rejects.toThrow('Falha no commit');
    expect(gateway.notifyNewOrder).not.toHaveBeenCalled();
  });
});
