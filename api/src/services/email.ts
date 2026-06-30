import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { pool } from '../db.js';

// Transporte preferido: SMTP (ej. Gmail) si está configurado. Mandar vía el SMTP del
// proveedor del remitente (Gmail) mantiene SPF/DKIM/DMARC alineados → buena entregabilidad
// sin dominio propio. Si no hay SMTP, caemos a Resend (requiere dominio verificado).
const smtpTransport =
  config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT ?? 465,
        secure: (config.SMTP_PORT ?? 465) === 465, // 465 = SSL; 587 = STARTTLS
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      })
    : null;

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

export type EmailTransport = 'smtp' | 'resend' | 'none';

export function activeTransport(): EmailTransport {
  if (smtpTransport) return 'smtp';
  if (resend) return 'resend';
  return 'none';
}

function isEnabled(): boolean {
  return activeTransport() !== 'none';
}

export interface SendResult {
  sent: boolean;
  transport: EmailTransport;
  error?: string;
}

/**
 * Envía un email por el transporte activo. Nunca lanza: devuelve { sent, error } para que
 * quien llama decida si avisar al usuario. Loguea siempre el fallo.
 */
async function send(to: string | string[], subject: string, html: string): Promise<SendResult> {
  const transport = activeTransport();
  const recipients = Array.isArray(to) ? to : [to];

  if (transport === 'none') {
    console.warn(`[email] Sin transporte configurado (SMTP/Resend). No se envió "${subject}" a ${recipients.join(', ')}`);
    return { sent: false, transport, error: 'No hay transporte de email configurado.' };
  }

  try {
    if (transport === 'smtp') {
      await smtpTransport!.sendMail({ from: config.EMAIL_FROM, to: recipients, subject, html });
      return { sent: true, transport };
    }
    const { error } = await resend!.emails.send({ from: config.EMAIL_FROM, to: recipients, subject, html });
    if (error) {
      console.error('[email] Resend error:', error);
      return { sent: false, transport, error: error.message ?? String(error) };
    }
    return { sent: true, transport };
  } catch (err) {
    console.error('[email] Send failed:', err);
    return { sent: false, transport, error: (err as Error).message };
  }
}

// ─── Templates ───────────────────────────────────────────
// HTML simple, dark theme inline-style para que se vea correcto en Gmail/Outlook.

interface OrderEmailData {
  public_id: string;
  customer_name: string;
  customer_email: string;
  total_usd: number;
  total_ars: number;
  product_name: string;
  option_name: string;
  service_date: string;
  adults: number;
  children: number;
  mp_payment_id: string | null;
}

const baseStyles = {
  body: 'margin:0;padding:0;background:#0d0a0a;font-family:Inter,Arial,sans-serif;color:#f5efe6;',
  container: 'max-width:600px;margin:0 auto;padding:40px 24px;',
  title: 'font-family:Georgia,serif;color:#c8a85a;font-size:32px;margin:0;letter-spacing:0.5px;',
  eyebrow: 'color:#e0c787;text-transform:uppercase;letter-spacing:3px;font-size:11px;margin:0 0 8px;',
  card: 'background:rgba(255,255,255,0.04);border:1px solid rgba(200,168,90,0.15);border-radius:12px;padding:24px;margin:24px 0;',
  row: 'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(200,168,90,0.08);',
  footer: 'color:rgba(245,239,230,0.4);font-size:12px;text-align:center;margin-top:40px;',
};

function htmlForCustomer(data: OrderEmailData): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Buenos Aires</p>
  <h1 style="${baseStyles.title}">¡Reserva confirmada!</h1>
  <p>Hola ${escapeHtml(data.customer_name)}, recibimos tu pago para una experiencia inolvidable en Buenos Aires.</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Detalles de tu reserva</p>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(data.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(data.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pasajeros</span><strong>${data.adults} adulto(s)${data.children > 0 ? ` · ${data.children} menor(es)` : ''}</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">USD ${data.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${data.public_id}</span></div>
  </div>
  <p>Te vamos a contactar en las próximas horas con los detalles del traslado y horarios definitivos. Si tenés cualquier consulta, respondé este email o escribinos por WhatsApp.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
}

function htmlForAdmin(data: OrderEmailData & { seller_name?: string | null; seller_code?: string | null; commission_usd?: number | null }): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Admin</p>
  <h1 style="${baseStyles.title}">Nueva venta confirmada</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(data.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(data.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(data.option_name)} — ${escapeHtml(data.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pax</span><strong>${data.adults} ad · ${data.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Total USD</span><strong style="color:#c8a85a">USD ${data.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Total ARS</span><strong>ARS ${data.total_ars.toLocaleString('es-AR')}</strong></div>
    <div style="${baseStyles.row}"><span>MP Payment</span><span style="font-family:monospace;font-size:11px">${data.mp_payment_id ?? '—'}</span></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${data.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Atribución a vendedor</p>
    <div style="${baseStyles.row}"><span>Vendedor</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    <div style="${baseStyles.row}"><span>Comisión a pagar</span><strong style="color:#c8a85a">USD ${data.commission_usd ?? 0}</strong></div>
  </div>` : ''}
  <p style="${baseStyles.footer}">Notificación automática · Ethereal Tours admin</p>
</div></body></html>`;
}

function htmlForSellerRefund(data: OrderEmailData & {
  seller_name: string; commission_usd: number; reason?: string | null; is_partial?: boolean;
}): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Vendedores</p>
  <h1 style="${baseStyles.title}">Una venta tuya fue cancelada</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, te avisamos que una venta atribuida a tu código fue ${data.is_partial ? 'reintegrada parcialmente' : 'cancelada y reintegrada al cliente'}${data.reason ? ` — ${escapeHtml(data.reason)}` : ''}.</p>
  ${data.is_partial
    ? `<p>La comisión correspondiente a esta venta se ajustará proporcionalmente.</p>`
    : `<p><strong>La comisión de USD ${data.commission_usd} que correspondía a esta venta ya no aplica.</strong></p>`}
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio cancelado</span><strong>${escapeHtml(data.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(data.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Cliente</span><span>${escapeHtml(data.customer_name)}</span></div>
    <div style="${baseStyles.row}"><span>Fecha solicitada</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Comisión que no aplica</span><strong style="color:#c8a85a">USD ${data.commission_usd}</strong></div>
  </div>
  <p>Cualquier consulta sobre tus ventas o pagos, escribinos.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
}

function htmlForRefund(data: OrderEmailData & { reason?: string | null }): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Tu reserva fue cancelada</h1>
  <p>Hola ${escapeHtml(data.customer_name)}, lamentamos comunicarte que no pudimos confirmar tu reserva${data.reason ? ` — ${escapeHtml(data.reason)}` : ''}.</p>
  <p><strong style="color:#c8a85a">Te reintegramos el monto completo: USD ${data.total_usd}</strong>. El reintegro tarda entre 2 y 5 días hábiles en aparecer en el medio de pago original.</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Reserva cancelada</p>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(data.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(data.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha solicitada</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Monto a reintegrar</span><strong style="color:#c8a85a">USD ${data.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${data.public_id}</span></div>
  </div>
  <p>Si querés reservar otra fecha u otra casa, escribinos por WhatsApp o respondé este email y te ayudamos a coordinar.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
}

function htmlForSeller(data: OrderEmailData & { seller_name: string; commission_usd: number; commission_percent: number }): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Vendedores</p>
  <h1 style="${baseStyles.title}">¡Tenés una nueva venta!</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, un cliente que escaneó tu QR acaba de comprar una experiencia. Te corresponde una comisión.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio vendido</span><strong>${escapeHtml(data.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Valor de la venta</span><strong>USD ${data.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Tu comisión (${data.commission_percent}%)</span><strong style="color:#c8a85a;font-size:18px">USD ${data.commission_usd}</strong></div>
  </div>
  <p>Vamos a procesar el pago de tu comisión junto con las del próximo período. Cualquier consulta sobre tus ventas o pagos, escribinos.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ─── Función principal: notifica los 3 destinatarios cuando una orden se paga ──
export async function sendOrderPaidNotifications(orderId: number): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) {
    console.warn('[email] Resend not configured; skipping notifications for order', orderId);
    return;
  }

  // Cargamos toda la data necesaria en una query
  const { rows } = await pool.query(
    `SELECT
       o.public_id, o.customer_name, o.customer_email,
       o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
       o.mp_payment_id,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       oi.adults, oi.children,
       s.name AS seller_name, s.code AS seller_code, s.contact_email AS seller_email,
       a.commission_amount_usd::float AS commission_usd,
       a.commission_percent_snapshot::float AS commission_percent
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN order_attributions a ON a.order_id = o.id
       LEFT JOIN sellers s ON s.id = a.seller_id
      WHERE o.id = $1
      LIMIT 1`,
    [orderId],
  );
  const data = rows[0];
  if (!data) return;

  const orderData: OrderEmailData = {
    public_id: data.public_id, customer_name: data.customer_name, customer_email: data.customer_email,
    total_usd: data.total_usd, total_ars: data.total_ars,
    product_name: data.product_name ?? 'Experiencia',
    option_name: data.option_name ?? 'Tier',
    service_date: data.service_date ?? '',
    adults: data.adults ?? 1, children: data.children ?? 0,
    mp_payment_id: data.mp_payment_id ?? null,
  };

  // 1) Cliente
  await send(
    data.customer_email,
    `✓ Reserva confirmada — ${orderData.option_name}`,
    htmlForCustomer(orderData),
  );

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    await send(
      config.ADMIN_NOTIFICATION_EMAIL,
      `Nueva venta — ${orderData.option_name} (USD ${orderData.total_usd})`,
      htmlForAdmin({
        ...orderData,
        seller_name: data.seller_name,
        seller_code: data.seller_code,
        commission_usd: data.commission_usd,
      }),
    );
  }

  // 3) Vendedor (si hay atribución y email)
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    await send(
      data.seller_email,
      `¡Nueva venta tuya! +USD ${data.commission_usd} de comisión`,
      htmlForSeller({
        ...orderData,
        seller_name: data.seller_name,
        commission_usd: data.commission_usd,
        commission_percent: data.commission_percent ?? 0,
      }),
    );
  }
}

// ─── Notificaciones de reserva en efectivo (pago al vendedor) ───────────────
export async function sendCashOrderNotifications(orderId: number): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(
    `SELECT
       o.public_id, o.customer_name, o.customer_email,
       o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
       o.mp_payment_id,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       oi.adults, oi.children,
       s.name AS seller_name, s.code AS seller_code, s.contact_email AS seller_email,
       a.commission_amount_usd::float AS commission_usd,
       a.commission_percent_snapshot::float AS commission_percent
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN order_attributions a ON a.order_id = o.id
     LEFT JOIN sellers s ON s.id = a.seller_id
    WHERE o.id = $1 LIMIT 1`,
    [orderId],
  );
  const data = rows[0];
  if (!data) return;

  const baseData: OrderEmailData = {
    public_id: data.public_id, customer_name: data.customer_name, customer_email: data.customer_email,
    total_usd: data.total_usd, total_ars: data.total_ars,
    product_name: data.product_name ?? 'Experiencia',
    option_name: data.option_name ?? 'Tier',
    service_date: data.service_date ?? '',
    adults: data.adults ?? 1, children: data.children ?? 0,
    mp_payment_id: null,
  };

  // El cliente NO recibe email aquí — se envía recién cuando el vendedor confirma el cobro
  // (ver sendCashCollectedNotifications)

  // 1) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Admin</p>
  <h1 style="${baseStyles.title}">Nueva reserva en efectivo</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(baseData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(baseData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)} — ${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pax</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Total USD</span><strong style="color:#c8a85a">USD ${baseData.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${baseData.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Vendedor que cobra</p>
    <div style="${baseStyles.row}"><span>Nombre</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    <div style="${baseStyles.row}"><span>Comisión estimada</span><strong style="color:#c8a85a">USD ${data.commission_usd ?? 0}</strong></div>
  </div>` : ''}
  <p style="color:rgba(245,239,230,0.7);">⚠ El email al pasajero se enviará <strong>automáticamente</strong> cuando el vendedor confirme el cobro desde su portal.</p>
  <p style="${baseStyles.footer}">Notificación automática · Ethereal Tours admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Efectivo] Nueva reserva — ${baseData.option_name} (USD ${baseData.total_usd})`, adminHtml);
  }

  // 3) Vendedor
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Vendedores</p>
  <h1 style="${baseStyles.title}">Tenés una reserva para cobrar</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, registramos una reserva a tu nombre. Coordiná el cobro con el cliente.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pasajeros</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Total a cobrar</span><strong style="color:#c8a85a;font-size:18px">USD ${baseData.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Tu comisión (${data.commission_percent ?? 0}%)</span><strong style="color:#c8a85a">USD ${data.commission_usd}</strong></div>
  </div>
  <p>Una vez que recibas el dinero del pasajero, confirmá el cobro desde tu portal para que se envíe el email de confirmación.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
    await send(data.seller_email, `Reserva para cobrar — ${baseData.option_name} (USD ${baseData.total_usd})`, sellerHtml);
  }
}

// ─── Cobro en efectivo confirmado por el vendedor ───────
export async function sendCashCollectedNotifications(orderId: number): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(
    `SELECT
       o.public_id, o.customer_name, o.customer_email,
       o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       oi.adults, oi.children,
       s.name AS seller_name, s.code AS seller_code, s.contact_email AS seller_email,
       a.commission_amount_usd::float AS commission_usd,
       a.commission_percent_snapshot::float AS commission_percent
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN order_attributions a ON a.order_id = o.id
     LEFT JOIN sellers s ON s.id = a.seller_id
    WHERE o.id = $1 LIMIT 1`,
    [orderId],
  );
  const data = rows[0];
  if (!data) return;

  const baseData: OrderEmailData = {
    public_id: data.public_id, customer_name: data.customer_name, customer_email: data.customer_email,
    total_usd: data.total_usd, total_ars: data.total_ars,
    product_name: data.product_name ?? 'Experiencia',
    option_name: data.option_name ?? 'Tier',
    service_date: data.service_date ?? '',
    adults: data.adults ?? 1, children: data.children ?? 0,
    mp_payment_id: null,
  };

  const adultLabel = `${baseData.adults} adulto${baseData.adults === 1 ? '' : 's'}`;
  const childLabel = baseData.children === 0 ? '' : ` · ${baseData.children} menor${baseData.children === 1 ? '' : 'es'}`;
  const paxSummary = `${adultLabel}${childLabel}`;

  // 1) Cliente — primera y única notificación que recibe
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Buenos Aires</p>
  <h1 style="${baseStyles.title}">¡Reserva confirmada!</h1>
  <p>Hola ${escapeHtml(baseData.customer_name)}, tu reserva está confirmada. ¡Nos vemos pronto en Buenos Aires!</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Detalles de tu reserva</p>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pasajeros</span><strong>${paxSummary}</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">USD ${baseData.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Forma de pago</span><strong>Efectivo</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${baseData.public_id}</span></div>
  </div>
  <p>Si tenés alguna consulta, respondé este email o escribinos por WhatsApp.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `¡Reserva confirmada! — ${baseData.option_name}`, customerHtml);

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Admin</p>
  <h1 style="${baseStyles.title}">Reserva cobrada y confirmada</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(baseData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(baseData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)} — ${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pax</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Total USD</span><strong style="color:#c8a85a">USD ${baseData.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${baseData.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Vendedor que cobró</p>
    <div style="${baseStyles.row}"><span>Nombre</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    <div style="${baseStyles.row}"><span>Comisión</span><strong style="color:#c8a85a">USD ${data.commission_usd ?? 0}</strong></div>
  </div>` : ''}
  <p style="color:rgba(245,239,230,0.7);">✓ El vendedor confirmó la recepción del dinero. La orden fue marcada como <strong>pagada</strong>.</p>
  <p style="${baseStyles.footer}">Notificación automática · Ethereal Tours admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Cobrado] ${baseData.option_name} — ${escapeHtml(data.customer_name)} (USD ${baseData.total_usd})`, adminHtml);
  }

  // 3) Vendedor
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Vendedores</p>
  <h1 style="${baseStyles.title}">¡Cobro registrado!</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, confirmaste la recepción del dinero. La reserva quedó confirmada y el email fue enviado al pasajero.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pasajeros</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Total cobrado</span><strong style="color:#c8a85a;font-size:18px">USD ${baseData.total_usd}</strong></div>
    <div style="${baseStyles.row}"><span>Tu comisión (${data.commission_percent ?? 0}%)</span><strong style="color:#c8a85a">USD ${data.commission_usd}</strong></div>
  </div>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
    await send(data.seller_email, `¡Cobro confirmado! — ${baseData.option_name} (USD ${baseData.total_usd})`, sellerHtml);
  }
}

// ─── Invitación al portal self-service ──────────────────
export async function sendSellerPortalInvite(
  sellerName: string,
  sellerEmail: string,
  inviteLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Portal de vendedores</p>
  <h1 style="${baseStyles.title}">¡Bienvenido al portal!</h1>
  <p>Hola ${escapeHtml(sellerName)}, el equipo de Ethereal Tours te invitó a acceder a tu portal de ventas.</p>
  <p>Desde ahí vas a poder ver tus ventas, comisiones y liquidaciones en tiempo real.</p>
  <div style="${baseStyles.card}">
    <p style="margin:0 0 16px;color:rgba(245,239,230,0.7);">Hacé clic en el botón para crear tu contraseña e ingresar:</p>
    <a href="${inviteLink}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Acceder al portal
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.5);font-size:13px;">O copiá este enlace en tu navegador:<br/>
    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${inviteLink}</span>
  </p>
  <p style="color:rgba(245,239,230,0.4);font-size:12px;">Este enlace expira en 24 horas. Si no lo pediste vos, podés ignorar este email.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
  return send(sellerEmail, 'Acceso a tu portal de ventas — Ethereal Tours', html);
}

export async function sendSellerPasswordReset(
  sellerName: string,
  sellerEmail: string,
  resetLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Portal de vendedores</p>
  <h1 style="${baseStyles.title}">Acceso a tu portal</h1>
  <p>Hola ${escapeHtml(sellerName)}, el equipo de Ethereal Tours te envió un nuevo link de acceso.</p>
  <div style="${baseStyles.card}">
    <p style="margin:0 0 16px;color:rgba(245,239,230,0.7);">Hacé clic para crear una nueva contraseña:</p>
    <a href="${resetLink}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Restablecer contraseña
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.5);font-size:13px;">O copiá este enlace en tu navegador:<br/>
    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${resetLink}</span>
  </p>
  <p style="color:rgba(245,239,230,0.4);font-size:12px;">Este enlace expira en 1 hora. Si no lo pediste vos, podés ignorar este email.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
  return send(sellerEmail, 'Restablecé tu acceso al portal — Ethereal Tours', html);
}

/**
 * Notificación al cliente, admin y vendedor (si hay atribución) cuando se reintegra una orden.
 * Se dispara desde el endpoint admin de refund.
 *
 * Si es refund parcial (amount != total), los emails lo indican explícitamente.
 */
export async function sendOrderRefundedNotifications(
  orderId: number,
  reason?: string | null,
  refundedAmountUsd?: number | null,
): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) {
    console.warn('[email] Resend not configured; skipping refund notif for order', orderId);
    return;
  }
  const { rows } = await pool.query(
    `SELECT
       o.public_id, o.customer_name, o.customer_email,
       o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
       o.mp_payment_id,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       oi.adults, oi.children,
       s.name AS seller_name, s.contact_email AS seller_email,
       a.commission_amount_usd::float AS commission_usd
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN order_attributions a ON a.order_id = o.id
       LEFT JOIN sellers s ON s.id = a.seller_id
      WHERE o.id = $1 LIMIT 1`,
    [orderId],
  );
  const data = rows[0];
  if (!data) return;

  const totalUsd: number = data.total_usd;
  const refundedUsd = refundedAmountUsd != null && refundedAmountUsd > 0 ? refundedAmountUsd : totalUsd;
  const isPartial = refundedUsd < totalUsd;

  const orderData: OrderEmailData & { reason?: string | null } = {
    public_id: data.public_id, customer_name: data.customer_name, customer_email: data.customer_email,
    total_usd: refundedUsd, total_ars: data.total_ars,
    product_name: data.product_name ?? 'Experiencia',
    option_name: data.option_name ?? 'Tier',
    service_date: data.service_date ?? '',
    adults: data.adults ?? 1, children: data.children ?? 0,
    mp_payment_id: data.mp_payment_id ?? null,
    reason,
  };

  // 1) Cliente
  await send(
    data.customer_email,
    isPartial
      ? `Reintegro parcial de tu reserva — USD ${refundedUsd}`
      : `Tu reserva fue cancelada — reintegro USD ${refundedUsd}`,
    htmlForRefund(orderData),
  );

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    await send(
      config.ADMIN_NOTIFICATION_EMAIL,
      isPartial
        ? `[Reintegro parcial] ${orderData.customer_name} — USD ${refundedUsd} de ${totalUsd}`
        : `[Reintegro procesado] ${orderData.customer_name} — USD ${refundedUsd}`,
      htmlForRefund(orderData),
    );
  }

  // 3) Vendedor (si la orden tenía atribución y el vendedor tiene email)
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    await send(
      data.seller_email,
      isPartial
        ? `Reintegro parcial — ${orderData.product_name}`
        : `Una venta tuya fue cancelada — ${orderData.product_name}`,
      htmlForSellerRefund({
        ...orderData,
        seller_name: data.seller_name,
        commission_usd: data.commission_usd,
        is_partial: isPartial,
      }),
    );
  }
}

// ─── Email de liquidación al vendedor ───────────────────────
export async function sendSellerCommissionPaid(input: {
  sellerName: string;
  sellerEmail: string;
  ordersCount: number;
  totalCommissionUsd: number;
  portalUrl: string;
}): Promise<void> {
  const { sellerName, sellerEmail, ordersCount, totalCommissionUsd, portalUrl } = input;
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Ethereal Tours · Liquidaciones</p>
  <h1 style="${baseStyles.title}">¡Liquidación procesada!</h1>
  <p>Hola ${escapeHtml(sellerName)}, el equipo de Ethereal Tours procesó una liquidación de comisiones a tu favor.</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Detalle de la liquidación</p>
    <div style="${baseStyles.row}"><span>Ventas liquidadas</span><strong>${ordersCount} venta${ordersCount === 1 ? '' : 's'}</strong></div>
    <div style="${baseStyles.row}"><span>Total acreditado</span><strong style="color:#c8a85a;font-size:22px">USD ${totalCommissionUsd.toFixed(2)}</strong></div>
  </div>
  <p>Podés ver el detalle completo en tu portal de vendedores.</p>
  <div style="${baseStyles.card}">
    <a href="${portalUrl}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Ver mi portal
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.6);font-size:13px;">¿Tenés alguna duda sobre el monto o las ventas incluidas? Escribinos por WhatsApp y te respondemos a la brevedad.</p>
  <p style="${baseStyles.footer}">Ethereal Tours · Programa de comisiones</p>
</div></body></html>`;
  await send(sellerEmail, `Liquidación procesada — USD ${totalCommissionUsd.toFixed(2)} acreditados`, html);
}
