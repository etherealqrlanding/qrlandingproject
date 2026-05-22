import { useCallback, useEffect, useState } from 'react';
import type { ProductImage } from '../types/api';

interface Props {
  images: ProductImage[];
  autoPlayMs?: number;
}

export default function Carousel({ images, autoPlayMs = 6000 }: Props) {
  const [index, setIndex] = useState(0);
  const total = images.length;

  const goTo = useCallback((i: number) => {
    setIndex(((i % total) + total) % total);
  }, [total]);

  const next = useCallback(() => goTo(index + 1), [index, goTo]);
  const prev = useCallback(() => goTo(index - 1), [index, goTo]);

  useEffect(() => {
    if (total <= 1 || !autoPlayMs) return;
    const id = window.setTimeout(next, autoPlayMs);
    return () => window.clearTimeout(id);
  }, [index, total, next, autoPlayMs]);

  // Soporte teclado: ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  if (total === 0) {
    return (
      <div className="aspect-[16/10] rounded-lg bg-gradient-to-br from-bordeaux-deep to-ink" />
    );
  }

  return (
    <div className="relative aspect-[16/10] rounded-lg overflow-hidden bg-ink-soft border border-gold/10 group">
      {images.map((img, i) => (
        <img
          key={img.id}
          src={img.url}
          alt={img.alt_text ?? ''}
          loading={i === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent pointer-events-none" />

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-ink/60 backdrop-blur text-cream hover:bg-ink/80 transition opacity-0 group-hover:opacity-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-ink/60 backdrop-blur text-cream hover:bg-ink/80 transition opacity-0 group-hover:opacity-100"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to image ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-8 bg-gold' : 'w-1.5 bg-cream/40 hover:bg-cream/70'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
