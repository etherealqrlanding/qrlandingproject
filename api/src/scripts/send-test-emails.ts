// Dispara una copia de CADA email que la app puede enviar (cliente, vendedor, admin) contra
// datos reales ya existentes en la base, sin tener que recorrer cada flujo de negocio real
// (comprar, reembolsar, cancelar, etc). Pensado para que el analista de negocio revise de
// una sola vez la comunicación de cada etapa.
//
// Requiere TEST_EMAIL_OVERRIDE seteada (ver email.ts: send() redirige ahí TODO destinatario
// y prefija el asunto con "[MAIL TESTING - CLIENTE/VENDEDOR/ADMIN]"). El script se niega a
// correr sin esa variable — sin ella, esto mandaría emails reales a clientes/vendedores.
//
// Uso (manda por SMTP/Resend, según lo que tengas configurado):
//   TEST_EMAIL_OVERRIDE=tu@mail.com npm run send:test-emails
//
// Uso en modo dry-run (no manda nada por red, no gasta cuota — guarda cada email como .html
// en api/tmp-test-emails/ + un index.html para repasarlos todos desde el navegador):
//   TEST_EMAIL_OVERRIDE=tu@mail.com TEST_EMAIL_DRY_RUN=true npm run send:test-emails
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db.js';
import { config } from '../config.js';
import {
  sendPaymentLinkEmail,
  sendOrderPaidNotifications,
  sendCashOrderNotifications,
  sendCashCollectedNotifications,
  sendSellerPortalInvite,
  sendSellerPasswordReset,
  sendAdminPortalInvite,
  sendAdminPasswordReset,
  sendOrderRefundedNotifications,
  sendOrderModifiedNotifications,
  sendOrderIncreasedNotifications,
  sendOrderRescheduledNotifications,
  sendSellerCancelledNotifications,
  sendAdminCancelledNotifications,
  sendSellerCommissionPaid,
  sendNetSettledConfirmation,
} from '../services/email.js';

// Pequeña pausa entre triggers para no saturar el rate limit del proveedor (Resend/SMTP).
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pickOrderId(paymentMethod: 'mercadopago' | 'pix' | 'cash', requireCashCollected = false): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT o.id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN order_attributions a ON a.order_id = o.id
       JOIN sellers s ON s.id = a.seller_id
      WHERE o.payment_method = $1
        AND s.contact_email IS NOT NULL
        AND a.commission_amount_usd > 0
        ${requireCashCollected ? 'AND o.cash_collected_at IS NOT NULL' : ''}
      ORDER BY o.id DESC
      LIMIT 1`,
    [paymentMethod],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(
      `No encontré en la base una orden de ejemplo con payment_method="${paymentMethod}"` +
      (requireCashCollected ? ' y cobro en efectivo confirmado' : '') +
      ' con vendedor y comisión asignados. Ajustá el script con un order_id manual.',
    );
  }
  return id;
}

async function pickSeller(): Promise<{ id: number; name: string; email: string }> {
  const { rows } = await pool.query<{ id: number; name: string; contact_email: string }>(
    `SELECT id, name, contact_email FROM sellers WHERE contact_email IS NOT NULL ORDER BY id DESC LIMIT 1`,
  );
  if (!rows[0]) throw new Error('No hay ningún vendedor con contact_email en la base.');
  return { id: rows[0].id, name: rows[0].name, email: rows[0].contact_email };
}

async function pickAdmin(): Promise<{ name: string; email: string }> {
  const { rows } = await pool.query<{ full_name: string; email: string }>(
    `SELECT full_name, email FROM admin_users ORDER BY created_at DESC LIMIT 1`,
  );
  if (!rows[0]) throw new Error('No hay ningún admin en la base.');
  return { name: rows[0].full_name, email: rows[0].email };
}

async function main() {
  if (!config.TEST_EMAIL_OVERRIDE) {
    throw new Error(
      'TEST_EMAIL_OVERRIDE no está seteada. Corré: TEST_EMAIL_OVERRIDE=tu@mail.com npm run send:test-emails\n' +
      'Sin esto, este script mandaría los emails a clientes y vendedores REALES de la base.',
    );
  }
  if (config.NODE_ENV === 'production') {
    throw new Error('Este script no corre con NODE_ENV=production (a propósito).');
  }

  console.log(`→ Todos los emails se van a redirigir a ${config.TEST_EMAIL_OVERRIDE} con prefijo [MAIL TESTING]\n`);

  const mpOrderId = await pickOrderId('mercadopago');
  const pixOrderId = await pickOrderId('pix');
  const cashOrderId = await pickOrderId('cash', true);
  const seller = await pickSeller();
  const admin = await pickAdmin();
  const { rows: mpTotalRows } = await pool.query<{ total_usd: number }>(
    'SELECT total_usd::float AS total_usd FROM orders WHERE id = $1', [mpOrderId],
  );
  const mpTotalUsd = mpTotalRows[0].total_usd;

  console.log(`Órdenes de ejemplo → MP: #${mpOrderId} · PIX: #${pixOrderId} · Efectivo: #${cashOrderId}`);
  console.log(`Vendedor de ejemplo → ${seller.name} <${seller.email}>`);
  console.log(`Admin de ejemplo → ${admin.name} <${admin.email}>\n`);

  const steps: Array<[string, () => Promise<unknown>]> = [
    // ── Link de pago pendiente (previo al pago) ──
    ['Link de pago — PIX', () => sendPaymentLinkEmail(pixOrderId, `${config.WEB_ORIGIN}/mock-pix-link-test`)],
    ['Link de pago — Mercado Pago', () => sendPaymentLinkEmail(mpOrderId, `${config.WEB_ORIGIN}/mock-mp-link-test`)],

    // ── Pago confirmado (online) ──
    ['Orden pagada (cliente/admin/vendedor)', () => sendOrderPaidNotifications(mpOrderId)],

    // ── Efectivo: reserva creada, luego cobro confirmado ──
    ['Reserva en efectivo creada (admin/vendedor)', () => sendCashOrderNotifications(cashOrderId)],
    ['Cobro en efectivo confirmado — por el vendedor', () => sendCashCollectedNotifications(cashOrderId, 'seller')],
    ['Cobro en efectivo confirmado — por el admin', () => sendCashCollectedNotifications(cashOrderId, 'admin')],

    // ── Reintegros ──
    ['Reintegro total', () => sendOrderRefundedNotifications(mpOrderId, 'El cliente no puede viajar en esa fecha', null)],
    ['Reintegro parcial', () => sendOrderRefundedNotifications(mpOrderId, 'Se redujo la cantidad de pasajeros', mpTotalUsd / 2)],

    // ── Modificación (reducción de pax con reintegro) ──
    ['Reserva modificada — reintegro por Mercado Pago', () => sendOrderModifiedNotifications(mpOrderId, 20, 30000, 'Bajó de 4 a 2 pasajeros', false, null)],
    ['Reserva modificada — reintegro en efectivo + reprogramada', () => sendOrderModifiedNotifications(cashOrderId, 20, 30000, 'Bajó de 4 a 2 pasajeros', true, { prevDate: '2026-08-10', newDate: '2026-08-17' })],

    // ── Ampliación (más pax, cobro adicional) ──
    ['Reserva ampliada (más pasajeros)', () => sendOrderIncreasedNotifications(mpOrderId, 15, 22000, 'Se sumaron 2 pasajeros adultos')],

    // ── Reprogramación de fecha ──
    ['Reserva reprogramada — por el admin', () => sendOrderRescheduledNotifications(mpOrderId, '2026-08-10', '2026-08-17', 'El cliente pidió cambiar el día', 'admin')],
    ['Reserva reprogramada — por el vendedor', () => sendOrderRescheduledNotifications(mpOrderId, '2026-08-10', '2026-08-17', 'El cliente pidió cambiar el día', 'seller')],

    // ── Cancelaciones ──
    ['Cancelación por el vendedor (efectivo ya cobrado)', () => sendSellerCancelledNotifications(cashOrderId, 'El cliente avisó que no puede asistir')],
    ['Cancelación por el admin', () => sendAdminCancelledNotifications(mpOrderId, 'Solicitud del cliente vía WhatsApp')],

    // ── Accesos a portales (vendedor / admin) ──
    ['Invitación al portal de vendedores', () => sendSellerPortalInvite(seller.name, seller.email, `${config.WEB_ORIGIN}/vendedor/invite/mock-token-test`)],
    ['Reset de contraseña — vendedor', () => sendSellerPasswordReset(seller.name, seller.email, `${config.WEB_ORIGIN}/vendedor/reset/mock-token-test`)],
    ['Invitación al panel de admin', () => sendAdminPortalInvite(admin.name, admin.email, `${config.WEB_ORIGIN}/admin/invite/mock-token-test`)],
    ['Reset de contraseña — admin', () => sendAdminPasswordReset(admin.name, admin.email, `${config.WEB_ORIGIN}/admin/reset/mock-token-test`)],

    // ── Liquidaciones ──
    ['Liquidación de comisiones MP pagada', () => sendSellerCommissionPaid({
      sellerId: seller.id, sellerName: seller.name, sellerEmail: seller.email,
      ordersCount: 5, totalCommissionUsd: 145.5, totalCommissionArs: 218250,
      portalUrl: `${config.WEB_ORIGIN}/vendedor`,
    })],
    ['Rendición en efectivo confirmada', () => sendNetSettledConfirmation({
      sellerId: seller.id, sellerName: seller.name, sellerEmail: seller.email,
      ordersCount: 3, totalNetArs: 95000,
      portalUrl: `${config.WEB_ORIGIN}/vendedor`,
    })],
  ];

  for (const [label, run] of steps) {
    process.stdout.write(`· ${label}... `);
    try {
      await run();
      console.log('ok');
    } catch (err) {
      console.log('FALLÓ');
      console.error(err);
    }
    await pause(400);
  }

  if (config.TEST_EMAIL_DRY_RUN === 'true') {
    const indexPath = buildDryRunIndex();
    console.log(`\n✅ Listo — modo dry-run, no se envió nada por red. Abrí:\n   ${indexPath}`);
  } else {
    console.log(`\n✅ Listo — revisá ${config.TEST_EMAIL_OVERRIDE} (asunto con prefijo "[MAIL TESTING - CLIENTE/VENDEDOR/ADMIN]").`);
  }
}

// Arma un index.html con un link a cada .html generado, agrupados por CLIENTE/VENDEDOR/ADMIN,
// para no tener que abrir archivo por archivo.
function buildDryRunIndex(): string {
  const dir = path.resolve(process.cwd(), 'tmp-test-emails');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html');
  const groups: Record<string, string[]> = { CLIENTE: [], VENDEDOR: [], ADMIN: [], 'SIN-AUDIENCIA': [] };
  for (const f of files) {
    const audience = f.split('__')[1] ?? 'SIN-AUDIENCIA';
    (groups[audience] ?? (groups[audience] = [])).push(f);
  }
  const section = (title: string, list: string[]) => list.length === 0 ? '' : `
    <h2>${title} (${list.length})</h2>
    <ul>${list.map((f) => `<li><a href="${encodeURIComponent(f)}" target="preview">${f.split('__').slice(2).join('__').replace('.html', '')}</a></li>`).join('')}</ul>`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>MAIL TESTING — Tango QR</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; display: flex; height: 100vh; }
  nav { width: 380px; overflow-y: auto; padding: 16px; border-right: 1px solid #ccc; box-sizing: border-box; }
  iframe { flex: 1; border: none; }
  h2 { font-size: 14px; text-transform: uppercase; color: #666; margin: 20px 0 6px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li a { display: block; padding: 6px 8px; border-radius: 6px; text-decoration: none; color: #222; font-size: 13px; }
  li a:hover { background: #eee; }
</style></head>
<body>
  <nav>
    <h1 style="font-size:16px">📧 MAIL TESTING</h1>
    <p style="font-size:12px;color:#888">Click en un email para verlo a la derecha.</p>
    ${section('Cliente', groups.CLIENTE)}
    ${section('Vendedor', groups.VENDEDOR)}
    ${section('Admin', groups.ADMIN)}
    ${section('Sin audiencia', groups['SIN-AUDIENCIA'])}
  </nav>
  <iframe name="preview"></iframe>
</body></html>`;
  const indexPath = path.join(dir, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf-8');
  return indexPath;
}

main()
  .catch((err) => {
    console.error('❌', err.message ?? err);
    process.exit(1);
  })
  .finally(() => pool.end());
