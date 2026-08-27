import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { pool } from '../db.js';
import { config } from '../config.js';
import { ORDER_EMAIL_SELECT, toOrderData, type OrderEmailData } from './email.js';

const GOLD = '#a8843f'; // versión oscura del dorado de marca, legible en fondo blanco/impreso
const INK = '#1a1512';
const MUTED = '#6b6259';
const LABEL_X = 50;
const VALUE_X = 210;
const LABEL_WIDTH = 150;
const VALUE_WIDTH = 335;

function collectPdfBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Fila etiqueta/valor de dos columnas. Avanza `doc.y` según la altura REAL del valor
// (no un moveDown fijo), así una referencia larga u otro texto que ocupe más de una
// línea no pisa la fila siguiente.
function row(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(11);
  const valueHeight = doc.heightOfString(value, { width: VALUE_WIDTH });

  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, LABEL_X, y, { width: LABEL_WIDTH });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(value, VALUE_X, y, { width: VALUE_WIDTH });

  doc.x = LABEL_X;
  doc.y = y + Math.max(valueHeight, 14) + 10;
}

/** Arma el voucher en PDF de una orden ya pagada. Devuelve null si la orden no existe. */
export async function generateVoucherPdf(orderId: number): Promise<Buffer | null> {
  const { rows } = await pool.query(`SELECT ${ORDER_EMAIL_SELECT}`, [orderId]);
  const data = rows[0];
  if (!data) return null;
  const order: OrderEmailData = toOrderData(data);

  // El QR apunta a la página pública de verificación (no al texto plano de la
  // referencia): así, si la casa de tango tiene señal, escanearlo siempre muestra
  // la composición ACTUAL de la reserva — sin importar qué voucher o email viejo
  // esté mostrando el pasajero.
  const verifyUrl = `${config.WEB_ORIGIN.replace(/\/$/, '')}/verificar/${order.public_id}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 200 });
  const generatedAt = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const bufferPromise = collectPdfBuffer(doc);

  doc.font('Helvetica').fontSize(10).fillColor(GOLD)
    .text('TANGO QR · BUENOS AIRES', { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(INK).text('Voucher de reserva');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(11).fillColor(MUTED)
    .text('Presentá este documento (impreso o desde el celular) en la puerta de la casa de tango.');
  doc.moveDown(1);

  doc.save();
  doc.rect(50, doc.y, 495, 1).fill(GOLD);
  doc.restore();
  doc.moveDown(1);

  row(doc, 'Casa de tango', order.product_name);
  if (order.address) row(doc, 'Dirección', order.address);
  row(doc, 'Experiencia', order.option_name);
  row(doc, 'Fecha', order.service_date);
  let pax = `${order.adults} adulto(s)`;
  if (order.children > 0) pax += ` · ${order.children} menor(es)`;
  if (order.infants != null && order.infants > 0) pax += ` · ${order.infants} infante(s)`;
  row(doc, 'Pasajeros', pax);
  if (order.transfer_qty != null && order.transfer_qty > 0) {
    const totalPax = order.adults + order.children;
    const qtyLabel = order.transfer_qty >= totalPax ? 'Incluido' : `${order.transfer_qty} de ${totalPax} pasajeros`;
    row(doc, 'Traslado', `${qtyLabel}${order.transfer_hotel ? ` — retiro en ${order.transfer_hotel}` : ''}`);
  }
  row(doc, 'Pasajero', order.customer_name);
  row(doc, 'Estado', 'Pagado');
  row(doc, 'Referencia', order.public_id);
  row(doc, 'Generado el', generatedAt);

  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD)
    .text('Este voucher refleja el estado más reciente de la reserva. Si tenés un email o PDF anterior, este lo reemplaza.', LABEL_X, doc.y, { width: 495 });

  doc.moveDown(1);
  const qrTop = doc.y;
  const qrSize = 110;
  doc.image(qrPng, LABEL_X, qrTop, { width: qrSize });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text('Escaneá el código para ver el estado actual de la reserva en vivo (recomendado si hay dudas).', VALUE_X, qrTop + qrSize / 2 - 14, { width: VALUE_WIDTH });
  doc.x = LABEL_X;
  doc.y = qrTop + qrSize + 20;

  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text('¿Consultas o cambios? Escribinos por WhatsApp con tu número de referencia. Cualquier cancelación o modificación de esta reserva se gestiona directamente con nosotros.', LABEL_X, doc.y, { width: 495 });

  doc.end();
  return bufferPromise;
}
