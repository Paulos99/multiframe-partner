import type { ProjectInput } from '../../../../packages/shared/partner';
import { usePartner } from './PartnerContext';
import { ProjectsPanel } from './ProjectsPanel';

export function ProjectsCabinet({
  onOpenRoom,
  onDiagnose,
  onCalculate,
}: {
  onOpenRoom: (id: string) => void;
  onDiagnose: (id: string) => void;
  onCalculate: (id: string) => void;
}) {
  const api = usePartner();
  const user = api.user;
  if (!user) return null;
  const canManage = (user.role === 'owner' || user.role === 'sales') && !api.projectsUnavailable;
  return (
    <ProjectsPanel
      projects={api.projects}
      rooms={api.objects}
      role={user.role}
      loading={api.projectsLoading}
      error={api.projectsError || undefined}
      onRetry={() => void api.refreshProjects()}
      onCreate={canManage ? (input: ProjectInput) => api.createProject(input) : undefined}
      onAttach={canManage ? (roomId, projectId) => api.attachRoomToProject(roomId, projectId) : undefined}
      onOpenRoom={onOpenRoom}
      onDiagnose={onDiagnose}
      onCalculate={onCalculate}
    />
  );
}
