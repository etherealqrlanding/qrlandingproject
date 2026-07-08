-- Contenido inicial de FAQs para el portal de vendedores.
-- ON CONFLICT DO NOTHING: no sobreescribe si ya hay contenido cargado.
INSERT INTO settings (key, value, description)
VALUES (
  'faq_seller_page',
  '{
    "updated_at": "2026-07-08T00:00:00.000Z",
    "items": [
      {
        "q_es": "¿Cómo funciona mi código QR?",
        "a_es": "Tu QR y tu link de referido están vinculados a tu código único. Cuando un pasajero lo escanea o accede al link, queda automáticamente asociado a vos. Cada venta que se concrete a partir de ese acceso te genera una comisión. Podés mostrar el QR en pantalla, imprimirlo o compartir el link por WhatsApp."
      },
      {
        "q_es": "¿Cuánto gano por cada venta?",
        "a_es": "Tu comisión es un porcentaje fijo del total de cada venta. Podés ver tu porcentaje exacto en la sección Resumen del portal. El monto se acumula en tu cuenta y se te liquida periódicamente por el equipo de Tangos y Milongas Tickets."
      },
      {
        "q_es": "¿Cómo creo una reserva para un pasajero?",
        "a_es": "Entrá a \"Nueva Reserva\", elegí la experiencia y el tier, completá los datos del pasajero y el método de pago. Si elegís efectivo, el pasajero te paga a vos y luego confirmás el cobro desde \"Mis Ventas\". Si elegís Mercado Pago, se genera un link de pago que el pasajero usa para abonar online."
      },
      {
        "q_es": "¿Qué diferencia hay entre cobrar en efectivo y por Mercado Pago?",
        "a_es": "En efectivo: vos cobrás el total al pasajero, te quedás con tu comisión y rendís el neto al operador. En Mercado Pago: el pasajero paga online directamente, y el operador te transfiere tu comisión al liquidar el período."
      },
      {
        "q_es": "¿Cómo confirmo que cobré en efectivo?",
        "a_es": "En \"Mis Ventas\", expandí la reserva que dice \"Pendiente\" y tocá el botón \"Confirmar cobro en efectivo\". Recién ahí se confirma la reserva, el pasajero recibe su email de confirmación y la comisión queda registrada a tu favor."
      },
      {
        "q_es": "¿Puedo modificar o cancelar una reserva?",
        "a_es": "Sí. Desde \"Mis Ventas\" podés agregar o quitar pasajeros, cambiar la fecha de servicio, o cancelar, siempre que estés dentro del plazo permitido antes del evento. Expandí la reserva y usá las opciones disponibles."
      },
      {
        "q_es": "¿Cuándo y cómo me pagan las comisiones?",
        "a_es": "Las comisiones de ventas por Mercado Pago se liquidan periódicamente por el equipo. Podés ver el historial en la sección \"Liquidaciones\". Cuando se procesa un pago, recibís un email con el detalle del monto y las ventas incluidas."
      },
      {
        "q_es": "¿Qué pasa si un pasajero quiere cancelar o no se presenta?",
        "a_es": "Podés cancelar la reserva desde \"Mis Ventas\". Si el pago fue en efectivo, coordinás la devolución directamente con el pasajero (el portal te ofrece ingresar el motivo y notifica al pasajero automáticamente). Si fue por Mercado Pago, el equipo gestiona el reintegro."
      },
      {
        "q_es": "¿Cómo funciona el neto a rendir en ventas en efectivo?",
        "a_es": "Cuando cobrás en efectivo recibís el total de la venta. Tu comisión ya está dentro de ese monto, así que el \"neto a rendir\" es lo que le corresponde al operador (total menos tu comisión). En el Resumen podés ver si tenés neto pendiente de rendir."
      },
      {
        "q_es": "¿Puedo usar el link en lugar del QR?",
        "a_es": "Sí, tu link de referido funciona exactamente igual que el QR. Podés compartirlo por WhatsApp, email o redes sociales. Cualquier reserva que se genere a partir de ese link te acredita la comisión de la misma manera."
      }
    ]
  }'::jsonb,
  'Preguntas frecuentes para el portal de vendedores.'
)
ON CONFLICT (key) DO NOTHING;
