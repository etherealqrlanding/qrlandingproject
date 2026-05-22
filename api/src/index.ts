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

const app = express();

app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/health', healthRouter);
app.use('/api', catalogRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/admin', adminRouter);
app.use('/api/seller', sellerRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`🎭 Ethereal API listening on http://localhost:${config.PORT}`);
  console.log(`   Environment: ${config.NODE_ENV}`);
  console.log(`   MP Access Token: ${config.MP_ACCESS_TOKEN.slice(0, 30)}...`);
  console.log(`   Resend: ${config.RESEND_API_KEY ? 'enabled (' + config.EMAIL_FROM + ')' : 'disabled'}`);
});
