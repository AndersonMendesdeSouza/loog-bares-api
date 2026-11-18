import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Server } from 'node:http';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { OrderStatusEnum } from '../dtos/enums/order-status.enum';
import { ProductStatusEnum } from '../dtos/enums/product-status.enum';
import { OrderType, TabStatus } from '../dtos/enums/table-enums';
import { UserRole } from '../dtos/enums/user-role.enum';
import { OrderEntity } from '../entities/order.entity';
import { ProductEntity } from '../entities/product-entity';
import { TabEntity } from '../entities/tab.entity';
import { TableEntity } from '../entities/table.entity';
import { UserEntity } from '../entities/user.entity';
import { TabModule } from '../modules/tab.module';
import { UserModule } from '../modules/user.module';
import { ImageEntity } from '../entities/image.entity';
import { ImageService } from '../services/image.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

describe('Pedidos da comanda', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let customerToken: string;
  let tabs: TabEntity[];
  let orders: OrderEntity[];
  let product: ProductEntity;
  let table: TableEntity;
  let failOrderSave: boolean;
  const tableId = '00000000-0000-4000-8000-000000000001';
  const productId = '00000000-0000-4000-8000-00000000000a';
  const tabId = '00000000-0000-4000-8000-000000000002';
  const missingId = '00000000-0000-4000-8000-000000000003';
  const payload = { tableId, items: [{ productId, quantity: 2 }] };
  const manager = {
    findOne: jest.fn(),
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const productRepo = { findOne: jest.fn() };
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };

  type TabBody = {
    id: string;
    subtotal: string;
    total: string;
    table: { id: string; number: number };
    orders: {
      id: string;
      status: string;
      paymentMethod: null;
      items: {
        productId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }[];
    }[];
  };

  function openTab() {
    const tab = Object.assign(new TabEntity(), {
      id: tabId,
      tableId,
      table,
      status: TabStatus.OPEN,
      orders: [],
      openedAt: new Date(),
      closedAt: null,
      closingTotal: null,
      paymentMethod: null,
    });
    tabs.push(tab);
    return tab;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [UserModule, TabModule],
    })
      .overrideProvider(getRepositoryToken(UserEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TableEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(OrderEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(ProductEntity))
      .useValue(productRepo)
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue({})
      .overrideProvider(ImageService)
      .useValue({})
      .overrideProvider(CloudinaryService)
      .useValue({})
      .overrideProvider(getRepositoryToken(TabEntity))
      .useValue(repo)
      .compile();
    const jwt = module.get(JwtService);
    adminToken = jwt.sign({ sub: 'local-admin', role: UserRole.ADMIN });
    customerToken = jwt.sign({
      sub: 'local-customer',
      role: UserRole.CUSTOMER,
    });
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    tabs = [];
    orders = [];
    failOrderSave = false;
    table = Object.assign(new TableEntity(), {
      id: tableId,
      number: 1,
      isActive: true,
    });
    product = Object.assign(new ProductEntity(), {
      id: productId,
      name: 'Hambúrguer da casa',
      description: 'Carne e queijo',
      price: '32.10',
      promoPrice: null,
      isActive: ProductStatusEnum.ACTIVED,
      stockEnabled: false,
      images: [],
    });
    manager.findOne.mockImplementation(
      (
        entity: unknown,
        options: {
          where: { id?: string; tableId?: string; status?: TabStatus };
          relations?: object;
        },
      ) => {
        if (entity === TableEntity)
          return Promise.resolve(options.where.id === table.id ? table : null);
        const tab = tabs.find((current) =>
          options.where.id
            ? current.id === options.where.id
            : current.tableId === options.where.tableId &&
              current.status === options.where.status,
        );
        if (!tab) return Promise.resolve(null);
        if (options.relations) {
          return Promise.resolve({
            ...tab,
            table,
            orders: orders.filter((order) => order.tab?.id === tab.id),
          });
        }
        return Promise.resolve(tab);
      },
    );
    productRepo.findOne.mockImplementation(
      (options: { where: { id: string } }) =>
        Promise.resolve(options.where.id === product.id ? product : null),
    );
    manager.getRepository.mockReturnValue(productRepo);
    manager.create.mockImplementation(
      (entity: new () => object, values: object) =>
        Object.assign(new entity(), values),
    );
    manager.save.mockImplementation(
      (entity: unknown, value: TabEntity | OrderEntity) => {
        if (entity === TabEntity) {
          Object.assign(value, {
            id: tabs.length === 0 ? tabId : missingId,
            openedAt: new Date(),
          });
          tabs.push(value as TabEntity);
        } else {
          if (failOrderSave)
            throw new QueryFailedError(
              'INSERT',
              [],
              Object.assign(new Error('Duplicate'), { code: '23505' }),
            );
          Object.assign(value, {
            id: `order-${orders.length + 1}`,
            code: orders.length + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          orders.push(value as OrderEntity);
        }
        return Promise.resolve(value);
      },
    );
    repo.manager.transaction.mockImplementation(
      async (
        callback: (transactionManager: typeof manager) => Promise<unknown>,
      ) => {
        const previousTabs = [...tabs];
        const previousOrders = [...orders];
        try {
          return await callback(manager);
        } catch (error) {
          tabs = previousTabs;
          orders = previousOrders;
          throw error;
        }
      },
    );
    repo.findOne.mockImplementation((options: { where: { id: string } }) => {
      const tab = tabs.find((current) => current.id === options.where.id);
      if (!tab) return Promise.resolve(null);
      return Promise.resolve({
        ...tab,
        table,
        orders: orders.filter((order) => order.tab?.id === tab.id),
      });
    });
    repo.find.mockImplementation(() =>
      Promise.resolve(
        tabs.map((tab) => ({
          ...tab,
          orders: orders.filter((order) => order.tab?.id === tab.id),
        })),
      ),
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('abre a comanda e cria o primeiro pedido com os preços do cadastro', async () => {
    const response = await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    const body = response.body as TabBody;
    expect(tabs).toHaveLength(1);
    expect(orders).toHaveLength(1);
    expect(body.subtotal).toBe('64.20');
    expect(body.total).toBe('64.20');
    expect(body.orders[0].status).toBe(OrderStatusEnum.RECEIVED);
    expect(body.orders[0].paymentMethod).toBeNull();
    expect(body.orders[0].items[0]).toMatchObject({
      productId,
      quantity: 2,
      name: product.name,
      unitPrice: 32.1,
      totalPrice: 64.2,
    });
    expect(orders[0].tab?.id).toBe(tabId);
    expect(orders[0].type).toBe(OrderType.DINE_IN);
    expect(orders[0].userId).toBeNull();
    expect(manager.findOne).toHaveBeenCalledWith(TableEntity, {
      where: { id: tableId },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('reutiliza a comanda aberta da mesa em uma segunda solicitação', async () => {
    openTab();
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    const response = await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(tabs).toHaveLength(1);
    expect(orders).toHaveLength(2);
    expect((response.body as TabBody).total).toBe('128.40');
  });

  it('adiciona um novo pedido por ID da comanda e preserva os valores anteriores', async () => {
    openTab();
    await request(server)
      .post(`/tabs/${tabId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: payload.items })
      .expect(201);
    product.price = '50.00';
    product.name = 'Novo nome';
    const response = await request(server)
      .post(`/tabs/${tabId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);
    const body = response.body as TabBody;
    expect(body.orders).toHaveLength(2);
    expect(body.orders[0].items[0]).toMatchObject({
      name: 'Hambúrguer da casa',
      unitPrice: 32.1,
      quantity: 2,
    });
    expect(body.orders[1].items[0]).toMatchObject({
      name: 'Novo nome',
      unitPrice: 50,
    });
    expect(body.total).toBe('114.20');
    expect(manager.findOne).toHaveBeenCalledWith(TabEntity, {
      where: { id: tabId },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('usa preço promocional, inclusive promoção de valor zero', async () => {
    product.promoPrice = '19.99';
    const response = await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect((response.body as TabBody).total).toBe('39.98');
    product.promoPrice = '0.00';
    const free = await request(server)
      .post(`/tabs/${tabId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: payload.items })
      .expect(201);
    expect((free.body as TabBody).orders[1].items[0].totalPrice).toBe(0);
  });

  it('agrupa o mesmo produto repetido, inclusive IDs em letras maiúsculas', async () => {
    const response = await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tableId,
        items: [
          { productId, quantity: 1 },
          { productId: productId.toUpperCase(), quantity: 2 },
        ],
      })
      .expect(201);
    expect((response.body as TabBody).orders[0].items).toHaveLength(1);
    expect((response.body as TabBody).total).toBe('96.30');
    expect(productRepo.findOne).toHaveBeenCalledTimes(2);
  });

  it('busca cada produto individualmente pelo ProductsService.findOne', async () => {
    const secondProductId = '00000000-0000-4000-8000-00000000000b';
    const secondProduct = {
      ...product,
      id: secondProductId,
      name: 'Refrigerante',
      price: '4.90',
    };
    productRepo.findOne.mockImplementation(
      (options: { where: { id: string } }) => {
        if (options.where.id === productId) return Promise.resolve(product);
        if (options.where.id === secondProductId)
          return Promise.resolve(secondProduct);
        return Promise.resolve(null);
      },
    );

    const response = await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tableId,
        items: [
          { productId, quantity: 2 },
          { productId: secondProductId, quantity: 1 },
        ],
      })
      .expect(201);

    expect(productRepo.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: productId },
      relations: ['images'],
    });
    expect(productRepo.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: secondProductId },
      relations: ['images'],
    });
    expect((response.body as TabBody).orders[0].items).toHaveLength(2);
    expect((response.body as TabBody).total).toBe('69.10');
    expect(manager.getRepository).toHaveBeenCalledTimes(2);
  });

  it('mantém a consulta normal de produto sem precisar de transação', async () => {
    const response = await request(server)
      .get(`/products/${productId}`)
      .expect(200);
    expect((response.body as { id: string }).id).toBe(productId);
    expect(productRepo.findOne).toHaveBeenCalledWith({
      where: { id: productId },
      relations: ['images'],
    });
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('retira pedidos cancelados dos totais sem apagar o histórico', async () => {
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    orders[0].status = OrderStatusEnum.CANCELED;
    const response = await request(server)
      .post(`/tabs/${tabId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);
    expect((response.body as TabBody).orders).toHaveLength(2);
    expect((response.body as TabBody).total).toBe('32.10');
    const detail = await request(server)
      .get(`/tabs/${tabId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((detail.body as TabBody).total).toBe('32.10');
    const list = await request(server)
      .get('/tabs/find-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((list.body as TabBody[])[0].total).toBe('32.10');
  });

  it('abre um novo atendimento se a comanda anterior da mesa está fechada', async () => {
    openTab().status = TabStatus.CLOSED;
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].status).toBe(TabStatus.CLOSED);
    expect(tabs[1].status).toBe(TabStatus.OPEN);
  });

  it.each([TabStatus.CLOSED, TabStatus.CANCELLED])(
    'bloqueia acréscimos na comanda %s',
    async (status) => {
      openTab().status = status;
      await request(server)
        .post(`/tabs/${tabId}/orders`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: payload.items })
        .expect(409);
      expect(orders).toHaveLength(0);
    },
  );

  it('retorna 404 para mesa ou comanda inexistente', async () => {
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, tableId: missingId })
      .expect(404);
    await request(server)
      .post(`/tabs/${missingId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: payload.items })
      .expect(404);
    expect(orders).toHaveLength(0);
  });

  it('bloqueia mesa inativa nos dois caminhos', async () => {
    openTab();
    table.isActive = false;
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(409);
    await request(server)
      .post(`/tabs/${tabId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: payload.items })
      .expect(409);
  });

  it('rejeita produto inexistente e desfaz a comanda criada na transação', async () => {
    productRepo.findOne.mockResolvedValue(null);
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(404);
    expect(tabs).toHaveLength(0);
    expect(orders).toHaveLength(0);
  });

  it('rejeita produto indisponível sem alterar uma comanda existente', async () => {
    openTab();
    product.isActive = ProductStatusEnum.DISABLED;
    await request(server)
      .post(`/tabs/${tabId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: payload.items })
      .expect(409);
    expect(tabs).toHaveLength(1);
    expect(orders).toHaveLength(0);
  });

  it.each(['-1.00', 'invalid'])(
    'rejeita preço cadastrado inválido %s',
    async (price) => {
      product.price = price;
      await request(server)
        .post('/tabs/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(409);
      expect(tabs).toHaveLength(0);
      expect(orders).toHaveLength(0);
    },
  );

  it('desfaz a abertura quando a gravação do pedido falha', async () => {
    failOrderSave = true;
    app.useLogger(false);
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(500);
    expect(tabs).toHaveLength(0);
    expect(orders).toHaveLength(0);
  });

  it('rejeita conflito com uma abertura simultânea fora deste fluxo', async () => {
    manager.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('Duplicate'), { code: '23505' }),
      ),
    );
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(409);
    expect(orders).toHaveLength(0);
  });

  it('rejeita pedido acima da precisão dos campos de valor', async () => {
    product.price = '9999999999.99';
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(400);
    expect(tabs).toHaveLength(0);
  });

  it.each([
    {},
    { tableId },
    { ...payload, items: [] },
    { ...payload, items: null },
    { ...payload, items: [null] },
    { ...payload, items: [[{ productId, quantity: 1 }]] },
    { ...payload, items: [{ productId, quantity: 0 }] },
    { ...payload, items: [{ productId, quantity: -1 }] },
    { ...payload, items: [{ productId, quantity: 1.5 }] },
    { ...payload, items: [{ productId, quantity: '2' }] },
    { ...payload, items: [{ productId: 'invalid', quantity: 1 }] },
    { ...payload, items: [{ productId, quantity: 1, unitPrice: 0.01 }] },
    { ...payload, total: 0.01 },
  ])('valida os itens e recusa valores vindos do cliente: %j', async (body) => {
    await request(server)
      .post('/tabs/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(400);
    expect(repo.manager.transaction).not.toHaveBeenCalled();
  });

  it.each(['/tabs/orders', `/tabs/${tabId}/orders`])(
    'protege %s com login e permissão de administrador',
    async (path) => {
      await request(server).post(path).send(payload).expect(401);
      await request(server)
        .post(path)
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload)
        .expect(403);
      expect(repo.manager.transaction).not.toHaveBeenCalled();
    },
  );

  it('valida o ID da comanda antes de iniciar a operação', async () => {
    await request(server)
      .post('/tabs/invalid/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: payload.items })
      .expect(400);
    expect(repo.manager.transaction).not.toHaveBeenCalled();
  });
});
