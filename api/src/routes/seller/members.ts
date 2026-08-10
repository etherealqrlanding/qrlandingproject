import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { hashPin, verifyPin } from '../../services/pin.js';
import { listSellerMembers, listSellerMemberStats, getSellerAdminPinHash, resolveSellerMember, createPinResetToken } from '../../repos/sellerMembers.js';
import { sendSellerMemberPinReset } from '../../services/email.js';
import { config } from '../../config.js';
import { authLimiter } from '../../middleware/rateLimit.js';

// Montado bajo /api/seller/me/members, ya protegido por requireSeller (ver index.ts).
export const sellerMembersRouter = Router();

// GET / — mi equipo (conserjes u otras personas que venden bajo mi mismo código/QR)
sellerMembersRouter.get('/', async (req, res, next) => {
  try {
    res.json({ data: await listSellerMembers(req.seller!.sellerId) });
  } catch (err) { next(err); }
});

// GET /stats — igual que arriba pero con ventas atribuidas a cada uno (reporting interno)
sellerMembersRouter.get('/stats', async (req, res, next) => {
  try {
    res.json({ data: await listSellerMemberStats(req.seller!.sellerId) });
  } catch (err) { next(err); }
});

// Da un mensaje distinto según si el PIN admin directamente no está configurado
// (nosotros tenemos que activarlo) vs. si el que se ingresó está mal.
async function requireAdminPin(sellerId: number, adminPin: string | undefined): Promise<{ ok: true } | { ok: false; httpStatus: number; error: string }> {
  if (!adminPin) return { ok: false, httpStatus: 400, error: 'Ingresá el PIN de administrador.' };
  const hash = await getSellerAdminPinHash(sellerId);
  if (!hash) return { ok: false, httpStatus: 409, error: 'Todavía no tenés un PIN de administrador configurado. Contactanos para activarlo.' };
  if (!verifyPin(adminPin, hash)) return { ok: false, httpStatus: 403, error: 'PIN de administrador incorrecto.' };
  return { ok: true };
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos'),
  // Opcional — habilita que esa persona pueda pedir su propio reset de PIN por email
  // si se lo olvida, sin depender del PIN de administrador (ver /members/forgot-pin).
  email: z.string().trim().email().max(160).optional().nullable(),
  admin_pin: z.string().regex(/^\d{4,6}$/).optional(),
});

// POST / — alta de un sub-vendedor. Solo con el PIN de administrador del vendedor: así
// un sub-vendedor no puede darse de alta compañeros nuevos por su cuenta.
sellerMembersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { name, pin, email, admin_pin } = parsed.data;

    const adminCheck = await requireAdminPin(req.seller!.sellerId, admin_pin);
    if (!adminCheck.ok) return res.status(adminCheck.httpStatus).json({ error: adminCheck.error });

    try {
      const { rows } = await pool.query(
        `INSERT INTO seller_members (seller_id, name, pin_hash, email)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, is_active, created_at`,
        [req.seller!.sellerId, name, hashPin(pin), email || null],
      );
      res.status(201).json({ data: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Ya tenés a alguien con ese nombre o email cargado.' });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  is_active: z.boolean().optional(),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos').optional(),
  email: z.string().trim().email().max(160).optional().nullable(),
  // Cualquiera de los dos autoriza cambiar nombre/PIN/email; activar/desactivar exige
  // admin_pin sin excepción (ni el dueño del registro puede auto-activarse/desactivarse).
  admin_pin: z.string().regex(/^\d{4,6}$/).optional(),
  current_pin: z.string().regex(/^\d{4,6}$/).optional(),
});

sellerMembersRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { name, is_active, pin, email, admin_pin, current_pin } = parsed.data;
    if (name === undefined && is_active === undefined && pin === undefined && email === undefined) {
      return res.status(400).json({ error: 'Nada para actualizar' });
    }

    const { rows: currentRows } = await pool.query<{ email: string | null }>(
      `SELECT email FROM seller_members WHERE id = $1 AND seller_id = $2 LIMIT 1`,
      [id, req.seller!.sellerId],
    );
    if (!currentRows[0]) return res.status(404).json({ error: 'No encontrado' });

    // Cargar el email por primera vez (todavía no tenía ninguno) no pide PIN — es
    // justamente el paso que habilita el self-service de "olvidé mi PIN" para alguien
    // que ya no se acuerda el suyo y no quiere depender del PIN de administrador. Una
    // vez que ya tiene uno cargado, cambiarlo sí vuelve a pedir el gate de siempre
    // (que nadie le pise el email de recuperación a otra persona sin autorización).
    const settingEmailFirstTime = currentRows[0].email == null
      && email != null && email.trim() !== ''
      && name === undefined && is_active === undefined && pin === undefined;

    if (is_active !== undefined) {
      // Activar/desactivar es exclusivo del PIN de administrador.
      const adminCheck = await requireAdminPin(req.seller!.sellerId, admin_pin);
      if (!adminCheck.ok) return res.status(adminCheck.httpStatus).json({ error: adminCheck.error });
    } else if (!settingEmailFirstTime) {
      // Cambiar nombre/PIN/email existente: vale el PIN admin, o el PIN actual de ESTE mismo registro.
      let authorized = false;
      if (admin_pin) {
        const hash = await getSellerAdminPinHash(req.seller!.sellerId);
        if (hash && verifyPin(admin_pin, hash)) authorized = true;
      }
      if (!authorized && current_pin) {
        const resolved = await resolveSellerMember(req.seller!.sellerId, id, current_pin);
        if (resolved.ok) authorized = true;
      }
      if (!authorized) {
        return res.status(403).json({ error: 'Ingresá tu PIN actual, o el PIN de administrador.' });
      }
    }

    try {
      const { rows } = await pool.query(
        `UPDATE seller_members
            SET name = COALESCE($3, name),
                is_active = COALESCE($4, is_active),
                pin_hash = COALESCE($5, pin_hash),
                email = CASE WHEN $6::boolean THEN $7 ELSE email END
          WHERE id = $1 AND seller_id = $2
          RETURNING id, name, email, is_active, created_at`,
        [id, req.seller!.sellerId, name ?? null, is_active ?? null, pin ? hashPin(pin) : null, email !== undefined, email || null],
      );
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
      res.json({ data: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Ya tenés a alguien con ese nombre o email cargado.' });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

// POST /:id/forgot-pin — pide el reset del PIN de un sub-vendedor puntual, dentro de
// "Mi equipo". Exige que quien lo pida esté logueado en ESTA cuenta de vendedor (ya
// lo garantiza requireSeller) Y que sepa el email exacto que tenemos cargado para esa
// persona — así un compañero no puede resetearle el PIN a otro solo por conocer su
// nombre. El link para elegir el PIN nuevo sí es público (no hace falta re-loguearse
// para completarlo desde el celular), pero pedirlo es 100% interno.
const forgotPinSchema = z.object({ email: z.string().trim().email() });

sellerMembersRouter.post('/:id/forgot-pin', authLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    const parsed = forgotPinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email inválido' });

    const { rows } = await pool.query<{ id: number; name: string; email: string | null }>(
      `SELECT id, name, email FROM seller_members WHERE id = $1 AND seller_id = $2 AND is_active = TRUE LIMIT 1`,
      [id, req.seller!.sellerId],
    );
    const member = rows[0];
    if (!member) return res.status(404).json({ error: 'No encontrado' });
    if (!member.email || member.email.toLowerCase() !== parsed.data.email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Ese no es el email que tenemos registrado para esta persona.' });
    }

    const token = await createPinResetToken(member.id);
    const link = `${config.WEB_ORIGIN.replace(/\/$/, '')}/reset-pin/${token}`;
    sendSellerMemberPinReset(member.name, member.email, link)
      .catch((e) => console.warn('[seller-member forgot-pin] email send failed:', e));

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
