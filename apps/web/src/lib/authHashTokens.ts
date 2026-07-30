// El cliente Supabase tiene detectSessionInUrl: false (para no interferir entre el
// portal de admin y el de vendedores, que comparten cliente). Cuando llegamos vía link
// de invite/recovery, hay que establecer la sesión manualmente parseando el hash.
export interface AuthHashTokens { accessToken: string; refreshToken: string; type: string }

export function parseAuthHashTokens(): AuthHashTokens | null {
  const hash = globalThis.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type') ?? '';
  if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) {
    return { accessToken, refreshToken, type };
  }
  return null;
}
