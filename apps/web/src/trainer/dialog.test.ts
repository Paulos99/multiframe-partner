/** Ролевой разговор: каждая реплика клиента показывается один раз, подпись у всех одна. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makePick, scenarioSlots, slotChoice, slotClientLine } from './choice';
import { buildTranscript, clientSays, clientSpeech, reactionAfterPicks } from './dialog';
import { testContent } from './testContent';
import type { Pick, Scenario } from './types';

test('подпись говорящего и кавычки убираются, повтор «Клиент: Имя: …» тоже', () => {
  assert.equal(clientSpeech('Клиент: Наталья: «То есть шагов не будет слышно?»', 'Наталья'), 'То есть шагов не будет слышно?');
  assert.equal(clientSpeech('Наталья: «Что дальше?»', 'Наталья'), 'Что дальше?');
  assert.equal(clientSpeech('Клиент: Что дальше?', 'Наталья'), 'Что дальше?');
  assert.equal(clientSpeech('Что дальше?', 'Наталья'), 'Что дальше?');
  assert.equal(clientSays('Клиент: Наталья: «Что дальше?»', 'Наталья'), 'Наталья: Что дальше?');
  // кавычки внутри реплики не трогаем
  assert.equal(clientSpeech('Мне сказали «так можно», и всё', 'Анна'), 'Мне сказали «так можно», и всё');
});

/** Проходит разговор целиком: на каждой реплике верный ответ (с первой попытки или после ошибки). */
function play(s: Scenario, wrongFirst: boolean): Pick[] {
  const picks: Pick[] = [];
  for (const slot of scenarioSlots(s)) {
    const choice = slotChoice(s, slot);
    const right = choice.options.find((o) => o.correct)!;
    const wrong = choice.options.find((o) => !o.correct)!;
    const tries = wrongFirst ? [{ optionId: wrong.id, ms: 1 }, { optionId: right.id, ms: 1 }] : [{ optionId: right.id, ms: 1 }];
    picks.push(makePick({ stepId: slot.stepId, objectionId: slot.objectionId, beat: slot.beat, clientLine: slotClientLine(s, slot), tries, choice }));
  }
  return picks;
}

for (const wrongFirst of [false, true]) {
  test(`лента разговора без повторов и подмены реплик (${wrongFirst ? 'с ошибкой на каждой реплике' : 'без ошибок'})`, () => {
    for (const s of testContent().scenarios.scenarios) {
      const slots = scenarioSlots(s);
      const all = play(s, wrongFirst);
      for (let n = 1; n <= all.length; n += 1) {
        const picks = all.slice(0, n);
        const last = reactionAfterPicks(s, slots, picks);
        // пока реакция на последний ответ показана отдельным блоком, в ленте её нет — иначе она была бы дважды
        const feed = buildTranscript(s, picks, last !== null);
        const lines = feed.flatMap((e) => [e.client, e.reaction]).filter((x): x is string => Boolean(x));
        assert.equal(new Set(lines).size, lines.length, `${s.id}: повтор реплики клиента после ${n} ответов:\n${lines.join('\n')}`);
        for (const line of lines) {
          assert.ok(line.startsWith(`${s.persona.name}: `), `${s.id}: подпись «${line.slice(0, 40)}»`);
          assert.ok(!/^[^:]+: (Клиент|[А-ЯЁ][а-яё]+): /.test(line), `${s.id}: двойная подпись «${line.slice(0, 50)}»`);
        }
        // реплика, на которую отвечали, в ленте та же, что была показана перед выбором
        const slot = slots[n - 1];
        assert.equal(feed[n - 1].client, clientSays(slotClientLine(s, slot), s.persona.name), `${s.id}: реплика подменена`);
      }
    }
  });
}

test('реакции хранятся в ленте: после перехода к следующей реплике предыдущая реакция остаётся выше неё', () => {
  const s = testContent().scenarios.scenarios.find((x) => x.steps.length >= 2)!;
  const slots = scenarioSlots(s);
  const picks = play(s, false).slice(0, 3); // шаг 1 (2 реплики) и первая реплика шага 2
  const feed = buildTranscript(s, picks, false);
  const expected = reactionAfterPicks(s, slots, picks.slice(0, 2));
  assert.ok(expected);
  assert.equal(feed[1].reaction, clientSays(expected, s.persona.name));
  assert.equal(feed[2].reaction, null);
});

test('в тексте сценариев нет «Клиент:» перед именем и повторов реплик', () => {
  for (const s of testContent().scenarios.scenarios) {
    const lines = [...s.steps.flatMap((st) => [...st.clientLines]), s.closing.clientLine];
    const spoken = lines.map((l) => clientSpeech(l, s.persona.name));
    assert.equal(new Set(spoken).size, spoken.length, `${s.id}: реплики клиента повторяются`);
    for (const st of s.steps) {
      for (const reaction of [st.afterPass, st.afterFail]) {
        assert.ok(!spoken.includes(clientSpeech(reaction, s.persona.name)), `${s.id}/${st.id}: реакция совпадает с репликой`);
      }
    }
    for (const l of [...lines, s.closing.afterCorrect, s.closing.afterWrong]) assert.ok(!/^\s*Клиент\s*:/i.test(l), `${s.id}: «${l}»`);
  }
});
