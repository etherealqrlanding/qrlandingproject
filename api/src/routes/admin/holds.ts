import { Router } from 'express';
import { z } from 'zod';
import { listActiveHoldsForAdmin } from '../../repos/checkoutHolds.js';

export const adminHoldsRouter = Router();

const listQuery = z.object({
  payment_method: z.enum(['mercadopago', 'pix']).optional(),
  search: z.string().max(120).optional(),
  include_expired: z.coerce.boolean().optional(),
});

// GET /api/admin/holds — cupos congelados del checkout público (MP/PIX en curso, todavía
// sin pago confirmado). Por default solo activos (expires_at > NOW()); ?include_expired=1
// trae también los vencidos que no se purgaron todavía, para debugging.
adminHoldsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    const rows = await listActiveHoldsForAdmin({
      paymentMethod: parsed.data.payment_method,
      search: parsed.data.search,
      includeExpired: parsed.data.include_expired,
    });
    res.json({ data: rows });
  } catch (err) { next(err); }
});
