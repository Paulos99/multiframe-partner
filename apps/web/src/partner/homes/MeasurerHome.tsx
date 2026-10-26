import { useState } from 'react';
import { HelpTrainingPanel } from '../HelpTrainingPanel';
import { usePartner } from '../PartnerContext';
import { InstallAppButton } from '../../app-shell/InstallAppButton';
import { CabinetChrome } from '../../app-shell/CabinetChrome';
import { ToolsPanel } from '../ToolsPanel';
import { consumeReturnToTools } from '../toolsReturn';
import { SupportRequestButton } from '../SupportRequestButton';
import { MeasurerDesk } from '../field/MeasurerDesk';
import { disarmFieldCalc } from '../field/fieldCalcGate';

import {
  roleHeading,
  SyncBadge,
  FrameBody,
  profileOf,
  type CabinetRoute,
} from './cabinetShared';
import styles from '../partner.module.css';

type Route = CabinetRoute;
export function MeasurerHome({
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

  return (
    <CabinetChrome
      title={roleHeading('measurer', user)}
      lead="Мои замеры · назначенные комнаты"
      mode="buttons"
      items={[
        { id: 'objects', label: 'Замеры', active: view === 'home', onSelect: () => setView('home') },
        { id: 'tools', label: 'Инструменты', active: view === 'tools', onSelect: () => { disarmFieldCalc(); setView('tools'); } },
        { id: 'help', label: 'Обучение', active: view === 'help', onSelect: () => { disarmFieldCalc(); setView('help'); } },
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
        <HelpTrainingPanel role="measurer" />
      ) : (
        <>
          <MeasurerDesk onOpenScheme={onOpenCalc} />
          <SupportRequestButton module="measurer_home" />
          <details className={styles.hintCard}>
            <summary>Офлайн на телефоне</summary>
            <p className={styles.lead}>
              Установите кабинет на устройство: в Chrome — «Установить приложение», на iPhone —
              «Поделиться → На экран Домой». После первого открытия прайс и объекты доступны без
              сети; отправка на сервер встаёт в очередь.
            </p>
          </details>
        </>
      )}
      </FrameBody>
    </CabinetChrome>
  );
}
