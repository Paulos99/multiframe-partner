import { usePartner } from './PartnerContext';
import { ObjectsPanel } from './ObjectsPanel';

export function RoleWorkspace({
  compact,
  onCreate,
  focusProjectId = null,
  focusRoomId = null,
  onOpened,
}: {
  compact?: boolean;
  onCreate?: () => void;
  focusProjectId?: string | null;
  focusRoomId?: string | null;
  onOpened?: (selection: { projectId: string | null; roomId: string | null }) => void;
}) {
  const { user } = usePartner();
  if (!user) return null;
  return (
    <ObjectsPanel
      compact={compact}
      onCreate={onCreate}
      focusProjectId={focusProjectId}
      focusRoomId={focusRoomId}
      onOpened={onOpened}
    />
  );
}
