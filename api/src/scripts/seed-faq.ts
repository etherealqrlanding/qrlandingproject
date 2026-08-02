// Carga un set inicial de Preguntas Frecuentes (bilingüe es/en) en la página
// pública /preguntas-frecuentes. No pisa contenido ya cargado a menos que se
// pase --force (por si un admin ya editó el FAQ a mano desde el panel).
// Uso:
//   npm run seed:faq
//   npm run seed:faq -- --force
import { parseArgs } from 'node:util';
import { getFaq, setFaq, type FaqItem } from '../services/content.js';
import { pool } from '../db.js';

const ITEMS: FaqItem[] = [
  {
    q_es: '¿Qué incluye la reserva?',
    q_en: 'What does the booking include?',
    a_es: 'Depende de la experiencia que elijas: cada casa de tango ofrece distintos niveles con cena, show, bebida y traslado. Vas a ver el detalle exacto de qué incluye cada opción antes de pagar, en la ficha de la casa.',
    a_en: 'It depends on the experience you choose: each tango house offers different tiers with dinner, show, drinks and transfer. You\'ll see exactly what\'s included in each option before paying, on the house page.',
  },
  {
    q_es: '¿Por qué necesito un link o código para entrar a la plataforma?',
    q_en: 'Why do I need a link or code to access the platform?',
    a_es: 'Es una plataforma exclusiva para clientes recomendados por nuestra red de vendedores autorizados (hoteles, guías, choferes, agencias). El link o QR que te compartieron te da acceso a precios oficiales con la garantía de Tangos y Milongas Tickets. Si lo perdiste, pedile a esa persona que te lo reenvíe.',
    a_en: 'This is an exclusive platform for guests referred by our network of authorized sellers (hotels, guides, drivers, agencies). The link or QR code you were given grants access to official prices backed by Tangos y Milongas Tickets. If you lost it, ask that person to resend it to you.',
  },
  {
    q_es: '¿Cómo reservo y cuándo se confirma mi lugar?',
    q_en: 'How do I book and when is my spot confirmed?',
    a_es: 'Elegís la casa, la fecha y la cantidad de personas, y pagás online. La confirmación es automática: recibís el comprobante por email apenas se acredita el pago, sin necesidad de esperar respuesta de nadie.',
    a_en: 'You choose the house, date and number of people, and pay online. Confirmation is automatic: you\'ll receive your voucher by email as soon as the payment is processed, no need to wait for a reply from anyone.',
  },
  {
    q_es: '¿Qué métodos de pago aceptan?',
    q_en: 'What payment methods do you accept?',
    a_es: 'Podés pagar con tarjeta de crédito, débito o dinero en cuenta (procesado en pesos argentinos vía Mercado Pago), con PIX en reales, o en efectivo directamente con quien te recomendó la experiencia.',
    a_en: 'You can pay by credit card, debit card or account balance (processed in Argentine pesos via Mercado Pago), with PIX in Brazilian reais, or in cash directly with whoever referred you to the experience.',
  },
  {
    q_es: 'Los precios están en dólares (USD), ¿en qué moneda se cobra realmente?',
    q_en: 'Prices are shown in US dollars (USD) — what currency am I actually charged in?',
    a_es: 'Los precios en USD son de referencia. Con tarjeta (Mercado Pago) el cobro se procesa en pesos argentinos (ARS) al tipo de cambio del momento; con PIX, en reales brasileños (BRL). Si pagás en efectivo, coordinás el monto directamente con quien te recomendó la experiencia.',
    a_en: 'USD prices are for reference. With a card (Mercado Pago), the charge is processed in Argentine pesos (ARS) at the current exchange rate; with PIX, in Brazilian reais (BRL). For cash payments, you coordinate the amount directly with whoever referred you.',
  },
  {
    q_es: 'Soy de Brasil, ¿puedo pagar con PIX en reales?',
    q_en: 'I\'m from Brazil — can I pay with PIX in reais?',
    a_es: 'Sí. Al momento de pagar podés elegir PIX: te generamos un QR con el monto en reales (BRL) a la cotización vigente, y la reserva se confirma automáticamente apenas se acredita el pago.',
    a_en: 'Yes. At checkout you can choose PIX: we generate a QR code with the amount in Brazilian reais (BRL) at the current rate, and your booking is confirmed automatically as soon as the payment is received.',
  },
  {
    q_es: 'Si pago en efectivo con quien me recomendó la experiencia, ¿cuándo queda confirmada mi reserva?',
    q_en: 'If I pay in cash with the person who referred me, when is my booking confirmed?',
    a_es: 'La reserva queda registrada pero pendiente hasta que se coordina el cobro en efectivo en el momento del servicio. Si preferís la confirmación inmediata, podés pagar online con tarjeta o PIX.',
    a_en: 'Your booking is registered but stays pending until the cash payment is arranged at the time of the service. If you\'d prefer instant confirmation, you can pay online by card or PIX.',
  },
  {
    q_es: '¿Es seguro pagar en la plataforma?',
    q_en: 'Is it safe to pay on the platform?',
    a_es: 'Sí. Los pagos con tarjeta se procesan a través de Mercado Pago y los pagos con PIX a través de nuestro proveedor de reales, ambos con cifrado de extremo a extremo. Nunca ingresás los datos de tu tarjeta directamente en nuestro sitio.',
    a_en: 'Yes. Card payments are processed through Mercado Pago and PIX payments through our BRL payment provider, both with end-to-end encryption. You\'ll never enter your card details directly on our site.',
  },
  {
    q_es: '¿Cómo me pongo en contacto con ustedes?',
    q_en: 'How do I get in touch with you?',
    a_es: 'Una vez que hacés la reserva, te enviamos por email toda la información de contacto. En ese correo vas a encontrar cómo comunicarte con nosotros para cualquier modificación, cancelación, reintegro o consulta sobre el estado de tu orden. Revisá ese email (y la carpeta de spam por las dudas): es la vía para gestionar todo lo relacionado con tu reserva.',
    a_en: 'Once you complete your booking, we send you all our contact information by email. In that message you\'ll find how to reach us for any change, cancellation, refund, or question about your order status. Check that email (and your spam folder, just in case) — it\'s the way to manage everything related to your booking.',
  },
  {
    q_es: '¿Puedo cancelar mi reserva o pedir un reembolso?',
    q_en: 'Can I cancel my booking or request a refund?',
    a_es: 'Sí. Revisá el email de confirmación que te enviamos al reservar: ahí vas a encontrar cómo comunicarte con nosotros para pedir la cancelación o el reembolso. Si pagaste con tarjeta, el reembolso se procesa por el mismo medio.',
    a_en: 'Yes. Check the confirmation email we sent you when you booked — you\'ll find how to reach us there to request a cancellation or refund. If you paid by card, the refund is processed back to the same card.',
  },
  {
    q_es: '¿Puedo modificar la fecha o la cantidad de personas después de reservar?',
    q_en: 'Can I change the date or number of people after booking?',
    a_es: 'Sí, siempre que haya disponibilidad. Revisá el email de confirmación de tu reserva: ahí figura cómo contactarnos para gestionar el cambio.',
    a_en: 'Yes, as long as there\'s availability. Check your booking confirmation email — it includes how to contact us to make the change.',
  },
  {
    q_es: '¿Los menores de edad pagan lo mismo que los adultos?',
    q_en: 'Do children pay the same price as adults?',
    a_es: 'No, la mayoría de las casas tiene un precio reducido para menores (en general entre 3 y 10 años). El precio exacto según la edad se muestra en cada experiencia al momento de reservar.',
    a_en: 'No, most houses offer a reduced price for children (generally between 3 and 10 years old). The exact price by age is shown for each experience when you book.',
  },
  {
    q_es: '¿Necesito imprimir algo o llevar algún comprobante?',
    q_en: 'Do I need to print anything or bring proof of booking?',
    a_es: 'No hace falta imprimir nada. Con mostrar el email de confirmación desde tu celular en la entrada de la casa es suficiente.',
    a_en: 'No printing needed. Showing the confirmation email on your phone at the house entrance is enough.',
  },
  {
    q_es: '¿Cómo sé a qué hora tengo que llegar?',
    q_en: 'How do I know what time I need to arrive?',
    a_es: 'Cada casa tiene sus propios días y horarios de funcionamiento, que vas a ver en la sección "Días y horarios" de su ficha. Si tu experiencia incluye traslado, te contactamos con los detalles antes de la fecha.',
    a_en: 'Each house has its own operating days and times, shown in the "Days and times" section of its page. If your experience includes a transfer, we\'ll contact you with the details before the date.',
  },
];

async function main() {
  const { values } = parseArgs({
    options: { force: { type: 'boolean', default: false } },
    allowPositionals: false,
  });

  const current = await getFaq();
  if (current.items.length > 0 && !values.force) {
    console.log(`⚠ El FAQ ya tiene ${current.items.length} pregunta(s) cargada(s). No se pisa nada.`);
    console.log('  Corré con --force si igual querés reemplazarlas por este set.');
    return;
  }

  await setFaq(ITEMS);
  console.log(`✅ FAQ actualizado con ${ITEMS.length} preguntas (es/en).`);
}

main()
  .catch((err) => {
    console.error('❌ Seed de FAQ falló:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
