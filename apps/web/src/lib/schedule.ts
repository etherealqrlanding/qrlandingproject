// Arma el resumen de horarios de una casa combinando los 4 campos
// estructurados (ver GeneralSection.tsx) en vez de un texto libre aparte
// -- evita mantener dos fuentes de la misma info (que podían desincronizarse).
// Si la casa ofrece cena y solo-show con horarios distintos, se etiquetan por
// separado; si solo tiene uno de los dos, se muestra directo sin etiqueta.
export function buildHouseScheduleSummary(product: {
  dinner_show_time_es: string | null;
  dinner_transfer_window_es: string | null;
  show_only_time_es: string | null;
  show_only_transfer_window_es: string | null;
}): string | null {
  const dinner = [product.dinner_show_time_es, product.dinner_transfer_window_es]
    .filter((v): v is string => Boolean(v))
    .join(' ');
  const showOnly = [product.show_only_time_es, product.show_only_transfer_window_es]
    .filter((v): v is string => Boolean(v))
    .join(' ');
  if (dinner && showOnly) return `Con cena: ${dinner} · Solo show: ${showOnly}`;
  return dinner || showOnly || null;
}
