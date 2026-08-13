// Modo abierto (sellers.team_pin_required = false): no hay PIN que valide identidad,
// así que recordar en el navegador quién fue la última persona elegida ahorra tener
// que volver a elegirla en cada acción durante el mismo turno. Alcance por dispositivo
// (no por vendedor) — encaja con el uso típico: un mostrador compartido, no logins
// personales.
const KEY = 'seller_last_member_id';

export function getLastMemberId(): number | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setLastMemberId(id: number | null): void {
  if (id == null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, String(id));
}
