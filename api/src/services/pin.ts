import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// PIN corto (4-6 dígitos) para que un sub-vendedor (ej. conserje de un hotel) se
// identifique al cargar o cobrar una venta — es una firma de honestidad interna
// dentro del equipo del vendedor, no una credencial de acceso real: no hay login,
// JWT ni sesión asociada a esto. Ver [[project_sub_sellers]].
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
