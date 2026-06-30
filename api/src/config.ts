import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Orígenes adicionales permitidos por CORS (coma-separados). Útil durante la
  // transición a un dominio propio: el front se sirve en el dominio nuevo pero
  // WEB_ORIGIN (usado para redirects/links) puede seguir apuntando al anterior.
  CORS_EXTRA_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(8),
  // Mercado Pago
  MP_ACCESS_TOKEN: z.string().min(10),
  MP_PUBLIC_KEY: z.string().min(10).optional(),
  MP_WEBHOOK_SECRET: z.string().min(8).optional(),
  MP_INTEGRATOR_ID: z.string().optional(),
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
  // Emails — opcionales para que el server arranque sin estar configurado todavía.
  // Transporte preferido: SMTP (ej. Gmail) si SMTP_* está configurado; si no, Resend.
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().default('Ethereal Tours <onboarding@resend.dev>'),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),
  // SMTP (Gmail u otro). Para Gmail: host=smtp.gmail.com, port=465, user=tu@gmail.com,
  // pass=contraseña de aplicación (requiere 2FA). EMAIL_FROM debe usar ese mismo gmail.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
