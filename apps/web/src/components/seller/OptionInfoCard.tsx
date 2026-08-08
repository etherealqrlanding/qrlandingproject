import type { ProductOption } from '../../types/api';
import MenuBlock from '../MenuBlock';

const DAY = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Props {
  option: ProductOption;
  productAvailableDays: number[];
  productAcceptsChildren: boolean;
  productChildrenAgeLabel: string | null;
  onBook?: () => void;
}

export function OptionInfoCard({ option, productAvailableDays, productAcceptsChildren, productChildrenAgeLabel, onBook }: Props) {
  const hasTimes = option.pickup_window_es || option.dinner_time_es || option.show_time_es;
  const showChildPrice = productAcceptsChildren && option.price_child_usd != null;

  return (
    <div className="rounded-xl border border-gold/15 bg-ink/40 p-4 space-y-3">
      {/* Nombre + precio */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-cream font-semibold text-sm leading-snug">{option.name_es}</p>
          {option.name_en && option.name_en !== option.name_es && (
            <p className="text-xs text-cream/35 italic">{option.name_en}</p>
          )}
          {option.description_es && (
            <p className="text-xs text-cream/60 mt-1 leading-relaxed">{option.description_es}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-gold font-display text-xl leading-none">USD {option.price_adult_usd}</p>
          <p className="text-[10px] text-cream/40 mt-0.5">por adulto</p>
          {showChildPrice && (
            <p className="text-xs text-cream/50 mt-1">
              Menor{productChildrenAgeLabel ? ` (${productChildrenAgeLabel})` : ''}: USD {option.price_child_usd}
            </p>
          )}
        </div>
      </div>

      {/* Badges */}
      {(option.has_dinner || option.has_transfer) && (
        <div className="flex flex-wrap gap-1.5">
          {option.has_dinner && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-amber-700/40 bg-amber-900/20 text-amber-300">
              🍽 Cena incluida
            </span>
          )}
          {option.has_transfer && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-sky-700/40 bg-sky-900/20 text-sky-300">
              🚌 Transfer incluido
            </span>
          )}
        </div>
      )}

      {/* Horarios */}
      {hasTimes && (
        <div className="rounded-lg border border-gold/10 bg-ink-soft/30 px-3 py-2 flex flex-wrap gap-x-5 gap-y-1.5">
          {option.pickup_window_es && (
            <span className="text-xs text-cream/60">
              ⏰ <span className="text-cream/40">Recogida:</span>{' '}
              <span className="text-cream/80 font-medium">{option.pickup_window_es}</span>
            </span>
          )}
          {option.dinner_time_es && (
            <span className="text-xs text-cream/60">
              🍽 <span className="text-cream/40">Cena:</span>{' '}
              <span className="text-cream/80 font-medium">{option.dinner_time_es}</span>
            </span>
          )}
          {option.show_time_es && (
            <span className="text-xs text-cream/60">
              🎭 <span className="text-cream/40">Show:</span>{' '}
              <span className="text-cream/80 font-medium">{option.show_time_es}</span>
            </span>
          )}
        </div>
      )}

      {/* Días disponibles */}
      {option.available_days.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-cream/35 uppercase tracking-wider mr-1">Días:</span>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <span
              key={d}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                option.available_days.includes(d) && productAvailableDays.includes(d)
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-ink/40 text-cream/15 border border-cream/10'
              }`}
            >
              {DAY[d]}
            </span>
          ))}
        </div>
      )}

      {/* Incluye */}
      {option.includes_es.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-cream/35 mb-1.5">Incluye</p>
          <ul className="space-y-1">
            {option.includes_es.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-cream/70 leading-relaxed">
                <span className="text-gold mt-0.5 shrink-0">✦</span>
                <span dangerouslySetInnerHTML={{ __html: item }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {option.menu && option.menu.content_html && (
        // Arranca cerrado — un menú con varios cursos/platos puede ser largo y no
        // queremos alargar la card por defecto (mismo criterio que ProductPage).
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gold-soft hover:text-gold">
            <span className="transition-transform group-open:rotate-90">▸</span>
            Ver menú
          </summary>
          <div className="mt-2">
            <MenuBlock menu={option.menu} />
          </div>
        </details>
      )}

      {onBook && (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={onBook}
            className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
          >
            Reservar esta opción →
          </button>
        </div>
      )}
    </div>
  );
}
