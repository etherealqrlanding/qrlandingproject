interface Props {
  value: number;
  min: number;
  dirty: boolean;
  onChange: (val: number) => void;
}

export default function InlineNumberInput({ value, min, dirty, onChange }: Readonly<Props>) {
  return (
    <input
      type="number" min={min}
      value={value}
      onChange={(e) => {
        const v = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(v) && v >= min) onChange(v);
      }}
      className={`w-24 text-right rounded px-2 py-1 text-sm bg-ink tabular-nums
        focus:outline-none focus:ring-1 transition-all
        ${dirty
          ? 'border border-gold text-gold focus:ring-gold/50'
          : 'border border-gold/15 text-cream/70 focus:ring-gold/30'
        }`}
    />
  );
}
