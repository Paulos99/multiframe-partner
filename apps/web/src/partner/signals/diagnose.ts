/**
 * Диагностические сигналы по агрегатам воронки сделок и событиям инструментов.
 * Чистые функции, без персональных данных клиентов: на входе только счётчики.
 */
import {
  INSUFFICIENT_OBSERVATIONS_LABEL,
  countsTowardSalesKpi,
  type DealFunnelCounts,
  type PlatformEvent,
} from '../../../../../packages/shared/events';

export type SignalConfidence = 'low' | 'medium' | 'high';

export type SignalKind =
  | 'offer_to_calc'
  | 'calc_to_quote'
  | 'quote_to_sent'
  | 'sent_to_decision'
  | 'high_decline'
  | 'calculator_dropoff'
  | 'calculator_errors'
  | 'problemomer_dropoff';

export type DiagnosticSignal = {
  id: string;
  kind: SignalKind;
  label: string;
  hypothesis: string;
  confidence: SignalConfidence;
  sampleSize: number;
  /** Доля 0..1, если сигнал основан на конверсии. */
  rate?: number | null;
};

export type ToolEventCounts = {
  problemomerStarted?: number;
  problemomerCompleted?: number;
  problemomerAbandoned?: number;
  calculatorStarted?: number;
  calculatorCompleted?: number;
  calculatorFailed?: number;
};

export type DiagnoseInput = {
  /** null/undefined — данных по сделкам нет, проверки воронки пропускаются. */
  funnel?: DealFunnelCounts | null;
  tools?: ToolEventCounts | null;
};

export const MIN_RELIABLE_SAMPLE = 5;

const LOW_CONVERSION = 0.5;
const HIGH_DECLINE = 0.5;
const HIGH_ERROR_RATE = 0.2;

function num(v: number | undefined | null): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

export function confidenceForSample(sampleSize: number): SignalConfidence {
  if (sampleSize >= 30) return 'high';
  if (sampleSize >= 15) return 'medium';
  return 'low';
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function insufficient(
  id: string,
  kind: SignalKind,
  title: string,
  sampleSize: number,
): DiagnosticSignal {
  return {
    id,
    kind,
    label: `${title}: ${INSUFFICIENT_OBSERVATIONS_LABEL}`,
    hypothesis: `Наблюдений меньше ${MIN_RELIABLE_SAMPLE}, вывод о причине пока не делаем.`,
    confidence: 'low',
    sampleSize,
    rate: null,
  };
}

type StepCheck = {
  id: string;
  kind: SignalKind;
  title: string;
  base: number;
  hit: number;
  /** true — сигнал, когда доля hit/base НИЖЕ порога; false — когда ВЫШЕ. */
  lowIsBad: boolean;
  threshold: number;
  label: (rate: number) => string;
  hypothesis: string;
};

function runCheck(c: StepCheck): DiagnosticSignal | null {
  if (c.base < MIN_RELIABLE_SAMPLE) return insufficient(c.id, c.kind, c.title, c.base);
  const rate = Math.min(1, c.hit / c.base);
  const bad = c.lowIsBad ? rate < c.threshold : rate > c.threshold;
  if (!bad) return null;
  return {
    id: c.id,
    kind: c.kind,
    label: c.label(rate),
    hypothesis: c.hypothesis,
    confidence: confidenceForSample(c.base),
    sampleSize: c.base,
    rate,
  };
}

export function diagnose(input: DiagnoseInput): DiagnosticSignal[] {
  const out: DiagnosticSignal[] = [];
  const push = (s: DiagnosticSignal | null) => {
    if (s) out.push(s);
  };
  const f = input.funnel;
  const t = input.tools;

  if (f) {
    push(
      runCheck({
        id: 'sig_offer_to_calc',
        kind: 'offer_to_calc',
        title: 'Предложение → расчёт',
        base: num(f.offered),
        hit: num(f.calculated),
        lowIsBad: true,
        threshold: LOW_CONVERSION,
        label: (r) => `Мало предложений доходит до расчёта (${pct(r)})`,
        hypothesis:
          'Менеджеры предлагают MultiFrame, но не доводят до расчёта: возможно, не хватает данных замера или уверенности в продукте.',
      }),
    );
    push(
      runCheck({
        id: 'sig_calc_to_quote',
        kind: 'calc_to_quote',
        title: 'Расчёт → КП',
        base: num(f.calculated),
        hit: num(f.quoteCreated),
        lowIsBad: true,
        threshold: LOW_CONVERSION,
        label: (r) => `Расчёты редко превращаются в КП (${pct(r)})`,
        hypothesis:
          'Расчёт выполняют, но КП не оформляют: возможно, неясен следующий шаг или цена не согласована.',
      }),
    );
    push(
      runCheck({
        id: 'sig_quote_to_sent',
        kind: 'quote_to_sent',
        title: 'КП → отправка клиенту',
        base: num(f.quoteCreated),
        hit: num(f.quoteSentConfirmed),
        lowIsBad: true,
        threshold: LOW_CONVERSION,
        label: (r) => `КП часто не отправляют клиенту (${pct(r)})`,
        hypothesis:
          'КП остаются «в черновиках»: возможно, нет привычки подтверждать отправку или нет повода связаться с клиентом.',
      }),
    );
    const decided = num(f.accepted) + num(f.declined) + num(f.postponed);
    push(
      runCheck({
        id: 'sig_sent_to_decision',
        kind: 'sent_to_decision',
        title: 'Отправка КП → решение',
        base: num(f.quoteSentConfirmed),
        hit: decided,
        lowIsBad: true,
        threshold: LOW_CONVERSION,
        label: (r) => `По отправленным КП редко фиксируют решение (${pct(r)})`,
        hypothesis:
          'Результат сделки не фиксируется или клиенты не отвечают: возможно, нет follow-up после отправки КП.',
      }),
    );
    push(
      runCheck({
        id: 'sig_high_decline',
        kind: 'high_decline',
        title: 'Доля отказов',
        base: decided,
        hit: num(f.declined),
        lowIsBad: false,
        threshold: HIGH_DECLINE,
        label: (r) => `Высокая доля отказов среди решений (${pct(r)})`,
        hypothesis:
          'Клиенты чаще отказываются, чем соглашаются: проверьте причины отказа и работу с возражениями.',
      }),
    );
  }

  if (t) {
    if (t.calculatorStarted != null) {
      push(
        runCheck({
          id: 'sig_calculator_dropoff',
          kind: 'calculator_dropoff',
          title: 'Калькулятор: завершение расчёта',
          base: num(t.calculatorStarted),
          hit: num(t.calculatorCompleted),
          lowIsBad: true,
          threshold: LOW_CONVERSION,
          label: (r) => `Расчёт в калькуляторе часто не завершают (${pct(r)})`,
          hypothesis:
            'Пользователи открывают калькулятор, но не доходят до результата: возможно, интерфейс или ввод данных вызывает затруднения.',
        }),
      );
    }
    if (t.calculatorFailed != null && t.calculatorStarted != null) {
      push(
        runCheck({
          id: 'sig_calculator_errors',
          kind: 'calculator_errors',
          title: 'Калькулятор: ошибки',
          base: num(t.calculatorStarted),
          hit: num(t.calculatorFailed),
          lowIsBad: false,
          threshold: HIGH_ERROR_RATE,
          label: (r) => `Много ошибок расчёта (${pct(r)} запусков)`,
          hypothesis:
            'Расчёт часто завершается ошибкой: возможна техническая проблема или типовая ошибка ввода данных.',
        }),
      );
    }
    if (t.problemomerStarted != null) {
      const base = num(t.problemomerStarted);
      const done = t.problemomerAbandoned != null
        ? Math.max(0, base - num(t.problemomerAbandoned))
        : num(t.problemomerCompleted);
      push(
        runCheck({
          id: 'sig_problemomer_dropoff',
          kind: 'problemomer_dropoff',
          title: 'Проблемомер: завершение',
          base,
          hit: done,
          lowIsBad: true,
          threshold: LOW_CONVERSION,
          label: (r) => `Проблемомер часто бросают на полпути (${pct(r)} доходят до результата)`,
          hypothesis:
            'Консультация с проблемомером прерывается: возможно, шаги слишком длинные или результат не вызывает интереса.',
        }),
      );
    }
  }

  return out;
}

/** Только боевые события; обучение и демо не учитываются. */
export function toolCountsFromEvents(
  events: readonly PlatformEvent[] | null | undefined,
): ToolEventCounts {
  const counts: Required<ToolEventCounts> = {
    problemomerStarted: 0,
    problemomerCompleted: 0,
    problemomerAbandoned: 0,
    calculatorStarted: 0,
    calculatorCompleted: 0,
    calculatorFailed: 0,
  };
  for (const e of Array.isArray(events) ? events : []) {
    if (!countsTowardSalesKpi(e)) continue;
    switch (e.name) {
      case 'problemomer_started':
        counts.problemomerStarted += 1;
        break;
      case 'problemomer_completed':
        counts.problemomerCompleted += 1;
        break;
      case 'problemomer_abandoned':
        counts.problemomerAbandoned += 1;
        break;
      case 'calculator_started':
        counts.calculatorStarted += 1;
        break;
      case 'calculator_completed':
        counts.calculatorCompleted += 1;
        break;
      case 'calculator_failed':
        counts.calculatorFailed += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}

type AnalyticsFunnelLike = {
  problemomer: { open: number; result: number };
  calculator: { open: number; calcDone: number };
};

type AnalyticsEventLike = {
  id?: string;
  tool?: string;
  action?: string;
  sessionId?: string | null;
  context?: string | null;
};

/**
 * Best-effort: исторические события аналитики не знают о dealId и ошибках,
 * поэтому берём только открытия и завершения инструментов. Учебный контекст исключён.
 */
export function toolCountsFromAnalytics(
  funnel: AnalyticsFunnelLike | null | undefined,
  events?: readonly AnalyticsEventLike[] | null,
): ToolEventCounts {
  let pmOpen = num(funnel?.problemomer.open);
  let pmDone = num(funnel?.problemomer.result);
  let calcOpen = num(funnel?.calculator.open);
  let calcDone = num(funnel?.calculator.calcDone);

  if (!pmOpen && !pmDone && !calcOpen && !calcDone && events?.length) {
    const seen = new Set<string>();
    for (const e of events) {
      if (e.context === 'training') continue;
      const key = `${e.tool}:${e.action}:${e.sessionId || e.id || ''}`;
      if (e.sessionId || e.id) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      if (e.tool === 'problemomer' && e.action === 'open') pmOpen += 1;
      if (e.tool === 'problemomer' && e.action === 'result') pmDone += 1;
      if (e.tool === 'calculator' && e.action === 'open') calcOpen += 1;
      if (e.tool === 'calculator' && e.action === 'calc_done') calcDone += 1;
    }
  }

  return {
    problemomerStarted: pmOpen,
    problemomerCompleted: pmDone,
    calculatorStarted: calcOpen,
    calculatorCompleted: calcDone,
  };
}

export type DealLike = { stage: string; outcome?: string | null };

const STAGE_RANK: Record<string, number> = {
  contact: 0,
  offered: 1,
  assessed: 2,
  calculated: 3,
  quote_created: 4,
  quote_shared: 5,
  quote_sent_confirmed: 6,
  quote_accepted: 7,
  quote_declined: 7,
  quote_postponed: 7,
  install: 8,
  closed: 8,
};

export function dealStageRank(stage: string): number {
  return STAGE_RANK[stage] ?? 0;
}

/** Воронка по текущему этапу сделок: сделка на этапе N считается дошедшей до всех предыдущих. */
export function dealsToFunnel(deals: readonly DealLike[] | null | undefined): DealFunnelCounts {
  const counts: DealFunnelCounts = {
    offered: 0,
    calculated: 0,
    quoteCreated: 0,
    quoteSentConfirmed: 0,
    accepted: 0,
    declined: 0,
    postponed: 0,
  };
  for (const d of Array.isArray(deals) ? deals : []) {
    const rank = dealStageRank(d.stage);
    if (rank >= 1) counts.offered += 1;
    if (rank >= 3) counts.calculated += 1;
    if (rank >= 4) counts.quoteCreated += 1;
    if (rank >= 6) counts.quoteSentConfirmed += 1;
    if (d.stage === 'quote_accepted' || d.stage === 'install' || d.outcome === 'accepted') counts.accepted += 1;
    else if (d.stage === 'quote_declined' || d.outcome === 'declined') counts.declined += 1;
    else if (d.stage === 'quote_postponed' || d.outcome === 'postponed') counts.postponed += 1;
  }
  return counts;
}
