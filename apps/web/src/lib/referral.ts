import Cookies from 'js-cookie';

export const REF_COOKIE = 'et_ref';
export const REF_PARAM = 'ref';
export const REF_TTL_DAYS = 30;

const VALID_REF = /^[A-Za-z0-9_-]{3,32}$/;

export function isValidRef(value: string): boolean {
  return VALID_REF.test(value);
}

export function getStoredRef(): string | null {
  return Cookies.get(REF_COOKIE) ?? null;
}

export function storeRef(code: string) {
  if (!isValidRef(code)) return;
  Cookies.set(REF_COOKIE, code, {
    expires: REF_TTL_DAYS,
    sameSite: 'lax',
    secure: window.location.protocol === 'https:',
  });
}

export function clearRef() {
  Cookies.remove(REF_COOKIE);
}
