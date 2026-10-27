/** Крупная строка карточки шума и мелкая строка с децибелами. */

export type NoiseKind = 'air' | 'impact';

export type NoiseKpiLines = {
  primary: string;
  secondary: string;
};

export function noiseKpiLines(
  kind: NoiseKind,
  before: number,
  after: number,
  pct: number,
): NoiseKpiLines {
  const from = Math.round(before);
  const to = Math.round(after);
  const delta = Math.abs(to - from);
  const index = kind === 'air' ? 'Rw' : 'Lnw';
  const quieter = Math.round(pct);
  return {
    primary: `на ${quieter}% тише`,
    secondary: `${from} → ${to} дБ · разница ${delta} дБ · ${index}`,
  };
}
