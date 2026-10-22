import { useMemo, useState } from 'react';
import {
  OFFICIAL_PANEL_PRICE_RUB,
  OFFICIAL_PRICE_PER_M2,
} from '../../../../../packages/shared/partner';
import { HelpTrainingPanel } from '../HelpTrainingPanel';
import { RoleWorkspace } from '../RoleOverview';
import { usePartner } from '../PartnerContext';
import { InstallAppButton } from '../../app-shell/InstallAppButton';
import { CabinetChrome } from '../../app-shell/CabinetChrome';
import { ToolsPanel } from '../ToolsPanel';
import { consumeReturnToTools } from '../toolsReturn';
import { EntryPoints } from '../commercial/EntryPoints';
import { WorkToday } from '../commercial/WorkToday';
import { SupportRequestButton } from '../SupportRequestButton';
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
  const actions = useMemo(() => nextActionsForRole('measurer', api.objects, []), [api.objects]);

  return (
    <CabinetChrome
      title={roleHeading('measurer', user)}
      lead="Мои замеры · продолжить черновик"
      mode="buttons"
      items={[
        { id: 'objects', label: 'Объекты', active: view === 'home', onSelect: () => setView('home') },
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
        <HelpTrainingPanel role="measurer" />
      ) : (
        <>
          <p className={styles.metaLine}>
            РРЦ панели {user.org?.panelPriceRub ?? OFFICIAL_PANEL_PRICE_RUB} ₽ ·{' '}
            {user.org?.pricePerM2 ?? OFFICIAL_PRICE_PER_M2} ₽/м² · монтаж{' '}
            {user.org?.installPricePerM2 != null ? `${user.org.installPricePerM2} ₽/м²` : 'не задан'}
          </p>
          <WorkToday title="Мои замеры" actions={actions} />
          <SupportRequestButton module="measurer_home" />
          <EntryPoints
            onSelect={(_id, route) => {
              if (route === 'calculator') onOpenCalc();
              else onNavigate('problemomer');
            }}
          />
          <RoleWorkspace compact onCreate={() => onNavigate('problemomer')} />
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
