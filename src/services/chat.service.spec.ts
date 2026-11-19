import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { ChatService } from './chat.service';
import { MessageGateway } from '../websocket/message.gateway';
import { ChatEntity } from '../entities/chat.entity';
import { ChatMessageEntity } from '../entities/chat-messages.entity';
import { OrderEntity } from '../entities/order.entity';
import { UserRole } from '../dtos/enums/user-role.enum';
import { ChatMessageSenderType } from '../dtos/enums/chat-message-sender-type.enum';

describe('Notificação de mensagem salva', () => {
  let service: ChatService;
  const chatRepo = { findOne: jest.fn() };
  const messageRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const emit = jest.fn();
  const user = {
    id: 'customer-id',
    email: 'cliente@example.com',
    role: UserRole.CUSTOMER,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    const gateway = new MessageGateway();
    gateway.server = { emit } as unknown as Server;
    service = new ChatService(
      chatRepo as unknown as Repository<ChatEntity>,
      messageRepo as unknown as Repository<ChatMessageEntity>,
      {} as Repository<OrderEntity>,
      gateway,
    );
    chatRepo.findOne.mockResolvedValue({ id: 'chat-id', orderId: 'order-id' });
    messageRepo.create.mockImplementation(
      (data: Partial<ChatMessageEntity>) => data,
    );
    messageRepo.save.mockImplementation((data: Partial<ChatMessageEntity>) =>
      Promise.resolve({
        ...data,
        id: 'message-id',
        createdAt: new Date('2026-11-18T12:00:00Z'),
      }),
    );
    messageRepo.findOne.mockResolvedValue(null);
  });

  it('autoriza, salva e só depois emite o ID do pedido e a mensagem confirmada', async () => {
    const response = await service.createMessage(
      { chatId: 'chat-id', text: '  Sem cebola  ' },
      user,
    );
    expect(response.text).toBe('Sem cebola');
    expect(response.id).toBe('message-id');
    expect(chatRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chat-id', order: { userId: user.id } },
      }),
    );
    expect(emit).toHaveBeenCalledWith('message.created', {
      orderId: 'order-id',
      message: {
        id: 'message-id',
        chatId: 'chat-id',
        text: 'Sem cebola',
        senderType: ChatMessageSenderType.CUSTOMER,
        createdAt: new Date('2026-11-18T12:00:00Z'),
      },
    });
    expect(messageRepo.save.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0],
    );
  });

  it('não transmite mensagem de um chat ao qual o cliente não tem acesso', async () => {
    chatRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createMessage({ chatId: 'another-chat', text: 'Olá' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(messageRepo.save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('não transmite mensagens vazias ou que falharam no banco', async () => {
    await expect(
      service.createMessage({ chatId: 'chat-id', text: '   ' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    messageRepo.save.mockRejectedValueOnce(
      new Error('Falha simulada no banco'),
    );
    await expect(
      service.createMessage({ chatId: 'chat-id', text: 'Olá' }, user),
    ).rejects.toThrow('Falha simulada no banco');
    expect(emit).not.toHaveBeenCalled();
  });

  it('identifica respostas do admin e não inclui dados pessoais do remetente no evento', async () => {
    messageRepo.findOne.mockResolvedValue({
      id: 'admin-message',
      chatId: 'chat-id',
      text: 'Já estamos preparando',
      senderId: 'admin-id',
      senderType: ChatMessageSenderType.ADMIN,
      sender: {
        id: 'admin-id',
        name: 'Atendente',
        email: 'privado@example.com',
        phone: '64999999999',
      },
      createdAt: new Date(),
    });
    await service.createMessage(
      { chatId: 'chat-id', text: 'Já estamos preparando' },
      { ...user, id: 'admin-id', role: UserRole.ADMIN },
    );
    const payload = emit.mock.calls[0][1] as {
      message: Record<string, unknown>;
    };
    expect(payload.message.senderType).toBe(ChatMessageSenderType.ADMIN);
    expect(payload.message).not.toHaveProperty('sender');
    expect(payload.message).not.toHaveProperty('senderId');
  });
});
