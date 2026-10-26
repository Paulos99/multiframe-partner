import { useMemo, useState } from 'react';
import { HelpTrainingPanel } from '../HelpTrainingPanel';
import { RoleWorkspace } from '../RoleOverview';
import { usePartner } from '../PartnerContext';
import { InstallAppButton } from '../../app-shell/InstallAppButton';
import { CabinetChrome } from '../../app-shell/CabinetChrome';
import { ToolsPanel } from '../ToolsPanel';
import { consumeReturnToTools } from '../toolsReturn';
import { WorkToday } from '../commercial/WorkToday';
import { nextActionsForRole } from '../commercial/nextActions';

import {
  roleHeading,
  SyncBadge,
  FrameBody,
  profileOf,
  type CabinetRoute,
} from './cabinetShared';
import styles from '../partner.module.css';

type Route = CabinetRoute;
export function CrewHome({
  onNavigate,
  onOpenCalc,
}: {
  onNavigate: (r: Route) => void;
  onOpenCalc: () => void;
}) {
  const api = usePartner();
  const user = api.user!;
  const [view, setView] = useState<'home' | 'tools' | 'help'>(() =>
    consumeReturnToTools() ? 'tools' : 'home',
  );
  const actions = useMemo(() => nextActionsForRole('crew', api.objects, []), [api.objects]);

  return (
    <CabinetChrome
      title={roleHeading('crew', user)}
      lead="Мои задания · смета со схемой и профиль комнаты"
      mode="buttons"
      items={[
        { id: 'tasks', label: 'Задания', active: view === 'home', onSelect: () => setView('home') },
        { id: 'tools', label: 'Инструменты', active: view === 'tools', onSelect: () => setView('tools') },
        { id: 'help', label: 'Обучение', active: view === 'help', onSelect: () => setView('help') },
      ]}
      extra={
        <>
          <SyncBadge />
          <InstallAppButton />
        </>
      }
      profile={profileOf(user, api.logout)}
    >
      <FrameBody>
      {view === 'tools' ? (
        <ToolsPanel
          onProblemomer={() => onNavigate('problemomer')}
          onCalculator={onOpenCalc}
        />
      ) : view === 'help' ? (
        <HelpTrainingPanel role="crew" />
      ) : (
        <>
          <WorkToday
            title="Мои задания"
            actions={actions}
            empty="Нет назначенных монтажей."
            onOpen={(action) => {
              if (action.objectId) api.openObject(action.objectId);
            }}
          />
          <RoleWorkspace />
          <details className={styles.hintCard}>
            <summary>Офлайн на телефоне</summary>
            <p className={styles.lead}>
              Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
              «Поделиться → На экран Домой». Количество панелей и крепежа останется на экране без
              сети.
            </p>
          </details>
        </>
      )}
      </FrameBody>
    </CabinetChrome>
  );
}
