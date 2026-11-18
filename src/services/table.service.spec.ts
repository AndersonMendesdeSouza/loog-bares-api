import type { Repository } from 'typeorm';
import { TableService } from './table.service';
import { TableEntity } from '../entities/table.entity';
import { TabEntity } from '../entities/tab.entity';
import { TableStatus, TabStatus } from '../dtos/enums/table-enums';
import { OrderEntity } from '../entities/order.entity';
import { OrderStatusEnum } from '../dtos/enums/order-status.enum';

describe('Status das mesas', () => {
  const table = Object.assign(new TableEntity(), {
    id: '00000000-0000-4000-8000-000000000001',
    number: 1,
    isActive: true,
  });
  const tableRepo = { find: jest.fn(), findOne: jest.fn() };
  const tabRepo = { find: jest.fn(), findOne: jest.fn() };
  const service = new TableService(
    tableRepo as unknown as Repository<TableEntity>,
    tabRepo as unknown as Repository<TabEntity>,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    table.tabs = [];
    tableRepo.find.mockResolvedValue([table]);
    tableRepo.findOne.mockResolvedValue(table);
    tabRepo.find.mockResolvedValue([]);
    tabRepo.findOne.mockResolvedValue(null);
  });

  it('retorna AVAILABLE sem comanda aberta', async () => {
    expect((await service.findAll())[0].status).toBe(TableStatus.AVAILABLE);
    expect((await service.findOne(table.id)).status).toBe(
      TableStatus.AVAILABLE,
    );
  });

  it('lista pública expõe apenas ID, número e disponibilidade', async () => {
    const response = await service.findActive();
    expect(response[0]).toEqual({ id: table.id, number: 1, isActive: true });
    expect(response[0]).not.toHaveProperty('tabs');
    expect(response[0]).not.toHaveProperty('orders');
    expect(tableRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, number: true, isActive: true },
      order: { number: 'ASC' },
    });
  });

  it('retorna OCCUPIED enquanto existir uma comanda OPEN', async () => {
    table.tabs = [Object.assign(new TabEntity(), { status: TabStatus.OPEN })];
    expect((await service.findAll())[0].status).toBe(TableStatus.OCCUPIED);
    expect((await service.findOne(table.id)).status).toBe(TableStatus.OCCUPIED);
    expect(tableRepo.find).toHaveBeenCalledWith({
      relations: { tabs: { orders: true } },
      order: { number: 'ASC' },
    });
    expect(tableRepo.findOne).toHaveBeenCalledWith({
      where: { id: table.id },
      relations: { tabs: { orders: true } },
    });
  });

  it('não ocupa uma mesa com a comanda de outra mesa', async () => {
    const otherTable = Object.assign(new TableEntity(), {
      id: 'outra-mesa',
      number: 2,
      isActive: true,
      tabs: [Object.assign(new TabEntity(), { status: TabStatus.OPEN })],
    });
    tableRepo.find.mockResolvedValue([table, otherTable]);
    const response = await service.findAll();
    expect(response[0].status).toBe(TableStatus.AVAILABLE);
    expect(response[1].status).toBe(TableStatus.OCCUPIED);
  });

  it.each([TabStatus.CLOSED, TabStatus.CANCELLED])(
    'volta a AVAILABLE quando a comanda muda para %s',
    async (status) => {
      const tab = Object.assign(new TabEntity(), { status: TabStatus.OPEN });
      table.tabs = [tab];
      expect((await service.findAll())[0].status).toBe(TableStatus.OCCUPIED);
      tab.status = status;
      expect((await service.findAll())[0].status).toBe(TableStatus.AVAILABLE);
    },
  );

  it('mantém INACTIVE para mesas desativadas', async () => {
    tableRepo.find.mockResolvedValue([{ ...table, isActive: false }]);
    tableRepo.findOne.mockResolvedValue({ ...table, isActive: false });
    expect((await service.findAll())[0].status).toBe(TableStatus.INACTIVE);
    expect((await service.findOne(table.id)).status).toBe(TableStatus.INACTIVE);
  });

  it('retorna tabs, pedidos e itens sem repetir a mesa dentro das tabs', async () => {
    const order = Object.assign(new OrderEntity(), {
      id: 'pedido-id',
      status: OrderStatusEnum.RECEIVED,
      subtotal: '20.00',
      total: '18.00',
      items: [
        {
          id: 'produto-id',
          name: 'Produto',
          quantity: 2,
          unitPrice: 10,
          totalPrice: 20,
        },
      ],
    });
    table.tabs = [
      Object.assign(new TabEntity(), {
        id: 'comanda-id',
        table,
        status: TabStatus.OPEN,
        orders: [order],
      }),
    ];
    const response = await service.findOne(table.id);
    expect(response.tabs?.[0]).toMatchObject({
      id: 'comanda-id',
      status: TabStatus.OPEN,
      subtotal: '20.00',
      total: '18.00',
      orders: [{ id: 'pedido-id', items: order.items }],
    });
    expect(response.tabs?.[0]).not.toHaveProperty('table');
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it('inclui pedidos cancelados no histórico sem somar seus valores', async () => {
    table.tabs = [
      Object.assign(new TabEntity(), {
        id: 'comanda-id',
        status: TabStatus.OPEN,
        orders: [
          Object.assign(new OrderEntity(), {
            status: OrderStatusEnum.RECEIVED,
            subtotal: '20.00',
            total: '18.00',
          }),
          Object.assign(new OrderEntity(), {
            status: OrderStatusEnum.CANCELED,
            subtotal: '100.00',
            total: '100.00',
          }),
        ],
      }),
    ];
    const tab = (await service.findAll())[0].tabs?.[0];
    expect(tab?.orders).toHaveLength(2);
    expect(tab?.subtotal).toBe('20.00');
    expect(tab?.total).toBe('18.00');
  });
});
