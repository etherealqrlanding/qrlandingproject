import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { pool } from '../db.js';

export interface SellerUser {
  sellerId: number;
  code: string;
  name: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      seller?: SellerUser;
    }
  }
}

interface CacheEntry { seller: SellerUser; expiresAt: number }
const tokenCache = new Map<string, CacheEntry>();
const TOKEN_CACHE_TTL_MS = 60_000;

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of tokenCache) {
    if (v.expiresAt <= now) tokenCache.delete(k);
  }
}

export async function requireSeller(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = header.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Empty token' });
    }

    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      req.seller = cached.seller;
      return next();
    }

    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { rows } = await pool.query<{
      id: number;
      code: string;
      name: string;
      contact_email: string | null;
      is_active: boolean;
    }>(
      `SELECT id, code, name, contact_email, is_active
         FROM sellers
        WHERE supabase_user_id = $1
        LIMIT 1`,
      [userData.user.id],
    );

    const row = rows[0];
    if (!row || !row.is_active) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const sellerUser: SellerUser = {
      sellerId: row.id,
      code: row.code,
      name: row.name,
      email: row.contact_email,
    };

    tokenCache.set(token, { seller: sellerUser, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    if (tokenCache.size > 100) pruneCache();

    req.seller = sellerUser;
    next();
  } catch (err) {
    next(err);
  }
}
