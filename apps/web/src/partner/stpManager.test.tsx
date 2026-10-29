import { renderToStaticMarkup } from 'react-dom/server';
import { ROLE_LABELS, isStpManagerRole, normalizeRole } from '../../../../packages/shared/partner.ts';
import { STP_TOOL_CARDS, STP_TOOLS_PENDING_LABEL, StpToolsPanel } from './StpToolsPanel.tsx';
import { STP_TOOL_URLS, cleanStpToolUrl, stpToolUrl } from './stpToolLinks.ts';
import { trainerRoleOf } from '../trainer/engine.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Роль
equal(normalizeRole('stp_manager'), 'stp_manager');
equal(isStpManagerRole('stp_manager'), true);
equal(isStpManagerRole('admin'), false);
equal(ROLE_LABELS.stp_manager, 'Менеджер StP');
equal(trainerRoleOf('stp_manager'), 'stp_manager');

// Ссылки: только https, пусто по умолчанию, переменные сборки перекрывают константу
equal(cleanStpToolUrl(''), '');
equal(cleanStpToolUrl('   '), '');
equal(cleanStpToolUrl('javascript:alert(1)'), '');
equal(cleanStpToolUrl('http://example.com/a'), '');
equal(cleanStpToolUrl('example.com/a'), '');
equal(cleanStpToolUrl(undefined), '');
equal(cleanStpToolUrl(' https://example.com/a '), 'https://example.com/a');
// Боевые адреса по умолчанию
equal(STP_TOOL_URLS.problemomer, 'https://stp-multiframe.ru/problemomer/');
equal(STP_TOOL_URLS.calculator, 'https://stp-multiframe.ru/calc/');
equal(stpToolUrl('problemomer', {}), 'https://stp-multiframe.ru/problemomer/');
equal(stpToolUrl('calculator', {}), 'https://stp-multiframe.ru/calc/');
const empty = { problemomer: '', calculator: '' };
equal(stpToolUrl('problemomer', {}, empty), null);
equal(stpToolUrl('calculator', { VITE_STP_CALCULATOR_URL: 'https://calc.example.com/' }, empty), 'https://calc.example.com/');
equal(stpToolUrl('problemomer', { VITE_STP_CALCULATOR_URL: 'https://calc.example.com/' }, empty), null);
equal(
  stpToolUrl('problemomer', {}, { problemomer: 'https://noise.example.com/x', calculator: '' }),
  'https://noise.example.com/x',
);
equal(
  stpToolUrl('problemomer', { VITE_STP_PROBLEMOMER_URL: 'https://env.example.com/' }, { problemomer: 'https://noise.example.com/x', calculator: '' }),
  'https://env.example.com/',
);

// Карточки без ссылок: неактивны и подписаны
equal(STP_TOOL_CARDS.map((card) => card.title), ['Диагностика шума', 'Калькулятор']);
const pending = renderToStaticMarkup(<StpToolsPanel links={{ problemomer: null, calculator: null }} />);
if (!pending.includes(STP_TOOLS_PENDING_LABEL)) throw new Error('Нет подписи «Ссылка появится позже»');
if ((pending.match(/disabled=""/g) || []).length !== 2) throw new Error('Кнопки без ссылки должны быть неактивны');
if (pending.includes('<a ')) throw new Error('Без ссылки не должно быть переходов');

// Карточки со ссылками: открываются в новой вкладке, без передачи окна
const ready = renderToStaticMarkup(
  <StpToolsPanel links={{ problemomer: 'https://noise.example.com/x', calculator: 'https://calc.example.com/' }} />,
);
if (!ready.includes('href="https://noise.example.com/x"')) throw new Error('Нет ссылки на диагностику');
if (!ready.includes('href="https://calc.example.com/"')) throw new Error('Нет ссылки на калькулятор');
equal((ready.match(/target="_blank"/g) || []).length, 2);
equal((ready.match(/rel="noopener noreferrer"/g) || []).length, 2);
if (ready.includes(STP_TOOLS_PENDING_LABEL)) throw new Error('Подпись ожидания осталась при готовой ссылке');

// Язык и обещания
const text = renderToStaticMarkup(<StpToolsPanel />);
if (!text.includes('href="https://stp-multiframe.ru/problemomer/"') || !text.includes('href="https://stp-multiframe.ru/calc/"')) {
  throw new Error('Карточки по умолчанию должны вести на боевые адреса');
}
for (const banned of ['сильный дискомфорт', 'важно для вас', 'до 17 дБ', 'гарант']) {
  if (text.includes(banned)) throw new Error(`Запрещённая формулировка: ${banned}`);
}
console.log('stpManager.test ok');
