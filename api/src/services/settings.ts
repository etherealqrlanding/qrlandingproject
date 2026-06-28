import { pool } from '../db.js';

const RATE_KEY = 'exchange_rate_usd_ars';

interface ExchangeRatePayload {
  rate: number;
  updated_at: string;
}

export async function getExchangeRate(): Promise<number> {
  const { rows } = await pool.query<{ value: ExchangeRatePayload }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [RATE_KEY],
  );
  const rate = rows[0]?.value?.rate;
  if (typeof rate !== 'number' || rate <= 0) {
    throw new Error('Exchange rate USD→ARS not configured. Set "exchange_rate_usd_ars" in settings.');
  }
  return rate;
}

export async function setExchangeRate(rate: number): Promise<void> {
  if (rate <= 0) throw new Error('Exchange rate must be positive');
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      RATE_KEY,
      JSON.stringify({ rate, updated_at: new Date().toISOString() }),
      'Tipo de cambio USD→ARS aplicado al cobrar con Mercado Pago.',
    ],
  );
}

const CUTOFF_KEY = 'same_day_booking_cutoff';

export async function getSameDayCutoff(): Promise<string | null> {
  const { rows } = await pool.query<{ value: { time: string } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [CUTOFF_KEY],
  );
  return rows[0]?.value?.time ?? null;
}

export async function setSameDayCutoff(time: string | null): Promise<void> {
  if (time === null) {
    await pool.query(`DELETE FROM settings WHERE key = $1`, [CUTOFF_KEY]);
    return;
  }
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      CUTOFF_KEY,
      JSON.stringify({ time }),
      'Horario límite para aceptar reservas del mismo día (hora Buenos Aires, formato HH:MM).',
    ],
  );
}

export function convertUsdToArs(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}

const MP_FEE_KEY = 'mp_fee_pct';

export async function getMpFeePct(): Promise<number> {
  const { rows } = await pool.query<{ value: { pct: number } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [MP_FEE_KEY],
  );
  const pct = rows[0]?.value?.pct;
  if (typeof pct !== 'number' || pct < 0 || pct > 100) return 10; // default 10%
  return pct;
}

export async function setMpFeePct(pct: number): Promise<void> {
  if (pct < 0 || pct > 100) throw new Error('mp_fee_pct must be between 0 and 100');
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      MP_FEE_KEY,
      JSON.stringify({ pct, updated_at: new Date().toISOString() }),
      'Porcentaje de comisión de Mercado Pago. Se descuenta del bruto al calcular comisión del vendedor.',
    ],
  );
}
