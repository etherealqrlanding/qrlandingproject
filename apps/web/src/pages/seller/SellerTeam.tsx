import SellerTeamSection from '../../components/seller/SellerTeamSection';

export default function SellerTeam() {
  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-10">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-cream">Mi Equipo</h1>
        <p className="mt-1 text-sm text-cream/50">
          Sub-recomendadores que venden bajo tu mismo código (ej. conserjes de un hotel) — alta, PIN, y quién cerró cada venta.
        </p>
      </header>

      <SellerTeamSection />
    </div>
  );
}
