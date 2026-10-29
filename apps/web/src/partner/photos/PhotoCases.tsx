import { useCallback, useEffect, useMemo, useState } from 'react';
import { PHOTO_STAGES, PHOTO_STAGE_LABELS, type PhotoStage } from '../../../../../packages/shared/roomPhotos.js';
import {
  apiGetPhotoCase,
  apiListPhotoCases,
  type PhotoCase,
  type PhotoCaseFilters,
  type RoomPhoto,
} from '../apiClient';
import { casesHash, navigateCases, parseCasesHash, type CasesRoute } from '../projectRoute';
import { Skeleton } from '../Skeleton';
import { PhotoCompare } from './PhotoCompare';
import { PhotoViewer } from './PhotoViewer';
import { ROLE_LABELS, formatPhotoDate, groupByStage } from './photoFormat';
import styles from './PhotoCases.module.css';

function useCasesRoute(): CasesRoute {
  const read = () => parseCasesHash(window.location.hash) ?? { kind: 'list' as const };
  const [route, setRoute] = useState<CasesRoute>(read);
  useEffect(() => {
    const sync = () => setRoute(read());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  return route;
}

/** «Аналитика → Фото отчёты» у админа (фотоотчёты партнёров, база кейсов): комнаты с фото всех партнёров. Список — обзор, кейс — отдельная страница. */
export function PhotoCases() {
  const route = useCasesRoute();
  return route.kind === 'case' ? <CasePage objectId={route.objectId} /> : <CasesList />;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function CountChips({ counts }: { counts: Record<PhotoStage, number> }) {
  return (
    <span className={styles.chips}>
      {PHOTO_STAGES.map((stage) => (
        <span key={stage} className={styles.chip} data-stage={stage} data-empty={counts[stage] ? undefined : '1'}>
          {PHOTO_STAGE_LABELS[stage]} {counts[stage]}
        </span>
      ))}
    </span>
  );
}

function CasesList() {
  const [filters, setFilters] = useState<PhotoCaseFilters>({ orgId: '', stage: '', from: '', to: '' });
  const [onlyComplete, setOnlyComplete] = useState(false);
  const [data, setData] = useState<{ cases: PhotoCase[]; partners: Array<{ id: string; name: string }> } | null>(null);
  const [allPartners, setAllPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const next = await apiListPhotoCases(filters, signal);
        setData(next);
        setError('');
        // Сервер отдаёт всех партнёров с фото независимо от фильтров, выбор не сужается.
        setAllPartners(next.partners);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить кейсы');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const cases = useMemo(
    () => (data?.cases ?? []).filter((item) => !onlyComplete || item.complete),
    [data, onlyComplete],
  );
  const completeCount = (data?.cases ?? []).filter((item) => item.complete).length;
  const set = (patch: Partial<PhotoCaseFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const filtered = Boolean(filters.orgId || filters.stage || filters.from || filters.to || onlyComplete);

  return (
    <section className={styles.page} data-testid="photo-cases">
      <header className={styles.head}>
        <h1>Фото отчёты</h1>
        <p className={styles.lead}>
          Комнаты, где партнёры приложили фото до, во время и после монтажа. База для примеров и разбора работ.
        </p>
      </header>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <strong>{data ? data.cases.length : '—'}</strong>
          <span>комнат с фото</span>
        </div>
        <div className={styles.kpi}>
          <strong>{data ? completeCount : '—'}</strong>
          <span>с «До» и «После»</span>
        </div>
        <div className={styles.kpi}>
          <strong>{data ? data.partners.length : '—'}</strong>
          <span>{data ? plural(data.partners.length, 'партнёр', 'партнёра', 'партнёров') : 'партнёров'}</span>
        </div>
      </div>

      <div className={styles.filters} role="search" aria-label="Фильтры кейсов">
        <label className={styles.field}>
          Партнёр
          <select value={filters.orgId || ''} onChange={(event) => set({ orgId: event.target.value })} data-testid="cases-filter-partner">
            <option value="">Все партнёры</option>
            {allPartners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Этап
          <select value={filters.stage || ''} onChange={(event) => set({ stage: event.target.value as PhotoStage | '' })} data-testid="cases-filter-stage">
            <option value="">Любой этап</option>
            {PHOTO_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                Есть фото: {PHOTO_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          С даты
          <input type="date" value={filters.from || ''} max={filters.to || undefined} onChange={(event) => set({ from: event.target.value })} />
        </label>
        <label className={styles.field}>
          По дату
          <input type="date" value={filters.to || ''} min={filters.from || undefined} onChange={(event) => set({ to: event.target.value })} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={onlyComplete} onChange={(event) => setOnlyComplete(event.target.checked)} data-testid="cases-filter-complete" />
          <span>Только с «До» и «После»</span>
        </label>
        {filtered ? (
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              setFilters({ orgId: '', stage: '', from: '', to: '' });
              setOnlyComplete(false);
            }}
          >
            Сбросить
          </button>
        ) : null}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}{' '}
          <button type="button" className={styles.linkBtn} onClick={() => void load()}>
            Повторить
          </button>
        </p>
      ) : null}

      {loading && !data ? <Skeleton count={3} label="Загружаем кейсы" /> : null}

      {data && !cases.length && !loading ? (
        <p className={styles.empty} data-testid="cases-empty">
          {filtered ? 'По этим условиям кейсов нет. Измените фильтры.' : 'Пока нет ни одной комнаты с фото.'}
        </p>
      ) : null}

      <ul className={styles.list} aria-busy={loading}>
        {cases.map((item) => (
          <li key={item.objectId}>
            <a
              className={styles.card}
              href={casesHash({ kind: 'case', objectId: item.objectId })}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                navigateCases({ kind: 'case', objectId: item.objectId });
              }}
              data-testid="case-card"
            >
              <span className={styles.cover}>
                {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" draggable={false} /> : null}
                {item.complete ? <span className={styles.badge}>До и после</span> : null}
              </span>
              <span className={styles.body}>
                <strong>{item.roomName || 'Комната'}</strong>
                <span className={styles.sub}>
                  {[item.partnerName, item.city, item.areaM2 ? `${item.areaM2} м²` : ''].filter(Boolean).join(' · ')}
                </span>
                <CountChips counts={item.counts} />
                <span className={styles.sub}>
                  {item.lastAt ? `Последнее фото: ${formatPhotoDate(item.lastAt, false)}` : ''}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CasePage({ objectId }: { objectId: string }) {
  const [data, setData] = useState<{ case: PhotoCase; photos: RoomPhoto[] } | null>(null);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ index: number; compare: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    apiGetPhotoCase(objectId, controller.signal)
      .then(setData)
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить кейс');
      });
    return () => controller.abort();
  }, [objectId]);

  const photos = data?.photos ?? [];
  const groups = useMemo(() => groupByStage(photos), [photos]);
  const flat = useMemo(() => PHOTO_STAGES.flatMap((stage) => groups[stage]), [groups]);
  const comparable = groups.before.length > 0 && groups.after.length > 0;
  const item = data?.case;

  return (
    <section className={styles.page} data-testid="photo-case">
      <nav className={styles.crumbs} aria-label="Навигация">
        <button type="button" className={styles.ghost} onClick={() => navigateCases({ kind: 'list' })} data-testid="case-back">
          К кейсам
        </button>
      </nav>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {!data && !error ? <Skeleton count={3} label="Загружаем кейс" /> : null}

      {item ? (
        <>
          <header className={styles.head}>
            <h1>{item.roomName || 'Комната'}</h1>
            <p className={styles.lead}>
              {[item.partnerName, item.city, item.areaM2 ? `${item.areaM2} м²` : ''].filter(Boolean).join(' · ')}
            </p>
            <p className={styles.lead}>
              {item.firstAt ? `Фото с ${formatPhotoDate(item.firstAt, false)}` : ''}
              {item.lastAt && item.lastAt !== item.firstAt ? ` по ${formatPhotoDate(item.lastAt, false)}` : ''}
            </p>
            <CountChips counts={item.counts} />
          </header>

          {comparable ? (
            <div className={styles.block}>
              <h2>До и после</h2>
              <PhotoCompare befores={groups.before} afters={groups.after} />
            </div>
          ) : null}

          <div className={styles.stages}>
            {PHOTO_STAGES.map((stage) => (
              <div key={stage} className={styles.block} data-testid={`case-stage-${stage}`}>
                <h2>
                  {PHOTO_STAGE_LABELS[stage]} <span className={styles.count}>{groups[stage].length}</span>
                </h2>
                {groups[stage].length ? (
                  <ul className={styles.grid}>
                    {groups[stage].map((photo) => (
                      <li key={photo.id}>
                        <button
                          type="button"
                          className={styles.tile}
                          onClick={() => setViewer({ index: flat.findIndex((p) => p.id === photo.id), compare: false })}
                          aria-label={`Открыть фото. ${PHOTO_STAGE_LABELS[stage]}, ${formatPhotoDate(photo.createdAt)}`}
                          data-testid="case-photo"
                        >
                          <img src={photo.thumbUrl} alt="" loading="lazy" draggable={false} />
                        </button>
                        <span className={styles.tileMeta}>
                          {formatPhotoDate(photo.createdAt, false)}
                          {photo.authorRole ? ` · ${ROLE_LABELS[photo.authorRole] || photo.authorRole}` : ''}
                        </span>
                        {photo.caption ? <span className={styles.tileCaption}>{photo.caption}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>Этого этапа нет.</p>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {viewer ? (
        <PhotoViewer photos={flat} startIndex={Math.max(0, viewer.index)} startInCompare={viewer.compare} onClose={() => setViewer(null)} />
      ) : null}
    </section>
  );
}
