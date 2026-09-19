export const RESERVATION_STATUSES = Object.freeze({
  RESERVED: 'RESERVED',
  FAILED: 'FAILED',
  RELEASED: 'RELEASED',
  RELEASE_FAILED: 'RELEASE_FAILED'
} as const);

export type ReservationStatus =
  (typeof RESERVATION_STATUSES)[keyof typeof RESERVATION_STATUSES];

export const SERVICE_NAME = 'inventory-service';

export const SUPPORTED_MESSAGE_VERSION = 1;

export const WORKFLOW_STEPS = Object.freeze({
  INVENTORY_PROCESSING: 'inventory_processing',
  INVENTORY_RESERVED: 'inventory_reserved',
  INVENTORY_RESERVATION_FAILED: 'inventory_reservation_failed',
  INVENTORY_RELEASED: 'inventory_released',
  INVENTORY_RELEASE_FAILED: 'inventory_release_failed',
  INVENTORY_DEADLETTERED: 'inventory_deadlettered'
} as const);

export interface LineItem {
  productId: string;
  quantity: number;
}

export interface ReservationSnapshot {
  id: string;
  orderId: string;
  status: ReservationStatus;
  failureReason: string | null;
  reservedAt: string | null;
  releasedAt: string | null;
  items: LineItem[];
}

export interface ResultEventDecision {
  type: string;
  payload: Record<string, unknown>;
  workflowStep: string;
}
