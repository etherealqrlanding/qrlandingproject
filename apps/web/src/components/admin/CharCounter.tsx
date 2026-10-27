interface Props {
  count: number;
  max: number;
  /** Texto antes del número, ej: "Ítem 3". */
  label?: string;
}

/** Contador "123/500": se pone rojo al pasarse del límite del servidor. */
export default function CharCounter({ count, max, label }: Props) {
  const over = count > max;
  return (
    <span className={`text-xs tabular-nums ${over ? 'text-bordeaux-light font-medium' : 'text-cream/40'}`}>
      {label && `${label}: `}{count}/{max}
      {over && ` (te pasaste por ${count - max})`}
    </span>
  );
}
