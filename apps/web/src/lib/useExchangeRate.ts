import { useState, useEffect } from 'react';
import { api } from './api';

let _cached: number | null = null;

export function useExchangeRate(): number | null {
  const [rate, setRate] = useState<number | null>(_cached);

  useEffect(() => {
    if (_cached !== null) return;
    api.settings.exchangeRate()
      .then((d) => { _cached = d.rate; setRate(d.rate); })
      .catch(() => {});
  }, []);

  return rate;
}

export function fmtArs(amount: number): string {
  return `$ ${Math.round(amount).toLocaleString('es-AR')}`;
}
