import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Option = { id: string; text: string; correct: boolean };
type Choice = { options: Option[] };
type Objection = {
  id: string;
  roles: string[];
  panel: { title: string };
  refusalReasonKey: string;
  referenceAnswer: string;
  sourceQuotes: { id: string; sourceType?: string }[];
  choices: { beat1: Choice; beat2: Choice };
};
type Scenario = {
  id: string;
  title: string;
  roles: string[];
  steps: { id: string; objectionId: string; coachHint: string; choices: { beat1: Choice; beat2: Choice } }[];
  closing: { choices: Choice };
};

const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../src/trainer/content/${name}.json`, import.meta.url), 'utf-8')) as T;
export const objectionsFile = read<{ objections: Objection[]; refusalReasons: { key: string; title: string }[] }>('objections');
export const scenarios = read<{ scenarios: Scenario[] }>('scenarios').scenarios;
export const questions = read<{ questions: { id: string; question: string; options: { id: string; text: string }[]; correctOptionIds: string[]; roles: string[]; type: string }[] }>('quiz').questions;

const allOptions: Option[] = [
  ...objectionsFile.objections.flatMap((o) => [...o.choices.beat1.options, ...o.choices.beat2.options]),
  ...scenarios.flatMap((s) => [...s.steps.flatMap((st) => [...st.choices.beat1.options, ...st.choices.beat2.options]), ...s.closing.choices.options]),
];

export type ShownOption = { button: Locator; correct: boolean };

/** Варианты на экране с пометкой «верный», по тексту из содержимого. */
export async function shownOptions(page: Page): Promise<ShownOption[]> {
  const buttons = page.locator('[data-option]');
  await expect(buttons.first()).toBeVisible();
  const count = await buttons.count();
  expect(count, 'вариантов на экране').toBe(4);
  const out: ShownOption[] = [];
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    const text = (await button.innerText()).replace(/\s+/g, ' ');
    const found = allOptions
      .filter((o) => text.includes(o.text.replace(/\s+/g, ' ')))
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (!found) throw new Error(`Нет такого варианта в содержимом: ${text.slice(0, 60)}`);
    out.push({ button, correct: found.correct });
  }
  expect(out.filter((x) => x.correct), 'верных вариантов').toHaveLength(1);
  return out;
}

/** Выбирает ответ в одной реплике: по желанию сначала ошибается. Не нажимает «Дальше». */
export async function pickChoice(page: Page, wrongFirst = false) {
  const options = await shownOptions(page);
  if (wrongFirst) {
    const wrong = options.find((o) => !o.correct)!;
    await wrong.button.click();
    await expect(wrong.button).toBeDisabled();
    await expect(wrong.button).toHaveAttribute('data-state', 'wrong');
    await expect(page.getByText(/^Почему неверно:/).first()).toBeVisible();
  }
  const right = options.find((o) => o.correct)!;
  await right.button.click();
  await expect(right.button).toHaveAttribute('data-state', 'right');
  await expect(page.getByText('Почему это верно', { exact: true })).toBeVisible();
}

/** Одно возражение в быстрой отработке: две реплики. Заканчивает на разборе. */
export async function playDrillCard(page: Page, wrongFirst = false) {
  await expect(page.getByText('Реплика клиента').or(page.locator('blockquote').first()).first()).toBeVisible();
  await pickChoice(page, wrongFirst);
  await page.getByRole('button', { name: 'Дальше: клиент повторяет', exact: true }).click();
  await expect(page.getByText('Клиент не согласен и повторяет')).toBeVisible();
  await pickChoice(page, false);
  await page.getByRole('button', { name: 'К разбору', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Разбор ответа' })).toBeVisible();
}

/** Весь сценарий до экрана итога. Первый выбор в каждой реплике верный; в слотах из `slip` ошибаются первым выбором. */
export async function playScenario(page: Page, opts: { slip?: number[]; stopAfter?: number } = {}) {
  let slot = 0;
  const nextBtn = page.getByRole('button', { name: /^(Дальше|Закончить разговор|К итогу разговора)/ });
  for (;;) {
    const options = page.locator('[data-option]');
    await expect(options.first().or(nextBtn.first())).toBeVisible();
    if (await options.first().isVisible()) {
      await pickChoice(page, opts.slip?.includes(slot) ?? false);
      slot += 1;
    }
    const label = (await nextBtn.first().innerText()).trim();
    await nextBtn.first().click();
    if (label.startsWith('К итогу')) return;
    if (opts.stopAfter !== undefined && slot >= opts.stopAfter && !label.startsWith('Закончить')) return;
  }
}
