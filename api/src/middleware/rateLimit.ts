import rateLimit from 'express-rate-limit';

// Rate limiting para endpoints públicos sensibles. Objetivo: que un código de vendedor
// filtrado (o un bot) no pueda floodear la creación de órdenes ni el recupero de contraseña.

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

// Acciones del portal de vendedores que validan un PIN corto (4-6 dígitos, 10.000-
// 1.000.000 combinaciones) contra seller_members/admin_pin_hash: cobrar, modificar,
// cancelar, asignar, gestionar el equipo, etc. Sin límite, alguien con la sesión del
// vendedor (que es compartida, no personal) podría probar el rango completo de PINs
// de fuerza bruta en minutos. 30 por 15 min por IP frena eso (10.000 combos tardarían
// ~80 hs) sin trabarle el uso normal a un mostrador con varias personas operando
// seguido desde la misma conexión.
export const pinLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Demasiados intentos. Esperá unos minutos e intentá de nuevo.'),
});

// Webhook de Mercado Pago: es un endpoint público sin auth (lo llama MP, identificado
// solo por firma opcional), así que cualquiera puede pegarle igual que a cualquier otra
// ruta pública. Antes quedaba exento a propósito asumiendo que "solo MP lo llama", pero
// nada lo garantiza — cada request dispara un INSERT en payment_events y, si trae un
// payment_id, una llamada saliente a la API de MP. El límite es generoso a propósito
// para no arriesgarse a frenar reintentos legítimos de MP en un pico de tráfico real.
export const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Demasiadas solicitudes.'),
});
