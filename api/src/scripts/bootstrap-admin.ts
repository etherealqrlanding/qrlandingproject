// Bootstrap del primer admin: crea el user en Supabase Auth y lo inserta en admin_users.
// Uso:
//   npm run admin:bootstrap -- --email me@example.com --password "fuerte123" [--name "Mi Nombre"] [--role super_admin]
import { parseArgs } from 'node:util';
import { supabaseAdmin } from '../services/supabase.js';
import { pool } from '../db.js';

const VALID_ROLES = ['super_admin', 'admin', 'operator'] as const;
type Role = typeof VALID_ROLES[number];

async function main() {
  const { values } = parseArgs({
    options: {
      email:    { type: 'string' },
      password: { type: 'string' },
      name:     { type: 'string' },
      role:     { type: 'string', default: 'super_admin' },
    },
    allowPositionals: false,
  });

  if (!values.email || !values.password) {
    console.error('❌ Usage: npm run admin:bootstrap -- --email <email> --password <password> [--name <name>] [--role super_admin|admin|operator]');
    process.exit(1);
  }
  const role = values.role as Role;
  if (!VALID_ROLES.includes(role)) {
    console.error(`❌ Invalid role "${role}". Use one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const email = values.email.trim().toLowerCase();

  console.log(`▶ Creating Supabase Auth user for ${email}...`);
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: values.password,
    email_confirm: true,                              // auto-confirma sin email
    user_metadata: { full_name: values.name ?? null },
  });

  let userId: string;
  if (createErr) {
    // Si el user ya existe en Auth, lo buscamos para insertarlo en admin_users igual
    if (createErr.message?.toLowerCase().includes('already')) {
      console.log('  ℹ User already exists in Supabase Auth, looking it up...');
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw listErr;
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) throw new Error(`Could not find existing user with email ${email}`);
      userId = existing.id;
    } else {
      throw createErr;
    }
  } else {
    userId = created.user.id;
    console.log(`  ✓ Supabase user created: ${userId}`);
  }

  console.log(`▶ Upserting admin_users row...`);
  await pool.query(
    `INSERT INTO admin_users (id, email, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           full_name = COALESCE(EXCLUDED.full_name, admin_users.full_name),
           role = EXCLUDED.role,
           is_active = TRUE`,
    [userId, email, values.name ?? null, role],
  );
  console.log('  ✓ admin_users row ready');

  console.log('');
  console.log('✅ Bootstrap complete.');
  console.log(`   Email:    ${email}`);
  console.log(`   Role:     ${role}`);
  console.log(`   Login at: http://localhost:5173/admin/login`);
}

main()
  .catch((err) => {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
