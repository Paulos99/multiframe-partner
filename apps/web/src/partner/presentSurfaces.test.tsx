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
equal(groups[0]?.accounts.map((account) => account.login), ['admin', 'stpmgr1']);
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
const demoByLogin = (login: string) => DEMO_ACCOUNTS.find((account) => account.login === login)!;
equal(demoRoleLabel(demoByLogin('partner1')), 'Владелец');
equal(demoRoleHint(demoByLogin('crew1b')), 'Вторая бригада');
equal(demoRoleHint(demoByLogin('crew1')), 'Задания на монтаж');
equal(demoRoleLabel(demoByLogin('stpmgr1')), 'Менеджер StP');
equal(demoRoleHint(demoByLogin('stpmgr1')), 'Обучение и инструменты');

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
// В обучении две вкладки: «Материалы» и «Тренажёр». Раздела «Кабинет» нет ни у одной роли.
for (const role of ['admin', 'owner', 'sales', 'measurer', 'crew'] as const) {
  const html = renderToStaticMarkup(<HelpTrainingPanel role={role} />);
  if (html.includes('Кабинет') || html.includes('Ваша работа') || html.includes('С чего начать')) {
    throw new Error(`В обучении роли ${role} остался раздел «Кабинет»`);
  }
  if (!html.includes('Обучение') || !html.includes('Загружаем материалы')) {
    throw new Error(`В обучении роли ${role} нет материалов`);
  }
  if (!html.includes('>Материалы<') || !html.includes('>Тренажёр<')) {
    throw new Error(`В обучении роли ${role} нет вкладок «Материалы» и «Тренажёр»`);
  }
}

console.log('Present surfaces: checks passed');
