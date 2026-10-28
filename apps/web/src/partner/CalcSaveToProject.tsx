import type { JobObject } from '../../../../packages/shared/partner';
import type { CabinetCalcMessage } from './cabinetCalc';
import { usePartner } from './PartnerContext';
import { roomStubFromLabel } from './roomLink';
import { SaveToProjectModal } from './SaveToProjectModal';
import { cleanName, resolveTargetProject, type SaveTarget } from './toolSave';

/**
 * Калькулятор без комнаты: «Сохранить в проект» в самом калькуляторе присылает расчёт сюда.
 * Запись — тем же `applyCalculation`, что и из комнаты: площадь и смета уходят в комнату,
 * а площадь комнаты возвращается в Проблемомер и в следующий расчёт.
 */
export function CalcSaveToProject({
  message,
  onClose,
}: {
  message: CabinetCalcMessage | null;
  onClose: () => void;
}) {
  const { user, projects, objects, createProject, saveObject, applyCalculation } = usePartner();

  async function saveToTarget(target: SaveTarget): Promise<JobObject> {
    if (!message) throw new Error('Сначала выполните расчёт');
    const project = await resolveTargetProject(target, projects, createProject, user?.org?.city || '');
    const wanted = target.room;
    let room: JobObject | undefined;
    if ('id' in wanted) {
      room = objects.find((item) => item.id === wanted.id);
      if (!room) throw new Error('Комната не найдена. Обновите страницу и повторите.');
    } else {
      const label = cleanName(wanted.create.name);
      room = await saveObject({
        status: 'draft',
        projectId: project.id,
        roomName: label,
        clientName: project.clientName || '',
        clientPhone: project.clientPhone || '',
        address: project.address || '',
        city: project.city || user?.org?.city || '',
        room: roomStubFromLabel(label),
      });
    }
    const saved = await applyCalculation({ ...message, objectId: room.id }, room.id, room);
    if (!saved) throw new Error('Не удалось записать расчёт в комнату');
    return saved;
  }

  return (
    <SaveToProjectModal
      open={Boolean(message)}
      tool="calculator"
      prefill={{ roomName: 'Комната', roomType: '', areaM2: message?.areaM2 ?? null }}
      onSave={saveToTarget}
      onClose={onClose}
    />
  );
}
