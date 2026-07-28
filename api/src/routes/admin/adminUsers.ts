import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/requireAdmin.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { config } from '../../config.js';
import { listAdminUsers, upsertAdminUser, updateAdminUser } from '../../repos/adminUsers.js';
import { sendAdminPortalInvite, sendAdminPasswordReset } from '../../services/email.js';

export const adminUsersRouter = Router();

// Ver/gestionar otros admins es sensible (otorga acceso al panel) — solo super_admin.
adminUsersRouter.use(requireRole('super_admin'));

adminUsersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await listAdminUsers();
    res.json({ data: rows });
  } catch (err) { next(err); }
});

const inviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().max(160).optional().nullable(),
  role: z.enum(['super_admin', 'admin', 'operator']),
});

// POST /api/admin/admins — invita un nuevo admin por email. Si el email ya existe en
// Supabase Auth (p.ej. es también vendedor), no crea una cuenta duplicada: le manda un
// link de recovery a esa misma cuenta y la vincula en admin_users. Mismo criterio que
// el invite de vendedores (routes/admin/sellers.ts).
adminUsersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const { email, full_name, role } = parsed.data;
    const portalUrl = `${config.WEB_ORIGIN.replace(/\/$/, '')}/admin/login`;

    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: portalUrl, data: { full_name: full_name ?? null, admin_invite: true } },
    });

    let userId: string;
    let action: 'invite_sent' | 'password_reset_sent';
    let actionLink: string;

    if (inviteErr) {
      if (!inviteErr.message?.toLowerCase().includes('already')) {
        return res.status(409).json({ error: `No se pudo invitar a "${email}": ${inviteErr.message}` });
      }
      // Ya existe como usuario de Auth (vendedor u otro admin) — reusamos esa cuenta.
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw listErr;
      const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) {
        return res.status(409).json({ error: `"${email}" ya está registrado pero no se pudo encontrar la cuenta.` });
      }
      userId = existing.id;

      const { data: recData, error: recErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: portalUrl },
      });
      if (recErr) return res.status(409).json({ error: recErr.message });
      action = 'password_reset_sent';
      actionLink = recData.properties.action_link;
    } else {
      userId = inviteData.user.id;
      action = 'invite_sent';
      actionLink = inviteData.properties.action_link;
    }

    const admin = await upsertAdminUser(userId, email, full_name ?? null, role);

    const emailResult = action === 'invite_sent'
      ? await sendAdminPortalInvite(full_name ?? email, email, actionLink)
      : await sendAdminPasswordReset(full_name ?? email, email, actionLink);

    res.status(201).json({
      data: {
        admin,
        ok: true,
        action,
        link: actionLink,
        email_sent: emailResult.sent,
        email_error: emailResult.error ?? null,
      },
    });
  } catch (err) { next(err); }
});

const updateSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'operator']).optional(),
  is_active: z.boolean().optional(),
});

// PATCH /api/admin/admins/:id — cambia rol y/o activa-desactiva. Un admin no puede
// tocar su propia fila acá (para no auto-degradarse o auto-desactivarse por error).
adminUsersRouter.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.admin!.id) {
      return res.status(400).json({ error: 'No podés cambiar tu propio rol o estado desde acá.' });
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    if (parsed.data.role === undefined && parsed.data.is_active === undefined) {
      return res.status(400).json({ error: 'Nada para actualizar' });
    }
    const updated = await updateAdminUser(id, parsed.data);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ data: updated });
  } catch (err) { next(err); }
});
