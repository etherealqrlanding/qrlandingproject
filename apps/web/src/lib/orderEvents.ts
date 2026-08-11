// Traduce los event_type internos (payment_events) a pasos legibles para el histórico
// de la orden. Los eventos de ruido (webhooks crudos, firmas) devuelven null y se ocultan.

export type EventTone = 'neutral' | 'good' | 'bad' | 'warn';

const LABELS: Record<string, { label: string; tone: EventTone }> = {
  preference_created: { label: 'Link de pago generado', tone: 'neutral' },
  preference_created_by_seller: { label: 'Link de pago generado (recomendador)', tone: 'neutral' },
  cash_order_created: { label: 'Reserva registrada (efectivo)', tone: 'neutral' },
  cash_order_created_by_seller: { label: 'Reserva registrada por el recomendador (efectivo)', tone: 'neutral' },
  cash_order_created_by_admin: { label: 'Reserva creada por el equipo (efectivo, a nombre de recomendador)', tone: 'neutral' },
  preference_created_by_admin: { label: 'Link de pago generado por el equipo (a nombre de recomendador)', tone: 'neutral' },
  order_paid: { label: 'Pago confirmado', tone: 'good' },
  order_pending: { label: 'Pago pendiente', tone: 'warn' },
  order_failed: { label: 'Pago rechazado', tone: 'bad' },
  order_cancelled: { label: 'Cancelada', tone: 'bad' },
  order_refunded: { label: 'Reintegrada', tone: 'bad' },
  cash_collected_by_seller: { label: 'Cobro en efectivo confirmado', tone: 'good' },
  cash_collected_by_admin: { label: 'Cobro en efectivo confirmado (admin)', tone: 'good' },
  order_rescheduled: { label: 'Fecha reprogramada', tone: 'warn' },
  order_modified: { label: 'Reserva modificada', tone: 'neutral' },
  order_increased_cash: { label: 'Ampliación cobrada (efectivo)', tone: 'good' },
  addon_paid: { label: 'Ampliación pagada (Mercado Pago)', tone: 'good' },
  addon_cash_collected: { label: 'Ampliación cobrada en efectivo', tone: 'good' },
  addon_cash_created: { label: 'Ampliación registrada (pendiente de cobro)', tone: 'neutral' },
  addon_expired_auto: { label: 'Ampliación caducada', tone: 'warn' },
  refund_processed: { label: 'Reintegro total procesado', tone: 'bad' },
  refund_partial_processed: { label: 'Reintegro parcial procesado', tone: 'warn' },
  refund_failed: { label: 'Reintegro rechazado por MP', tone: 'bad' },
  modify_refund_failed: { label: 'Reintegro de modificación rechazado', tone: 'bad' },
  order_expired_auto: { label: 'Caducada por falta de pago', tone: 'warn' },
  admin_status_change: { label: 'Cambio de estado manual (admin)', tone: 'neutral' },
  attribution_set_by_admin: { label: 'Venta asignada por admin', tone: 'neutral' },
  attribution_set_by_member: { label: 'Venta autoasignada', tone: 'neutral' },
};

export interface OrderEvent {
  id: number;
  event_type: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export function eventDisplay(type: string): { label: string; tone: EventTone } | null {
  return LABELS[type] ?? null;
}
