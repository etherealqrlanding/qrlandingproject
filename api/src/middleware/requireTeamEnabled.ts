import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';

/**
 * Gate de "Mi equipo" (sub-vendedores): el admin habilita/deshabilita la función por
 * cuenta con sellers.team_enabled (ver migración 051). Montado después de
 * requireSeller — no borra nada al apagarlo, solo bloquea estas rutas mientras esté
 * en false. El nav del portal ya lo oculta (GET /me expone team_enabled), esto es la
 * confirmación del lado del servidor.
 */
export async function requireTeamEnabled(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query<{ team_enabled: boolean }>(
      `SELECT team_enabled FROM sellers WHERE id = $1 LIMIT 1`,
      [req.seller!.sellerId],
    );
    if (!rows[0]?.team_enabled) {
      return res.status(403).json({ error: 'La función de equipo no está habilitada para esta cuenta.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}
