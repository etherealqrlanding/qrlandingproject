import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError } from '../../lib/sellerApi';

const SUPPORT_WHATSAPP = '5491132368312';
const WA_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Hola, soy vendedor de Tangos y Milongas Tickets y necesito ayuda con el portal.')}`;

type FaqItem = { q_es: string; a_es: string };

const BENEFITS = [
  {
    icon: '◆',
    title: 'Comisión por cada venta',
    body: 'Ganás un porcentaje fijo de cada reserva generada con tu código, ya sea que el pasajero pague en efectivo o por Mercado Pago.',
  },
  {
    icon: '◈',
    title: 'QR y link propios',
    body: 'Tu código QR y link de referido son únicos. Mostralo en pantalla, imprimilo o envialo por WhatsApp — cualquier venta que venga de ahí es tuya.',
  },
  {
    icon: '✦',
    title: 'Efectivo o Mercado Pago',
    body: 'Podés cobrar vos mismo en efectivo o generar un link de pago online para que el pasajero abone cuando quiera. Vos elegís según la situación.',
  },
  {
    icon: '⬡',
    title: 'Liquidaciones transparentes',
    body: 'Cada centavo queda registrado. Ves en tiempo real tu comisión ganada, pendiente y ya cobrada, con historial completo en la sección Liquidaciones.',
  },
];

const TIPS = [
  {
    num: '01',
    title: 'Compartí el QR antes de la experiencia',
    body: 'Mostralo en el hotel, en la charla previa con el grupo, o enviá el link por WhatsApp. Cuanto antes lo tengan, más probable que reserven.',
  },
  {
    num: '02',
    title: 'Usá "Nueva Reserva" para grupos grandes',
    body: 'Para grupos que ya confirmaron y van a pagar en el momento, crear la reserva vos mismo es más rápido y te asegura que quede a tu nombre.',
  },
  {
    num: '03',
    title: 'Confirmá el cobro apenas recibas el dinero',
    body: 'En ventas en efectivo, confirmar el cobro activa el email al pasajero y cierra el ciclo. Si no confirmás, la reserva queda como pendiente indefinidamente.',
  },
  {
    num: '04',
    title: 'Modificar es mejor que cancelar y volver a crear',
    body: 'Si un pasajero quiere agregar acompañantes o cambiar la fecha, usá las opciones de Modificar o Reprogramar desde la venta. Mantiene el historial limpio.',
  },
  {
    num: '05',
    title: 'Revisá el neto a rendir periódicamente',
    body: 'En ventas en efectivo, vos cobrás el total y le rendís el neto al operador. Revisá el Resumen para no acumular pendientes y mantener la cuenta al día.',
  },
];

export default function SellerHelp() {
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sellerApi.faq()
      .then((d) => setFaq(d.items))
      .catch((err) => setError((err as SellerApiError).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-12">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-cream">Ayuda</h1>
        <p className="mt-1 text-sm text-cream/50">Todo lo que necesitás para operar con el portal</p>
      </header>

      {/* ── Contacto ── */}
      <section>
        <div className="rounded-2xl border border-gold/15 bg-ink-soft/40 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex-1">
            <p className="text-cream font-medium mb-1">¿Necesitás ayuda o tenés alguna duda?</p>
            <p className="text-sm text-cream/55">
              Escribinos por WhatsApp y te respondemos a la brevedad. Reservas, comisiones, liquidaciones o cualquier consulta del portal.
            </p>
          </div>
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-[#0d0a0a] hover:bg-[#22c55e] transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Escribinos por WhatsApp
          </a>
        </div>
      </section>

      {/* ── Beneficios ── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-5">¿Qué te ofrece el portal?</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border border-gold/15 bg-ink-soft/40 p-5">
              <span className="text-gold text-xl mb-3 block">{b.icon}</span>
              <p className="text-cream font-medium text-sm mb-1.5">{b.title}</p>
              <p className="text-cream/55 text-xs leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tips ── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-5">Tips para operar mejor</h2>
        <div className="space-y-3">
          {TIPS.map((t) => (
            <div key={t.num} className="flex gap-4 rounded-xl border border-gold/10 bg-ink-soft/20 p-4">
              <span className="shrink-0 font-mono text-xs text-gold/40 mt-0.5 w-5">{t.num}</span>
              <div>
                <p className="text-cream text-sm font-medium mb-1">{t.title}</p>
                <p className="text-cream/55 text-xs leading-relaxed">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-5">Preguntas frecuentes</h2>

        {loading && (
          <div className="space-y-2">
            {['a','b','c','d','e'].map((k) => (
              <div key={k} className="h-14 rounded-xl bg-ink-soft/40 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-bordeaux-light">{error}</p>
        )}

        {!loading && !error && faq.length === 0 && (
          <div className="rounded-xl border border-gold/10 bg-ink-soft/20 p-6 text-center text-cream/40 text-sm">
            Todavía no hay preguntas frecuentes cargadas.
          </div>
        )}

        {!loading && faq.length > 0 && (
          <div className="space-y-2">
            {faq.map((item, i) => (
              <div
                key={i}
                className={`rounded-xl border transition-colors ${
                  open === i ? 'border-gold/25 bg-ink-soft/50' : 'border-gold/10 bg-ink-soft/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span className="text-sm text-cream font-medium leading-snug">{item.q_es}</span>
                  <span className={`shrink-0 text-gold/50 text-xs transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {open === i && (
                  <div className="px-5 pb-5">
                    <p className="text-sm text-cream/65 leading-relaxed whitespace-pre-line">{item.a_es}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
