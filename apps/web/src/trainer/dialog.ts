/**
 * Реплики клиента в ролевом разговоре: одна подпись у всех строк и одна строка на реплику.
 * В данных реплика может быть «Клиент: …», «Наталья: «…»» или просто текстом; на экране — всегда «Имя: текст».
 */
import { scenarioSlots, slotChoice, slotClientLine, type Slot } from './choice';
import type { Pick, Scenario } from './types';

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Текст реплики без подписи говорящего (в том числе повторной «Клиент: Наталья: …») и без внешних кавычек. */
export function clientSpeech(raw: string, name: string): string {
  const prefix = new RegExp(`^\\s*(?:Клиент(?:ка)?|${escapeRx(name)})\\s*:\\s*`, 'i');
  let text = raw.trim();
  for (let i = 0; i < 4 && prefix.test(text); i += 1) text = text.replace(prefix, '').trim();
  const quoted = /^«([^«»]*)»[.!]?$/.exec(text);
  if (quoted) text = quoted[1].trim();
  return text;
}

/** Реплика клиента для показа: «Имя: текст». */
export function clientSays(raw: string, name: string): string {
  return `${name}: ${clientSpeech(raw, name)}`;
}

/** Реакция клиента после выбора: ответ на шаг (после второй реплики) или на заключительную реплику. */
export function reactionAfterPicks(s: Scenario, slots: Slot[], picks: Pick[]): string | null {
  const last = slots[picks.length - 1];
  if (!last) return null;
  if (last.beat === 'closing') return s.closing.afterCorrect;
  if (last.beat === 2) {
    const step = s.steps.find((x) => x.id === last.stepId);
    if (!step) return null;
    const both = picks.filter((p) => p.stepId === step.id).every((p) => p.firstTry);
    return both ? step.afterPass : step.afterFail;
  }
  return null;
}

export type TranscriptEntry = {
  /** Реплика клиента, на которую отвечали (с подписью). */
  client: string;
  /** Выбранный ответ. */
  mine: string;
  /** Реакция клиента после ответа (с подписью), если она была. */
  reaction: string | null;
};

/**
 * Разговор до текущей реплики. Реакции клиента остаются в ленте, поэтому новая реплика
 * появляется ниже них, а не вместо них. `pendingReaction` — реакция на последний ответ, пока она показана отдельным блоком.
 */
export function buildTranscript(s: Scenario, picks: Pick[], pendingReaction: boolean): TranscriptEntry[] {
  const slots = scenarioSlots(s);
  return picks.map((p, i) => {
    const slot = slots[i];
    const mine = slotChoice(s, slot).options.find((o) => o.id === p.optionId)?.text ?? '';
    const isLast = i === picks.length - 1;
    const reaction = isLast && pendingReaction ? null : reactionAfterPicks(s, slots, picks.slice(0, i + 1));
    return {
      client: clientSays(p.clientLine || slotClientLine(s, slot), s.persona.name),
      mine,
      reaction: reaction ? clientSays(reaction, s.persona.name) : null,
    };
  });
}
