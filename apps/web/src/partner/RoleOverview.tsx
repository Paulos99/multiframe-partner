import { usePartner } from './PartnerContext';
import { ObjectsPanel } from './ObjectsPanel';

export function RoleWorkspace({ compact, onCreate }: { compact?: boolean; onCreate?: () => void }) {
  const { user } = usePartner();
  if (!user) return null;
  return <ObjectsPanel compact={compact} onCreate={onCreate} />;
}
