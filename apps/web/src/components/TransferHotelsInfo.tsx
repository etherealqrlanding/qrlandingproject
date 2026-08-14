import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HOTELS_BY_NEIGHBORHOOD } from '../lib/hotels';
import Collapse from './Collapse';

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Listado informativo (solo lectura) de los hoteles elegibles para el traslado, para
// que el cliente vea de entrada si su hotel está cubierto antes de reservar. Reusa la
// misma fuente de datos que el selector del checkout (ver components/TransferSection.tsx)
// para que la lista sea siempre consistente entre ambos lugares.
export default function TransferHotelsInfo() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return HOTELS_BY_NEIGHBORHOOD;
    const q = normalize(query);
    return HOTELS_BY_NEIGHBORHOOD.map((n) => ({
      ...n,
      hotels: n.hotels.filter((h) => normalize(h.name).includes(q) || normalize(h.address).includes(q) || normalize(n.label).includes(q)),
    })).filter((n) => n.hotels.length > 0);
  }, [query]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gold-soft hover:text-gold"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        {open ? t('product.transfer_hotels_hide') : t('product.transfer_hotels_view')}
      </button>

      {open && (
        <Collapse className="mt-2 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('product.transfer_hotels_search')}
            className="input w-full text-sm"
            autoComplete="off"
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gold/10 bg-ink/30">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-cream/50">{t('product.transfer_hotels_empty')}</p>
            ) : (
              filtered.map((n) => (
                <div key={n.label}>
                  <p className="sticky top-0 px-3 py-1.5 text-xs uppercase tracking-widest text-gold-soft bg-ink-soft/95 border-b border-gold/10">
                    {n.label}
                  </p>
                  {n.hotels.map((h) => (
                    <div key={h.name} className="px-4 py-1.5 border-b border-gold/5 last:border-b-0">
                      <span className="text-sm text-cream/80 block">{h.name}</span>
                      <span className="text-xs text-cream/40">{h.address}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </Collapse>
      )}
    </div>
  );
}
