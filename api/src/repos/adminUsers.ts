import { pool } from '../db.js';

export type AdminRole = 'super_admin' | 'admin' | 'operator';

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

const SELECT_COLUMNS = 'id, email, full_name, role, is_active, created_at, last_login_at';

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const { rows } = await pool.query<AdminUserRow>(
    `SELECT ${SELECT_COLUMNS} FROM admin_users ORDER BY created_at`,
  );
  return rows;
}

// Crea o reactiva el admin_users row para un auth user ya creado (nuevo o preexistente,
// p.ej. un vendedor al que también le damos acceso admin) — mismo criterio que
// bootstrap-admin.ts para no duplicar cuentas de Supabase Auth por email repetido.
export async function upsertAdminUser(
  id: string,
  email: string,
  fullName: string | null,
  role: AdminRole,
): Promise<AdminUserRow> {
  const { rows } = await pool.query<AdminUserRow>(
    `INSERT INTO admin_users (id, email, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           full_name = COALESCE(EXCLUDED.full_name, admin_users.full_name),
           role = EXCLUDED.role,
           is_active = TRUE
     RETURNING ${SELECT_COLUMNS}`,
    [id, email, fullName, role],
  );
  return rows[0];
}

export async function updateAdminUser(
  id: string,
  patch: { role?: AdminRole; is_active?: boolean },
): Promise<AdminUserRow | null> {
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE admin_users SET
       role = COALESCE($2, role),
       is_active = COALESCE($3, is_active)
     WHERE id = $1
     RETURNING ${SELECT_COLUMNS}`,
    [id, patch.role ?? null, patch.is_active ?? null],
  );
  return rows[0] ?? null;
}
