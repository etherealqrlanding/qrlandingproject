import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ProductSummary } from '../types/api';
import { localized } from '../lib/i18nFields';
import { useExchangeRate, fmtArs } from '../lib/useExchangeRate';

interface Props {
  product: ProductSummary;
}

export default function ProductCard({ product }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const exchangeRate = useExchangeRate();
  const description = localized(product, 'short_description', lang);
  const startingArs = (exchangeRate != null && product.starting_price_usd != null)
    ? Math.round(product.starting_price_usd * exchangeRate) : null;

  return (
    <Link
      to={`/shows/${product.slug}`}
      className="group relative block aspect-[4/5] rounded-lg overflow-hidden border border-gold/10 bg-ink-soft transition hover:border-gold/40"
    >
      {product.hero_image ? (
        <img
          src={product.hero_image}
          alt={product.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-90"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-bordeaux-deep to-ink" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="text-xs uppercase tracking-widest text-gold-soft">{product.venue_name}</p>
        <h3 className="mt-1 font-display text-2xl text-cream leading-tight">{product.name}</h3>
        {description && (
          <p className="mt-2 text-sm text-cream/70 line-clamp-2">{description}</p>
        )}
        <div className="mt-4 flex items-center justify-between">
          {product.starting_price_usd != null && (
            <p className="text-sm text-cream/80">
              <span className="text-cream/50">{t('product.from')}</span>{' '}
              {startingArs != null ? (
                <>
                  <span className="text-gold font-medium">{fmtArs(startingArs)}</span>
                  <span className="text-cream/40 text-xs ml-1">≈ USD {product.starting_price_usd}</span>
                </>
              ) : (
                <span className="text-gold font-medium">USD {product.starting_price_usd}</span>
              )}
            </p>
          )}
          <span className="text-xs text-gold-soft group-hover:text-gold transition">
            {t('product.view_more')} →
          </span>
        </div>
      </div>
    </Link>
  );
}
