import { usePartner } from './PartnerContext';
import { AdminHome } from './homes/AdminHome';
import { OwnerHome } from './homes/OwnerHome';
import { SalesHome } from './homes/SalesHome';
import { MeasurerHome } from './homes/MeasurerHome';
import { CrewHome } from './homes/CrewHome';
import type { CabinetRoute } from './homes/cabinetShared';

export function CabinetScreen({ onNavigate }: { onNavigate: (r: CabinetRoute) => void }) {
  const api = usePartner();
  const user = api.user;
  if (!user) return null;

  const openCalc = () => api.requestCalculator(null);

  if (user.role === 'admin') return <AdminHome onNavigate={onNavigate} />;
  if (user.role === 'owner') {
    return <OwnerHome onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  if (user.role === 'sales') {
    return <SalesHome onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  if (user.role === 'crew') {
    return <CrewHome onNavigate={onNavigate} onOpenCalc={openCalc} />;
  }
  return <MeasurerHome onNavigate={onNavigate} onOpenCalc={openCalc} />;
}
