import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { fmtArs } from '../../lib/useExchangeRate';
import { useSellerSettings, windowLabel as windowLabelShort } from '../../lib/useSellerSettings';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';
import type { ProductSummary, ProductDetail } from '../../types/api';
import SellerTeamSection from '../../components/seller/SellerTeamSection';
import SellerBrandingSection from '../../components/seller/SellerBrandingSection';

function windowLabel(hours: number | null): string {
  return hours == null ? windowLabelShort(hours) : `${windowLabelShort(hours)} antes del servicio`;
}

function InfoCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gold/15 bg-ink-soft/40 p-5">
      <p className="text-xs uppercase tracking-widest text-gold-soft mb-2">{label}</p>
      <p className="text-cream text-xl font-display mb-1.5">{value}</p>
      <p className="text-cream/50 text-xs leading-relaxed">{hint}</p>
    </div>
  );
}

export default function SellerSettings() {
  const { data: settings, error } = useSellerSettings();
  const loading = !settings && !error;

  // ── Cupo por fecha: casa → opción → calendario ──
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [productSlug, setProductSlug] = useState<string>('');
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [optionId, setOptionId] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [viewDate, setViewDate] = useState(today);

  useEffect(() => {
    api.products.list().then((list) => {
      setProducts(list);
      if (list[0]) setProductSlug(list[0].slug);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!productSlug) return;
    setLoadingDetail(true);
    setOptionId(null);
    api.products.bySlug(productSlug)
      .then((detail) => {
        setProductDetail(detail);
        setOptionId(detail.options[0]?.id ?? null);
      })
      .catch(() => setProductDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [productSlug]);

  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-10">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-cream">Configuración</h1>
        <p className="mt-1 text-sm text-cream/50">Valores definidos por el equipo que afectan tus reservas — siempre actualizados.</p>
      </header>

      {loading && (
        <div className="grid sm:grid-cols-2 gap-3">
          {['a', 'b', 'c', 'd', 'e'].map((k) => (
            <div key={k} className="h-28 rounded-xl bg-ink-soft/40 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && <p className="text-sm text-bordeaux-light">{error}</p>}

      {!loading && settings && (
        <section className="grid sm:grid-cols-2 gap-3">
          <InfoCard
            label="Tipo de cambio"
            value={settings.exchange_rate != null ? `${fmtArs(settings.exchange_rate)} / USD` : 'No configurado'}
            hint={
              settings.exchange_rate_mode === 'auto'
                ? 'Se actualiza automáticamente. Es el que se usa para cobrar y calcular tu comisión.'
                : 'Fijado manualmente por el equipo. Es el que se usa para cobrar y calcular tu comisión.'
            }
          />
          <InfoCard
            label="Anticipación mínima para modificar"
            value={windowLabel(settings.modify_window_hours)}
            hint="Si falta menos que esto para el servicio, no vas a poder modificar pasajeros ni traslado de una reserva."
          />
          <InfoCard
            label="Anticipación mínima para cancelar"
            value={windowLabel(settings.cancel_window_hours)}
            hint="Si falta menos que esto para el servicio, no vas a poder cancelar la reserva desde el portal."
          />
          <InfoCard
            label="Archivado automático"
            value={settings.auto_archive_enabled ? `Activo — ${settings.archive_retention_days} días` : 'Inactivo'}
            hint={
              settings.auto_archive_enabled
                ? 'Las reservas canceladas, reintegradas, vencidas o fallidas pasan solas al Archivo después de este plazo.'
                : 'El equipo desactivó el archivado automático — las reservas solo se archivan a mano.'
            }
          />
          <InfoCard
            label="Horario límite de reservas"
            value={settings.same_day_booking_cutoff ?? 'Sin límite'}
            hint={
              settings.same_day_booking_cutoff
                ? 'Después de esta hora (Buenos Aires) ya no se pueden cargar reservas para el mismo día.'
                : 'No hay horario límite configurado para reservas del mismo día.'
            }
          />
        </section>
      )}

      {/* ── Personalizar mi página (solo socios habilitados) ── */}
      <SellerBrandingSection />

      {/* ── Mi equipo ── */}
      <SellerTeamSection />

      {/* ── Cupo por fecha ── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-1">Cupo por fecha</h2>
        <p className="text-cream/50 text-xs mb-5">Elegí una casa y una experiencia para ver qué días tienen pocos lugares o están completos.</p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select
            value={productSlug}
            onChange={(e) => setProductSlug(e.target.value)}
            className="flex-1 rounded-lg border border-gold/20 bg-ink-soft/40 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold/50"
          >
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
          <select
            value={optionId ?? ''}
            onChange={(e) => setOptionId(Number(e.target.value))}
            disabled={!productDetail || productDetail.options.length === 0}
            className="flex-1 rounded-lg border border-gold/20 bg-ink-soft/40 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold/50 disabled:opacity-40"
          >
            {productDetail?.options.map((o) => (
              <option key={o.id} value={o.id}>{o.name_es}</option>
            ))}
          </select>
        </div>

        {loadingDetail && <div className="h-72 rounded-lg bg-ink-soft/40 animate-pulse" />}

        {!loadingDetail && optionId != null && (
          <div className="max-w-sm">
            <AvailabilityCalendar
              optionId={optionId}
              value={viewDate}
              currentDate={today}
              onChange={setViewDate}
            />
          </div>
        )}

        {!loadingDetail && optionId == null && (
          <div className="rounded-xl border border-gold/10 bg-ink-soft/20 p-6 text-center text-cream/40 text-sm">
            Esta casa todavía no tiene experiencias cargadas.
          </div>
        )}
      </section>
    </div>
  );
}
