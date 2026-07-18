import type { Response } from 'express';

// In-memory map: sellerId → active SSE connections
const connections = new Map<number, Set<Response>>();

export function addConnection(sellerId: number, res: Response): void {
  if (!connections.has(sellerId)) connections.set(sellerId, new Set());
  connections.get(sellerId)!.add(res);
}

export function removeConnection(sellerId: number, res: Response): void {
  const set = connections.get(sellerId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connections.delete(sellerId);
}

export function notifySeller(sellerId: number, event: string, payload: unknown): void {
  const set = connections.get(sellerId);
  if (!set || set.size === 0) return;
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(chunk); } catch { /* conexión ya cerrada */ }
  }
}

// Admin: no está keyed por id — cualquier admin con el panel abierto quiere ver todo,
// así que es un set simple de conexiones (a diferencia del vendedor, que solo ve lo suyo).
const adminConnections = new Set<Response>();

export function addAdminConnection(res: Response): void {
  adminConnections.add(res);
}

export function removeAdminConnection(res: Response): void {
  adminConnections.delete(res);
}

export function notifyAdmins(event: string, payload: unknown): void {
  if (adminConnections.size === 0) return;
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of adminConnections) {
    try { res.write(chunk); } catch { /* conexión ya cerrada */ }
  }
}
