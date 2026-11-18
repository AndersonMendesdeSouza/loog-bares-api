import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminOrderRequestDto } from './create-admin-order-request.dto';
import { OrderType } from '../enums/table-enums';

describe('CreateAdminOrderRequestDto', () => {
  const items = [
    { productId: '00000000-0000-4000-8000-000000000001', quantity: 2 },
  ];
  const address = {
    street: 'Rua 1',
    number: '10',
    neighborhood: 'Centro',
    city: 'Buriti Alegre',
    state: 'GO',
    zipCode: '75660-000',
  };
  const delivery = {
    type: OrderType.DELIVERY,
    customerName: 'Cliente',
    customerPhone: '64999999687',
    deliveryAddress: address,
    items,
  };

  async function errors(payload: object) {
    const dto = plainToInstance(CreateAdminOrderRequestDto, payload);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  }

  it('aceita retirada sem endereço e sem dados de usuário', async () => {
    expect(await errors({ type: OrderType.PICKUP, items })).toHaveLength(0);
  });

  it('aceita delivery com cliente, endereço e IDs dos produtos', async () => {
    expect(await errors(delivery)).toHaveLength(0);
  });

  it.each([
    { ...delivery, deliveryAddress: undefined },
    { ...delivery, deliveryAddress: null },
    { ...delivery, deliveryAddress: { ...address, street: '' } },
    { ...delivery, customerName: undefined },
    { ...delivery, customerName: '  ' },
    { ...delivery, customerPhone: undefined },
    { ...delivery, customerPhone: '123' },
    { ...delivery, items: [] },
    { ...delivery, items: [{ productId: items[0].productId, quantity: 0 }] },
    { ...delivery, items: [{ productId: 'inválido', quantity: 1 }] },
    { ...delivery, type: OrderType.DINE_IN },
    { ...delivery, userId: '00000000-0000-4000-8000-000000000002' },
    { ...delivery, total: 0.01 },
    { ...delivery, items: [{ ...items[0], unitPrice: 0.01 }] },
  ])('rejeita dados inválidos ou campos extras: %j', async (payload) => {
    expect((await errors(payload)).length).toBeGreaterThan(0);
  });
});
