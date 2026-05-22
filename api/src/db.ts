import pg from 'pg';
import { config } from './config.js';

// Supabase y otros providers cloud usan SSL. node-postgres lo activa si la URL
// trae sslmode=require, pero por las dudas detectamos si es una conexión cloud
// y forzamos SSL con rejectUnauthorized: false (Supabase usa cert intermedio
// que no siempre está en la trust store local en Windows).
const isCloudPg = /supabase\.(co|com|in)|neon\.tech|render\.com|railway\.app/.test(
  config.DATABASE_URL,
);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: isCloudPg ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

export async function ping(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  } catch (err) {
    console.error('DB ping failed:', err);
    return false;
  }
}
