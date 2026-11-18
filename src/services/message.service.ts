import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  async sendMessage(phone: string, message: string) {
    const baseUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE;

    if (!baseUrl || !apiKey || !instance) {
      this.logger.error('Evolution API não configurada');
      return;
    }

    let number = phone.replace(/\D/g, '');

    if (number.length === 10 || number.length === 11) {
      number = `55${number}`;
    }

    try {
      const response = await fetch(
        `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`,
        {
          method: 'POST',
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            text: message,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(
          `Erro Evolution API (${response.status}): ${error}`,
        );
        return;
      }

      return await response.json();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error(`Falha ao enviar mensagem WhatsApp: ${reason}`);
    }
  }
}
