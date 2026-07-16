import { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange' | 'size'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Estado "algunos seleccionados" (ej. checkbox de cabecera de tabla). */
  indeterminate?: boolean;
}

/**
 * Checkbox a medida con la paleta de marca (dorado sobre oscuro), en vez del
 * checkbox nativo del sistema operativo. El <input> real queda accesible pero
 * visualmente oculto (sr-only); un <span> decorativo dibuja la caja y el tilde
 * según el estado, que viene controlado por props (no depende de :indeterminate
 * en CSS, que no todos los navegadores exponen igual).
 */
export default function Checkbox({ checked, onChange, indeterminate, disabled, className, ...rest }: Props) {
  return (
    <label
      className={`relative inline-flex shrink-0 items-center ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className ?? ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-gold/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-ink ${
          checked || indeterminate
            ? 'border-gold bg-gold'
            : 'border-gold/30 bg-ink/40 peer-hover:border-gold/60'
        }`}
      >
        {indeterminate ? (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5H8" stroke="#0d0a0a" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : checked ? (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2" stroke="#0d0a0a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </label>
  );
}
