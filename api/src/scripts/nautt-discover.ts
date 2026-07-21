// Helper: descubre los UUIDs de BRL + método PIX de la cuenta Nautt del entorno actual.
// Útil sobre todo para SANDBOX, donde los uuids difieren de producción.
//
//   NAUTT_API_KEY=... NAUTT_BASE_URL=https://api-stage.nauttfinance.com npm run nautt:discover
//
// (Si no pasás NAUTT_BASE_URL, usa el del .env o producción por defecto.)
//
// Técnica: la lista /exchange-currencies no embebe los métodos de pago, así que creamos
// un payment-link temporal en BRL, leemos su detalle público (que sí trae
// currency.payment_methods con el uuid del método PIX) y lo borramos.
import 'dotenv/config';

const KEY = process.env.NAUTT_API_KEY;
const BASE = process.env.NAUTT_BASE_URL || 'https://api.nauttfinance.com';

if (!KEY) {
  console.error('✗ Falta NAUTT_API_KEY en el entorno (.env o inline).');
  process.exit(1);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v2${path}`, {
    ...init,
    headers: { 'X-API-Key': KEY as string, 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${res.status} ${body?.code ?? ''} ${body?.message ?? ''} (${path})`);
  }
  return body.data as T;
}

async function main() {
  console.log(`→ Entorno: ${BASE}`);

  // 1) BRL currency uuid
  const currencies = await api<Array<{ currency: { uuid: string; symbol: string; name: string } }>>('/exchange-currencies');
  const brl = currencies.find((c) => c.currency?.symbol === 'BRL')?.currency;
  if (!brl) throw new Error('No se encontró la moneda BRL en /exchange-currencies para esta cuenta.');
  console.log(`  BRL currency_uuid: ${brl.uuid} (${brl.name})`);

  // 2) Crear payment-link temporal para leer los métodos de pago (PIX)
  const link = await api<{ uuid: string }>('/payment-links', {
    method: 'POST',
    body: JSON.stringify({
      name: 'discover-uuids (temporal, se borra)',
      currency_uuid: brl.uuid,
      clients: [{ name: 'discover', email: 'discover@example.com' }],
      products: [{ name: 'discover', price: 1, quantity: 1 }],
      fixed: true,
    }),
  });

  try {
    const detail = await api<{ currency: { payment_methods: Array<{ uuid: string; payment_method: string; deposit: boolean; conversion: boolean; min_deposit?: string }> } }>(
      `/payment-links/${link.uuid}`,
    );
    const methods = detail.currency?.payment_methods ?? [];
    const pix = methods.find((m) => /pix/i.test(m.payment_method) && m.deposit);
    console.log('  Métodos de pago BRL disponibles:');
    for (const m of methods) {
      const mark = m === pix ? '  ← PIX (usar este)' : '';
      console.log(`    - ${m.payment_method.padEnd(14)} uuid=${m.uuid} deposit=${m.deposit} conversion=${m.conversion}${mark}`);
    }
    if (!pix) throw new Error('No se encontró un método PIX con depósito habilitado en BRL.');

    console.log('\n✔ Pegá esto en tu .env:');
    console.log(`NAUTT_CURRENCY_UUID_BRL=${brl.uuid}`);
    console.log(`NAUTT_PIX_EXCHANGE_UUID=${pix.uuid}`);
    if (pix.min_deposit) console.log(`# (min_deposit informado: ${pix.min_deposit})`);
  } finally {
    // Borrar el link temporal siempre.
    await api(`/payment-links/${link.uuid}`, { method: 'DELETE' }).catch((e) =>
      console.error('  ⚠ No se pudo borrar el link temporal', link.uuid, '—', (e as Error).message),
    );
  }
}

main().catch((e) => { console.error('✗ Falló:', (e as Error).message); process.exit(1); });
