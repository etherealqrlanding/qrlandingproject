import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ProductSummary } from '../types/api';
import { localized, localizedArray } from '../lib/i18nFields';
import { useExchangeRate } from '../lib/useExchangeRate';

const MAX_OPTION_TAGS = 2;

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
      </div>

      {/* Info: debajo de la foto en mobile, superpuesta abajo desde sm+ */}
      <div className="p-3 sm:absolute sm:inset-x-0 sm:bottom-0 sm:p-5">
        <p className="text-[10px] sm:text-xs uppercase tracking-widest text-gold-soft">{product.venue_name}</p>
        <h3 className="mt-0.5 sm:mt-1 font-display text-lg sm:text-2xl text-cream leading-tight">
          {product.name}
        </h3>
        {description && (
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-cream/70 line-clamp-2">{description}</p>
        )}
        {optionNames.length > 0 && (
          <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1">
            {optionNames.slice(0, MAX_OPTION_TAGS).map((name) => (
              <span
                key={name}
                className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full border border-gold/20 bg-gold/5 text-gold-soft truncate max-w-[110px] sm:max-w-[140px]"
              >
                {name}
              </span>
            ))}
            {optionNames.length > MAX_OPTION_TAGS && (
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full border border-gold/10 text-cream/40">
                +{optionNames.length - MAX_OPTION_TAGS}
              </span>
            )}
          </div>
        )}
        <div className="mt-2 sm:mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {product.starting_price_usd != null && (
            <p className="text-xs sm:text-sm text-cream/80">
              <span className="text-cream/50">{t('product.from')}</span>{' '}
              <span className="text-gold font-medium">USD {product.starting_price_usd}</span>
              {startingArs != null && (
                <>
                  <span className="text-cream/30 mx-1">·</span>
                  <span className="text-gold font-medium">
                    ARS {startingArs.toLocaleString('es-AR')}
                  </span>
                </>
              )}
            </p>
          )}
          <span className="text-[11px] sm:text-xs text-gold-soft group-hover:text-gold transition">
            {t('product.view_more')} →
          </span>
        </div>
        {product.starting_price_usd != null && (
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-[11px] leading-snug text-cream/40">
            {t('product.currency_notice')}
          </p>
        )}
      </div>
    </Link>
  );
});

export default ProductCard;
