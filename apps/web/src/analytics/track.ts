import { channelLabel, getChannel } from './channel';
import { metrikaReachGoal } from './metrika';

export type AnalyticsEvent =
  | 'pm_start'
  | 'pm_room_step'
  | 'pm_result_view'
  | 'pm_cta_calc'
  | 'pm_cta_consult'
  | 'pm_share'
  | 'pm_pdf'
  | 'pm_audio_play';

export function track(
  event: AnalyticsEvent,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  const merged = {
    channel: channelLabel(getChannel()),
    ...params,
  };
  metrikaReachGoal(event, merged);
  if (import.meta.env.DEV) {
    console.info('[analytics]', event, merged);
  }
}
