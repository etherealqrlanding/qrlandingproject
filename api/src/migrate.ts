// Runner de migraciones simple: aplica .sql en orden alfabético y registra en schema_migrations.
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function getAppliedMigrations(): Promise<Set<string>> {
  try {
    const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    return new Set(rows.map((r) => r.filename));
  } catch {
    // tabla aún no existe; primera corrida
    return new Set();
  }
}

async function run() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const applied = await getAppliedMigrations();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date.');
    return;
  }

  console.log(`▶ Applying ${pending.length} migration(s)...`);

  for (const file of pending) {
    const path = join(MIGRATIONS_DIR, file);
    const sql = await readFile(path, 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
      await client.query('COMMIT');
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${file} failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('✅ Migrations complete.');
}

run()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
