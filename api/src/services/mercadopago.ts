// Wrapper sobre el SDK oficial de Mercado Pago.
// Solo lo que necesitamos para Checkout Pro: crear preference + buscar pago.
import { MercadoPagoConfig, Preference, Payment, PaymentRefund } from 'mercadopago';
import { config } from '../config.js';

const mpClient = new MercadoPagoConfig({
  accessToken: config.MP_ACCESS_TOKEN,
  options: {
    timeout: 10_000,
    integratorId: config.MP_INTEGRATOR_ID || undefined,
  },
});

const preferenceApi = new Preference(mpClient);
const paymentApi = new Payment(mpClient);
const refundApi = new PaymentRefund(mpClient);

export interface CreatePreferenceInput {
  orderPublicId: string;             // UUID de la orden interna
  title: string;                     // descripción del producto (ej: "Cena Show VIP — Casa Emblema")
  totalArs: number;                  // monto total en pesos argentinos
  quantityAdults: number;
  quantityChildren: number;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  metadata: {
    order_id: number;
    seller_ref: string | null;
    option_id: number;
    product_slug: string;
    service_date: string;
  };
  webOrigin: string;                  // URL de retorno del frontend
}

export async function createPreference(input: CreatePreferenceInput): Promise<{ id: string; init_point: string; sandbox_init_point: string }> {
  const totalQty = input.quantityAdults + input.quantityChildren;
  if (totalQty < 1) throw new Error('Quantity must be at least 1');

  // MP exige back_urls públicos con HTTPS para usar auto_return.
  // En desarrollo (localhost / ngrok http) lo desactivamos para que la preference
  // se cree igual; el usuario vuelve manualmente con el botón "Volver al sitio".
  const isLocalOrigin = /localhost|127\.0\.0\.1|192\.168\./.test(input.webOrigin);

  // MP recomienda 1 item por cobro con quantity y unit_price.
  // Como el precio adulto y menor pueden diferir, mandamos el TOTAL como un solo item
  // y la cantidad como 1, para que el desglose sea preciso. La cantidad real va en metadata.
  const result = await preferenceApi.create({
    body: {
      external_reference: input.orderPublicId,
      items: [
        {
          id: input.metadata.product_slug,
          title: input.title,
          quantity: 1,
          unit_price: input.totalArs,
          currency_id: 'ARS',
        },
      ],
      payer: {
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone ? { number: input.customer.phone } : undefined,
      },
      back_urls: {
        success: `${input.webOrigin}/checkout/success?order=${input.orderPublicId}`,
        failure: `${input.webOrigin}/checkout/failure?order=${input.orderPublicId}`,
        pending: `${input.webOrigin}/checkout/pending?order=${input.orderPublicId}`,
      },
      ...(isLocalOrigin ? {} : { auto_return: 'approved' as const }),
      notification_url: `${process.env.WEBHOOK_PUBLIC_URL ?? input.webOrigin}/api/checkout/webhook`,
      statement_descriptor: 'TANGOS Y MILONGAS',
      metadata: input.metadata,
      binary_mode: false,
    },
  });

  if (!result.id || !result.init_point) {
    throw new Error('MP preference response missing id/init_point');
  }
  return {
    id: result.id,
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point ?? result.init_point,
  };
}

export async function fetchPayment(paymentId: string) {
  return paymentApi.get({ id: paymentId });
}

/**
 * Refund completo o parcial de un pago.
 * Si amount es undefined, refund total. Si es número, refund parcial por ese monto en ARS.
 *
 * MP devuelve un objeto con el refund creado. Si el pago era con tarjeta, los fondos
 * vuelven a la tarjeta en 2-5 días hábiles. Si era efectivo/transferencia, depende del medio.
 */
export async function refundPayment(paymentId: string, amount?: number) {
  if (amount != null) {
    return refundApi.create({
      payment_id: paymentId,
      body: { amount },
    });
  }
  return refundApi.create({ payment_id: paymentId });
}

export type MpPaymentStatus =
  | 'approved'
  | 'pending'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back';

export function mapMpStatusToOrderStatus(mpStatus: string | null | undefined):
  'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' {
  switch (mpStatus) {
    case 'approved':
    case 'authorized':
      return 'paid';
    case 'rejected':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    case 'pending':
    case 'in_process':
    case 'in_mediation':
    default:
      return 'pending';
  }
}
