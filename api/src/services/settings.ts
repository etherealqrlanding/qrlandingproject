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
