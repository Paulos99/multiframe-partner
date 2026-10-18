import { usePartner } from './PartnerContext';
import { PartnerNetworkOverview } from './network/PartnerNetwork';
import { ObjectsPanel } from './ObjectsPanel';

export function NetworkOverview({
  count,
  onPartners,
  onAdd,
  onLearning,
  onOpenCompany,
}: {
  count: number;
  onPartners: () => void;
  onAdd: () => void;
  onLearning: () => void;
  onOpenCompany?: (company: { orgId: string | null; userId: string; companyName: string }) => void;
}) {
  return (
    <PartnerNetworkOverview
      count={count}
      onPartners={onPartners}
      onAdd={onAdd}
      onLearning={onLearning}
      onOpenCompany={onOpenCompany}
    />
  );
}

export function RoleWorkspace({ compact, onCreate }: { compact?: boolean; onCreate?: () => void }) {
  const { user } = usePartner();
  if (!user) return null;
  return <ObjectsPanel compact={compact} onCreate={onCreate} />;
}
