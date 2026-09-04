import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getSupportWhatsapp } from './settings.js';
import { resolveOptionSchedule } from '../repos/catalog.js';

// Carpeta de salida del modo dry-run (ver TEST_EMAIL_DRY_RUN más abajo). Gitignoreada.
const DRY_RUN_DIR = path.resolve(process.cwd(), 'tmp-test-emails');

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

// Genera una alternativa en texto plano a partir del HTML. Los emails multipart
// (html + text) evitan una señal clásica de spam: correos 100% HTML sin fallback
// de texto, algo que Outlook y filtros corporativos penalizan en el scoring.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

/**
 * Envía un email por el transporte activo. Nunca lanza: devuelve { sent, error } para que
 * quien llama decida si avisar al usuario. Loguea siempre el fallo.
 */
type Audience = 'CLIENTE' | 'VENDEDOR' | 'ADMIN';

async function send(to: string | string[], subject: string, html: string, audience?: Audience): Promise<SendResult> {
  const transport = activeTransport();
  let recipients = Array.isArray(to) ? to : [to];

  // Modo test de comunicaciones (TEST_EMAIL_OVERRIDE, nunca activo en producción): redirige
  // todos los destinatarios reales a una casilla de revisión, conservando el asunto original
  // (prefijado, + el grupo destinatario si se indicó) para que se pueda identificar de qué
  // email se trata y a quién iba dirigido con solo mirar la bandeja de entrada.
  if (config.TEST_EMAIL_OVERRIDE && config.NODE_ENV !== 'production') {
    console.info(`[email] TEST_EMAIL_OVERRIDE activo — "${subject}" (originalmente a ${recipients.join(', ')}) redirigido a ${config.TEST_EMAIL_OVERRIDE}`);
    const tag = audience ? `[MAIL TESTING - ${audience}]` : '[MAIL TESTING]';
    subject = `${tag} ${subject}`;
    recipients = [config.TEST_EMAIL_OVERRIDE];

    // Dry-run: no se manda nada por red (ni SMTP ni Resend) — se guarda como .html en disco.
    // Sirve para revisar el diseño sin gastar cuota del proveedor.
    if (config.TEST_EMAIL_DRY_RUN === 'true') {
      fs.mkdirSync(DRY_RUN_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeSubject = subject.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const filePath = path.join(DRY_RUN_DIR, `${stamp}__${audience ?? 'SIN-AUDIENCIA'}__${safeSubject}.html`);
      fs.writeFileSync(filePath, html, 'utf-8');
      console.info(`[email] DRY RUN — guardado en ${filePath} (no se envió por red)`);
      return { sent: true, transport: 'none' };
    }
  }

  if (transport === 'none') {
    console.warn(`[email] Sin transporte configurado (SMTP/Resend). No se envió "${subject}" a ${recipients.join(', ')}`);
    return { sent: false, transport, error: 'No hay transporte de email configurado.' };
  }

  const text = htmlToText(html);

  try {
    if (transport === 'smtp') {
      await smtpTransport!.sendMail({ from: config.EMAIL_FROM, to: recipients, subject, html, text });
      return { sent: true, transport };
    }
    const { error } = await resend!.emails.send({ from: config.EMAIL_FROM, to: recipients, subject, html, text });
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

export interface OrderEmailData {
  public_id: string;
  customer_name: string;
  customer_email: string;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  product_name: string;
  option_name: string;
  service_date: string;
  adults: number;
  children: number;
  mp_payment_id: string | null;
  // Medio de pago y, si es PIX, el monto real en reales que pagó el cliente. Los emails
  // al cliente muestran el total en la moneda que realmente vio (reales para PIX, pesos
  // para el resto) en vez del total_ars (que para PIX es solo una referencia interna).
  payment_method?: string | null;
  pix_fiat_amount_brl?: number | null;
  // Campos extendidos (opcionales) para el detalle completo de la reserva.
  customer_phone?: string | null;
  customer_nationality?: string | null;
  unit_price_adult_usd?: number | null;
  unit_price_child_usd?: number | null;
  transfer_qty?: number | null;
  infants?: number | null;
  // Rango de edad configurado por el admin para menores/infantes -- se muestran en el
  // comprobante para que quede trazada la política vigente al momento de la reserva
  // (evita malentendidos en la puerta de la casa por un criterio de edad distinto).
  children_age_label?: string | null;
  infant_age_label?: string | null;
  transfer_hotel?: string | null;
  pickup_window?: string | null;
  dinner_time?: string | null;
  show_time?: string | null;
  includes?: string[] | null;
  address?: string | null;
  seller_name?: string | null;
  seller_email?: string | null;
  cash_collected_currency?: 'ARS' | 'USD' | null;
  net_total_usd?: number | null;
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

// Número de soporte por WhatsApp — configurable desde el admin (Settings). Se cachea
// en memoria porque los templates de abajo son funciones síncronas (no pueden esperar
// una consulta a la base en cada email); el número casi no cambia, así que un desfasaje
// de hasta 5 minutos tras un cambio en el admin es aceptable. Default = el número
// histórico, por si todavía no se configuró nada en "settings".
const DEFAULT_SUPPORT_WHATSAPP = '5491132368312';
let cachedSupportWhatsapp = DEFAULT_SUPPORT_WHATSAPP;

async function refreshSupportWhatsappCache(): Promise<void> {
  try {
    const number = await getSupportWhatsapp();
    if (number) cachedSupportWhatsapp = number;
  } catch { /* ante cualquier error dejamos el último valor conocido */ }
}

refreshSupportWhatsappCache();
setInterval(refreshSupportWhatsappCache, 5 * 60 * 1000).unref();

// Bloque de soporte con botón de WhatsApp — el pago es una operación sensible,
// así el cliente/vendedor tiene contacto directo ante cualquier inconveniente.
function supportBlock(): string {
  return `<div style="text-align:center;margin:28px 0 4px">
    <p style="font-size:13px;color:rgba(245,239,230,0.6);margin:0 0 10px">¿Algún inconveniente con tu pago o tu reserva? Estamos para ayudarte al instante.</p>
    <a href="https://wa.me/${cachedSupportWhatsapp}" style="display:inline-block;background:#25D366;color:#0d0a0a;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">Escribinos por WhatsApp</a>
  </div>`;
}

// Lema de "entrada válida" — se repite en todos los emails que reflejan el estado
// vigente de la reserva (confirmación, modificación, ampliación, reprogramación),
// para que el cliente sepa que ESE email (el más reciente) es lo que presenta en la casa.
function ticketBadge(): string {
  return `<p style="text-align:center;margin:0 0 4px;font-size:12px;letter-spacing:0.5px;color:#c8a85a;text-transform:uppercase">🎫 Este email es tu entrada — mostralo en la puerta de la casa de tango</p>
  <p style="text-align:center;margin:0 0 20px;font-size:11px;color:rgba(245,239,230,0.5)">Si recibiste más de un email para esta reserva, vale solo el más reciente — los anteriores quedan sin efecto.</p>`;
}

// Botón de descarga del voucher en PDF — para guardarlo en el celular y no depender
// de conexión al presentarlo en la casa de tango. El endpoint exige la orden "paid",
// así que este bloque solo se agrega en emails que reflejan una reserva vigente.
function voucherButtonBlock(publicId: string): string {
  const url = `${config.API_PUBLIC_URL}/api/checkout/orders/${publicId}/voucher.pdf`;
  const verifyUrl = `${config.WEB_ORIGIN}/verificar/${publicId}`;
  return `<div style="text-align:center;margin:4px 0 24px">
    <a href="${url}" style="display:inline-block;background:transparent;border:1.5px solid #c8a85a;color:#e0c787;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:13px">⬇ Descargar voucher PDF</a>
    <p style="margin:8px 0 0;font-size:11px;color:rgba(245,239,230,0.4)">Guardalo en tu celular — te sirve como entrada aunque no tengas señal.</p>
    <p style="margin:10px 0 0;font-size:11px;color:rgba(245,239,230,0.4)">
      ¿La casa tiene wifi? <a href="${verifyUrl}" style="color:#e0c787">Verificá el estado actual de la reserva acá</a>.
    </p>
  </div>`;
}

// Fila etiqueta/valor reutilizable.
function emailRow(label: string, value: string, accent = false): string {
  return `<div style="${baseStyles.row}"><span>${label}</span><strong${accent ? ' style="color:#c8a85a"' : ''}>${value}</strong></div>`;
}

// ── Moneda: los emails muestran TODO en pesos (el negocio opera en ARS) ──
// Los montos internos están en USD; se convierten al tipo de cambio congelado de la orden.
function fmtArs(n: number): string {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}
function fmtUsd(n: number): string {
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtBrl(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function arsOf(usd: number | null | undefined, rate: number): string {
  return fmtArs((usd ?? 0) * rate);
}

// El cliente de PIX pagó en REALES; los demás medios, en pesos. Estos helpers muestran el
// monto en la moneda que el cliente realmente vio, así el email no le muestra "ARS 150.000"
// cuando en verdad pagó "R$ 512".
function isPixOrder(d: OrderEmailData): boolean {
  return d.payment_method === 'pix' && d.pix_fiat_amount_brl != null;
}
function chargedTotalStr(d: OrderEmailData): string {
  return isPixOrder(d) ? fmtBrl(d.pix_fiat_amount_brl as number) : fmtArs(d.total_ars);
}
// Precio unitario: para PIX no tenemos el desglose por pax en reales (solo el total),
// así que se muestra en USD como referencia; para el resto, en pesos.
function perPaxStr(usd: number, d: OrderEmailData): string {
  return isPixOrder(d) ? fmtUsd(usd) : arsOf(usd, d.exchange_rate_used);
}

// Neto que el vendedor nos rinde en una venta en EFECTIVO = total − comisión.
// En efectivo no mostramos "total cobrado" ni "comisión" (el vendedor cobra el monto
// que define y no lo trazamos): el único número que importa es el neto a rendir.
function cashNetArs(raw: Record<string, unknown>, d: OrderEmailData): number {
  const commissionArs = (raw.commission_ars as number | null) ?? 0;
  return Math.max(0, Math.round(d.total_ars - commissionArs));
}

// Igual que cashNetArs, pero si el vendedor cobró en dólares, el neto se muestra
// directamente en USD (net_total_usd_snapshot, ya congelado) en vez de convertirlo
// a pesos — el vendedor tiene los dólares en mano, no hace falta ninguna conversión.
function cashNetDisplay(raw: Record<string, unknown>, d: OrderEmailData): string {
  if (d.cash_collected_currency === 'USD' && d.net_total_usd != null) {
    return fmtUsd(d.net_total_usd);
  }
  return fmtArs(cashNetArs(raw, d));
}

// Bloque de detalle COMPLETO de la reserva, reutilizado en todos los emails al cliente
// y al vendedor. Renderiza solo lo que existe (campos opcionales). La idea es que el
// cliente tenga TODA la info y no tenga que consultar nada.
function reservationCard(d: OrderEmailData, opts?: { showAmounts?: boolean; showContact?: boolean }): string {
  const rows: string[] = [];
  rows.push(emailRow('Casa de tango', escapeHtml(d.product_name)));
  rows.push(emailRow('Experiencia', escapeHtml(d.option_name)));
  if (d.address) rows.push(emailRow('Dirección', escapeHtml(d.address)));
  rows.push(emailRow('Fecha', d.service_date));

  const showAmounts = opts?.showAmounts !== false;
  let pax = `${d.adults} adulto(s)`;
  if (showAmounts && d.unit_price_adult_usd != null) pax += ` · ${perPaxStr(d.unit_price_adult_usd, d)} c/u`;
  rows.push(emailRow('Adultos', pax));
  if (d.children > 0) {
    let ch = `${d.children} menor(es)`;
    if (d.children_age_label) ch += ` (${escapeHtml(d.children_age_label)})`;
    if (showAmounts && d.unit_price_child_usd != null) ch += ` · ${perPaxStr(d.unit_price_child_usd, d)} c/u`;
    rows.push(emailRow('Menores', ch));
  }
  if (d.infants != null && d.infants > 0) {
    let inf = `${d.infants} (sin cargo de entrada)`;
    if (d.infant_age_label) inf += ` -- ${escapeHtml(d.infant_age_label)}`;
    rows.push(emailRow('Infantes', inf));
  }

  if (d.pickup_window) rows.push(emailRow('Horario de traslado', escapeHtml(d.pickup_window)));
  if (d.dinner_time) rows.push(emailRow('Cena', escapeHtml(d.dinner_time)));
  if (d.show_time) rows.push(emailRow('Show', escapeHtml(d.show_time)));
  if (d.transfer_qty != null && d.transfer_qty > 0) {
    const totalPax = d.adults + d.children + (d.infants ?? 0);
    // El traslado siempre es automático para todo el grupo (incluidos infantes) —
    // ya no puede haber una cantidad parcial, así que no hace falta distinguir.
    rows.push(emailRow('Traslado', `Para los ${totalPax} pasajero(s) de la reserva${d.transfer_hotel ? ` — retiro en ${escapeHtml(d.transfer_hotel)}` : ''}`));
  }

  if (showAmounts) {
    rows.push(emailRow('Total', chargedTotalStr(d), true));
  }
  rows.push(`<div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${d.public_id}</span></div>`);

  const includesBlock = (d.includes && d.includes.length > 0)
    ? `<div style="${baseStyles.card}"><p style="${baseStyles.eyebrow}">Qué incluye tu experiencia</p><ul style="margin:0;padding-left:18px;line-height:1.8;color:#f5efe6">${d.includes.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
    : '';

  const contactBlock = (opts?.showContact && d.seller_name)
    ? `<p style="font-size:13px;color:rgba(245,239,230,0.6)">Tu reserva fue gestionada por <strong style="color:#e0c787">${escapeHtml(d.seller_name)}</strong>. Ante cualquier duda podés contactarnos y mencionar tu número de referencia.</p>`
    : '';

  return `<div style="${baseStyles.card}"><p style="${baseStyles.eyebrow}">Detalles de tu reserva</p>${rows.join('')}</div>${includesBlock}${contactBlock}`;
}

function htmlForCustomer(data: OrderEmailData): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">¡Reserva confirmada!</h1>
  ${ticketBadge()}
  <p>Hola ${escapeHtml(data.customer_name)}, recibimos tu pago para una experiencia inolvidable en Buenos Aires. Acá tenés todos los detalles de tu reserva:</p>
  ${reservationCard(data, { showContact: true })}
  ${voucherButtonBlock(data.public_id)}
  <div style="background:rgba(200,168,90,0.08);border:1px solid rgba(200,168,90,0.25);border-radius:10px;padding:16px 18px;margin:20px 0">
    <p style="margin:0;font-size:13px;line-height:1.6"><strong style="color:#c8a85a">¿Necesitás cancelar o modificar tu reserva?</strong> Como pagaste online (${isPixOrder(data) ? 'PIX' : 'Tarjeta'}), cualquier gestión relacionada con tu cobro (cancelación, cambio de fecha, sumar o quitar pasajeros, reintegros) la manejamos nosotros directamente — escribinos por WhatsApp con tu número de referencia y te ayudamos al instante.</p>
  </div>
  <p>Guardá este email como comprobante. Si tenés cualquier consulta, respondé este mismo correo o escribinos por WhatsApp con tu número de referencia.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
}

function htmlForAdmin(data: OrderEmailData & { seller_name?: string | null; seller_code?: string | null; commission_usd?: number | null; commission_ars?: number | null }): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Nueva venta confirmada</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(data.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(data.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(data.option_name)} — ${escapeHtml(data.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pax</span><strong>${data.adults} ad · ${data.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">${chargedTotalStr(data)}${isPixOrder(data) ? ` <span style="opacity:.55;font-size:11px">(≈ ${fmtArs(data.total_ars)})</span>` : ''}</strong></div>
    <div style="${baseStyles.row}"><span>Método</span><strong>${data.payment_method === 'pix' ? 'PIX (reales)' : data.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}</strong></div>
    <div style="${baseStyles.row}"><span>${isPixOrder(data) ? 'Orden Nautt' : 'MP Payment'}</span><span style="font-family:monospace;font-size:11px">${data.mp_payment_id ?? '—'}</span></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${data.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Atribución a recomendador</p>
    <div style="${baseStyles.row}"><span>Recomendador</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    <div style="${baseStyles.row}"><span>Incentivo por recomendación a pagar</span><strong style="color:#c8a85a">${fmtArs(data.commission_ars ?? 0)}</strong></div>
  </div>` : ''}
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
}

function htmlForSellerRefund(data: OrderEmailData & {
  seller_name: string; commission_usd: number; commission_ars: number; reason?: string | null; is_partial?: boolean;
}): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Una venta tuya fue cancelada</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, te avisamos que una venta atribuida a tu código fue ${data.is_partial ? 'reintegrada parcialmente' : 'cancelada y reintegrada al cliente'}${data.reason ? ` — ${escapeHtml(data.reason)}` : ''}.</p>
  ${data.is_partial
    ? `<p>El incentivo por recomendación correspondiente a esta venta se ajustará proporcionalmente.</p>`
    : `<p><strong>El incentivo por recomendación de ${fmtArs(data.commission_ars)} que correspondía a esta venta ya no aplica.</strong></p>`}
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio cancelado</span><strong>${escapeHtml(data.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(data.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Cliente</span><span>${escapeHtml(data.customer_name)}</span></div>
    <div style="${baseStyles.row}"><span>Fecha solicitada</span><strong>${data.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Incentivo por recomendación que no aplica</span><strong style="color:#c8a85a">${fmtArs(data.commission_ars)}</strong></div>
  </div>
  <p>Cualquier consulta sobre tus ventas o pagos, escribinos.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
}

function htmlForRefund(data: OrderEmailData & { reason?: string | null }): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Tu reserva fue cancelada</h1>
  <p>Hola ${escapeHtml(data.customer_name)}, lamentamos comunicarte que no pudimos confirmar tu reserva${data.reason ? ` — ${escapeHtml(data.reason)}` : ''}.</p>
  <p><strong style="color:#c8a85a">Te reintegramos ARS ${data.total_ars.toLocaleString('es-AR')}</strong> al mismo medio de pago con el que abonaste. El reintegro tarda entre 2 y 5 días hábiles en aparecer.</p>
  ${reservationCard(data, { showAmounts: false })}
  <p>Si querés reservar otra fecha u otra casa, escribinos por WhatsApp o respondé este email y te ayudamos a coordinar.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
}

function htmlForSeller(data: OrderEmailData & { seller_name: string; commission_usd: number; commission_ars: number; commission_percent: number }): string {
  return `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">¡Tenés una nueva venta!</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, un cliente que escaneó tu QR acaba de comprar una experiencia. Te corresponde un incentivo por recomendación.</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Tu incentivo por recomendación</p>
    <div style="${baseStyles.row}"><span>Valor de la venta</span><strong>${fmtArs(data.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Tu incentivo por recomendación (${data.commission_percent}%)</span><strong style="color:#c8a85a;font-size:18px">${fmtArs(data.commission_ars)}</strong></div>
  </div>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Datos de la reserva</p>
    ${emailRow('Cliente', escapeHtml(data.customer_name))}
    ${data.customer_phone ? emailRow('Teléfono', escapeHtml(data.customer_phone)) : ''}
    ${emailRow('Casa de tango', escapeHtml(data.product_name))}
    ${emailRow('Experiencia', escapeHtml(data.option_name))}
    ${emailRow('Fecha', data.service_date)}
    ${emailRow('Pasajeros', `${data.adults} adulto(s)${data.children > 0 ? ` · ${data.children} menor(es)` : ''}`)}
    ${data.transfer_qty != null && data.transfer_qty > 0 ? emailRow('Traslado', `Para los ${data.adults + data.children + (data.infants ?? 0)} pasajero(s) de la reserva${data.transfer_hotel ? ` — retiro en ${escapeHtml(data.transfer_hotel)}` : ''}`) : ''}
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${data.public_id}</span></div>
  </div>
  <p>Vamos a procesar el pago de tu incentivo por recomendación junto con los del próximo período. Cualquier consulta sobre tus ventas o pagos, escribinos.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// SELECT compartido con TODOS los datos de la orden para los emails detallados.
export const ORDER_EMAIL_SELECT = `
       o.id AS order_id,
       o.public_id, o.customer_name, o.customer_email, o.customer_phone, o.customer_nationality,
       o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
       o.exchange_rate_used::float AS exchange_rate_used,
       o.mp_payment_id, o.payment_method, o.pix_fiat_amount_brl::float AS pix_fiat_amount_brl,
       o.cash_collected_at, o.cash_collected_currency,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       oi.adults, oi.children,
       oi.unit_price_adult_usd::float AS unit_price_adult_usd,
       oi.unit_price_child_usd::float AS unit_price_child_usd,
       oi.transfer_qty, oi.transfer_hotel, oi.infants,
       opt.has_dinner, opt.show_only_time_enabled, opt.includes_es,
       p.address_es, p.children_age_label, p.infant_age_label,
       p.dinner_show_time_es, p.show_only_time_es,
       p.dinner_transfer_window_es, p.show_only_transfer_window_es,
       s.id AS seller_id, s.name AS seller_name, s.code AS seller_code, s.contact_email AS seller_email,
       a.commission_amount_usd::float AS commission_usd,
       a.commission_amount_ars::float AS commission_ars,
       a.commission_percent_snapshot::float AS commission_percent,
       a.net_total_usd_snapshot::float AS net_total_usd
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN product_options opt ON opt.id = oi.option_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN order_attributions a ON a.order_id = o.id
     LEFT JOIN sellers s ON s.id = a.seller_id
    WHERE o.id = $1 LIMIT 1`;

// Mapea una fila (con los alias de ORDER_EMAIL_SELECT) al OrderEmailData completo.
export function toOrderData(data: Record<string, unknown>): OrderEmailData {
  const schedule = resolveOptionSchedule(
    {
      dinner_show_time_es: (data.dinner_show_time_es as string) ?? null,
      show_only_time_es: (data.show_only_time_es as string) ?? null,
      dinner_transfer_window_es: (data.dinner_transfer_window_es as string) ?? null,
      show_only_transfer_window_es: (data.show_only_transfer_window_es as string) ?? null,
    },
    {
      has_dinner: Boolean(data.has_dinner),
      show_only_time_enabled: Boolean(data.show_only_time_enabled),
    },
  );
  return {
    public_id: data.public_id as string,
    customer_name: data.customer_name as string,
    customer_email: data.customer_email as string,
    total_usd: data.total_usd as number,
    total_ars: data.total_ars as number,
    exchange_rate_used: (data.exchange_rate_used as number) ?? 0,
    product_name: (data.product_name as string) ?? 'Experiencia',
    option_name: (data.option_name as string) ?? 'Tier',
    service_date: (data.service_date as string) ?? '',
    adults: (data.adults as number) ?? 1,
    children: (data.children as number) ?? 0,
    mp_payment_id: (data.mp_payment_id as string) ?? null,
    payment_method: (data.payment_method as string) ?? null,
    pix_fiat_amount_brl: (data.pix_fiat_amount_brl as number) ?? null,
    customer_phone: (data.customer_phone as string) ?? null,
    customer_nationality: (data.customer_nationality as string) ?? null,
    unit_price_adult_usd: (data.unit_price_adult_usd as number) ?? null,
    unit_price_child_usd: (data.unit_price_child_usd as number) ?? null,
    transfer_qty: (data.transfer_qty as number) ?? null,
    infants: (data.infants as number) ?? null,
    children_age_label: (data.children_age_label as string) ?? null,
    infant_age_label: (data.infant_age_label as string) ?? null,
    transfer_hotel: (data.transfer_hotel as string) ?? null,
    pickup_window: schedule.pickup_window_es,
    dinner_time: schedule.dinner_time_es,
    show_time: schedule.show_time_es,
    includes: (data.includes_es as string[]) ?? null,
    address: (data.address_es as string) ?? null,
    seller_name: (data.seller_name as string) ?? null,
    seller_email: (data.seller_email as string) ?? null,
    cash_collected_currency: (data.cash_collected_currency as 'ARS' | 'USD') ?? null,
    net_total_usd: (data.net_total_usd as number) ?? null,
  };
}

// ─── Link de pago pendiente (pre-pago) ──────────────────────
// Se manda al cliente apenas se crea una orden online (Mercado Pago o PIX) que todavía no
// pagó (ej. reserva armada por un vendedor). Es la ÚNICA vía para que el cliente reciba el
// link — el vendedor no ve ni reenvía links, así que si el cliente lo pierde, tiene que
// pedirnos a nosotros que se lo reenviemos (no al vendedor). El medio (PIX/MP) sale de la orden.
export async function sendPaymentLinkEmail(orderId: number, initPoint: string): Promise<void> {
  if (!isEnabled()) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);
  // El medio surge de la orden (PIX o MP): así el email dice el método correcto sin que el
  // caller tenga que pasarlo. Para PIX el link va a la página con el QR/clave en reales.
  const isPix = orderData.payment_method === 'pix';
  const payLabel = isPix ? 'PIX' : 'Tarjeta';
  const payColor = isPix ? '#32BCAD' : '#009ee3';
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Completá tu pago</h1>
  <p>Hola ${escapeHtml(orderData.customer_name)}, ¡ya casi! Para confirmar tu reserva de ${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}, pagá con ${payLabel}${isPix ? ' (en reales)' : ''} acá:</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${initPoint}" style="display:inline-block;background:${payColor};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px">Pagar con ${payLabel}</a>
  </div>
  ${reservationCard(orderData, { showContact: true })}
  <p style="font-size:13px;color:rgba(245,239,230,0.6)">El lugar queda reservado hasta que completes el pago; si no lo hacés a tiempo, la reserva caduca. Si necesitás que te reenviemos este link, escribinos por WhatsApp con tu número de referencia.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `Completá tu pago — ${orderData.option_name}`, html, 'CLIENTE');
}

// ─── Función principal: notifica los 3 destinatarios cuando una orden se paga ──
export async function sendOrderPaidNotifications(orderId: number): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) {
    console.warn('[email] Resend not configured; skipping notifications for order', orderId);
    return;
  }

  // Cargamos toda la data necesaria en una query
  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);

  // 1) Cliente
  await send(
    data.customer_email,
    `✓ Reserva confirmada — ${orderData.option_name}`,
    htmlForCustomer(orderData),
    'CLIENTE',
  );

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    await send(
      config.ADMIN_NOTIFICATION_EMAIL,
      `Nueva venta — ${orderData.option_name} (${fmtArs(orderData.total_ars)})`,
      htmlForAdmin({
        ...orderData,
        seller_name: data.seller_name,
        seller_code: data.seller_code,
        commission_usd: data.commission_usd,
        commission_ars: data.commission_ars,
      }),
      'ADMIN',
    );
  }

  // 3) Vendedor (si hay atribución y email)
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    await send(
      data.seller_email,
      `¡Nueva venta tuya! +${fmtArs(data.commission_ars ?? 0)} de incentivo por recomendación`,
      htmlForSeller({
        ...orderData,
        seller_name: data.seller_name,
        commission_usd: data.commission_usd,
        commission_ars: data.commission_ars,
        commission_percent: data.commission_percent ?? 0,
      }),
      'VENDEDOR',
    );
  }
}

// ─── Notificaciones de reserva en efectivo (pago al vendedor) ───────────────
export async function sendCashOrderNotifications(orderId: number): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const baseData: OrderEmailData = toOrderData(data);
  const sellerLabel = escapeHtml(data.seller_name ?? 'quien te recomendó la experiencia');

  // 1) Cliente — la reserva queda PENDIENTE hasta que el recomendador confirme que
  // cobró: este email solo avisa que se registró y guía el siguiente paso (pagar).
  // La confirmación real (con el voucher/entrada) llega recién con
  // sendCashCollectedNotifications -- por eso acá NO va ticketBadge() ni
  // voucherButtonBlock() (el endpoint del voucher exige la orden "paid").
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Reserva registrada — falta el pago</h1>
  <p>Hola ${escapeHtml(baseData.customer_name)}, registramos tu reserva para pago en efectivo. Todavía <strong>no está confirmada</strong>: para confirmarla, acercate a <strong style="color:#e0c787">${sellerLabel}</strong> y coordiná el pago del servicio con esa persona.</p>
  ${reservationCard(baseData, { showContact: true, showAmounts: false })}
  <p>Ni bien se confirme el pago te vamos a enviar otro email con la reserva confirmada y tu comprobante — ese es el que tenés que presentar en la casa de tango, no este.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `Reserva registrada — falta el pago (${baseData.option_name})`, customerHtml, 'CLIENTE');

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Nueva reserva en efectivo</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(baseData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(baseData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)} — ${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pax</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Sugerido</span><strong>${fmtArs(baseData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${baseData.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Recomendador que cobra</p>
    <div style="${baseStyles.row}"><span>Nombre</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    <div style="${baseStyles.row}"><span>Neto a rendir</span><strong style="color:#c8a85a">${fmtArs(cashNetArs(data, baseData))}</strong></div>
  </div>` : ''}
  <p style="color:rgba(245,239,230,0.7);">⚠ El pasajero ya recibió un aviso de que su reserva quedó pendiente de pago. El email con la <strong>confirmación</strong> se enviará automáticamente cuando el recomendador confirme el cobro desde su portal.</p>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Efectivo] Nueva reserva — ${baseData.option_name} (${fmtArs(baseData.total_ars)})`, adminHtml, 'ADMIN');
  }

  // 3) Vendedor
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    // Generar tokens de acción de un solo uso (48 h de validez)
    let collectUrl: string | null = null;
    let cancelUrl: string | null = null;
    if (data.order_id && data.seller_id) {
      try {
        const { rows: tkRows } = await pool.query<{ token: string; action: string }>(
          `INSERT INTO order_action_tokens (order_id, seller_id, action, expires_at)
           VALUES
             ($1, $2, 'collect', NOW() + INTERVAL '48 hours'),
             ($1, $2, 'cancel',  NOW() + INTERVAL '48 hours')
           RETURNING token, action`,
          [data.order_id, data.seller_id],
        );
        const cTok = tkRows.find((r) => r.action === 'collect')?.token;
        const xTok = tkRows.find((r) => r.action === 'cancel')?.token;
        if (cTok) collectUrl = `${config.WEB_ORIGIN}/accion/${cTok}`;
        if (xTok) cancelUrl  = `${config.WEB_ORIGIN}/accion/${xTok}`;
      } catch (e) {
        console.error('[email] Failed to create action tokens:', e);
      }
    }

    const actionButtons = `
  <p style="color:rgba(245,239,230,0.7);font-size:14px;margin:24px 0 8px">Una vez que recibas el dinero, podés confirmar el cobro directamente desde este email:</p>
  ${collectUrl ? `<div style="text-align:center;margin:16px 0 8px"><a href="${collectUrl}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.3px">✓ Confirmar cobro</a></div>` : ''}
  ${cancelUrl  ? `<div style="text-align:center;margin:8px 0 24px"><a href="${cancelUrl}"  style="display:inline-block;color:#e57373;text-decoration:none;padding:10px 24px;border-radius:8px;font-weight:600;font-size:13px;border:1px solid rgba(229,115,115,0.35)">Cancelar reserva</a></div>` : ''}`;

    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Tenés una reserva para cobrar</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, registramos una reserva a tu nombre. Coordiná el cobro con el cliente.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pasajeros</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Sugerido</span><strong>${fmtArs(baseData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Neto a rendir</span><strong style="color:#c8a85a;font-size:18px">${fmtArs(cashNetArs(data, baseData))}</strong></div>
  </div>
  <p style="font-size:13px;color:rgba(245,239,230,0.6);margin:0">Al pasajero le cobrás el monto que definas; a nosotros nos rendís el neto.</p>
  ${actionButtons}
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(data.seller_email, `Reserva para cobrar — ${baseData.option_name} (${fmtArs(baseData.total_ars)})`, sellerHtml, 'VENDEDOR');
  }
}

// ─── Cobro en efectivo confirmado ───────────────────────────
// actor: 'seller' = el vendedor lo hizo desde su portal
//        'admin'  = el admin lo hizo en nombre del vendedor
export async function sendCashCollectedNotifications(orderId: number, actor: 'seller' | 'admin' = 'seller'): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const baseData: OrderEmailData = toOrderData(data);

  // 1) Cliente — primera y única notificación que recibe (igual en ambos casos)
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">¡Reserva confirmada!</h1>
  ${ticketBadge()}
  <p>Hola ${escapeHtml(baseData.customer_name)}, tu reserva está confirmada (pago en efectivo). ¡Nos vemos pronto en Buenos Aires! Acá tenés todos los detalles:</p>
  ${reservationCard(baseData, { showContact: true, showAmounts: false })}
  ${voucherButtonBlock(baseData.public_id)}
  <p>Guardá este email como comprobante. Si tenés alguna consulta, respondé este correo o escribinos por WhatsApp con tu número de referencia.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `¡Reserva confirmada! — ${baseData.option_name}`, customerHtml, 'CLIENTE');

  // 2) Admin — indica quién confirmó el cobro
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const actorNote = actor === 'admin'
      ? '✓ El admin confirmó el cobro en nombre del recomendador. La orden fue marcada como <strong>pagada</strong>.'
      : '✓ El recomendador confirmó la recepción del dinero. La orden fue marcada como <strong>pagada</strong>.';
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Reserva cobrada y confirmada</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(baseData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(baseData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)} — ${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pax</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Sugerido</span><strong>${fmtArs(baseData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${baseData.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Recomendador</p>
    <div style="${baseStyles.row}"><span>Nombre</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    <div style="${baseStyles.row}"><span>Neto a rendir</span><strong style="color:#c8a85a">${cashNetDisplay(data, baseData)}</strong></div>
  </div>` : ''}
  <p style="color:rgba(245,239,230,0.7);">${actorNote}</p>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Cobrado] ${baseData.option_name} — ${escapeHtml(data.customer_name)} (${fmtArs(baseData.total_ars)})`, adminHtml, 'ADMIN');
  }

  // 3) Vendedor — texto diferente según quién confirmó
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    const sellerIntro = actor === 'admin'
      ? `Hola ${escapeHtml(data.seller_name)}, el equipo de Tango QR confirmó el cobro de esta reserva en tu nombre. La reserva quedó confirmada y el email fue enviado al pasajero.`
      : `Hola ${escapeHtml(data.seller_name)}, confirmaste la recepción del dinero. La reserva quedó confirmada y el email fue enviado al pasajero.`;
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">¡Cobro registrado!</h1>
  <p>${sellerIntro}</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(baseData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Casa</span><strong>${escapeHtml(baseData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${baseData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Pasajeros</span><strong>${baseData.adults} ad · ${baseData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Neto a rendir</span><strong style="color:#c8a85a;font-size:18px">${cashNetDisplay(data, baseData)}</strong></div>
  </div>
  <p style="font-size:13px;color:rgba(245,239,230,0.6);margin:0">El monto que le cobraste al pasajero lo definiste vos; lo que nos rendís es el neto.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(data.seller_email, `¡Cobro confirmado! — ${baseData.option_name} (${fmtArs(baseData.total_ars)})`, sellerHtml, 'VENDEDOR');
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
  <p style="${baseStyles.eyebrow}">Tango QR · Portal de recomendadores</p>
  <h1 style="${baseStyles.title}">¡Bienvenido al portal!</h1>
  <p>Hola ${escapeHtml(sellerName)}, el equipo de Tango QR te invitó a acceder a tu portal de ventas.</p>
  <p>Desde ahí vas a poder ver tus ventas, incentivos por recomendación y liquidaciones en tiempo real.</p>
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
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
  return send(sellerEmail, 'Acceso a tu portal de ventas — Tango QR', html, 'VENDEDOR');
}

export async function sendSellerPasswordReset(
  sellerName: string,
  sellerEmail: string,
  resetLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Portal de recomendadores</p>
  <h1 style="${baseStyles.title}">Acceso a tu portal</h1>
  <p>Hola ${escapeHtml(sellerName)}, el equipo de Tango QR te envió un nuevo link de acceso.</p>
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
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
  return send(sellerEmail, 'Restablecé tu acceso al portal — Tango QR', html, 'VENDEDOR');
}

export async function sendSellerMemberPinReset(
  memberName: string,
  memberEmail: string,
  resetLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Mi equipo</p>
  <h1 style="${baseStyles.title}">Restablecer tu PIN</h1>
  <p>Hola ${escapeHtml(memberName)}, pediste restablecer el PIN que usás para firmar tus ventas.</p>
  <div style="${baseStyles.card}">
    <p style="margin:0 0 16px;color:rgba(245,239,230,0.7);">Hacé clic para elegir un PIN nuevo:</p>
    <a href="${resetLink}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Elegir PIN nuevo
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.5);font-size:13px;">O copiá este enlace en tu navegador:<br/>
    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${resetLink}</span>
  </p>
  <p style="color:rgba(245,239,230,0.4);font-size:12px;">Este enlace expira en 2 horas y sirve una sola vez. Si no lo pediste vos, podés ignorar este email.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR</p>
</div></body></html>`;
  return send(memberEmail, 'Restablecé tu PIN — Tango QR', html, 'VENDEDOR');
}

export async function sendSellerAdminPinReset(
  sellerName: string,
  adminEmail: string,
  resetLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Mi equipo</p>
  <h1 style="${baseStyles.title}">Restablecer el PIN de administrador</h1>
  <p>Hola, pidieron restablecer el PIN de administrador de la cuenta de ${escapeHtml(sellerName)} (el que gestiona el equipo de sub-recomendadores).</p>
  <div style="${baseStyles.card}">
    <p style="margin:0 0 16px;color:rgba(245,239,230,0.7);">Hacé clic para elegir un PIN nuevo:</p>
    <a href="${resetLink}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Elegir PIN nuevo
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.5);font-size:13px;">O copiá este enlace en tu navegador:<br/>
    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${resetLink}</span>
  </p>
  <p style="color:rgba(245,239,230,0.4);font-size:12px;">Este enlace expira en 2 horas y sirve una sola vez. Si no lo pediste vos, podés ignorar este email.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR</p>
</div></body></html>`;
  return send(adminEmail, 'Restablecé el PIN de administrador — Tango QR', html, 'VENDEDOR');
}

export async function sendAdminPortalInvite(
  adminName: string,
  adminEmail: string,
  inviteLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Panel de administración</p>
  <h1 style="${baseStyles.title}">¡Bienvenido al panel!</h1>
  <p>Hola ${escapeHtml(adminName)}, te dieron acceso de administrador al panel de Tango QR.</p>
  <div style="${baseStyles.card}">
    <p style="margin:0 0 16px;color:rgba(245,239,230,0.7);">Hacé clic en el botón para crear tu contraseña e ingresar:</p>
    <a href="${inviteLink}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Acceder al panel
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.5);font-size:13px;">O copiá este enlace en tu navegador:<br/>
    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${inviteLink}</span>
  </p>
  <p style="color:rgba(245,239,230,0.4);font-size:12px;">Este enlace expira en 24 horas. Si no lo esperabas, podés ignorar este email.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Panel de administración</p>
</div></body></html>`;
  return send(adminEmail, 'Acceso al panel de administración — Tango QR', html, 'ADMIN');
}

export async function sendAdminPasswordReset(
  adminName: string,
  adminEmail: string,
  resetLink: string,
): Promise<SendResult> {
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Panel de administración</p>
  <h1 style="${baseStyles.title}">Acceso al panel</h1>
  <p>Hola ${escapeHtml(adminName)}, se agregó/actualizó tu acceso de administrador.</p>
  <div style="${baseStyles.card}">
    <p style="margin:0 0 16px;color:rgba(245,239,230,0.7);">Hacé clic para crear una contraseña (o usá la que ya tenías si es la misma cuenta):</p>
    <a href="${resetLink}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Ir al panel
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.5);font-size:13px;">O copiá este enlace en tu navegador:<br/>
    <span style="font-family:monospace;font-size:11px;word-break:break-all;">${resetLink}</span>
  </p>
  <p style="color:rgba(245,239,230,0.4);font-size:12px;">Este enlace expira en 1 hora. Si no lo esperabas, podés ignorar este email.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Panel de administración</p>
</div></body></html>`;
  return send(adminEmail, 'Acceso al panel de administración — Tango QR', html, 'ADMIN');
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
  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const totalUsd: number = data.total_usd;
  const refundedUsd = refundedAmountUsd != null && refundedAmountUsd > 0 ? refundedAmountUsd : totalUsd;
  const isPartial = refundedUsd < totalUsd;

  // El reintegro se hace en PESOS (moneda del cobro en MP). En un refund total es
  // exactamente el total_ars que pagó el cliente; en uno parcial, el proporcional.
  const refundedArs = isPartial
    ? Math.round((refundedUsd * data.total_ars) / data.total_usd)
    : data.total_ars;
  const arsStr = refundedArs.toLocaleString('es-AR');

  const orderData: OrderEmailData & { reason?: string | null } = {
    ...toOrderData(data),
    total_usd: refundedUsd,
    total_ars: refundedArs,
    reason,
  };

  // 1) Cliente
  await send(
    data.customer_email,
    isPartial
      ? `Reintegro parcial de tu reserva — ARS ${arsStr}`
      : `Tu reserva fue cancelada — reintegro ARS ${arsStr}`,
    htmlForRefund(orderData),
    'CLIENTE',
  );

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    await send(
      config.ADMIN_NOTIFICATION_EMAIL,
      isPartial
        ? `[Reintegro parcial] ${orderData.customer_name} — ARS ${arsStr} (de ARS ${data.total_ars.toLocaleString('es-AR')})`
        : `[Reintegro procesado] ${orderData.customer_name} — ARS ${arsStr}`,
      htmlForRefund(orderData),
      'ADMIN',
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
        commission_ars: data.commission_ars,
        is_partial: isPartial,
      }),
      'VENDEDOR',
    );
  }
}

// ─── Modificación de reserva con reintegro parcial ──────────
// Se dispara cuando una reserva se reduce (menos pax o se quita traslado). En el
// momento del envío la orden YA tiene los nuevos totales, así que reservationCard
// muestra la reserva vigente; sumamos el monto reintegrado.
export async function sendOrderModifiedNotifications(
  orderId: number,
  _refundedUsd: number,
  refundedArs: number,
  reason?: string | null,
  viaCash = false,
  // Si la misma acción también reprogramó la fecha, se incluye acá en vez de mandar
  // un segundo email aparte (sendOrderRescheduledNotifications queda sin usar en ese
  // caso — ver ModifyReservationModal, que suprime esa notificación cuando hay reduce).
  dateChange?: { prevDate: string; newDate: string } | null,
): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);
  const arsStr = refundedArs.toLocaleString('es-AR');
  const refundLine = viaCash
    ? `<p><strong style="color:#c8a85a">El recomendador te devuelve ARS ${arsStr}</strong> en efectivo.</p>`
    : `<p><strong style="color:#c8a85a">Te reintegramos ARS ${arsStr}</strong> al mismo medio de pago. El reintegro puede tardar entre 2 y 5 días hábiles en aparecer.</p>`;
  const dateChangeLine = dateChange
    ? `<p style="color:rgba(245,239,230,0.8)">También reprogramamos tu fecha de servicio: de <strong style="color:#e0c787">${dateChange.prevDate}</strong> a <strong style="color:#e0c787">${dateChange.newDate}</strong>.</p>`
    : '';

  // 1) Cliente
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Actualizamos tu reserva</h1>
  ${ticketBadge()}
  <p>Hola ${escapeHtml(orderData.customer_name)}, modificamos tu reserva según lo acordado${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  ${refundLine}
  ${dateChangeLine}
  <p style="color:rgba(245,239,230,0.7)">Así queda tu reserva actualizada:</p>
  ${reservationCard(orderData, { showContact: true })}
  ${voucherButtonBlock(orderData.public_id)}
  <p>Guardá este email como comprobante actualizado. Cualquier duda, respondé este correo o escribinos por WhatsApp con tu número de referencia.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `Reserva actualizada — reintegro ARS ${arsStr}`, customerHtml, 'CLIENTE');

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Reserva modificada</h1>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Nueva composición</span><strong>${orderData.adults} ad · ${orderData.children} men${orderData.infants != null && orderData.infants > 0 ? ` · ${orderData.infants} inf` : ''}${orderData.transfer_qty != null && orderData.transfer_qty > 0 ? ` · traslado ${orderData.transfer_qty}/${orderData.adults + orderData.children}` : ''}</strong></div>
    ${dateChange ? `<div style="${baseStyles.row}"><span>Fecha reprogramada</span><strong>${dateChange.prevDate} → ${dateChange.newDate}</strong></div>` : ''}
    <div style="${baseStyles.row}"><span>Reintegrado</span><strong style="color:#c8a85a">ARS ${arsStr}</strong></div>
    <div style="${baseStyles.row}"><span>Nuevo total</span><strong>${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
  </div>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Modificada] ${orderData.customer_name} — reintegro ARS ${arsStr}`, adminHtml, 'ADMIN');
  }

  // 3) Vendedor (si hay atribución y email) — su comisión se ajustó al nuevo total
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Una venta tuya se modificó</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, una reserva atribuida a tu código se redujo${reason ? ` — ${escapeHtml(reason)}` : ''}. Tu incentivo por recomendación se ajustó al nuevo total.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Nueva composición</span><strong>${orderData.adults} ad · ${orderData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Nuevo total</span><strong>${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Tu incentivo por recomendación ajustado</span><strong style="color:#c8a85a">${fmtArs(data.commission_ars ?? 0)}</strong></div>
  </div>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(data.seller_email, `Venta modificada — ${orderData.option_name}`, sellerHtml, 'VENDEDOR');
  }
}

// ─── Aumento de reserva (pasajeros agregados) ───────────────
// La orden ya tiene la composición nueva al enviarse. `charged` = lo cobrado de más.
export async function sendOrderIncreasedNotifications(
  orderId: number,
  _chargedUsd: number,
  chargedArs: number,
  reason?: string | null,
): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);
  const arsStr = chargedArs.toLocaleString('es-AR');

  // 1) Cliente
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Sumamos pasajeros a tu reserva</h1>
  ${ticketBadge()}
  <p>Hola ${escapeHtml(orderData.customer_name)}, actualizamos tu reserva con los pasajeros que agregaste${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  <p>Cargo adicional: <strong style="color:#c8a85a">ARS ${arsStr}</strong>.</p>
  ${reservationCard(orderData, { showContact: true })}
  ${voucherButtonBlock(orderData.public_id)}
  <p>Guardá este email como comprobante actualizado. Cualquier duda, respondé este correo o escribinos por WhatsApp con tu número de referencia.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `Reserva actualizada — ${orderData.option_name}`, customerHtml, 'CLIENTE');

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Reserva ampliada</h1>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Nueva composición</span><strong>${orderData.adults} ad · ${orderData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Cobro adicional</span><strong style="color:#c8a85a">ARS ${arsStr}</strong></div>
    <div style="${baseStyles.row}"><span>Nuevo total</span><strong>${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
  </div>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Ampliada] ${orderData.customer_name} — +ARS ${arsStr}`, adminHtml, 'ADMIN');
  }

  // 3) Vendedor (si hay atribución) — comisión ajustada al nuevo total
  if (data.seller_name && data.seller_email && data.commission_usd != null) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Una venta tuya se amplió</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, una reserva atribuida a tu código sumó pasajeros. Tu incentivo por recomendación se ajustó al nuevo total.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Nueva composición</span><strong>${orderData.adults} ad · ${orderData.children} men</strong></div>
    <div style="${baseStyles.row}"><span>Nuevo total</span><strong>${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Tu incentivo por recomendación ajustado</span><strong style="color:#c8a85a">${fmtArs(data.commission_ars ?? 0)}</strong></div>
  </div>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(data.seller_email, `Venta ampliada — ${orderData.option_name}`, sellerHtml, 'VENDEDOR');
  }
}

// ─── Reprogramación de fecha ──────────────────────────────────
// No cambia ningún monto, solo la fecha de servicio — pero las 3 partes necesitan
// enterarse: el cliente para no presentarse el día viejo, y admin/vendedor para el seguimiento.
export async function sendOrderRescheduledNotifications(
  orderId: number,
  prevDate: string,
  newDate: string,
  reason?: string | null,
  actor: 'admin' | 'seller' = 'admin',
): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);
  const actorLabel = actor === 'seller' ? 'tu recomendador' : 'nuestro equipo';

  // 1) Cliente
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Reprogramamos tu reserva</h1>
  ${ticketBadge()}
  <p>Hola ${escapeHtml(orderData.customer_name)}, ${actorLabel} reprogramó tu reserva${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  <p><strong style="color:#c8a85a">Nueva fecha: ${newDate}</strong> (antes era ${prevDate}).</p>
  ${reservationCard(orderData, { showAmounts: false })}
  ${voucherButtonBlock(orderData.public_id)}
  <p>Guardá este email como comprobante actualizado. Cualquier duda, respondé este correo o escribinos por WhatsApp con tu número de referencia.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `Reserva reprogramada — nueva fecha ${newDate}`, customerHtml, 'CLIENTE');

  // 2) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Reserva reprogramada</h1>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha anterior</span><strong>${prevDate}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha nueva</span><strong style="color:#c8a85a">${newDate}</strong></div>
    <div style="${baseStyles.row}"><span>Reprogramado por</span><strong>${actor === 'seller' ? 'Recomendador' : 'Admin'}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
  </div>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Reprogramada] ${orderData.customer_name} — ${prevDate} → ${newDate}`, adminHtml, 'ADMIN');
  }

  // 3) Vendedor (si hay atribución y email) — no afecta su comisión, solo aviso operativo
  if (data.seller_name && data.seller_email) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Una venta tuya se reprogramó</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, una reserva atribuida a tu código cambió de fecha${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha anterior</span><strong>${prevDate}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha nueva</span><strong style="color:#c8a85a">${newDate}</strong></div>
  </div>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(data.seller_email, `Venta reprogramada — ${orderData.option_name}`, sellerHtml, 'VENDEDOR');
  }
}

// ─── Cancelación iniciada por el vendedor ────────────────────
// El cliente tiene que coordinar la devolución del dinero directamente con el vendedor
// (sobre todo en efectivo). Este email avisa al cliente y al admin; el vendedor no recibe
// porque él mismo inició la acción.
export async function sendSellerCancelledNotifications(
  orderId: number,
  reason?: string | null,
): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);
  const sellerLabel = data.seller_name ? escapeHtml(data.seller_name) : 'el recomendador';
  const reasonLine = reason ? `<p style="color:rgba(245,239,230,0.7)">Motivo indicado: ${escapeHtml(reason)}</p>` : '';
  // Esta función solo se usa para cancelaciones de reservas en EFECTIVO (el vendedor no
  // puede cancelar Mercado Pago). Si nunca se llegó a cobrar, no hay nada que devolver —
  // decirle al pasajero que "coordine la devolución" en ese caso sería confuso.
  const wasCollected = data.cash_collected_at != null;
  const refundLine = wasCollected
    ? `<p><strong style="color:#c8a85a">Para gestionar la devolución del dinero, contactá directamente a ${sellerLabel}.</strong> Si necesitás ayuda o no lográs comunicarte, escribinos por WhatsApp y te asistimos.</p>`
    : `<p>Como todavía no se había realizado ningún cobro, no tenés que hacer ningún trámite de devolución.</p>`;

  // 1) Cliente — le decimos explícitamente que coordine la devolución con el vendedor
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Tu reserva fue cancelada</h1>
  <p>Hola ${escapeHtml(orderData.customer_name)}, ${sellerLabel} canceló tu reserva${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  ${refundLine}
  ${reservationCard(orderData, { showAmounts: true, showContact: true })}
  ${reasonLine}
  <p>Si querés reservar otra fecha u otra experiencia, respondé este email o escribinos por WhatsApp y te ayudamos a coordinar.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(
    data.customer_email,
    `Tu reserva fue cancelada — ${orderData.option_name}`,
    customerHtml,
    'CLIENTE',
  );

  // 2) Vendedor — confirmación de que la cancelación se procesó y el cliente fue notificado
  if (data.seller_name && data.seller_email) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Cancelación registrada</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, confirmamos que cancelaste la siguiente reserva${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  <p>${wasCollected
    ? 'El pasajero recibió un email indicándole que coordine la devolución del dinero directamente con vos.'
    : 'Como todavía no se había cobrado nada, el pasajero fue notificado de que no tiene que hacer ningún trámite.'}</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Pasajero</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email pasajero</span><span>${escapeHtml(orderData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${orderData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
  </div>
  <p style="color:rgba(245,239,230,0.6);font-size:13px;">Si necesitás asistencia para coordinar la devolución, escribinos por WhatsApp.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(
      data.seller_email,
      `Cancelación registrada — ${orderData.option_name} (${escapeHtml(orderData.customer_name)})`,
      sellerHtml,
      'VENDEDOR',
    );
  }

  // 3) Admin — aviso con todos los datos para seguimiento
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Reserva cancelada por recomendador</h1>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Orden cancelada</p>
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email cliente</span><span>${escapeHtml(orderData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha servicio</span><strong>${orderData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
  </div>
  ${data.seller_name ? `
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Recomendador que canceló</p>
    <div style="${baseStyles.row}"><span>Nombre</span><strong>${escapeHtml(data.seller_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Código</span><span style="font-family:monospace">${escapeHtml(data.seller_code ?? '')}</span></div>
    ${data.seller_email ? `<div style="${baseStyles.row}"><span>Email</span><span>${escapeHtml(data.seller_email)}</span></div>` : ''}
    <div style="${baseStyles.row}"><span>Incentivo por recomendación que no aplica</span><strong>${fmtArs(data.commission_ars ?? 0)}</strong></div>
  </div>` : ''}
  ${reason ? `<p style="color:rgba(245,239,230,0.7)"><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
  <p style="color:rgba(245,239,230,0.55);font-size:13px;">${wasCollected
    ? '⚠ El cliente fue notificado para coordinar la devolución del dinero directamente con el recomendador.'
    : 'ℹ La reserva no había sido cobrada — el cliente fue notificado de que no hay ningún trámite de devolución pendiente.'}</p>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(
      config.ADMIN_NOTIFICATION_EMAIL,
      `[Cancelada por recomendador] ${orderData.customer_name} — ${escapeHtml(orderData.option_name)}`,
      adminHtml,
      'ADMIN',
    );
  }
}

// ─── Cancelación por el administrador ───────────────────────
export async function sendAdminCancelledNotifications(
  orderId: number,
  reason?: string | null,
): Promise<void> {
  if (!isEnabled() && !config.ADMIN_NOTIFICATION_EMAIL) return;

  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return;

  const orderData = toOrderData(data);
  const reasonLine = reason ? `<p style="color:rgba(245,239,230,0.7)">Motivo: ${escapeHtml(reason)}</p>` : '';
  // Este cambio de estado es manual y NO dispara un reintegro real en Mercado Pago (para
  // eso existe el botón "Reintegrar" dedicado, que usa /refund y manda otro email). Así
  // que para MP nunca hay que prometer un reintegro automático acá. Para efectivo, el
  // mensaje depende de si efectivamente se había cobrado algo.
  const isCash = data.payment_method === 'cash';
  const wasCollected = data.cash_collected_at != null;
  const refundLine = isCash
    ? (wasCollected
        ? '<strong style="color:#c8a85a">El recomendador se pondrá en contacto para coordinar la devolución del dinero.</strong>'
        : 'Como todavía no se había realizado ningún cobro, no tenés que hacer ningún trámite de devolución.')
    : 'Esta cancelación no generó un reintegro automático. Si corresponde una devolución, nuestro equipo se va a contactar para coordinarla.';

  // 1) Cliente
  const customerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Buenos Aires</p>
  <h1 style="${baseStyles.title}">Tu reserva fue cancelada</h1>
  <p>Hola ${escapeHtml(orderData.customer_name)}, el equipo de Tango QR canceló tu reserva${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  <p>${refundLine}</p>
  ${reservationCard(orderData, { showAmounts: true, showContact: true })}
  ${reasonLine}
  <p>Si querés reservar otra fecha u otra experiencia, respondé este email o escribinos por WhatsApp.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Buenos Aires · ${new Date().getFullYear()}</p>
</div></body></html>`;
  await send(data.customer_email, `Tu reserva fue cancelada — ${orderData.option_name}`, customerHtml, 'CLIENTE');

  // 2) Vendedor (si la orden tenía atribución)
  if (data.seller_name && data.seller_email) {
    const sellerHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Recomendadores</p>
  <h1 style="${baseStyles.title}">Una reserva tuya fue cancelada</h1>
  <p>Hola ${escapeHtml(data.seller_name)}, el administrador canceló la siguiente reserva atribuida a tu código${reason ? ` — ${escapeHtml(reason)}` : ''}.</p>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Pasajero</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha del servicio</span><strong>${orderData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
  </div>
  ${reasonLine}
  <p style="color:rgba(245,239,230,0.6);font-size:13px;">El pasajero fue notificado. Si tenés dudas escribinos por WhatsApp.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
    await send(data.seller_email, `[Cancelada por admin] ${escapeHtml(orderData.customer_name)} — ${escapeHtml(orderData.option_name)}`, sellerHtml, 'VENDEDOR');
  }

  // 3) Admin
  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Reserva cancelada por admin</h1>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Cliente</span><strong>${escapeHtml(orderData.customer_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Email cliente</span><span>${escapeHtml(orderData.customer_email)}</span></div>
    <div style="${baseStyles.row}"><span>Servicio</span><strong>${escapeHtml(orderData.option_name)} — ${escapeHtml(orderData.product_name)}</strong></div>
    <div style="${baseStyles.row}"><span>Fecha servicio</span><strong>${orderData.service_date}</strong></div>
    <div style="${baseStyles.row}"><span>Total</span><strong style="color:#c8a85a">${fmtArs(orderData.total_ars)}</strong></div>
    <div style="${baseStyles.row}"><span>Referencia</span><span style="font-family:monospace;font-size:11px">${orderData.public_id}</span></div>
    ${data.seller_name ? `<div style="${baseStyles.row}"><span>Recomendador</span><strong>${escapeHtml(data.seller_name)}</strong></div>` : ''}
  </div>
  ${reason ? `<p style="color:rgba(245,239,230,0.7)"><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Cancelada admin] ${orderData.customer_name} — ${escapeHtml(orderData.option_name)}`, adminHtml, 'ADMIN');
  }
}

// ─── Email de liquidación al vendedor ───────────────────────
export async function sendSellerCommissionPaid(input: {
  sellerId: number;
  sellerName: string;
  sellerEmail: string;
  ordersCount: number;
  totalCommissionUsd: number;
  totalCommissionArs: number;
  portalUrl: string;
}): Promise<void> {
  const { sellerId, sellerName, sellerEmail, ordersCount, totalCommissionUsd, totalCommissionArs, portalUrl } = input;
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Liquidaciones</p>
  <h1 style="${baseStyles.title}">¡Liquidación procesada!</h1>
  <p>Hola ${escapeHtml(sellerName)}, el equipo de Tango QR procesó una liquidación de incentivos por recomendación a tu favor.</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Detalle de la liquidación</p>
    <div style="${baseStyles.row}"><span>Ventas liquidadas</span><strong>${ordersCount} venta${ordersCount === 1 ? '' : 's'}</strong></div>
    <div style="${baseStyles.row}"><span>Total acreditado</span><strong style="color:#c8a85a;font-size:22px">USD ${totalCommissionUsd.toFixed(2)}</strong></div>
  </div>
  <p>Podés ver el detalle completo en tu portal de recomendadores.</p>
  <div style="${baseStyles.card}">
    <a href="${portalUrl}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Ver mi portal
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.6);font-size:13px;">¿Tenés alguna duda sobre el monto o las ventas incluidas? Escribinos por WhatsApp y te respondemos a la brevedad.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
  await send(sellerEmail, `Liquidación procesada — USD ${totalCommissionUsd.toFixed(2)} acreditados`, html, 'VENDEDOR');

  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Liquidación MP confirmada</h1>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Recomendador</span><strong>${escapeHtml(sellerName)}</strong></div>
    <div style="${baseStyles.row}"><span>Ventas liquidadas</span><strong>${ordersCount}</strong></div>
    <div style="${baseStyles.row}"><span>Total pagado</span><strong style="color:#c8a85a">${fmtArs(totalCommissionArs)} (USD ${totalCommissionUsd.toFixed(2)})</strong></div>
    <div style="${baseStyles.row}"><span>Recomendador ID</span><span style="font-family:monospace">${sellerId}</span></div>
  </div>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Liquidación MP] ${sellerName} — ${fmtArs(totalCommissionArs)}`, adminHtml, 'ADMIN');
  }
}

// ─── Rendición en efectivo confirmada por el admin ───────────
// El vendedor le rinde a la agencia el neto de sus ventas en efectivo; esto confirma
// que ese dinero YA llegó y quedó reconciliado (dirección opuesta a la comisión MP).
export async function sendNetSettledConfirmation(input: {
  sellerId: number;
  sellerName: string;
  sellerEmail: string;
  ordersCount: number;
  totalNetArs: number;
  portalUrl: string;
}): Promise<void> {
  const { sellerId, sellerName, sellerEmail, ordersCount, totalNetArs, portalUrl } = input;
  const html = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Liquidaciones</p>
  <h1 style="${baseStyles.title}">¡Rendición confirmada!</h1>
  <p>Hola ${escapeHtml(sellerName)}, confirmamos que recibimos tu rendición en efectivo. Ya quedó todo en orden.</p>
  <div style="${baseStyles.card}">
    <p style="${baseStyles.eyebrow}">Detalle de la rendición</p>
    <div style="${baseStyles.row}"><span>Ventas rendidas</span><strong>${ordersCount} venta${ordersCount === 1 ? '' : 's'}</strong></div>
    <div style="${baseStyles.row}"><span>Neto recibido</span><strong style="color:#c8a85a;font-size:22px">${fmtArs(totalNetArs)}</strong></div>
  </div>
  <p>Podés ver el detalle completo en tu portal de recomendadores.</p>
  <div style="${baseStyles.card}">
    <a href="${portalUrl}" style="display:inline-block;background:#c8a85a;color:#0d0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
      Ver mi portal
    </a>
  </div>
  <p style="color:rgba(245,239,230,0.6);font-size:13px;">¿Alguna diferencia en el monto? Escribinos por WhatsApp y lo revisamos.</p>
  ${supportBlock()}
  <p style="${baseStyles.footer}">Tango QR · Programa de incentivos por recomendación</p>
</div></body></html>`;
  await send(sellerEmail, `Rendición confirmada — ${fmtArs(totalNetArs)} recibidos`, html, 'VENDEDOR');

  if (config.ADMIN_NOTIFICATION_EMAIL) {
    const adminHtml = `
<!doctype html>
<html><body style="${baseStyles.body}"><div style="${baseStyles.container}">
  <p style="${baseStyles.eyebrow}">Tango QR · Admin</p>
  <h1 style="${baseStyles.title}">Rendición en efectivo confirmada</h1>
  <div style="${baseStyles.card}">
    <div style="${baseStyles.row}"><span>Recomendador</span><strong>${escapeHtml(sellerName)}</strong></div>
    <div style="${baseStyles.row}"><span>Ventas rendidas</span><strong>${ordersCount}</strong></div>
    <div style="${baseStyles.row}"><span>Neto recibido</span><strong style="color:#c8a85a">${fmtArs(totalNetArs)}</strong></div>
    <div style="${baseStyles.row}"><span>Recomendador ID</span><span style="font-family:monospace">${sellerId}</span></div>
  </div>
  <p style="${baseStyles.footer}">Notificación automática · Tango QR admin</p>
</div></body></html>`;
    await send(config.ADMIN_NOTIFICATION_EMAIL, `[Rendición efectivo] ${sellerName} — ${fmtArs(totalNetArs)}`, adminHtml, 'ADMIN');
  }
}
