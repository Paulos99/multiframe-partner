import { useEffect, useMemo, useState } from 'react';
import { Header } from '../../app-shell/Header';
import appShell from '../../app-shell/AppShell.module.css';
import { applyStoredTheme } from '../../app-shell/theme';
import { Skeleton } from '../../partner/Skeleton';
import { usePageReveal } from '../../partner/motionBits';
import { apiPublicRoom, hasRemoteApi, isApiError, type PublicRoomShare } from '../../partner/apiClient';
import { createInitialSession, withDerived } from '../../state/session';
import type { RoomAnswers, SessionState } from '../../state/types';
import { SmoothScroll } from '../../ui/SmoothScroll';
import { ResultDashboard } from '../Result/ResultWideScreen';
import { deriveResultView } from '../Result/resultShared';
import styles from './SharedRoomPage.module.css';

const SITE_URL = 'https://stp-multiframe.ru';

/** Ответы комнаты с сервера поверх значений по умолчанию. Лишних полей здесь нет: сервер их не отдаёт. */
export function sessionFromSharedRoom(room: Record<string, unknown>): SessionState {
  const base = createInitialSession();
  const clean = Object.fromEntries(Object.entries(room).filter(([, value]) => value !== null && value !== undefined));
  const answers = { ...base.answers.room, ...clean, plannedCeiling: 'stretch' } as RoomAnswers;
  return withDerived({
    ...base,
    step: 'result',
    answers: { ...base.answers, room: answers },
    cta: { roomType: answers.roomType, ceilingAreaM2: answers.ceilingAreaM2 },
  });
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; share: PublicRoomShare; session: SessionState }
  | { kind: 'gone' }
  | { kind: 'failed' };

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = 'Результаты Проблемомера · MultiFrame';
    return () => {
      meta.remove();
      document.title = prevTitle;
    };
  }, []);
}

function useLockedViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const prevHtml = root.style.overflow;
    const prevBody = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <section className={styles.message} role="status" data-testid="shared-room-unavailable">
      <h1>{title}</h1>
      <p>{text}</p>
      <a className={styles.siteLink} href={SITE_URL} rel="noopener noreferrer">
        Сайт MultiFrame
      </a>
    </section>
  );
}

/**
 * Страница клиента по ссылке #/r/<токен>: результаты Проблемомера одной комнаты.
 * Без входа и без данных компании: ни цен, ни контактов, ни других комнат.
 */
export function SharedRoomPage({ token }: { token: string | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useNoIndex();
  useLockedViewport();
  useEffect(() => {
    applyStoredTheme();
  }, []);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'gone' });
      return;
    }
    if (!hasRemoteApi()) {
      setState({ kind: 'failed' });
      return;
    }
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    apiPublicRoom(token, ctrl.signal)
      .then((share) => {
        setState({ kind: 'ready', share, session: sessionFromSharedRoom(share.room) });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ kind: isApiError(err) && err.status === 404 ? 'gone' : 'failed' });
      });
    return () => ctrl.abort();
  }, [token]);

  usePageReveal(state.kind);

  const view = useMemo(() => (state.kind === 'ready' ? deriveResultView(state.session) : null), [state]);

  let body;
  if (state.kind === 'loading') {
    body = <Skeleton kind="page" count={3} label="Загружаем результаты" />;
  } else if (state.kind === 'gone') {
    body = (
      <Message
        title="Ссылка недоступна"
        text="Возможно, её отключили или адрес скопирован не полностью. Попросите того, кто её отправил, прислать новую."
      />
    );
  } else if (state.kind === 'failed' || !view) {
    body = (
      <Message
        title="Не удалось открыть результаты"
        text="Проверьте связь и обновите страницу. Если не помогло, попросите прислать ссылку ещё раз."
      />
    );
  } else {
    const name = state.kind === 'ready' ? state.share.roomName.trim() : '';
    body = (
      <>
        <p className={styles.intro} data-reveal>
          Результаты Проблемомера по вашей комнате. Внизу страницы можно послушать, как звучит комната
          до и после.
        </p>
        <ResultDashboard p={view} title={name ? `Акустический профиль: ${name}` : undefined} />
        <footer className={styles.footer}>
          <a className={styles.siteLink} href={SITE_URL} rel="noopener noreferrer">
            Сайт MultiFrame
          </a>
        </footer>
      </>
    );
  }

  return (
    <SmoothScroll>
      <div className={`${appShell.shell} ${appShell.shellWide}`} data-lenis-prevent data-testid="shared-room-page">
        <Header />
        <main className={`${appShell.main} ${appShell.mainWide}`}>{body}</main>
      </div>
    </SmoothScroll>
  );
}
