/**
 * Mock "lookupOrderStatus" tool used by the billing specialist.
 *
 * In a real system this would call an orders microservice or DB. It is a
 * Nest provider, so swapping the mock for a real HTTP client means changing
 * only this class - the agent code does not change.
 */
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AgentTool } from './tool.types';

const argsSchema = z.object({
  orderId: z
    .string()
    .regex(/^ORD-\d{4,}$/, 'orderId must look like ORD-1234'),
});

/** Fake data. Deterministic so tests and demos are reproducible. */
const ORDERS: Record<string, Record<string, unknown>> = {
  'ORD-1001': { status: 'delivered', amount: 49.99, currency: 'EUR', chargedTwice: false, deliveredAt: '2026-10-02' },
  'ORD-1002': { status: 'refund_pending', amount: 120.0, currency: 'EUR', chargedTwice: true, refundEta: '3-5 business days' },
  'ORD-1003': { status: 'shipped', amount: 15.5, currency: 'EUR', chargedTwice: false, carrier: 'DHL', eta: '2026-10-22' },
};

@Injectable()
export class OrderStatusTool implements AgentTool {
  private readonly logger = new Logger(OrderStatusTool.name);

  readonly declaration = {
    name: 'lookupOrderStatus',
    description:
      'Look up the current status, amount and payment details of a customer order. ' +
      'Call this whenever the customer mentions an order ID (format ORD-1234) or asks about a charge, refund or delivery for a specific order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order identifier, e.g. ORD-1002' },
      },
      required: ['orderId'],
    },
  };

  async execute(rawArgs: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Validate model-produced args exactly like we would validate an HTTP body.
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      // Returning the error (instead of throwing) lets the model self-correct
      // or explain to the customer - this is part of the agent loop.
      return { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
    }
    const order = ORDERS[parsed.data.orderId];
    this.logger.debug(`lookupOrderStatus(${parsed.data.orderId}) -> ${order ? 'found' : 'not found'}`);
    return order ? { orderId: parsed.data.orderId, ...order } : { error: `Order ${parsed.data.orderId} not found` };
  }
}
