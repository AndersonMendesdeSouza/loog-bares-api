import type { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrderEntity } from '../entities/order.entity';
import { AddressEntity } from '../entities/address.entity';
import { TableEntity } from '../entities/table.entity';
import { ProductsService } from './products.service';
import { ChatService } from './chat.service';
import { MessageService } from './message.service';
import { OrderType } from '../dtos/enums/table-enums';
import { ProductStatusEnum } from '../dtos/enums/product-status.enum';
import { CreateAdminOrderRequestDto } from '../dtos/request/create-admin-order-request.dto';
import { OrdersGateway } from '../websocket/orders.gateway';

describe('Pedidos de balcão e delivery pelo admin', () => {
  const manager = { create: jest.fn(), save: jest.fn() };
  const repo = { manager: { transaction: jest.fn() } };
  const products = { findOne: jest.fn() };
  const chat = { create: jest.fn() };
  const message = { sendMessage: jest.fn() };
  const gateway = { notifyNewOrder: jest.fn() };
  const addressRepo = { findOne: jest.fn(), save: jest.fn() };
  const service = new OrdersService(
    repo as unknown as Repository<OrderEntity>,
    addressRepo as unknown as Repository<AddressEntity>,
    chat as unknown as ChatService,
    message as unknown as MessageService,
    gateway as unknown as OrdersGateway,
    products as unknown as ProductsService,
    {} as Repository<TableEntity>,
  );
  const productId = '00000000-0000-4000-8000-000000000001';
  const address = {
    street: 'Rua 1',
    number: '10',
    block: '2',
    lot: '3',
    neighborhood: 'Centro',
    city: 'Buriti Alegre',
    state: 'GO',
    zipCode: '75660-000',
  };

  function payload(): CreateAdminOrderRequestDto {
    return {
      type: OrderType.DELIVERY,
      customerName: 'Cliente',
      customerPhone: '64999999687',
      deliveryAddress: address,
      items: [{ productId, quantity: 2 }],
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    repo.manager.transaction.mockImplementation(
      (work: (value: typeof manager) => Promise<unknown>) => work(manager),
    );
    manager.create.mockImplementation(
      (_entity: typeof OrderEntity, data: Partial<OrderEntity>) =>
        Object.assign(new OrderEntity(), data, { id: 'pedido-id', code: 1 }),
    );
    manager.save.mockImplementation(
      (_entity: typeof OrderEntity, order: OrderEntity) =>
        Promise.resolve(order),
    );
    products.findOne.mockResolvedValue({
      id: productId,
      name: 'Hambúrguer',
      isActive: ProductStatusEnum.ACTIVED,
      price: '25.00',
      promoPrice: '22.50',
      images: [],
    });
  });

  it('salva delivery com endereço no próprio pedido, sem usuário ou endereço cadastrado', async () => {
    const response = await service.createAdmin(payload());
    expect(response.userId).toBeNull();
    expect(response.tableId).toBeNull();
    expect(response.mesaId).toBeNull();
    expect(response.paymentMethod).toBeNull();
    expect(response.deliveryAddress).toEqual(address);
    expect(response.addressId).toBeUndefined();
    expect(addressRepo.findOne).not.toHaveBeenCalled();
    expect(addressRepo.save).not.toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(
      OrderEntity,
      expect.objectContaining({ type: OrderType.DELIVERY, tab: null }),
    );
    expect(chat.create).not.toHaveBeenCalled();
    expect(gateway.notifyNewOrder).toHaveBeenCalledWith(response);
  });

  it('consulta o produto e calcula preços no servidor', async () => {
    const response = await service.createAdmin(payload());
    expect(products.findOne).toHaveBeenCalledWith(productId, manager);
    expect(response.total).toBe('45.00');
    expect(response.subtotal).toBe('45.00');
    expect(response.items[0]).toMatchObject({
      productId,
      quantity: 2,
      unitPrice: 22.5,
      totalPrice: 45,
    });
  });

  it('agrupa produtos repetidos pela quantidade', async () => {
    const dto = payload();
    dto.items.push({ productId, quantity: 1 });
    const response = await service.createAdmin(dto);
    expect(response.items).toHaveLength(1);
    expect(response.items[0].quantity).toBe(3);
    expect(response.total).toBe('67.50');
  });

  it('salva retirada sem mesa, usuário ou endereço', async () => {
    const response = await service.createAdmin({
      type: OrderType.PICKUP,
      items: [{ productId, quantity: 1 }],
    });
    expect(response.type).toBe(OrderType.PICKUP);
    expect(response.customerName).toBe('Retirada no balcão');
    expect(response.userId).toBeNull();
    expect(response.deliveryAddress).toBeNull();
    expect(gateway.notifyNewOrder).toHaveBeenCalledWith(response);
  });

  it('não salva produto inativo', async () => {
    products.findOne.mockResolvedValue({
      id: productId,
      name: 'Produto',
      isActive: ProductStatusEnum.DISABLED,
    });
    await expect(service.createAdmin(payload())).rejects.toThrow(
      'indisponível',
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(gateway.notifyNewOrder).not.toHaveBeenCalled();
  });

  it('não salva quando um produto não existe', async () => {
    products.findOne.mockRejectedValue(new Error('Produto não encontrado'));
    await expect(service.createAdmin(payload())).rejects.toThrow(
      'Produto não encontrado',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('exige dados de entrega e rejeita endereço para retirada', async () => {
    await expect(
      service.createAdmin({ ...payload(), deliveryAddress: undefined }),
    ).rejects.toThrow('endereço');
    await expect(
      service.createAdmin({ ...payload(), type: OrderType.PICKUP }),
    ).rejects.toThrow('Retirada');
    expect(repo.manager.transaction).not.toHaveBeenCalled();
  });
});
