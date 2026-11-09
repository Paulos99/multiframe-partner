import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { pollDelayMs } from './polling';
import type {
  ActivityEvent,
  JobObject,
  OrgSettings,
  PartnerProfile,
  Project,
  ProjectInput,
  SessionUser,
  UserRole,
} from '../../../../packages/shared/partner';
import { loadCities, resolveCity } from './cityCatalog';
import { startTrainingSync } from './trainingSync';
import {
  canCreateObjects,
  isStpManagerRole,
  toPartnerProfile,
  type JobObjectDocument,
} from '../../../../packages/shared/partner';
import {
  apiAdminCreatePartner,
  apiAdminDeletePartner,
  apiAdminListPartners,
  apiAdminResetPassword,
  apiAdminUpdatePartnerCity,
  apiBase,
  apiCreateProject,
  apiCreateStaff,
  apiDeleteStaff,
  apiDeleteProject,
  apiPatchObject,
  apiListStaff,
  apiLogin,
  apiRenameStaff,
  apiUpdateDisplayName,
  apiUpdatePhone,
  apiLogout,
  apiMe,
  apiResetStaffPassword,
  apiSaveOrg,
  apiUploadObjectDocuments,
  hasRemoteApi,
  isApiError,
  isTransientApiError,
  NETWORK_ERROR_MESSAGE,
  stripObjectDocuments,
} from './apiClient';
import {
  calcMessageHasScheme,
  objectPatchFromCalc,
  readablePdfName,
  type CabinetCalcMessage,
} from './cabinetCalc';
import { linkCalcToRoom } from './roomLink';
import {
  PARTNER_CALC_STORE,
  partnerCalcParamsFromOrg,
  persistPartnerCalcParams,
} from './calcUrl';
export { calcUrlFromOrg } from './calcUrl';
import { groupOrphanRooms } from '../../../../packages/shared/groupProjects.js';
import { withDemoDocuments } from './demoDocuments';
import { isDemoModeEnabled } from './demoMode';
import { allowDeviceLogin } from './loginFallback';
import { useOfflineMaterialsAutoSync } from './offlineAutoSync';
import {
  bootstrapHistoryReset,
  flushAnalyticsQueue,
  trackPartnerAnalytics,
} from './analytics';
import {
  cacheObjects,
  clearObjectQueue,
  createPartnerAccount,
  createStaffAccount,
  deletePartnerAccount,
  deleteLocalProject,
  deleteStaffAccount,
  enqueueObjectDocuments,
  renameStaffDisplayName,
  updateOwnDisplayName,
  updateOwnPhone,
  generatePassword,
  listActivity,
  listPartners,
  listStaffForOrg,
  loadCachedObjects,
  loadSession,
  loadToken,
  localLogin,
  localLogout,
  peekObjectDocumentQueue,
  removeQueuedObjectDocuments,
  peekObjectQueue,
  resetPartnerPassword,
  resetStaffPassword,
  updatePartnerCity,
  saveSession,
  saveToken,
  setLocalOnlySession,
  trackToolOpen,
  updateOrgSettings,
  type StoredOrg,
  type StoredUser,
} from './localStore';
import {
  enqueueOutbox,
  listOutbox,
  listProjectOutbox,
  loadCalculationsFor,
  putObject,
  rememberSession,
  type CachedCalculation,
} from './offlineDb';
import { QUEUE_EVENT, enqueueNote, flushFieldQueue, listMyQueue, withSyncLock } from './fieldQueue';
import {
  AUTO_SYNC_INTERVAL_MS,
  isFinalHttpStatus,
  isRegenerableDocumentKind,
  pendingTotal,
  readLastSync,
  type FieldQueueItem,
  type PendingCounts,
} from './offlineQueue';
import { precacheRoomDocuments } from './docCache';
import {
  deleteObjectSynced,
  listStageConflicts,
  resolveStageConflict,
  type StageConflict,
  flushDocumentQueue,
  type DocFlushFailure,
  flushOutbox,
  loadVisibleObjects,
  rememberObjectDocuments,
  flushProjectOutbox,
  loadVisibleProjects,
  saveObjectSynced,
  saveProjectSynced,
} from './syncEngine';

export type StaffMember = {
  id: string;
  login: string;
  role: UserRole;
  displayName: string;
  /** Рабочий телефон из профиля. */
  phone?: string;
  orgId: string | null;
  createdAt?: string;
  /** Пароль ещё не задан: сотрудник ждёт ссылку активации. */
  pendingActivation?: boolean;
};

export type SyncStatus = 'offline' | 'pending' | 'synced';

function asStaff(member: StaffMember | StoredUser): StaffMember {
  return {
    id: member.id,
    login: member.login,
    role: member.role,
    displayName: member.displayName,
    orgId: member.orgId,
    createdAt: member.createdAt,
    ...('pendingActivation' in member && member.pendingActivation ? { pendingActivation: true } : {}),
  };
}

const NO_PENDING: PendingCounts = { rooms: 0, projects: 0, notes: 0, photos: 0, documents: 0 };

export type SyncNowResult = {
  pendingLeft: number;
  docSent: number;
  docFailed: DocFlushFailure[];
  message: string;
};

type PartnerApi = {
  user: SessionUser | null;
  partner: PartnerProfile | null;
  loading: boolean;
  /** Первая проверка сессии закончилась. Попытка входа это не сбрасывает. */
  ready: boolean;
  error: string | null;
  remote: boolean;
  objects: JobObject[];
  objectsLoading: boolean;
  staffLoading: boolean;
  partnersLoading: boolean;
  pendingSyncCount: number;
  /** Что ждёт отправки, по видам: комнаты, проекты, заметки, фото, PDF. */
  pendingCounts: PendingCounts;
  /** Заметки и фото этого человека в очереди на телефоне. */
  fieldQueue: FieldQueueItem[];
  /** Последняя удачная загрузка с сервера (ISO) или null. */
  lastSyncAt: string | null;
  /** Конфликты этапа: ждут выбора человека. */
  stageConflicts: StageConflict[];
  resolveStageConflict: (objectId: string, choice: 'mine' | 'server') => Promise<void>;
  /** Заметка к комнате. Без связи ложится в очередь и уходит сама. */
  addRoomNote: (objectId: string, text: string) => Promise<void>;
  /** «Отправить сейчас»: очередь целиком, без пауз между повторами. */
  syncNow: () => Promise<SyncNowResult>;
  /** PDF с окончательной ошибкой: убрать из очереди отправки. */
  dismissQueuedDocuments: (objectId: string, versionId: string) => void;
  /** Последний итог ручной отправки (для полосы). */
  lastSyncResult: string | null;
  online: boolean;
  syncStatus: SyncStatus;
  calculations: CachedCalculation[];
  /** JWT expired while the outbox still has rows. Queue is kept until the next login. */
  authHold: boolean;
  login: (login: string, password: string, options?: { demoAccount?: boolean }) => Promise<void>;
  logout: () => void;
  saveOrg: (patch: Partial<OrgSettings>) => Promise<void>;
  /** Пустой пароль при работе с сервером: владелец получит ссылку активации и задаст пароль сам. */
  adminCreatePartner: (input: {
    login: string;
    password: string;
    companyName: string;
    city?: string;
  }) => Promise<{ login: string; password: string; pendingActivation?: boolean }>;
  adminResetPassword: (partnerUserId: string, password: string) => Promise<string>;
  adminDeletePartner: (partnerUserId: string) => Promise<void>;
  adminUpdatePartnerCity: (partnerUserId: string, city: string) => Promise<string>;
  adminListPartners: () => Array<{
    user: StoredUser | StaffMember;
    org: StoredOrg | { id: string; settings: OrgSettings } | undefined;
    lastLogin: string | null;
    executorCount: number;
  }>;
  adminActivity: () => ActivityEvent[];
  partnerCreateStaff: (input: {
    login: string;
    password: string;
    displayName: string;
    role: UserRole;
  }) => Promise<{ id: string; login: string; password: string; role: UserRole; pendingActivation?: boolean }>;
  partnerResetStaffPassword: (staffUserId: string, password: string) => Promise<string>;
  partnerDeleteStaff: (staffUserId: string) => Promise<void>;
  partnerListStaff: () => StaffMember[];
  renameStaff: (staffUserId: string, displayName: string) => Promise<{ id: string; displayName: string }>;
  updateDisplayName: (displayName: string) => Promise<SessionUser>;
  updatePhone: (phone: string) => Promise<SessionUser>;
  profileOpenToken: number;
  requestOpenProfile: () => void;
  /** @deprecated */
  partnerCreateExecutor: (input: {
    login: string;
    password: string;
    displayName: string;
  }) => Promise<{ id: string; login: string; password: string }>;
  /** @deprecated */
  partnerResetExecutorPassword: (executorUserId: string, password: string) => Promise<string>;
  /** @deprecated */
  partnerDeleteExecutor: (executorUserId: string) => Promise<void>;
  /** @deprecated */
  partnerListExecutors: () => StaffMember[];
  refreshObjects: () => Promise<void>;
  acceptProfile: (profile: SessionUser) => void;
  projects: Project[];
  projectsLoading: boolean;
  projectsError: string | null;
  projectsUnavailable: boolean;
  refreshProjects: () => Promise<void>;
  createProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectInput) => Promise<Project>;
  attachRoomToProject: (roomId: string, projectId: string) => Promise<void>;
  saveObject: (input: Partial<JobObject> & { id?: string }) => Promise<JobObject>;
  deleteObject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  flushObjectQueue: (opts?: { force?: boolean }) => Promise<SyncNowResult>;
  /** Открыть калькулятор на комнате. Без objectId площадь никуда не пишется. */
  requestCalculator: (objectId: string | null) => void;
  calcRequest: { objectId: string | null; nonce: number; areaM2?: number | null } | null;
  /** fresh — «Пересобрать»: опрос заново с первого вопроса. */
  requestDiagnosis: (objectId: string, opts?: { fresh?: boolean }) => void;
  clearDiagnosis: () => void;
  diagnosisRequest: { objectId: string; nonce: number; fresh?: boolean } | null;
  openObject: (id: string | null) => void;
  openedObjectId: string | null;
  /** Закрыть инструмент и открыть карточку комнаты, из которой пришли. */
  leaveToCabinet: (objectId?: string | null) => void;
  cabinetLeaveNonce: number;
  attachCalculation: (message: CabinetCalcMessage, objectId: string | null) => Promise<JobObject | null>;
  /** Площадь и, если PDF уже собран, смета — в существующую комнату. Новую комнату не создаёт и никому не шлёт. */
  applyCalculation: (message: CabinetCalcMessage, objectId: string | null, room?: JobObject) => Promise<JobObject | null>;
  /** «Профиль» — PDF проблемомера в карточку объекта. */
  attachProfile: (saved: JobObject, pdfBase64: string) => Promise<JobObject | null>;
  /** КП проекта: файл лежит в первой комнате проекта, отпечаток — по всем комнатам. */
  attachOffer: (
    anchor: JobObject,
    file: { pdfBase64: string; filename: string; stamp: string; panels: number; areaM2: number },
  ) => Promise<JobObject | null>;
  noteTool: (tool: 'problemomer' | 'calculator') => void;
  refresh: () => void;
  apiBase: string;
};

type AttachFile = {
  kind: 'estimate' | 'profile' | 'offer';
  stamp?: string | null;
  filename: string;
  pdfBase64: string;
  hasScheme: boolean;
  panels: number | null;
  areaM2: number | null;
};

const Ctx = createContext<PartnerApi | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [profileOpenToken, setProfileOpenToken] = useState(0);
  const requestOpenProfile = useCallback(() => setProfileOpenToken((n) => n + 1), []);
  const [objects, setObjects] = useState<JobObject[]>([]);
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [staffLoading,setStaffLoading]=useState(false);
  const [partnersLoading,setPartnersLoading]=useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsUnavailable, setProjectsUnavailable] = useState(false);
  const [diagnosisRequest, setDiagnosisRequest] = useState<{ objectId: string; nonce: number; fresh?: boolean } | null>(null);
  const [openedObjectId, setOpenedObjectId] = useState<string | null>(null);
  const [cabinetLeaveNonce, setCabinetLeaveNonce] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>(NO_PENDING);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [fieldQueue, setFieldQueue] = useState<FieldQueueItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [stageConflicts, setStageConflicts] = useState<StageConflict[]>([]);
  const pendingRef = useRef(0);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [calculations, setCalculations] = useState<CachedCalculation[]>([]);
  const [authHold, setAuthHold] = useState(false);
  const [staffCache, setStaffCache] = useState<StaffMember[]>([]);
  const [calcRequest, setCalcRequest] = useState<{ objectId: string | null; nonce: number; areaM2?: number | null } | null>(
    null,
  );
  const [partnersCache, setPartnersCache] = useState<
    Array<{
      user: StoredUser | StaffMember;
      org: StoredOrg | { id: string; settings: OrgSettings } | undefined;
      lastLogin: string | null;
      executorCount: number;
    }>
  >([]);
  const remote = hasRemoteApi();
  const objectsEpoch = useRef(0);
  const projectsEpoch = useRef(0);
  const groupedPosts = useRef(new Set<string>());

  /** Пересчёт очередей на телефоне: индикатор, полоса-напоминание, конфликты этапа. */
  const refreshPending = useCallback(async () => {
    const session = loadSession();
    if (!session || isStpManagerRole(session.role) || !remote || (isDemoModeEnabled() && !loadToken())) {
      pendingRef.current = 0;
      setPendingCounts(NO_PENDING);
      setPendingSyncCount(0);
      setFieldQueue([]);
      setStageConflicts([]);
      setLastSyncAt(session ? readLastSync(session.id) : null);
      return;
    }
    const [outbox, projectOutbox, queue, conflicts] = await Promise.all([
      listOutbox().catch(() => []),
      listProjectOutbox().catch(() => []),
      listMyQueue(session.id),
      listStageConflicts(session.id),
    ]);
    const counts: PendingCounts = {
      rooms: outbox.length ? outbox.filter((op) => op.userId === session.id).length : peekObjectQueue().length,
      projects: projectOutbox.filter((op) => op.userId === session.id).length,
      notes: queue.filter((item) => item.kind === 'note').length,
      photos: queue.filter((item) => item.kind === 'photo').length,
      documents: peekObjectDocumentQueue().length,
    };
    pendingRef.current = pendingTotal(counts);
    setPendingCounts(counts);
    setPendingSyncCount(pendingTotal(counts));
    setFieldQueue(queue);
    setStageConflicts(conflicts);
    setLastSyncAt(readLastSync(session.id));
  }, [remote]);

  const refreshObjects = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const session = loadSession();
    // У менеджера StP нет ни комнат, ни проектов: на сервер за ними не ходим.
    if (!session || isStpManagerRole(session.role)) {
      if (!silent) {
        setObjects([]);
        setPendingSyncCount(0);
      }
      return;
    }
    if (!silent) objectsEpoch.current += 1;
    const stamp = objectsEpoch.current;
    if (!silent) setObjectsLoading(true);
    try {
      const list = withDemoDocuments(await loadVisibleObjects(session, remote));
      if (stamp !== objectsEpoch.current) return;
      setObjects(list);
      cacheObjects(list);
      await refreshPending();
      // Предзагрузка «на сегодня»: PDF назначенных комнат на телефон, пока есть связь.
      if (!silent && remote && loadToken() && navigator.onLine) {
        void precacheRoomDocuments(list, session).catch(() => undefined);
      }
    } catch {
      if (!silent && stamp === objectsEpoch.current) setObjects(loadCachedObjects());
    } finally {
      if (!silent && stamp === objectsEpoch.current) setObjectsLoading(false);
    }
  }, [remote, refreshPending]);

  const refreshProjects = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const session = loadSession();
    if (!session || isStpManagerRole(session.role)) {
      if (!silent) {
        setProjects([]);
        setProjectsError(null);
        setProjectsUnavailable(false);
      }
      return;
    }
    if (!silent) projectsEpoch.current += 1;
    const stamp = projectsEpoch.current;
    if (!silent) setProjectsLoading(true);
    try {
      const result = await loadVisibleProjects(session, remote);
      if (stamp !== projectsEpoch.current) return;
      if (silent && result.error) return;
      setProjects(result.projects);
      setProjectsError(result.error);
      setProjectsUnavailable(result.unavailable);
    } catch (err) {
      if (silent || stamp !== projectsEpoch.current) return;
      setProjects([]);
      setProjectsError(err instanceof Error ? err.message : 'Не удалось загрузить проекты');
      setProjectsUnavailable(true);
    } finally {
      if (!silent && stamp === projectsEpoch.current) setProjectsLoading(false);
    }
  }, [remote]);

  /**
   * Выгрузка всего, что ждёт на телефоне, по порядку: комнаты (с этапами), проекты, заметки, фото, PDF.
   * Одна выгрузка на все вкладки (navigator.locks). Запускается при открытии приложения, по событию
   * online, при возврате на вкладку и раз в минуту, пока что-то ждёт отправки.
   */
  const flushObjectQueue = useCallback(
    async (opts?: { force?: boolean }): Promise<SyncNowResult> => {
      const session = loadSession();
      let docSent = 0;
      let docFailed: DocFlushFailure[] = [];
      if (!session || isStpManagerRole(session.role)) {
        return { pendingLeft: 0, docSent: 0, docFailed: [], message: '' };
      }
      await withSyncLock(async () => {
        const result = await flushOutbox(session, remote);
        const projectsResult = await flushProjectOutbox(session, remote);
        if (result === 'auth' || projectsResult === 'auth') setAuthHold(true);
        else if (result === 'ok' || result === 'idle') {
          setAuthHold(false);
          if (remote && loadToken()) {
            const fieldResult = await flushFieldQueue(session, { force: opts?.force });
            if (fieldResult === 'auth') setAuthHold(true);
          }
          const docs = await flushDocumentQueue({ force: opts?.force });
          docSent = docs.sent;
          docFailed = docs.failed;
          if (docs.auth) setAuthHold(true);
        }
      });
      await refreshObjects();
      await refreshProjects();
      await refreshPending();
      const left = pendingRef.current;
      let message = '';
      if (left === 0 && docFailed.length === 0) {
        message = docSent > 0 ? 'Всё отправлено.' : 'Очередь пуста.';
      } else if (docFailed.some((item) => item.final)) {
        const names = docFailed.filter((item) => item.final).map((item) => item.filename).join(', ');
        message = `Не удалось отправить: ${names}. Соберите PDF заново через «Пересобрать» или уберите из очереди.`;
      } else if (left > 0) {
        message = `Ещё ждут отправки: ${left}. Повторим сами.`;
      }
      if (opts?.force) setLastSyncResult(left > 0 ? message || null : null);
      return { pendingLeft: left, docSent, docFailed, message };
    },
    [remote, refreshObjects, refreshProjects, refreshPending],
  );

  const syncNow = useCallback(() => flushObjectQueue({ force: true }), [flushObjectQueue]);

  const dismissQueuedDocuments = useCallback(
    (objectId: string, versionId: string) => {
      removeQueuedObjectDocuments(objectId, versionId);
      setLastSyncResult(null);
      void refreshPending();
    },
    [refreshPending],
  );

  const addRoomNote = useCallback(
    async (objectId: string, text: string) => {
      const session = loadSession();
      if (!session) throw new Error('Нужно войти');
      const clean = text.trim();
      if (!clean) throw new Error('Напишите текст заметки');
      await enqueueNote(session, objectId, clean);
      await refreshPending();
      if (navigator.onLine) void flushObjectQueue();
    },
    [refreshPending, flushObjectQueue],
  );

  const resolveConflict = useCallback(
    async (objectId: string, choice: 'mine' | 'server') => {
      await resolveStageConflict(objectId, choice);
      await refreshPending();
      if (navigator.onLine) await flushObjectQueue();
      else await refreshObjects();
    },
    [refreshPending, flushObjectQueue, refreshObjects],
  );

  // Пока что-то ждёт отправки: повтор раз в минуту и при возврате на вкладку. Очередь фото и заметок
  // сообщает об изменениях событием — индикатор и полоса пересчитываются сразу.
  useEffect(() => {
    if (!user || !remote) return;
    const retry = () => {
      if (navigator.onLine && pendingRef.current > 0) void flushObjectQueue();
    };
    const timer = window.setInterval(retry, AUTO_SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    const onQueue = () => void refreshPending();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(QUEUE_EVENT, onQueue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(QUEUE_EVENT, onQueue);
    };
  }, [user?.id, remote, flushObjectQueue, refreshPending]);

  const refresh = useCallback(() => {
    setUser(loadSession());
    setTick((n) => n + 1);
    setLoading(false);
    setReady(true);
  }, []);

  useEffect(() => {
    bootstrapHistoryReset();
    let cancelled = false;
    (async () => {
      const session = loadSession();
      try {
        const legacy = peekObjectQueue();
        if (legacy.length && session) {
          for (const obj of legacy) {
            await enqueueOutbox({
              id: obj.id,
              op: 'upsert',
              updatedAt: obj.updatedAt || new Date().toISOString(),
              userId: obj.createdBy || session.id,
              orgId: obj.orgId,
              payload: obj,
            });
            await putObject(obj);
          }
          clearObjectQueue();
        }
      } catch {
        /* keep the legacy queue if IndexedDB is blocked */
      }
      if (remote && loadToken()) {
        try {
          const me = await apiMe();
          if (cancelled) return;
          saveSession(me);
          setUser(me);
          await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: me.id });
        } catch (err) {
          if (cancelled) return;
          if (isApiError(err) && err.status === 401) {
            saveToken(null);
            setAuthHold(true);
            await rememberSession({ token: null, apiBase: apiBase(), userId: session?.id || null });
          } else if (session) {
            await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: session.id });
          }
          setUser(session);
        }
      } else {
        setUser(session);
        if (session) {
          await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: session.id });
        }
      }
      setLoading(false);
      setReady(true);
      void flushAnalyticsQueue();
      void flushObjectQueue();
    })();
    return () => {
      cancelled = true;
    };
  }, [remote, flushObjectQueue]);

  // Результаты обучения и открытия материалов уходят на сервер сами, пока кабинет открыт (админ без компании не пишет).
  useEffect(() => {
    if (!user?.id || !user.orgId || user.role === 'admin') return;
    return startTrainingSync(user.id);
  }, [user?.id, user?.orgId, user?.role]);

  useEffect(() => {
    if (user) {
      void refreshObjects();
      void refreshProjects();
    }
  }, [user?.id, refreshObjects, refreshProjects]);

  useEffect(() => {
    if (!user || !remote) return;
    let timer = 0;
    let stopped = false;
    let inflight = false;
    const pull = () => {
      if (stopped || inflight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      inflight = true;
      void Promise.all([
        refreshObjects({ silent: true }),
        refreshProjects({ silent: true }),
      ]).finally(() => {
        inflight = false;
      });
    };
    const arm = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => {
        pull();
        arm();
      }, pollDelayMs());
    };
    const onFocus = () => pull();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        pull();
        arm();
      } else {
        window.clearTimeout(timer);
        timer = 0;
      }
    };
    arm();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, remote, refreshObjects, refreshProjects]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushAnalyticsQueue();
      void flushObjectQueue();
    };
    const onOffline = () => {
      setOnline(false);
      void refreshObjects();
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'mf-flush') {
        void flushAnalyticsQueue();
        void flushObjectQueue();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
    };
  }, [flushObjectQueue, refreshObjects]);

  // Офлайн-копии «Обучения» обновляются сами, если пользователь их включил.
  useOfflineMaterialsAutoSync(user?.id ?? null, online);

  useEffect(() => {
    if (!user) {
      setCalculations([]);
      return;
    }
    let cancelled = false;
    const reload = () => {
      void loadCalculationsFor(user)
        .then((rows) => {
          if (!cancelled) setCalculations(rows);
        })
        .catch(() => undefined);
    };
    reload();
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [user, tick, online]);

  useEffect(() => {
    const company = user?.org?.companyName || '';
    (window as Window & { __MF_PARTNER_COMPANY__?: string }).__MF_PARTNER_COMPANY__ = company;
    (window as Window & { __MF_PARTNER_ORG__?: OrgSettings | null }).__MF_PARTNER_ORG__ =
      user?.org || null;
    if (user?.org) {
      persistPartnerCalcParams(partnerCalcParamsFromOrg(user.org));
    }
  }, [user]);

  const login = useCallback(
    async (loginName: string, password: string, options?: { demoAccount?: boolean }) => {
      setError(null);
      setCalcRequest(null);
      setDiagnosisRequest(null);
      try {
        localStorage.removeItem(PARTNER_CALC_STORE);
      } catch {
        /* хранилище недоступно */
      }
      setOpenedObjectId(null);
      setLoading(true);
      try {
        let session: SessionUser;
        if (remote) {
          try {
            let res: Awaited<ReturnType<typeof apiLogin>>;
            try {
              res = await apiLogin(loginName, password);
            } catch (first) {
              // Сбой связи на телефоне бывает разовым: один повтор, прежде чем сдаваться.
              if (!isTransientApiError(first)) throw first;
              await new Promise((resolve) => setTimeout(resolve, 1200));
              res = await apiLogin(loginName, password);
            }
            session = res.user;
            saveSession(session);
            setLocalOnlySession(false);
          } catch (apiError) {
            // Вход только на устройстве (без токена) — это исключение для демо:
            //  • выбранная демо-роль, закрытая на сервере;
            //  • обрыв связи, когда демо включено.
            // Неверный пароль настоящего аккаунта (в том числе старый, до смены) сюда не попадает:
            // иначе вход «проходит» по демо-паролю из сборки, а материалы потом не открываются.
            const allowDevice = allowDeviceLogin({
              demoEnabled: isDemoModeEnabled(),
              demoAccount: options?.demoAccount === true,
              transientError: isTransientApiError(apiError),
            });
            if (!allowDevice) {
              throw isTransientApiError(apiError) ? new Error(NETWORK_ERROR_MESSAGE) : apiError;
            }
            try {
              session = localLogin(loginName, password);
              setLocalOnlySession(true);
            } catch (localError) {
              if (isTransientApiError(apiError)) throw new Error(NETWORK_ERROR_MESSAGE);
              throw localError;
            }
          }
        } else {
          session = localLogin(loginName, password);
        }
        setUser(session);
        setAuthHold(false);
        await rememberSession({ token: loadToken(), apiBase: apiBase(), userId: session.id });
        trackPartnerAnalytics({ tool: 'cabinet', action: 'login' });
        void flushAnalyticsQueue();
        void flushObjectQueue();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка входа');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [remote, flushObjectQueue],
  );

  const logout = useCallback(() => {
    if (remote) void apiLogout();
    localLogout(user);
    setLocalOnlySession(false);
    void rememberSession({ token: null, apiBase: apiBase(), userId: null });
    setUser(null);
    setCalcRequest(null);
    setDiagnosisRequest(null);
    try {
      localStorage.removeItem(PARTNER_CALC_STORE);
    } catch {
      /* хранилище недоступно */
    }
    setOpenedObjectId(null);
    setObjects([]);
    setProjects([]);
    setProjectsError(null);
    setProjectsUnavailable(false);
    setStaffCache([]);
    setCalculations([]);
  }, [user, remote]);

  const saveOrg = useCallback(
    async (patch: Partial<OrgSettings>) => {
      if (!user?.orgId) throw new Error('Нет организации');
      let nextPatch = patch;
      if (patch.city !== undefined) {
        await loadCities();
        const resolved = resolveCity(patch.city, user.org?.city ?? '');
        if (!resolved.ok) throw new Error(resolved.message);
        nextPatch = { ...patch, city: resolved.city };
      }
      let settings: OrgSettings;
      if (remote && loadToken()) {
        settings = await apiSaveOrg(nextPatch);
      } else {
        settings = updateOrgSettings(user.orgId, nextPatch, user);
      }
      const next = { ...user, org: settings };
      persistPartnerCalcParams(partnerCalcParamsFromOrg(settings));
      saveSession(next);
      setUser(next);
    },
    [user, remote],
  );

  const adminCreatePartner = useCallback(
    async (input: { login: string; password: string; companyName: string; city?: string }) => {
      if (!user) throw new Error('Нет сессии');
      await loadCities();
      const resolved = resolveCity(input.city ?? '', null);
      if (!resolved.ok) throw new Error(resolved.message);
      const payload = { ...input, city: resolved.city };
      if (remote && loadToken()) {
        const res = await apiAdminCreatePartner(payload);
        setTick((n) => n + 1);
        return { login: res.login, password: res.password ?? '', pendingActivation: res.pendingActivation };
      }
      const res = createPartnerAccount({ ...payload, password: payload.password || generatePassword(), admin: user });
      setTick((n) => n + 1);
      return { login: res.user.login, password: res.password };
    },
    [user, remote],
  );

  const adminUpdatePartnerCity = useCallback(
    async (partnerUserId: string, city: string) => {
      if (!user) throw new Error('Нет сессии');
      await loadCities();
      const resolved = resolveCity(city, null);
      if (!resolved.ok) throw new Error(resolved.message);
      if (remote && loadToken()) {
        const saved = await apiAdminUpdatePartnerCity(partnerUserId, resolved.city);
        setTick((n) => n + 1);
        return saved;
      }
      const saved = updatePartnerCity(partnerUserId, resolved.city, user);
      setTick((n) => n + 1);
      return saved;
    },
    [user, remote],
  );

  const adminResetPassword = useCallback(
    async (partnerUserId: string, password: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const pw = await apiAdminResetPassword(partnerUserId, password);
        setTick((n) => n + 1);
        return pw;
      }
      const pw = resetPartnerPassword(partnerUserId, password, user);
      setTick((n) => n + 1);
      return pw;
    },
    [user, remote],
  );

  const adminDeletePartner = useCallback(
    async (partnerUserId: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        await apiAdminDeletePartner(partnerUserId);
      } else {
        deletePartnerAccount(partnerUserId, user);
      }
      setTick((n) => n + 1);
    },
    [user, remote],
  );

  const partnerCreateStaff = useCallback(
    async (input: {
      login: string;
      password: string;
      displayName: string;
      role: UserRole;
    }) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const res = await apiCreateStaff(input);
        setTick((n) => n + 1);
        const list = await apiListStaff();
        setStaffCache(list);
        return { ...res, password: res.password ?? '' };
      }
      const res = createStaffAccount({ ...input, owner: user });
      setTick((n) => n + 1);
      return {
        id: res.user.id,
        login: res.user.login,
        password: res.password,
        role: res.user.role,
        pendingActivation: Boolean(res.user.pendingActivation) || !res.password,
      };
    },
    [user, remote],
  );

  const partnerResetStaffPassword = useCallback(
    async (staffUserId: string, password: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const pw = await apiResetStaffPassword(staffUserId, password);
        setTick((n) => n + 1);
        return pw;
      }
      const pw = resetStaffPassword(staffUserId, password, user);
      setTick((n) => n + 1);
      return pw;
    },
    [user, remote],
  );

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const next = await apiUpdateDisplayName(displayName);
        saveSession(next);
        setUser(next);
        return next;
      }
      const next = updateOwnDisplayName(user, displayName);
      setUser(next);
      return next;
    },
    [user, remote],
  );

  const updatePhone = useCallback(
    async (phone: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const next = { ...user, ...(await apiUpdatePhone(phone)) };
        saveSession(next);
        setUser(next);
        return next;
      }
      const next = updateOwnPhone(user, phone);
      setUser(next);
      return next;
    },
    [user, remote],
  );

  const renameStaff = useCallback(
    async (staffUserId: string, displayName: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        const updated = await apiRenameStaff(staffUserId, displayName);
        setStaffCache(await apiListStaff());
        if (updated.id === user.id) {
          const next = { ...user, displayName: updated.displayName };
          saveSession(next);
          setUser(next);
        }
        return { id: updated.id, displayName: updated.displayName };
      }
      const saved = renameStaffDisplayName(staffUserId, displayName, user);
      if (staffUserId === user.id) {
        const next = { ...user, displayName: saved };
        saveSession(next);
        setUser(next);
      }
      setTick((n) => n + 1);
      return { id: staffUserId, displayName: saved };
    },
    [user, remote],
  );

  const partnerDeleteStaff = useCallback(
    async (staffUserId: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken()) {
        await apiDeleteStaff(staffUserId);
        setStaffCache(await apiListStaff());
      } else {
        deleteStaffAccount(staffUserId, user);
      }
      setTick((n) => n + 1);
    },
    [user, remote],
  );

  useEffect(() => {
    let cancelled=false;
    setStaffLoading(false);setPartnersLoading(false);
    if (!user) return;
    if(user.role==='owner'||user.role==='sales') {
      if(remote&&loadToken()) {
        setStaffLoading(true);
        void apiListStaff().then(list=>{if(!cancelled)setStaffCache(list);})
          .catch(()=>{}).finally(()=>{if(!cancelled)setStaffLoading(false);});
      } else if(user.orgId) setStaffCache(listStaffForOrg(user.orgId));
    }
    if(user.role==='admin') {
      if(remote&&loadToken()) {
        setPartnersLoading(true);
        void apiAdminListPartners().then(list=>{if(!cancelled)setPartnersCache(list.map(p=>({user:p.user,org:p.org,lastLogin:p.lastLogin,executorCount:p.staffCount??p.executorCount})));})
          .catch(()=>{}).finally(()=>{if(!cancelled)setPartnersLoading(false);});
      } else setPartnersCache(listPartners());
    }
    return()=>{cancelled=true;};
  },[user,remote,tick]);

  useEffect(() => {
    const orphans = objects.filter((object) => !String(object.projectId || '').trim());
    if (!user || !orphans.length) return;
    const doc = {
      projects: projects.map((project) => ({ ...project })),
      objects: objects.map((object) => ({ ...object })),
    };
    if (!groupOrphanRooms(doc)) return;
    const nextProjects = doc.projects as Project[];
    const nextObjects = doc.objects as JobObject[];
    setProjects(nextProjects);
    setObjects(nextObjects);
    if (!remote || !loadToken() || !canCreateObjects(user.role)) return;
    const fresh = nextProjects.filter((project) => !projects.some((item) => item.id === project.id));
    void (async () => {
      for (const project of fresh) {
        if (groupedPosts.current.has(project.id)) continue;
        groupedPosts.current.add(project.id);
        try {
          await apiCreateProject({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            clientPhone: project.clientPhone,
            address: project.address,
            city: project.city,
          });
        } catch (err) {
          groupedPosts.current.delete(project.id);
          if (isApiError(err) && err.status === 403) return;
        }
      }
      for (const object of nextObjects) {
        if (!orphans.some((item) => item.id === object.id) || !object.projectId) continue;
        const mark = `${object.id}:${object.projectId}`;
        if (groupedPosts.current.has(mark)) continue;
        groupedPosts.current.add(mark);
        try {
          await apiPatchObject(object.id, { projectId: object.projectId });
        } catch {
          groupedPosts.current.delete(mark);
        }
      }
    })();
  }, [objects, projects, remote, user]);

  const saveObject = useCallback(
    async (input: Partial<JobObject> & { id?: string }) => {
      if (!user) throw new Error('Нет сессии');
      const obj = await saveObjectSynced(user, remote, stripObjectDocuments(input));
      await refreshObjects();
      await refreshProjects();
      return obj;
    },
    [user, remote, refreshObjects, refreshProjects],
  );

  const createProject = useCallback(
    async (input: ProjectInput) => {
      if (!user) throw new Error('Нет сессии');
      const project = await saveProjectSynced(user, remote, input);
      await refreshProjects();
      return project;
    },
    [user, remote, refreshProjects],
  );

  const updateProject = useCallback(
    async (id: string, input: ProjectInput) => {
      if (!user) throw new Error('Нет сессии');
      const project = await saveProjectSynced(user, remote, input, id);
      await refreshProjects();
      return project;
    },
    [user, remote, refreshProjects],
  );

  const attachRoomToProject = useCallback(
    async (roomId: string, projectId: string) => {
      const room = objects.find((obj) => obj.id === roomId);
      await saveObject({ ...(room || {}), id: roomId, projectId });
      await refreshProjects();
    },
    [objects, saveObject, refreshProjects],
  );

  const deleteObject = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Нет сессии');
      await deleteObjectSynced(user, remote, id);
      await refreshObjects();
    },
    [user, remote, refreshObjects],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Нет сессии');
      if (remote && loadToken() && navigator.onLine) await apiDeleteProject(id);
      try {
        deleteLocalProject(id, user);
      } catch (err) {
        if (!(remote && loadToken() && navigator.onLine)) throw err;
      }
      await refreshObjects();
      await refreshProjects();
    },
    [user, remote, refreshObjects, refreshProjects],
  );

  const requestDiagnosis = useCallback((objectId: string, opts?: { fresh?: boolean }) => {
    setDiagnosisRequest({ objectId, nonce: Date.now(), ...(opts?.fresh ? { fresh: true } : {}) });
  }, []);

  const clearDiagnosis = useCallback(() => setDiagnosisRequest(null), []);

  const openObject = useCallback((id: string | null) => setOpenedObjectId(id), []);

  const leaveToCabinet = useCallback((objectId?: string | null) => {
    if (objectId) setOpenedObjectId(objectId);
    setDiagnosisRequest(null);
    setCabinetLeaveNonce((n) => n + 1);
  }, []);

  const requestCalculator = useCallback((objectId: string | null) => {
    const areaM2 = objectId ? objects.find(obj => obj.id === objectId)?.room.areaM2 : null;
    // Capture once on opening: saving a new result must not reload the active iframe.
    setCalcRequest({ objectId, nonce: Date.now(), areaM2 });
  }, [objects]);

  /**
   * Прикладывает PDF к объекту.
   * Смета, профиль и КП собираются из данных заново: без связи только локальная копия,
   * в очередь отправки их не кладём. В облако — сразу при связи; при окончательной ошибке
   * не копим очередь, при сбое связи — краткий повтор через очередь.
   */
  const attachDocuments = useCallback(
    async (saved: JobObject, files: AttachFile[]): Promise<JobObject> => {
      if (!user) throw new Error('Нет сессии');
      const ready = files.filter((d) => d.pdfBase64.length > 32);
      if (!ready.length) return saved;
      const versionId = `ver_${Date.now().toString(36)}`;
      const regenerable = ready.every((d) => isRegenerableDocumentKind(d.kind));
      if (remote && loadToken() && navigator.onLine) {
        try {
          const updated = await apiUploadObjectDocuments(saved.id, ready, versionId);
          await refreshObjects();
          return updated;
        } catch (err) {
          // Смета, профиль и КП: локальная копия ниже, в очередь отправки не кладём.
          if (!regenerable && isApiError(err) && isFinalHttpStatus(err.status)) {
            throw err;
          }
          /* regenerable или сбой связи у прочих файлов — ниже */
        }
      }
      const now = new Date().toISOString();
      const roomName = saved.roomName || saved.clientName || saved.address || 'Комната';
      const localDocs: JobObjectDocument[] = ready.map((d) => ({
        id: `doc_${Math.random().toString(36).slice(2, 10)}`,
        versionId,
        createdAt: now,
        createdBy: user.id,
        kind: d.kind,
        filename: d.filename,
        hasScheme: d.hasScheme,
        panels: d.panels,
        areaM2: d.areaM2,
        dataBase64: d.pdfBase64,
        ...(d.kind === 'offer' ? { stamp: d.stamp || null, projectId: saved.projectId || null } : {}),
      }));
      // Собираемые PDF (смета, профиль, КП) в очередь отправки не кладём — только локальная копия.
      if (!regenerable) {
        enqueueObjectDocuments(
          saved.id,
          ready.map((d) => ({
            objectId: saved.id,
            versionId,
            kind: d.kind,
            filename: d.filename,
            pdfBase64: d.pdfBase64,
            hasScheme: d.hasScheme,
            panels: d.panels,
            areaM2: d.areaM2,
            roomName,
            ...(d.stamp ? { stamp: d.stamp } : {}),
          })),
        );
      }
      const withDocs = await rememberObjectDocuments(saved, localDocs, user);
      await refreshObjects();
      await refreshPending();
      return withDocs;
    },
    [user, remote, refreshObjects, refreshPending],
  );

  const attachCalculation = useCallback(
    async (message: CabinetCalcMessage, objectId: string | null) => {
      if (!user) return null;
      const existing = objectId ? objects.find((o) => o.id === objectId) : undefined;
      if (!canCreateObjects(user.role) && !(user.role === 'measurer' && existing)) return null;
      if (!calcMessageHasScheme(message)) return null;
      const patch = objectPatchFromCalc(message, existing, user.org, objectId);
      const saved = await saveObject(patch);
      const namedAt = new Date().toISOString();
      // Одна «Смета»: цены, количество и схема раскладки. PDF без цен больше не делаем.
      return attachDocuments(saved, [
        {
          kind: 'estimate',
          filename: readablePdfName(saved.clientName, 'estimate', namedAt),
          pdfBase64: message.pdfBase64 || '',
          hasScheme: true,
          panels: saved.estimate?.panels ?? null,
          areaM2: saved.room?.areaM2 ?? null,
        },
      ]);
    },
    [user, objects, saveObject, attachDocuments],
  );

  const applyCalculation = useCallback(
    async (message: CabinetCalcMessage, objectId: string | null, room?: JobObject) => {
      if (!user || !objectId) return null;
      // `room` — только что созданная комната: список объектов в состоянии ещё не обновился.
      const existing = room?.id === objectId ? room : objects.find((item) => item.id === objectId);
      if (!existing) return null;
      if (!canCreateObjects(user.role) && user.role !== 'measurer') return null;
      const patch = linkCalcToRoom(message, existing, user.org);
      if (!patch) return null;
      const saved = await saveObject(patch);
      if (!message.pdfBase64 || message.pdfBase64.length < 32) return saved;
      return attachDocuments(saved, [
        {
          kind: 'estimate',
          filename: readablePdfName(saved.clientName, 'estimate'),
          pdfBase64: message.pdfBase64,
          hasScheme: message.hasScheme !== false && !message.areaEstimate,
          panels: saved.estimate?.panels ?? message.panels ?? null,
          areaM2: saved.room?.areaM2 ?? null,
        },
      ]);
    },
    [user, objects, saveObject, attachDocuments],
  );

  const attachProfile = useCallback(
    async (saved: JobObject, pdfBase64: string) => {
      if (!user || (!canCreateObjects(user.role) && user.role !== 'measurer')) return null;
      return attachDocuments(saved, [
        {
          kind: 'profile',
          filename: readablePdfName(saved.clientName, 'profile', new Date().toISOString()),
          pdfBase64,
          hasScheme: false,
          panels: null,
          areaM2: saved.room?.areaM2 ?? null,
        },
      ]);
    },
    [user, attachDocuments],
  );

  const attachOffer = useCallback(
    async (
      anchor: JobObject,
      file: { pdfBase64: string; filename: string; stamp: string; panels: number; areaM2: number },
    ) => {
      if (!user || (user.role !== 'owner' && user.role !== 'sales')) return null;
      return attachDocuments(anchor, [
        {
          kind: 'offer',
          filename: file.filename,
          pdfBase64: file.pdfBase64,
          hasScheme: false,
          panels: file.panels,
          areaM2: file.areaM2,
          stamp: file.stamp,
        },
      ]);
    },
    [user, attachDocuments],
  );

  const noteTool = useCallback(
    (tool: 'problemomer' | 'calculator') => {
      if (user) {
        trackToolOpen(user, tool);
        trackPartnerAnalytics({ tool, action: 'open' });
      }
      setTick((n) => n + 1);
    },
    [user],
  );

  const partner = useMemo(() => (user ? toPartnerProfile(user) : null), [user]);

  const value = useMemo<PartnerApi>(
    () => ({
      user,
      partner,
      loading,
      ready,
      error,
      remote,
      objects,
      objectsLoading,
      staffLoading,
      partnersLoading,
      pendingSyncCount,
      pendingCounts,
      fieldQueue,
      lastSyncAt,
      stageConflicts,
      resolveStageConflict: resolveConflict,
      addRoomNote,
      syncNow,
      dismissQueuedDocuments,
      lastSyncResult,
      online,
      syncStatus: (!online ? 'offline' : pendingSyncCount > 0 ? 'pending' : 'synced') as SyncStatus,
      calculations,
      authHold,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminDeletePartner,
      adminUpdatePartnerCity,
      adminListPartners: () => (remote ? partnersCache : listPartners()),
      adminActivity: () => listActivity(),
      partnerCreateStaff,
      partnerResetStaffPassword,
      partnerDeleteStaff,
      renameStaff,
      updateDisplayName,
      updatePhone,
      profileOpenToken,
      requestOpenProfile,
      partnerListStaff: () =>
        (remote
          ? staffCache
          : staffCache.length
            ? staffCache
            : user?.orgId
              ? listStaffForOrg(user.orgId)
              : []
        ).map(asStaff),
      partnerCreateExecutor: async (input) => {
        const res = await partnerCreateStaff({ ...input, role: 'measurer' });
        return { id: res.id, login: res.login, password: res.password };
      },
      partnerResetExecutorPassword: partnerResetStaffPassword,
      partnerDeleteExecutor: partnerDeleteStaff,
      partnerListExecutors: () =>
        (remote
          ? staffCache
          : staffCache.length
            ? staffCache
            : user?.orgId
              ? listStaffForOrg(user.orgId)
              : []
        ).map(asStaff),
      refreshObjects,
      acceptProfile: (profile: SessionUser) => { saveSession(profile); setUser(profile); },
      projects,
      projectsLoading,
      projectsError,
      projectsUnavailable,
      refreshProjects,
      createProject,
      updateProject,
      attachRoomToProject,
      saveObject,
      deleteObject,
      deleteProject,
      flushObjectQueue,
      requestCalculator,
      calcRequest,
      requestDiagnosis,
      clearDiagnosis,
      diagnosisRequest,
      openObject,
      openedObjectId,
      leaveToCabinet,
      cabinetLeaveNonce,
      attachCalculation,
      applyCalculation,
      attachProfile,
      attachOffer,
      noteTool,
      refresh,
      apiBase: remote ? (import.meta.env.VITE_API_URL as string) || '' : '',
    }),
    [
      user,
      partner,
      loading,
      ready,
      error,
      remote,
      objects,
      objectsLoading,
      staffLoading,
      partnersLoading,
      pendingSyncCount,
      pendingCounts,
      fieldQueue,
      lastSyncAt,
      stageConflicts,
      resolveConflict,
      addRoomNote,
      syncNow,
      dismissQueuedDocuments,
      lastSyncResult,
      online,
      calculations,
      authHold,
      login,
      logout,
      saveOrg,
      adminCreatePartner,
      adminResetPassword,
      adminDeletePartner,
      adminUpdatePartnerCity,
      partnerCreateStaff,
      partnerResetStaffPassword,
      partnerDeleteStaff,
      renameStaff,
      updateDisplayName,
      updatePhone,
      profileOpenToken,
      requestOpenProfile,
      refreshObjects,
      projects,
      projectsLoading,
      projectsError,
      projectsUnavailable,
      refreshProjects,
      createProject,
      updateProject,
      attachRoomToProject,
      saveObject,
      deleteObject,
      deleteProject,
      flushObjectQueue,
      requestCalculator,
      calcRequest,
      requestDiagnosis,
      clearDiagnosis,
      diagnosisRequest,
      openObject,
      openedObjectId,
      leaveToCabinet,
      cabinetLeaveNonce,
      attachCalculation,
      applyCalculation,
      attachProfile,
      attachOffer,
      noteTool,
      refresh,
      tick,
      staffCache,
      partnersCache,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Без исключения вне провайдера: для панелей, которые рендерятся и отдельно (тесты, предпросмотр). */
export function useOptionalPartner(): PartnerApi | null {
  return useContext(Ctx);
}

export function usePartner(): PartnerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePartner outside Provider');
  return ctx;
}

export { generatePassword };
