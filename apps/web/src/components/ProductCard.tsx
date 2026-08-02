import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ProductSummary } from '../types/api';
import { localized, localizedArray } from '../lib/i18nFields';
import { useExchangeRate } from '../lib/useExchangeRate';

const MAX_OPTION_TAGS = 2;
// Mobile es texto plano (sin el padding/borde de los pills de desktop), así que entran
// más nombres en el mismo espacio — se permiten 2 líneas antes de resumir en "+N".
const MAX_OPTION_TAGS_MOBILE = 4;

interface Props {
  product: ProductSummary;
  /** Resalta la card (ej. al volver del detalle, para ubicar desde dónde se venía). */
  highlighted?: boolean;
  /** Se dispara al hacer click, antes de navegar — para que el listado recuerde esta card. */
  onNavigate?: () => void;
  /** Clases extra para el link raíz (ej. ocultar la card en ciertos breakpoints). */
  className?: string;
}

const ProductCard = forwardRef<HTMLAnchorElement, Props>(function ProductCard(
  { product, highlighted, onNavigate, className },
  ref,
) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const exchangeRate = useExchangeRate();
  const description = localized(product, 'short_description', lang);
  const neighborhood = localized(product, 'neighborhood', lang);
  const tagline = localized(product, 'tagline', lang);
  const badge = localized(product, 'badge', lang);
  const optionNames = localizedArray(product, 'option_names', lang);
  const startingArs = (exchangeRate != null && product.starting_price_usd != null)
    ? Math.round(product.starting_price_usd * exchangeRate) : null;

  return (
    <Link
      ref={ref}
      to={`/shows/${product.slug}`}
      onClick={onNavigate}
      className={`group block rounded-lg overflow-hidden border bg-ink-soft transition duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 active:translate-y-0 active:scale-[0.99] sm:relative sm:aspect-[4/5] ${
        highlighted
          ? 'border-gold ring-2 ring-gold ring-offset-2 ring-offset-ink shadow-[0_0_28px_rgba(200,168,90,0.35)]'
          : 'border-gold/10 hover:border-gold/40'
      } ${className ?? ''}`}
    >
      {/* Foto: tira arriba en mobile (flujo normal, no se corta nada del texto), overlay completo desde sm+ */}
      <div className="relative aspect-[4/3] sm:absolute sm:inset-0 sm:aspect-auto">
        {product.hero_image ? (
          <img
            src={product.hero_image}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-90 sm:opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-90"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bordeaux-deep to-ink" />
        )}
        <div className="hidden sm:block absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        {(neighborhood || badge) && (
          <div className="absolute inset-x-2 top-2 sm:inset-x-3 sm:top-3 z-10 flex items-start justify-between gap-1.5">
            {neighborhood ? (
              <span className="min-w-0 truncate text-[10px] sm:text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md bg-ink/75 backdrop-blur-md border border-cream/10 text-cream shadow-md">
                📍 {neighborhood}
              </span>
            ) : <span />}
            {badge ? (
              <span className="min-w-0 truncate text-[10px] sm:text-xs font-bold uppercase tracking-wide px-2 sm:px-2.5 py-1 rounded-md bg-gold text-ink shadow-md">
                {badge}
              </span>
            ) : <span />}
          </div>
        )}
      </div>

      {/* Info: debajo de la foto en mobile, superpuesta abajo desde sm+ */}
      <div className="p-3 sm:absolute sm:inset-x-0 sm:bottom-0 sm:p-5">
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gold-soft">
          {tagline || product.venue_name}
        </p>
        <h3 className="mt-0.5 sm:mt-1 font-display text-lg sm:text-2xl text-cream leading-tight">
          {product.name}
        </h3>
        {description && (
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-cream/70 line-clamp-4 sm:line-clamp-2">{description}</p>
        )}
        {optionNames.length > 0 && (
          <>
            {/* Mobile: texto compacto en vez de pills (hasta 2 líneas), con "+N" si sobran */}
            <p className="sm:hidden mt-1 text-[10px] text-gold-soft/80 line-clamp-2">
              {optionNames.slice(0, MAX_OPTION_TAGS_MOBILE).join(' · ')}
              {optionNames.length > MAX_OPTION_TAGS_MOBILE && ` +${optionNames.length - MAX_OPTION_TAGS_MOBILE}`}
            </p>
            {/* Desktop: pills, como antes */}
            <div className="hidden sm:flex mt-2 flex-wrap gap-1">
              {optionNames.slice(0, MAX_OPTION_TAGS).map((name) => (
                <span
                  key={name}
                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-gold/20 bg-gold/5 text-gold-soft truncate max-w-[140px]"
                >
                  {name}
                </span>
              ))}
              {optionNames.length > MAX_OPTION_TAGS && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gold/10 text-cream/40">
                  +{optionNames.length - MAX_OPTION_TAGS}
                </span>
              )}
            </div>
          </>
        )}
        <div className="mt-2 sm:mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {product.starting_price_usd != null && (
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-cream/50 font-semibold block">
                {t('product.from')}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-bold text-gold">USD {product.starting_price_usd}</span>
                {startingArs != null && (
                  <span className="text-[11px] sm:text-xs text-cream/50 font-medium">
                    · ARS {startingArs.toLocaleString('es-AR')}
                  </span>
                )}
              </div>
            </div>
          )}
          <span className="shrink-0 inline-flex items-center rounded-lg bg-gold px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-ink shadow-md transition group-hover:bg-gold-soft">
            {t('product.view_more')} →
          </span>
        </div>
      </div>
    </Link>
  );
});

export default ProductCard;
