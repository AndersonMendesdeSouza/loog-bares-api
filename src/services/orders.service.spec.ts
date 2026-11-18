import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentMethodEnum } from '../dtos/enums/payment-method.enum';
import { UserRole } from '../dtos/enums/user-role.enum';
import { OrderRequestDto } from '../dtos/request/order-request.dto';
import { AddressEntity } from '../entities/address.entity';
import { OrderEntity } from '../entities/order.entity';
import { ChatService } from './chat.service';
import { OrdersService } from './orders.service';
import { MessageService } from './message.service';
import { OrderStatusEnum } from '../dtos/enums/order-status.enum';
import {
  createGuestOrderToken,
  verifyGuestOrderToken,
} from '../utils/guest-order-token';
import { IsNull } from 'typeorm';
import { ProductsService } from './products.service';
import { TableEntity } from '../entities/table.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  const originalGuestSecret = process.env.GUEST_ORDER_SECRET;

  const user = {
    id: 'customer-id',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
  };
  const address = { id: 'address-id', userId: user.id };
  const orderRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const addressRepo = { findOne: jest.fn() };
  const tableRepo = { findOne: jest.fn() };
  const chatService = { create: jest.fn() };
  const messageService = { sendMessage: jest.fn() };

  function createPayload(): OrderRequestDto {
    return {
      mesaId: ' 12 ',
      paymentMethod: PaymentMethodEnum.PIX,
      customerName: 'Cliente',
      customerPhone: '11999999999',
      subtotal: 25,
      deliveryFee: 0,
      discount: 0,
      total: 25,
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

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.GUEST_ORDER_SECRET = 'guest-order-test-secret';

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
        { provide: getRepositoryToken(AddressEntity), useValue: addressRepo },
        { provide: getRepositoryToken(TableEntity), useValue: tableRepo },
        { provide: ChatService, useValue: chatService },
        { provide: MessageService, useValue: messageService },
        { provide: ProductsService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get(OrdersService);
    orderRepo.create.mockImplementation((dto: Partial<OrderEntity>) =>
      Object.assign(new OrderEntity(), dto, { id: dto.id || 'order-id' }),
    );
    orderRepo.save.mockImplementation((order: OrderEntity) => {
      orderRepo.findOne.mockResolvedValue(order);
      return Promise.resolve(order);
    });
    orderRepo.findOne.mockResolvedValue({ id: 'order-id', userId: user.id });
    addressRepo.findOne.mockResolvedValue(address);
    tableRepo.findOne.mockResolvedValue({
      id: 'table-id',
      number: 12,
      isActive: true,
    });
    messageService.sendMessage.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalGuestSecret === undefined) {
      delete process.env.GUEST_ORDER_SECRET;
    } else {
      process.env.GUEST_ORDER_SECRET = originalGuestSecret;
    }
  });

  it('aceita entrega sem login com endereço enviado no pedido', async () => {
    const deliveryAddress = {
      street: 'Rua 1',
      number: '10',
      block: '2',
      lot: '3',
      neighborhood: 'Centro',
      city: 'Buriti Alegre',
      state: 'GO',
      zipCode: '75660-000',
    };
    const dto = { ...createPayload(), mesaId: undefined, deliveryAddress };
    const response = await service.create(dto);
    expect(response.userId).toBeNull();
    expect(response.deliveryAddress).toEqual(deliveryAddress);
    expect(response.guestToken).toEqual(expect.any(String));
    expect(addressRepo.findOne).not.toHaveBeenCalled();
    expect(chatService.create).not.toHaveBeenCalled();
    expect(orderRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: response.id, userId: IsNull() } }),
    );
  });

  it('rejeita addressId e deliveryAddress juntos', async () => {
    const dto = {
      ...createPayload(),
      mesaId: undefined,
      addressId: address.id,
      deliveryAddress: {
        street: 'Rua 1',
        number: '10',
        neighborhood: 'Centro',
        city: 'Buriti Alegre',
        state: 'GO',
        zipCode: '75660-000',
      },
    };
    await expect(service.create(dto, user)).rejects.toThrow(
      'addressId ou deliveryAddress',
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('valida a mesa pelo UUID e salva o relacionamento', async () => {
    const response = await service.create({
      ...createPayload(),
      mesaId: undefined,
      tableId: 'table-id',
    });
    expect(tableRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'table-id' },
    });
    expect(response.tableId).toBe('table-id');
    expect(response.mesaId).toBe('12');
  });

  it('rejeita mesa inexistente ou inativa', async () => {
    tableRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.create(createPayload())).rejects.toThrow(
      'Mesa não encontrada',
    );
    tableRepo.findOne.mockResolvedValueOnce({
      id: 'table-id',
      number: 12,
      isActive: false,
    });
    await expect(service.create(createPayload())).rejects.toThrow(
      'mesa está inativa',
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('valida também o número antigo contra as mesas cadastradas', async () => {
    await service.create(createPayload());
    expect(tableRepo.findOne).toHaveBeenCalledWith({ where: { number: 12 } });
  });

  it('creates a table order without looking up an address', async () => {
    await service.create(createPayload(), user);

    expect(addressRepo.findOne).not.toHaveBeenCalled();
    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mesaId: '12',
        addressId: undefined,
        address: undefined,
        userId: user.id,
        deliveryFee: 0,
        total: 25,
      }),
    );
    expect(orderRepo.save).toHaveBeenCalledTimes(1);
    expect(chatService.create).toHaveBeenCalledWith(
      { orderId: 'order-id' },
      user,
    );
  });

  it('creates a delivery order using only an address owned by the customer', async () => {
    const dto = createPayload();
    delete dto.mesaId;
    dto.addressId = address.id;
    dto.deliveryFee = 5;
    dto.total = 30;

    await service.create(dto, user);

    expect(addressRepo.findOne).toHaveBeenCalledWith({
      where: { id: address.id, userId: user.id },
    });
    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mesaId: null,
        addressId: address.id,
        address,
        deliveryFee: 5,
        total: 30,
      }),
    );
    expect(messageService.sendMessage).toHaveBeenCalledTimes(1);
    expect(messageService.sendMessage).toHaveBeenCalledWith(
      dto.customerPhone,
      expect.stringContaining('#order-id'),
    );
  });

  it('returns the saved order and logs the failure when WhatsApp is unavailable', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    messageService.sendMessage.mockRejectedValue(
      new Error('WhatsApp indisponível'),
    );

    try {
      const response = await service.create(createPayload(), user);

      expect(response.id).toBe('order-id');
      expect(orderRepo.save).toHaveBeenCalledTimes(1);
      expect(chatService.create).toHaveBeenCalledWith(
        { orderId: 'order-id' },
        user,
      );
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('WhatsApp indisponível'),
      );
    } finally {
      loggerError.mockRestore();
    }
  });

  it('does not send WhatsApp when saving the order fails', async () => {
    orderRepo.save.mockRejectedValue(new Error('Falha ao salvar pedido'));

    await expect(service.create(createPayload(), user)).rejects.toThrow(
      'Falha ao salvar pedido',
    );
    expect(messageService.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an order without a destination', async () => {
    const dto = createPayload();
    delete dto.mesaId;

    await expect(service.create(dto, user)).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(addressRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a table number containing only whitespace', async () => {
    const dto = createPayload();
    dto.mesaId = '   ';

    await expect(service.create(dto, user)).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an order with both a table and an address', async () => {
    const dto = createPayload();
    dto.addressId = address.id;

    await expect(service.create(dto, user)).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(addressRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a table order with a delivery fee', async () => {
    const dto = createPayload();
    dto.deliveryFee = 5;

    await expect(service.create(dto, user)).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a delivery address not found for the customer', async () => {
    const dto = createPayload();
    delete dto.mesaId;
    dto.addressId = address.id;
    addressRepo.findOne.mockResolvedValue(null);

    await expect(service.create(dto, user)).rejects.toThrow(NotFoundException);
    expect(addressRepo.findOne).toHaveBeenCalledWith({
      where: { id: address.id, userId: user.id },
    });
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('creates a table order without login, returns its access token and skips chat', async () => {
    const response = await service.create(createPayload());

    expect(response.userId).toBeNull();
    expect(response.mesaId).toBe('12');
    expect(response.guestToken).toEqual(expect.any(String));
    expect(messageService.sendMessage).toHaveBeenCalledTimes(1);
    expect(messageService.sendMessage).toHaveBeenCalledWith(
      createPayload().customerPhone,
      expect.stringContaining(`#${response.id}`),
    );
    expect(() =>
      verifyGuestOrderToken(response.guestToken!, response.id),
    ).not.toThrow();
    expect(chatService.create).not.toHaveBeenCalled();
    expect(addressRepo.findOne).not.toHaveBeenCalled();
    expect(orderRepo.findOne).toHaveBeenCalledWith({
      where: { id: response.id, userId: IsNull() },
      relations: { user: true, address: true, chat: false },
    });
  });

  it('rejects delivery without login before looking up any address or saving', async () => {
    const dto = createPayload();
    delete dto.mesaId;
    dto.addressId = address.id;

    await expect(service.create(dto)).rejects.toThrow(UnauthorizedException);
    expect(addressRepo.findOne).not.toHaveBeenCalled();
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a guest order before saving when its secret is not configured', async () => {
    delete process.env.GUEST_ORDER_SECRET;

    await expect(service.create(createPayload())).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('starts guest orders as received even if the client sends another status', async () => {
    const dto = createPayload();
    dto.status = OrderStatusEnum.DELIVERED;
    const response = await service.create(dto);

    expect(response.status).toBe(OrderStatusEnum.RECEIVED);
  });

  it('rejects reading an order without login or an access token', async () => {
    await expect(service.findById('order-id')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(orderRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects using a valid guest token to read another order', async () => {
    const token = createGuestOrderToken('first-order');

    await expect(
      service.findById('second-order', undefined, token),
    ).rejects.toThrow(UnauthorizedException);
    expect(orderRepo.findOne).not.toHaveBeenCalled();
  });

  it('restricts guest queries to the signed order with no account owner', async () => {
    const token = createGuestOrderToken('order-id');
    orderRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findById('order-id', undefined, token),
    ).rejects.toThrow(NotFoundException);
    expect(orderRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'order-id', userId: IsNull() },
      relations: { user: true, address: true, table: true, chat: false },
    });
  });

  it('allows a guest to cancel their own order with its token', async () => {
    const token = createGuestOrderToken('order-id');
    orderRepo.findOne.mockResolvedValue({
      id: 'order-id',
      userId: null,
      mesaId: '12',
      status: OrderStatusEnum.RECEIVED,
      history: [],
    });

    const response = await service.alterStatus(
      'order-id',
      { status: OrderStatusEnum.CANCELED },
      undefined,
      token,
    );

    expect(response.status).toBe(OrderStatusEnum.CANCELED);
    expect(orderRepo.save).toHaveBeenCalledTimes(1);
    expect(chatService.create).not.toHaveBeenCalled();
  });

  it('rejects using a guest token to cancel another order', async () => {
    const token = createGuestOrderToken('first-order');

    await expect(
      service.alterStatus(
        'second-order',
        { status: OrderStatusEnum.CANCELED },
        undefined,
        token,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(orderRepo.findOne).not.toHaveBeenCalled();
  });

  it('does not allow guests to advance the preparation status', async () => {
    const token = createGuestOrderToken('order-id');

    await expect(
      service.alterStatus(
        'order-id',
        { status: OrderStatusEnum.PREPARING },
        undefined,
        token,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('does not allow guests to cancel a delivered order', async () => {
    const token = createGuestOrderToken('order-id');
    orderRepo.findOne.mockResolvedValue({
      id: 'order-id',
      status: OrderStatusEnum.DELIVERED,
    });

    await expect(
      service.alterStatus(
        'order-id',
        { status: OrderStatusEnum.CANCELED },
        undefined,
        token,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('still scopes authenticated customers to their own orders', async () => {
    await service.findById('order-id', user);

    expect(orderRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-id', userId: user.id },
      }),
    );
  });

  it('still allows administrators to query a guest order', async () => {
    await service.findById('order-id', { ...user, role: UserRole.ADMIN });

    expect(orderRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-id' },
      }),
    );
  });
});
