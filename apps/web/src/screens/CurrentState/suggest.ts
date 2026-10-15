import type { NoiseScenario, NoiseType } from '../../state/types';

const IMPACT: NoiseScenario[] = ['steps', 'drop', 'furniture', 'repair'];
const AIRBORNE: NoiseScenario[] = ['talk', 'tv', 'music'];

export function classifyFromScenarios(scenarios: NoiseScenario[]): NoiseType {
  const hasImpact = scenarios.some((s) => IMPACT.includes(s));
  const hasAirborne = scenarios.some((s) => AIRBORNE.includes(s));
  if (hasImpact && hasAirborne) return 'mixed';
  if (hasImpact) return 'impact';
  if (hasAirborne) return 'airborne';
  return 'mixed';
}
