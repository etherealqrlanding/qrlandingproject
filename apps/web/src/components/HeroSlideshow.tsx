import { useEffect, useState } from 'react';

interface Props {
  images: string[];
  intervalMs?: number;
}

/**
 * Slideshow de fondo para el hero: cross-fade entre fotos de las casas,
 * con un leve zoom continuo (Ken Burns). Puramente decorativo.
 */
export default function HeroSlideshow({ images, intervalMs = 5000 }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs]);

  if (images.length === 0) return null;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {images.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover animate-kenburns transition-opacity duration-[1500ms] ease-in-out ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  );
}
