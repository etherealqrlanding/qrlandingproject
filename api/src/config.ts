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
  // URL pública donde esta MISMA API responde (no el front). Se usa para armar links
  // que el navegador debe abrir directo contra el backend (ej. el PDF del voucher),
  // a diferencia de WEB_ORIGIN que es para páginas del front. En local, front (5173)
  // y API (4000) son servidores separados sin proxy entre sí, así que no pueden
  // compartir el mismo origin — en producción, si están detrás del mismo dominio con
  // proxy a /api, se puede setear igual a WEB_ORIGIN.
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(8),
  // Mercado Pago
  MP_ACCESS_TOKEN: z.string().min(10),
  MP_PUBLIC_KEY: z.string().min(10).optional(),
  MP_WEBHOOK_SECRET: z.string().min(8).optional(),
  MP_INTEGRATOR_ID: z.string().optional(),
  // Nautt Finance (PIX en reales). Opcional: sin API key el server arranca igual y el
  // checkout con PIX responde un error claro (mismo criterio que las credenciales de emails).
  NAUTT_API_KEY: z.string().min(10).optional(),
  NAUTT_BASE_URL: z.string().url().default('https://api.nauttfinance.com'),
  // UUIDs de la moneda BRL y del método de pago PIX (mapping conversion) en la cuenta Nautt.
  // Traen los valores de producción por defecto; se pueden sobreescribir por entorno.
  NAUTT_CURRENCY_UUID_BRL: z.string().uuid().default('73f6eb8b-7066-4f1e-948d-8468966fe766'),
  NAUTT_PIX_EXCHANGE_UUID: z.string().uuid().default('c07441b4-4e23-4fc7-b686-be8967b6e2d9'),
  // Autenticación del webhook de Nautt. Dos mecanismos, se acepta con CUALQUIERA:
  //  - NAUTT_WEBHOOK_SECRET: secreto de firma (formato Svix/"Standard Webhooks", prefijo
  //    whsec_) que genera el panel de Nautt al registrar el webhook. Verificamos el HMAC.
  //  - NAUTT_WEBHOOK_TOKEN: secreto compartido que va en la URL (?token=) / header
  //    x-webhook-token, por si se registra la URL sin depender de la firma.
  NAUTT_WEBHOOK_SECRET: z.string().min(8).optional(),
  NAUTT_WEBHOOK_TOKEN: z.string().min(8).optional(),
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
  // Emails — opcionales para que el server arranque sin estar configurado todavía.
  // Transporte preferido: SMTP (ej. Gmail) si SMTP_* está configurado; si no, Resend.
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().default('Tangos y Milongas Tickets <onboarding@resend.dev>'),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),
  // SMTP (Gmail u otro). Para Gmail: host=smtp.gmail.com, port=465, user=tu@gmail.com,
  // pass=contraseña de aplicación (requiere 2FA). EMAIL_FROM debe usar ese mismo gmail.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  // En producción, sin este secreto la verificación de firma del webhook de MP queda
  // deshabilitada para siempre y en silencio (ver checkout.ts) — mejor que el server
  // ni arranque a que quede así sin que nadie se entere.
  const isPlaceholder = data.MP_WEBHOOK_SECRET === 'change-me-when-configured-in-mp-panel';
  if (data.NODE_ENV === 'production' && (!data.MP_WEBHOOK_SECRET || isPlaceholder)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MP_WEBHOOK_SECRET'],
      message: 'MP_WEBHOOK_SECRET es obligatorio en producción (configuralo con el secreto real del panel de Mercado Pago) para poder verificar la firma del webhook.',
    });
  }
  // Si PIX está activo (hay API key de Nautt), en producción exigimos AL MENOS un mecanismo
  // de autenticación del webhook (firma o token): sin ninguno quedaría abierto. El pago igual
  // se re-consulta a Nautt, pero es una defensa barata que no queremos perder por olvido.
  if (data.NODE_ENV === 'production' && data.NAUTT_API_KEY && !data.NAUTT_WEBHOOK_SECRET && !data.NAUTT_WEBHOOK_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NAUTT_WEBHOOK_SECRET'],
      message: 'En producción con PIX activo (NAUTT_API_KEY seteada) hace falta NAUTT_WEBHOOK_SECRET o NAUTT_WEBHOOK_TOKEN para autenticar el webhook de Nautt.',
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
