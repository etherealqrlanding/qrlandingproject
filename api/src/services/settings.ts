import { pool } from '../db.js';

const RATE_KEY = 'exchange_rate_usd_ars';
const RATE_DESCRIPTION = 'Tipo de cambio USD→ARS aplicado al cobrar con Mercado Pago.';

export type ExchangeRateMode = 'auto' | 'manual';

interface ExchangeRatePayload {
  rate: number;
  updated_at: string;
  mode?: ExchangeRateMode;
  source?: 'manual' | 'dolarapi_oficial';
}

async function getExchangeRatePayload(): Promise<ExchangeRatePayload | null> {
  const { rows } = await pool.query<{ value: ExchangeRatePayload }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [RATE_KEY],
  );
  return rows[0]?.value ?? null;
}

async function saveExchangeRatePayload(payload: ExchangeRatePayload): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [RATE_KEY, JSON.stringify(payload), RATE_DESCRIPTION],
  );
}

export async function getExchangeRate(): Promise<number> {
  const rate = (await getExchangeRatePayload())?.rate;
  if (typeof rate !== 'number' || rate <= 0) {
    throw new Error('Exchange rate USD→ARS not configured. Set "exchange_rate_usd_ars" in settings.');
  }
  return rate;
}

export async function getExchangeRateMode(): Promise<ExchangeRateMode> {
  return (await getExchangeRatePayload())?.mode ?? 'manual';
}

// Carga manual desde el admin: fija el valor y pasa a modo "manual" explícitamente
// (si estaba en automático, el próximo sync no lo pisa hasta que el admin reactive "auto").
export async function setExchangeRate(rate: number): Promise<void> {
  if (rate <= 0) throw new Error('Exchange rate must be positive');
  await saveExchangeRatePayload({
    rate, updated_at: new Date().toISOString(), mode: 'manual', source: 'manual',
  });
}

// Cambia el modo sin tocar el valor actual (útil al togglear el switch en el admin).
export async function setExchangeRateMode(mode: ExchangeRateMode): Promise<void> {
  const current = await getExchangeRatePayload();
  await saveExchangeRatePayload({
    rate: current?.rate ?? 0,
    updated_at: current?.updated_at ?? new Date().toISOString(),
    mode,
    source: current?.source,
  });
}

// Usado únicamente por el sync automático (dolarapi.com) — nunca lo llama el admin directo.
export async function setExchangeRateFromAuto(rate: number): Promise<void> {
  if (rate <= 0) throw new Error('Exchange rate must be positive');
  await saveExchangeRatePayload({
    rate, updated_at: new Date().toISOString(), mode: 'auto', source: 'dolarapi_oficial',
  });
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

const BOOKING_HORIZON_KEY = 'booking_horizon_months';
const DEFAULT_BOOKING_HORIZON_MONTHS = 3;

// Hasta cuántos meses a futuro se puede reservar (checkout público, carga manual
// de admin/vendedor y reprogramación de reservas existentes respetan el mismo
// tope). null = sin fila configurada todavía → default; { months: null } = sin tope.
export async function getBookingHorizonMonths(): Promise<number | null> {
  const { rows } = await pool.query<{ value: { months: number | null } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [BOOKING_HORIZON_KEY],
  );
  if (rows.length === 0) return DEFAULT_BOOKING_HORIZON_MONTHS;
  return rows[0].value?.months ?? null;
}

export async function setBookingHorizonMonths(months: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      BOOKING_HORIZON_KEY,
      JSON.stringify({ months }),
      'Hasta cuántos meses a futuro se puede reservar (checkout público, carga manual y reprogramación). null = sin tope.',
    ],
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

const SUPPORT_WHATSAPP_KEY = 'support_whatsapp';

// Número de WhatsApp de contacto/soporte (solo dígitos, código de país incluido,
// ej: 5491132368312). Se usa en todo el contacto con nosotros de la app: el sitio
// público, el portal de vendedores y los emails de reservas.
export async function getSupportWhatsapp(): Promise<string | null> {
  const { rows } = await pool.query<{ value: { number: string } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [SUPPORT_WHATSAPP_KEY],
  );
  return rows[0]?.value?.number ?? null;
}

export async function setSupportWhatsapp(number: string): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      SUPPORT_WHATSAPP_KEY,
      JSON.stringify({ number }),
      'Número de WhatsApp de contacto/soporte (solo dígitos, con código de país). Usado en el sitio público, el portal de vendedores y los emails.',
    ],
  );
}

const ARCHIVE_RETENTION_KEY = 'archive_retention_days';
const DEFAULT_ARCHIVE_RETENTION_DAYS = 5;

// Días que una orden cancelada/reintegrada/expirada/fallida permanece en la tabla
// principal antes de archivarse sola. `null` desactiva el auto-archivado (solo manual).
export async function getArchiveRetentionDays(): Promise<number | null> {
  const { rows } = await pool.query<{ value: { days: number | null } }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [ARCHIVE_RETENTION_KEY],
  );
  if (rows.length === 0) return DEFAULT_ARCHIVE_RETENTION_DAYS;
  return rows[0].value?.days ?? null;
}

export async function setArchiveRetentionDays(days: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      ARCHIVE_RETENTION_KEY,
      JSON.stringify({ days }),
      'Días que una orden cancelada/reintegrada/expirada/fallida permanece en la tabla principal antes de archivarse sola. null = desactivado.',
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

