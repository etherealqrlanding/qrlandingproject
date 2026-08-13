export default function StatCard({ label, value, sub }: Readonly<{ label: string; value: string; sub?: string }>) {
  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/40 p-3 md:p-5">
      <p className="text-[10px] uppercase tracking-wider text-cream/50 mb-1">{label}</p>
      <p className="font-display text-2xl md:text-3xl text-gold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-cream/40 hidden sm:block">{sub}</p>}
    </div>
  );
}
