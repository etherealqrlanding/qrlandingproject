import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { pool } from '../db.js';

export interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'operator';
  full_name: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminUser;
    }
  }
}

/**
 * Verifica el JWT del header Authorization usando Supabase Auth y confirma
 * que el user_id está en admin_users y activo.
 *
 * Estrategia: llamamos `supabase.auth.getUser(token)` que valida el JWT contra
 * Supabase. Más simple que validar localmente (no necesita JWT secret) y siempre
 * coherente con el estado de Supabase (si el user fue baneado, falla acá).
 *
 * Caché: la validación se cachea 60s en memoria para reducir round trips. Si el
 * user es baneado tarda hasta 60s en propagarse, lo cual es aceptable.
 */
interface CacheEntry { userId: string; email: string; expiresAt: number }
const tokenCache = new Map<string, CacheEntry>();
const TOKEN_CACHE_TTL_MS = 60_000;

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of tokenCache) {
    if (v.expiresAt <= now) tokenCache.delete(k);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = header.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Empty token' });
    }

    let supabaseUser: { id: string; email?: string };
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      supabaseUser = { id: cached.userId, email: cached.email };
    } else {
      const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !userData?.user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      supabaseUser = userData.user;
      tokenCache.set(token, {
        userId: supabaseUser.id,
        email: supabaseUser.email ?? '',
        expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
      });
      if (tokenCache.size > 100) pruneCache();
    }

    const { rows } = await pool.query<{
      id: string;
      email: string;
      role: AdminUser['role'];
      full_name: string | null;
      is_active: boolean;
    }>(
      `SELECT id, email, role, full_name, is_active
         FROM admin_users
        WHERE id = $1
        LIMIT 1`,
      [supabaseUser.id],
    );
    const admin = rows[0];
    if (!admin || !admin.is_active) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Actualizamos last_login_at de forma no bloqueante
    pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [admin.id])
      .catch((err) => console.warn('Failed to update last_login_at:', err));

    req.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      full_name: admin.full_name,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: AdminUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}
