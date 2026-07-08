import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { catalogRouter } from './routes/catalog.js';
import { checkoutRouter } from './routes/checkout.js';
import { adminRouter } from './routes/admin/index.js';
import { sellerRouter } from './routes/seller/index.js';
import { actionRouter } from './routes/action.js';
import { startExpiryJob } from './services/expireOrders.js';
import { AvailabilityError } from './repos/availability.js';

const app = express();

// Detrás de un proxy/ingress (ej. OpenShift) el IP real del cliente viene en
// X-Forwarded-For. Confiamos en el primer hop para que el rate limiter identifique
// correctamente a cada cliente en vez de agrupar todo bajo la IP del proxy.
if (config.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());

// CORS: en producción exigimos el origin configurado (WEB_ORIGIN). En desarrollo
// aceptamos cualquier localhost/127.0.0.1 sin importar el puerto, porque Vite cambia
// de puerto (5174, 5175…) si el 5173 está ocupado y eso rompía el login por CORS.
const allowedOrigins = new Set([
  config.WEB_ORIGIN,
  ...(config.CORS_EXTRA_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
]);
const isDevLocalhost = (origin: string) =>
  config.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      // Sin origin (curl, healthchecks, server-to-server) → permitir.
      if (!origin || allowedOrigins.has(origin) || isDevLocalhost(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin no permitido por CORS: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/health', healthRouter);
app.use('/api', catalogRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/admin', adminRouter);
app.use('/api/seller', sellerRouter);
app.use('/api/action', actionRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Cupo agotado detectado dentro de la transacción (guarda anti-sobreventa) → 409.
  if (err instanceof AvailabilityError) {
    return res.status(409).json({ error: err.message, reason: err.reason });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`🎭 Tangos y Milongas Tickets API listening on http://localhost:${config.PORT}`);
  console.log(`   Environment: ${config.NODE_ENV}`);
  console.log(`   MP Access Token: ${config.MP_ACCESS_TOKEN.slice(0, 30)}...`);
  console.log(`   Resend: ${config.RESEND_API_KEY ? 'enabled (' + config.EMAIL_FROM + ')' : 'disabled'}`);
  // Caducidad automática de reservas en efectivo no cobradas (>24h).
  startExpiryJob();
});
