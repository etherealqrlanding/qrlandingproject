import { useState } from 'react';
import SellerTeamSection from '../../components/seller/SellerTeamSection';
import SellerTeamStats from '../../components/seller/SellerTeamStats';

type Tab = 'team' | 'stats';

export default function SellerTeam() {
  const [tab, setTab] = useState<Tab>('team');

  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-3xl md:text-4xl text-cream">Mi Equipo</h1>
        <p className="mt-1 text-sm text-cream/50">
          Sub-recomendadores que venden bajo tu mismo código (ej. conserjes de un hotel) — alta, PIN, y quién cerró cada venta.
        </p>
      </header>

      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setTab('team')}
          className={`px-3 py-1.5 rounded-full text-xs border transition ${
            tab === 'team' ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
          }`}
        >
          Equipo
        </button>
        <button
          type="button"
          onClick={() => setTab('stats')}
          className={`px-3 py-1.5 rounded-full text-xs border transition ${
            tab === 'stats' ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
          }`}
        >
          Estadísticas
        </button>
      </div>

      {tab === 'team' ? <SellerTeamSection /> : <SellerTeamStats />}
    </div>
  );
}
