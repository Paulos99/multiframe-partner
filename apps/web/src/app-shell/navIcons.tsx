import type { ComponentType, SVGProps } from 'react';
import {
  BarChartIcon,
  BuildingIcon,
  ChecklistIcon,
  FolderIcon,
  GraduationCapIcon,
  HouseIcon,
  KanbanIcon,
  PartnersIcon,
  PlusIcon,
  TeamIcon,
  WrenchIcon,
} from '../icons';

/** Иконки разделов кабинета: на планшете меню сворачивается в рельс с иконками, на телефоне — нижняя панель. */
const ICONS: Record<string, ComponentType<Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string }>> = {
  objects: HouseIcon,
  tasks: ChecklistIcon,
  deals: KanbanIcon,
  projects: FolderIcon,
  company: BuildingIcon,
  staff: TeamIcon,
  analytics: BarChartIcon,
  partners: PartnersIcon,
  add: PlusIcon,
  help: GraduationCapIcon,
  tools: WrenchIcon,
};

export function NavIcon({ id, label }: { id: string; label: string }) {
  const Icon = ICONS[id];
  if (!Icon) {
    return (
      <span aria-hidden="true" data-nav-icon="letter">
        {label.trim().slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
<Icon size={20} data-nav-icon={id} />
  );
}

/** «Объекты · 2» → { base: 'Объекты', count: '2' }. */
export function splitNavLabel(label: string): { base: string; count: string | null } {
  const [base, ...rest] = label.split(' · ');
  return { base: (base || label).trim(), count: rest.length ? rest.join(' · ').trim() : null };
}
