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

const MODIFY_CUTOFF_KEY = 'modify_window';
const CANCEL_CUTOFF_KEY = 'cancel_window';

export async function getModifyWindow(): Promise<number | null> {
  const { rows } = await pool.query<{ value: { hours: number } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [MODIFY_CUTOFF_KEY],
  );
  return rows[0]?.value?.hours ?? null;
}

export async function setModifyWindow(hours: number | null): Promise<void> {
  if (hours === null) {
    await pool.query(`DELETE FROM settings WHERE key = $1`, [MODIFY_CUTOFF_KEY]);
    return;
  }
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [MODIFY_CUTOFF_KEY, JSON.stringify({ hours }), 'Horas de anticipación mínima para modificar una reserva antes del servicio.'],
  );
}

export async function getCancelWindow(): Promise<number | null> {
  const { rows } = await pool.query<{ value: { hours: number } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [CANCEL_CUTOFF_KEY],
  );
  return rows[0]?.value?.hours ?? null;
}

export async function setCancelWindow(hours: number | null): Promise<void> {
  if (hours === null) {
    await pool.query(`DELETE FROM settings WHERE key = $1`, [CANCEL_CUTOFF_KEY]);
    return;
  }
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CANCEL_CUTOFF_KEY, JSON.stringify({ hours }), 'Horas de anticipación mínima para cancelar una reserva antes del servicio.'],
  );
}

const MAINTENANCE_KEY = 'maintenance_mode';

export async function getMaintenanceMode(): Promise<boolean> {
  const { rows } = await pool.query<{ value: { enabled: boolean } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [MAINTENANCE_KEY],
  );
  return rows[0]?.value?.enabled === true;
}

export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      MAINTENANCE_KEY,
      JSON.stringify({ enabled }),
      'Modo mantenimiento: bloquea el acceso al sitio público cuando está activo.',
    ],
  );
}

// serviceDate: "YYYY-MM-DD" string or Date object (pg driver returns Date for date columns).
// Medianoche BsAs de esa fecha = 03:00 UTC del mismo día.
export function checkOperationWindow(
  hours: number | null,
  serviceDate: string | Date,
): { blocked: boolean; message?: string } {
  if (!hours) return { blocked: false };
  const dateStr = serviceDate instanceof Date ? serviceDate.toISOString().slice(0, 10) : serviceDate;
  const [y, m, d] = dateStr.split('-').map(Number);
  const serviceMidnightUtcMs = Date.UTC(y, m - 1, d, 3, 0, 0);
  const hoursUntilService = (serviceMidnightUtcMs - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilService >= hours) return { blocked: false };
  const message = hoursUntilService < 0
    ? 'No se puede operar sobre una reserva cuyo servicio ya inició.'
    : `Esta operación requiere al menos ${hours} hs de anticipación al servicio (faltan ${hoursUntilService.toFixed(1)} hs).`;
  return { blocked: true, message };
}

