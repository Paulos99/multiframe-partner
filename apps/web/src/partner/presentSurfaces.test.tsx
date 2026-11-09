import { renderToStaticMarkup } from 'react-dom/server';
import { HelpTrainingPanel } from './HelpTrainingPanel.tsx';
import { folderCountLabel, materialNote } from './MaterialsPanel.tsx';
import { MaterialStubView, PREPARING_LABEL } from './MaterialStubView.tsx';
import { ObjectHistory, recordsLabel } from './ObjectHistory.tsx';
import { TrainingVideos } from './RoleVideoCard.tsx';
import { ensureMaterialVideos, publicMaterialsFor, type MaterialNode } from '../../../../packages/shared/materialsLib.js';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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

// Обучающие видео: кто что видит, решает админ StP (роли видимости). Сначала каждый встроенный ролик виден своей роли,
// у менеджера StP видео нет, админ StP видит все четыре с отметкой ролей, кнопками «Кто видит» и «Удалить».
const VIDEO_ROLES = [['owner', 'Владелец компании'], ['sales', 'Менеджер по продажам'], ['measurer', 'Замерщик'], ['crew', 'Монтажник']] as const;
const seededVideos = (role: string) => {
  const platform = ensureMaterialVideos({ materials: [] as MaterialNode[] });
  return publicMaterialsFor(platform.materials, role).filter((item) => item.section === 'video');
};
const videosHtml = (role: string) =>
  renderToStaticMarkup(
    <TrainingVideos
      items={seededVideos(role)}
      canManage={role === 'admin'}
      busy={false}
      previewItem={(item) => ({ id: item.id, name: item.name, mime: item.mime, load: async () => ({ url: '', mime: 'video/mp4' }) })}
      onAdd={() => undefined}
      onRoles={() => undefined}
      onDelete={() => undefined}
    />,
  );
for (const [role, title] of VIDEO_ROLES) {
  const html = videosHtml(role);
  if (!html.includes('Обучающее видео') || !html.includes(`«${title}»`) || !html.includes(`/videos/role-${role}.jpg`)) {
    throw new Error(`В обучении роли ${role} нет своего видео`);
  }
  if ((html.match(/Смотреть:/g) || []).length !== 1) throw new Error(`Роль ${role} должна видеть только своё видео`);
  if (html.includes('<video')) throw new Error(`У роли ${role} видео не должно играть в карточке — только кнопка «Смотреть»`);
  if (/Удалить|Кто видит|Добавить видео/.test(html)) throw new Error(`У роли ${role} не должно быть управления видео`);
}
if (videosHtml('stp_manager') !== '') throw new Error('У менеджера StP не должно быть обучающего видео');
{
  const html = videosHtml('admin');
  if (html.includes('<video')) throw new Error('Админ StP: видео не должны быть встроены в карточку');
  if ((html.match(/Смотреть:/g) || []).length !== 4) throw new Error('Админ StP должен видеть все четыре видео');
  for (const [role, title] of VIDEO_ROLES) {
    if (!html.includes(`«${title}»`) || !html.includes(`/videos/role-${role}.jpg`)) throw new Error(`Админ StP не видит видео роли ${role}`);
  }
  if (html.includes('role-stp')) throw new Error('Видео менеджера StP убрано');
  if ((html.match(/Удалить видео:/g) || []).length !== 4) throw new Error('Админ StP должен уметь удалить каждое видео');
  if (!html.includes('Видят: Владелец') || !html.includes('Добавить видео')) throw new Error('Админ StP: нет отметки ролей или кнопки «Добавить видео»');
}

console.log('Present surfaces: checks passed');
