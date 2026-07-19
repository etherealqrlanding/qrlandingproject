export default function DetailRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-cream/40 shrink-0">{label}</span>
      <span className="text-cream/80 text-right">{children}</span>
    </div>
  );
}
