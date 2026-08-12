import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProductImage } from '../types/api';

interface Props {
  images: ProductImage[];
  // Video de YouTube (ya como embed URL) — si viene, se intercala como 4ta
  // diapositiva del carrusel en vez de mostrarse aparte más abajo en la página.
  videoEmbedUrl?: string | null;
  videoTitle?: string;
  autoPlayMs?: number;
}

type Slide = { kind: 'image'; img: ProductImage } | { kind: 'video' };

// Lugar fijo del video dentro del carrusel: 4ta diapositiva (índice 3). Si hay
// menos de 3 fotos antes, se acomoda al final de las que haya.
const VIDEO_POSITION = 3;

function buildSlides(images: ProductImage[], hasVideo: boolean): Slide[] {
  const imageSlides: Slide[] = images.map((img) => ({ kind: 'image', img }));
  if (!hasVideo) return imageSlides;
  const pos = Math.min(VIDEO_POSITION, imageSlides.length);
  return [...imageSlides.slice(0, pos), { kind: 'video' }, ...imageSlides.slice(pos)];
}

export default function Carousel({ images, videoEmbedUrl, videoTitle, autoPlayMs = 6000 }: Props) {
  const slides = useMemo(() => buildSlides(images, Boolean(videoEmbedUrl)), [images, videoEmbedUrl]);
  const total = slides.length;
  const videoIndex = slides.findIndex((s) => s.kind === 'video');
  const [index, setIndex] = useState(0);

  const goTo = useCallback((i: number) => {
    setIndex(((i % total) + total) % total);
  }, [total]);

  const next = useCallback(() => goTo(index + 1), [index, goTo]);
  const prev = useCallback(() => goTo(index - 1), [index, goTo]);

  useEffect(() => {
    // No autoplay lejos del video: si está mirándolo, que lo controle a mano.
    if (total <= 1 || !autoPlayMs || index === videoIndex) return;
    const id = window.setTimeout(next, autoPlayMs);
    return () => window.clearTimeout(id);
  }, [index, total, next, autoPlayMs, videoIndex]);

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
      {slides.map((slide, i) => (
        <div
          key={slide.kind === 'image' ? slide.img.id : 'video'}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {slide.kind === 'image' ? (
            <img
              src={slide.img.url}
              alt={slide.img.alt_text ?? ''}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-black">
              <iframe
                title={videoTitle ?? 'Video'}
                src={videoEmbedUrl!}
                className="h-full w-full"
                style={{ border: 0 }}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent pointer-events-none" />

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-ink/60 backdrop-blur text-cream hover:bg-ink/80 transition opacity-0 group-hover:opacity-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-ink/60 backdrop-blur text-cream hover:bg-ink/80 transition opacity-0 group-hover:opacity-100"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.kind === 'image' ? slide.img.id : 'video'}
                type="button"
                onClick={() => goTo(i)}
                aria-label={slide.kind === 'video' ? 'Go to video' : `Go to image ${i + 1}`}
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
