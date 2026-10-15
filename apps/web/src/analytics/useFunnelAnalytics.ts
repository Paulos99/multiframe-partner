import { useEffect, useRef } from 'react';
import type { SessionState } from '../state/types';
import { buildAnalyticsPayload, eventParamsFromSession } from './payload';
import { ingestAnalyticsPayload } from './ingest';
import { track } from './track';

/**
 * Emit funnel goals when wizard step / room substep changes.
 * Mount once inside SessionProvider tree.
 */
export function useFunnelAnalytics(session: SessionState): void {
  const prevStep = useRef<string | null>(null);
  const prevSub = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const { step, roomSubstep } = session;

    if (step === 'start') {
      started.current = false;
      prevStep.current = 'start';
      prevSub.current = null;
      return;
    }

    const params = eventParamsFromSession(session);

    if (step === 'room' && (prevStep.current === 'start' || prevStep.current === null) && !started.current) {
      started.current = true;
      track('pm_start', params);
    }

    if (step === 'room' && roomSubstep !== prevSub.current) {
      track('pm_room_step', { ...params, roomSubstep });
    }

    if (step === 'result' && prevStep.current !== 'result') {
      track('pm_result_view', params);
      const payload = buildAnalyticsPayload(session);
      if (payload) void ingestAnalyticsPayload(payload);
    }

    prevStep.current = step;
    prevSub.current = roomSubstep;
  }, [session.step, session.roomSubstep, session]);
}
