import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_ACCOUNTS } from './demoSeed.ts';
import { demoGroups, demoRoleHint, demoRoleLabel } from './DemoSwitcher.tsx';
import { HelpTrainingPanel } from './HelpTrainingPanel.tsx';
import { folderCountLabel, materialNote } from './MaterialsPanel.tsx';
import { MaterialStubView, PREPARING_LABEL } from './MaterialStubView.tsx';
import { ObjectHistory, recordsLabel } from './ObjectHistory.tsx';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const groups = demoGroups();
equal(groups.map((group) => group.title), ['StP', 'Потолки Столицы', 'Северный Потолок']);
equal(groups.map((group) => group.place), ['Сеть', 'Москва', 'Санкт-Петербург']);
equal(groups[0]?.accounts.map((account) => account.login), ['admin']);
equal(groups[1]?.accounts.map((account) => account.login), ['partner1', 'sales1', 'exec1', 'crew1', 'crew1b']);
equal(groups[2]?.accounts.map((account) => account.login), ['partner2', 'sales2', 'exec2', 'crew2']);
equal(
  groups.flatMap((group) => group.accounts).map((account) => account.login).sort(),
  DEMO_ACCOUNTS.map((account) => account.login).sort(),
);

for (const account of DEMO_ACCOUNTS) {
  const label = `${demoRoleLabel(account)} ${demoRoleHint(account)}`;
  if (label.includes(account.password)) throw new Error('Подпись роли содержит пароль');
}
equal(demoRoleLabel(DEMO_ACCOUNTS[1]!), 'Владелец');
equal(demoRoleHint(DEMO_ACCOUNTS[5]!), 'Вторая бригада');
equal(demoRoleHint(DEMO_ACCOUNTS[4]!), 'Задания на монтаж');

equal(folderCountLabel(0), 'Пока пусто');
equal(folderCountLabel(1), '1 материал');
equal(folderCountLabel(2), '2 материала');
equal(folderCountLabel(5), '5 материалов');
equal(folderCountLabel(11), '11 материалов');
equal(folderCountLabel(21), '21 материал');
equal(materialNote({ kind: 'folder', hasFile: false, stub: null, size: null }), '');
equal(materialNote({ kind: 'file', hasFile: false, stub: 'deck-product', size: null }), PREPARING_LABEL);
equal(materialNote({ kind: 'file', hasFile: true, stub: 'deck-product', size: 2048 }), '2 КБ');
equal(materialNote({ kind: 'file', hasFile: false, stub: null, size: null }), 'Файл пока недоступен');
equal(recordsLabel(1), '1 запись');
equal(recordsLabel(3), '3 записи');
equal(recordsLabel(5), '5 записей');

const stub = renderToStaticMarkup(<MaterialStubView stub="deck-client" />);
if (!stub.includes(PREPARING_LABEL)) throw new Error('В заглушке нет статуса публикации');
if (!stub.includes('Дальше')) throw new Error('Листание презентации пропало');
if (stub.includes('Демонстрационный')) throw new Error('В заглушке осталась служебная пометка');

const video = renderToStaticMarkup(<MaterialStubView stub="video-install" />);
if (!video.includes('Смотреть')) throw new Error('Видео-заглушка не открывается');

const history = renderToStaticMarkup(
  <ObjectHistory
    entries={[
      { at: '2026-10-18T09:00:00Z', userId: 'u1', login: 'sales', action: 'status', detail: 'measured→quote_sent' },
      { at: '2026-10-17T09:00:00Z', userId: null, login: 'system', action: 'create' },
      { at: 'not-a-date', userId: null, login: '', action: 'update' },
    ]}
    people={[{ id: 'u1', displayName: 'Марина' }]}
  />,
);
if (!history.includes('Дата не указана')) throw new Error('Пустая дата не подписана');
if (history.includes('Показать всю историю')) throw new Error('Короткая история не должна сворачиваться');

const folded = renderToStaticMarkup(
  <ObjectHistory
    entries={[
      { at: '2026-10-18T09:00:00Z', userId: 'u1', login: 'sales', action: 'status', detail: 'measured→quote_sent' },
      { at: '2026-10-17T09:00:00Z', userId: null, login: 'system', action: 'create' },
      { at: '2026-10-16T09:00:00Z', userId: 'u1', login: 'sales', action: 'calc_pdf' },
      { at: '2026-10-15T09:00:00Z', userId: 'u1', login: 'sales', action: 'update' },
    ]}
    people={[{ id: 'u1', displayName: 'Марина' }]}
  />,
);
if (!folded.includes('Показать всю историю (4)')) throw new Error('Свёртка истории пропала');
if (renderToStaticMarkup(<ObjectHistory entries={[]} people={[]} />) !== '') {
  throw new Error('Пустая история не должна рисоваться');
}

const training = renderToStaticMarkup(<HelpTrainingPanel role="owner" />);
if (!training.includes('Обучение') || !training.includes('Загружаем материалы')) {
  throw new Error('Раздел обучения без загрузки материалов');
}
if (!training.includes('Материалы') || !training.includes('Кабинет')) {
  throw new Error('Вкладки обучения не подписаны');
}

console.log('Present surfaces: checks passed');
