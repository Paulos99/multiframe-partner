import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const BANNED = /стен|проём|проем|двер|окон|окн[ао]/i;

test('«Как работает?»: в обучении кабинета нет шагов и текста про стены и проёмы', () => {
  const source = read('../../public/calculator/src/ui/app-onboarding.js');
  assert.doesNotMatch(source, BANNED);
  assert.doesNotMatch(source, /demoOpenings|demoSurfaces|sketchOpeningsBtn|deselectAllWallsBtn/);
  const ids = [...source.matchAll(/id: '([a-z-]+)',\n\s+async play/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['welcome', 'mode', 'draw-layout', 'results', 'buy', 'help']);
  assert.match(source, /const total = 6;/);
  assert.match(source, /бескаркасной/);
});

test('обучение в редакторе схемы: без проёмов и стен', () => {
  const source = read('../../public/calculator/src/editor/sketch-onboarding.js');
  const sketchPart = source.slice(0, source.indexOf('WALL_TUTORIAL_KEY'));
  assert.doesNotMatch(sketchPart, BANNED);
  assert.match(sketchPart, /id: 'contour'/);
  assert.match(sketchPart, /id: 'done'/);
});
