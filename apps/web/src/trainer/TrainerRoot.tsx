import { useCallback, useEffect, useState } from 'react';
import { usePartner } from '../partner/PartnerContext';
import { DrillScreen, useStartDrill, type DrillSession } from './DrillScreen';
import { trainerRoleOf } from './engine';
import { BankScreen, Home, ProgressScreen, SettingsDialog } from './HomeScreens';
import { QuizResult, QuizRun, QuizStart, type QuizSession } from './QuizScreens';
import { ScenarioList, ScenarioResult, ScenarioSituation, ScenarioTalk, type ScenarioSession } from './ScenarioScreens';
import { parseTrainerHash, type TrainerRoute } from './route';
import { TrainerProvider } from './TrainerContext';
import { go } from './ui';
import styles from './Trainer.module.css';

function useTrainerRoute(): TrainerRoute {
  const [route, setRoute] = useState(() => parseTrainerHash(window.location.hash));
  useEffect(() => {
    const sync = () => setRoute(parseTrainerHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  return route;
}

function Inner() {
  const route = useTrainerRoute();
  const start = useStartDrill();
  const [drill, setDrill] = useState<DrillSession | null>(null);
  const [scenario, setScenario] = useState<ScenarioSession | null>(null);
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [settings, setSettings] = useState(false);
  const openSettings = useCallback(() => setSettings(true), []);

  let screen;
  switch (route.page) {
    case 'drill':
      screen = <DrillScreen session={drill} setSession={setDrill} objectionId={route.objectionId} onOpenSettings={openSettings} />;
      break;
    case 'scenarios':
      screen = <ScenarioList />;
      break;
    case 'scenario':
      screen =
        route.step === 'situation' ? (
          <ScenarioSituation id={route.id} setSession={setScenario} />
        ) : route.step === 'talk' ? (
          <ScenarioTalk id={route.id} session={scenario} setSession={setScenario} />
        ) : (
          <ScenarioResult id={route.id} session={scenario} setSession={setScenario} />
        );
      break;
    case 'quiz':
      screen =
        route.step === 'start' ? (
          <QuizStart setSession={setQuiz} />
        ) : route.step === 'run' ? (
          <QuizRun session={quiz} setSession={setQuiz} />
        ) : (
          <QuizResult session={quiz} setSession={setQuiz} startDrill={(id) => setDrill(start(id))} />
        );
      break;
    case 'progress':
      screen = <ProgressScreen />;
      break;
    case 'bank':
      screen = <BankScreen id={route.id} onTrain={(id) => setDrill(start(id))} />;
      break;
    default:
      screen = (
        <Home
          onStartDrill={() => {
            setDrill(start());
            go({ page: 'drill' });
          }}
          onResumeDrill={() => go({ page: 'drill' })}
          resume={drill && drill.phase !== 'summary' ? { index: drill.index + 1, total: drill.deck.length } : null}
          onOpenSettings={openSettings}
        />
      );
  }
  return (
    <div className={styles.root}>
      {screen}
      {settings ? <SettingsDialog onClose={() => setSettings(false)} /> : null}
    </div>
  );
}

/** Тренажёр продаж внутри «Обучения». Прогресс хранится на устройстве отдельно для каждого пользователя. */
export function TrainerRoot() {
  const { user } = usePartner();
  if (!user) return null;
  return (
    <TrainerProvider
      userId={user.id}
      partnerId={user.orgId}
      role={trainerRoleOf(user.role)}
      loading={
        <p className={styles.notice} role="status">
          Загружаем тренажёр…
        </p>
      }
      failed={(retry) => (
        <div className={styles.notice} role="alert">
          <p>Не удалось загрузить тренажёр. Содержимое сохранено на устройстве: попробуйте обновить страницу.</p>
          <button type="button" className={styles.secondary} onClick={retry}>
            Обновить
          </button>
        </div>
      )}
    >
      <Inner />
    </TrainerProvider>
  );
}
