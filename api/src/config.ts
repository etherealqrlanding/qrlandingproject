import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
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
  // Resend (emails) — opcionales para que el server arranque sin estar configurado todavía
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().default('Ethereal Tours <onboarding@resend.dev>'),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
