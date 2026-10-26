import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Deal } from '../../../../../packages/shared/deal';
import type { JobObject, Project, SessionUser } from '../../../../../packages/shared/partner';
import { apiListDeals, hasRemoteApi, type ApiDeal } from '../apiClient';
import { ensureDealsForProjects, listLocalDeals } from './localDeals';

function asDeal(row: ApiDeal): Deal {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    stage: row.stage as Deal['stage'],
    ownerUserId: row.ownerUserId,
    assignments: row.assignments,
    nextActionAt: row.nextActionAt,
    outcome: (row.outcome as Deal['outcome']) ?? null,
    lossReason: (row.lossReason as Deal['lossReason']) ?? null,
    lossComment: row.lossComment ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Сделки: remote API или localStorage-демо. */
export function useCommercialDeals(input: {
  user: SessionUser | null;
  objects: JobObject[];
  projects: Project[];
}) {
  const { user, objects, projects } = input;
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    const orgId = user?.orgId || null;
    if (!user || !orgId) {
      setDeals([]);
      setLoading(false);
      return;
    }

    if (hasRemoteApi()) {
      setLoading(true);
      void apiListDeals()
        .then((rows) => {
          if (live) setDeals(rows.map(asDeal));
        })
        .catch(() => {
          if (live) setDeals([]);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
      };
    }

    const next = ensureDealsForProjects(orgId, user.id, projects, objects);
    setDeals(next);
    setLoading(false);
    return () => {
      live = false;
    };
  }, [user, objects, projects, tick]);

  const projectId = useMemo(() => {
    const fromObj = objects.find((o) => o.projectId)?.projectId;
    if (fromObj) return fromObj;
    return projects[0]?.id || null;
  }, [objects, projects]);

  const activeDealId = useMemo(() => {
    if (!projectId) return deals.find((d) => !d.outcome)?.id || null;
    return (
      deals.find((d) => d.projectId === projectId && !d.outcome)?.id ||
      deals.find((d) => d.projectId === projectId)?.id ||
      null
    );
  }, [deals, projectId]);

  const reloadLocal = useCallback(() => {
    if (!user?.orgId || hasRemoteApi()) {
      refresh();
      return;
    }
    setDeals(listLocalDeals(user.orgId));
  }, [user?.orgId, refresh]);

  return { deals, loading, projectId, activeDealId, refresh: reloadLocal };
}
