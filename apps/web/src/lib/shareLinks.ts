import { REF_PARAM } from './referral';

export function buildShareUrl(path: string, refCode: string | null): string {
  const url = new URL(path, window.location.origin);
  if (refCode) url.searchParams.set(REF_PARAM, refCode);
  return url.toString();
}
