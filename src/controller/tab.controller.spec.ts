import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Server } from 'node:http';
import request from 'supertest';
import { TabStatus } from '../dtos/enums/table-enums';
import { UserRole } from '../dtos/enums/user-role.enum';
import { TableEntity } from '../entities/table.entity';
import { TabEntity } from '../entities/tab.entity';
import { UserEntity } from '../entities/user.entity';
import { OrderEntity } from '../entities/order.entity';
import { ProductEntity } from '../entities/product-entity';
import { TabModule } from '../modules/tab.module';
import { UserModule } from '../modules/user.module';
import { ImageEntity } from '../entities/image.entity';
import { ImageService } from '../services/image.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

describe('Atualização de tab', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let customerToken: string;
  let storedTab: TabEntity;
  const tabId = '00000000-0000-4000-8000-000000000001';
  const missingId = '00000000-0000-4000-8000-000000000002';
  const table = {
    id: '00000000-0000-4000-8000-000000000003',
    number: 1,
    isActive: true,
  };
  const manager = { findOne: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const repo = {
    findOne: jest.fn(),
    update: jest.fn(),
    manager: { transaction: jest.fn() },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [UserModule, TabModule],
    })
      .overrideProvider(getRepositoryToken(UserEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TableEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TabEntity))
      .useValue(repo)
      .overrideProvider(getRepositoryToken(OrderEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(ProductEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue({})
      .overrideProvider(ImageService)
      .useValue({})
      .overrideProvider(CloudinaryService)
      .useValue({})
      .compile();

    const jwt = module.get(JwtService);
    adminToken = jwt.sign({ sub: 'test-admin', role: UserRole.ADMIN });
    customerToken = jwt.sign({ sub: 'test-customer', role: UserRole.CUSTOMER });
    app = module.createNestApplication();
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
    storedTab = Object.assign(new TabEntity(), {
      id: tabId,
      table,
      status: TabStatus.OPEN,
      orders: [],
      openedAt: new Date('2026-01-01T18:00:00Z'),
      closedAt: null,
      closingTotal: null,
      paymentMethod: null,
    });
    repo.findOne.mockImplementation((options: { where: { id: string } }) =>
      Promise.resolve(options.where.id === tabId ? storedTab : null),
    );
    repo.manager.transaction.mockImplementation(
      (work: (transactionManager: typeof manager) => Promise<unknown>) =>
        work(manager),
    );
    manager.findOne.mockImplementation(
      (_entity: typeof TabEntity, options: { where: { id: string } }) =>
        Promise.resolve(options.where.id === tabId ? storedTab : null),
    );
    manager.update.mockResolvedValue({ affected: 2 });
    manager.delete.mockResolvedValue({ affected: 1 });
    repo.update.mockImplementation(
      (
        criteria: { id: string; status: TabStatus },
        changes: Partial<TabEntity>,
      ) => {
        if (
          criteria.id !== storedTab.id ||
          criteria.status !== storedTab.status
        )
          return Promise.resolve({ affected: 0 });
        Object.assign(storedTab, changes);
        return Promise.resolve({ affected: 1 });
      },
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('DELETE /tabs/:id', () => {
    it('desvincula os pedidos antes de excluir somente a comanda', async () => {
      await request(server)
        .delete(`/tabs/${tabId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect({ message: 'Comanda excluída com sucesso' });
      expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(TabEntity, {
        where: { id: tabId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.update).toHaveBeenCalledWith(
        OrderEntity,
        { tab: { id: tabId } },
        { tab: null },
      );
      expect(manager.delete).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(TabEntity, tabId);
      expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(
        manager.delete.mock.invocationCallOrder[0],
      );
    });

    it('retorna 404 sem alterar pedidos quando a comanda não existe', async () => {
      await request(server)
        .delete(`/tabs/${missingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('valida o UUID antes de consultar o banco', async () => {
      await request(server)
        .delete('/tabs/invalido')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expect(repo.manager.transaction).not.toHaveBeenCalled();
    });

    it('exige autenticação', async () => {
      await request(server).delete(`/tabs/${tabId}`).expect(401);
      expect(repo.manager.transaction).not.toHaveBeenCalled();
    });

    it('permite exclusão apenas para administrador', async () => {
      await request(server)
        .delete(`/tabs/${tabId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      expect(repo.manager.transaction).not.toHaveBeenCalled();
    });
  });

  it.each([TabStatus.CLOSED, TabStatus.CANCELLED])(
    'altera OPEN para %s e preenche closedAt no servidor',
    async (status) => {
      const startedAt = Date.now();
      const response = await request(server)
        .patch(`/tabs/${tabId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
      const body = response.body as {
        id: string;
        status: TabStatus;
        closedAt: string;
        table: typeof table;
        orders: unknown[];
        closingTotal: null;
        paymentMethod: null;
      };
      expect(body.id).toBe(tabId);
      expect(body.status).toBe(status);
      expect(new Date(body.closedAt).getTime()).toBeGreaterThanOrEqual(
        startedAt,
      );
      expect(new Date(body.closedAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(body.table).toEqual(table);
      expect(body.orders).toEqual([]);
      expect(body.closingTotal).toBeNull();
      expect(body.paymentMethod).toBeNull();
      expect(repo.update).toHaveBeenCalledWith(
        { id: tabId, status: TabStatus.OPEN },
        { status, closedAt: storedTab.closedAt },
      );
    },
  );

  it.each([TabStatus.CLOSED, TabStatus.CANCELLED])(
    'bloqueia alteração quando a tab já está %s',
    async (status) => {
      const closedAt = new Date('2026-01-02T18:00:00Z');
      storedTab.status = status;
      storedTab.closedAt = closedAt;
      await request(server)
        .patch(`/tabs/${tabId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TabStatus.CLOSED })
        .expect(409);
      expect(repo.update).not.toHaveBeenCalled();
      expect(storedTab.closedAt).toBe(closedAt);
    },
  );

  it('bloqueia duas alterações simultâneas da mesma comanda', async () => {
    repo.update.mockResolvedValue({ affected: 0 });
    await request(server)
      .patch(`/tabs/${tabId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: TabStatus.CANCELLED })
      .expect(409);
    expect(storedTab.status).toBe(TabStatus.OPEN);
  });

  it.each([
    {},
    { status: null },
    { status: TabStatus.OPEN },
    { status: 'INVALID' },
    { status: TabStatus.CLOSED, closedAt: '2026-01-01' },
    { status: TabStatus.CLOSED, tableId: missingId },
    { status: TabStatus.CLOSED, closingTotal: '1.00' },
  ])('valida o payload %j', async (body) => {
    await request(server)
      .patch(`/tabs/${tabId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(400);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('retorna 404 para uma comanda inexistente', async () => {
    await request(server)
      .patch(`/tabs/${missingId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: TabStatus.CLOSED })
      .expect(404);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('valida o UUID antes de consultar o banco', async () => {
    await request(server)
      .patch('/tabs/invalido')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: TabStatus.CLOSED })
      .expect(400);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('exige login', async () => {
    await request(server)
      .patch(`/tabs/${tabId}`)
      .send({ status: TabStatus.CLOSED })
      .expect(401);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('exige permissão de administrador', async () => {
    await request(server)
      .patch(`/tabs/${tabId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: TabStatus.CLOSED })
      .expect(403);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
