// Perfiles de vendedor — fuente única para admin (SellerDataSection, SellerDashboard)
// y para el ícono del modal público (SellerWelcomeModal). El label en español es
// solo para las pantallas internas (admin/vendedor, siempre en español); el modal
// público traduce el label y el mensaje vía i18n (seller_welcome.kind / .message),
// usando `value` como clave.
export interface SellerKindDef {
  value: string;
  label: string;
  icon: string;
  /** Al elegir este perfil en el admin, sugiere marcar "vendedor permanente"
   * (habilita efectivo) — el admin puede seguir overrideándolo a mano. */
  suggestsCash: boolean;
}

export const SELLER_KINDS: SellerKindDef[] = [
  { value: 'recepcion', label: 'Recepción', icon: '🏨', suggestsCash: true },
  { value: 'choferes', label: 'Choferes', icon: '🚘', suggestsCash: false },
  { value: 'guias', label: 'Guías', icon: '🎙️', suggestsCash: false },
  { value: 'agencias', label: 'Agencias', icon: '✈️', suggestsCash: true },
  { value: 'freelance', label: 'Freelance', icon: '🤝', suggestsCash: false },
  { value: 'comercios', label: 'Comercios', icon: '🛍️', suggestsCash: false },
];

const DEFAULT_ICON = '🌟';

export function sellerKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return SELLER_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function sellerKindIcon(kind: string | null | undefined): string {
  if (!kind) return DEFAULT_ICON;
  return SELLER_KINDS.find((k) => k.value === kind)?.icon ?? DEFAULT_ICON;
}

export function sellerKindSuggestsCash(kind: string | null | undefined): boolean {
  return SELLER_KINDS.find((k) => k.value === kind)?.suggestsCash ?? false;
}
