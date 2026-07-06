import rateLimit from 'express-rate-limit';

// Rate limiting para endpoints públicos sensibles. Objetivo: que un código de vendedor
// filtrado (o un bot) no pueda floodear la creación de órdenes ni el recupero de contraseña.
// El webhook de Mercado Pago queda EXENTO a propósito (lo llama MP, no un usuario).

const jsonMessage = (error: string) => ({ error });

// Creación de reservas (preferences / cash). Un cliente legítimo crea 1-2 órdenes;
// 30 por 15 min por IP es holgado y corta cualquier abuso.
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.'),
});

// Endpoints de autenticación (ej. recupero de contraseña): más estricto para frenar
// enumeración de emails / fuerza bruta.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Demasiados intentos. Esperá unos minutos e intentá de nuevo.'),
});
