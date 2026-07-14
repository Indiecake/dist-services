import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { CreateOrderItem } from '@services-sandbox/contracts/http/create-order';

import { orderItems, orderStatusHistory, orders } from './schema.ts';

export interface CreateOrderRecordInput {
  customerId: string;
  currency: string;
  status: string;
  totalAmountCents: number;
  items: CreateOrderItem[];
}

export interface OrderItemRecord {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderStatusHistoryRecord {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  reason: string | null;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  status: string;
  currency: string;
  totalAmountCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
  statusHistory: OrderStatusHistoryRecord[];
}

export class OrderRepository {
  private readonly db: NodePgDatabase;

  constructor(db: NodePgDatabase) {
    this.db = db;
  }

  async createOrder(input: CreateOrderRecordInput): Promise<OrderRecord> {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          customerId: input.customerId,
          status: input.status,
          currency: input.currency,
          totalAmountCents: input.totalAmountCents
        })
        .returning();

      const insertedItems = await tx
        .insert(orderItems)
        .values(
          input.items.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents
          }))
        )
        .returning();

      const [statusHistory] = await tx
        .insert(orderStatusHistory)
        .values({
          orderId: order.id,
          fromStatus: null,
          toStatus: input.status,
          reason: null
        })
        .returning();

      return {
        id: order.id,
        customerId: order.customerId,
        status: order.status,
        currency: order.currency,
        totalAmountCents: order.totalAmountCents,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: insertedItems.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents
        })),
        statusHistory: [
          {
            id: statusHistory.id,
            fromStatus: statusHistory.fromStatus,
            toStatus: statusHistory.toStatus,
            changedAt: statusHistory.changedAt,
            reason: statusHistory.reason
          }
        ]
      };
    });
  }

  async findById(orderId: string): Promise<OrderRecord | null> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

    if (!order) {
      return null;
    }

    const items = await this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const statusHistory = await this.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId));

    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      currency: order.currency,
      totalAmountCents: order.totalAmountCents,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents
      })),
      statusHistory: statusHistory.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        changedAt: entry.changedAt,
        reason: entry.reason
      }))
    };
  }
}
