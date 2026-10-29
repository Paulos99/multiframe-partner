import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHOTO_STAGES,
  canAddPhoto,
  canDeletePhoto,
  canSeePhotoStage,
  canShareReportWithClient,
  cleanPhotoCaption,
  photoCountsFor,
  photoStagesRoleAdds,
  photoStagesRoleSees,
} from '../../../../packages/shared/roomPhotos.js';

test('замерщик видит и добавляет только «До»', () => {
  assert.deepEqual(photoStagesRoleSees('measurer'), ['before']);
  assert.deepEqual(photoStagesRoleAdds('measurer'), ['before']);
  assert.equal(canAddPhoto('measurer', 'after'), false);
  assert.equal(canSeePhotoStage('measurer', 'progress'), false);
});

test('монтажник, владелец и менеджер работают со всеми этапами', () => {
  for (const role of ['crew', 'owner', 'sales']) {
    assert.deepEqual(photoStagesRoleAdds(role), PHOTO_STAGES);
    assert.deepEqual(photoStagesRoleSees(role), PHOTO_STAGES);
  }
});

test('админ только смотрит', () => {
  assert.deepEqual(photoStagesRoleSees('admin'), PHOTO_STAGES);
  assert.deepEqual(photoStagesRoleAdds('admin'), []);
  assert.equal(canAddPhoto('admin', 'before'), false);
});

test('удаление: свои фото; владелец, менеджер и админ — любые', () => {
  const photo = { createdBy: 'u1' };
  assert.equal(canDeletePhoto({ id: 'u1', role: 'crew' }, photo), true);
  assert.equal(canDeletePhoto({ id: 'u2', role: 'crew' }, photo), false);
  assert.equal(canDeletePhoto({ id: 'u2', role: 'measurer' }, photo), false);
  assert.equal(canDeletePhoto({ id: 'u3', role: 'owner' }, photo), true);
  assert.equal(canDeletePhoto({ id: 'u4', role: 'sales' }, photo), true);
  assert.equal(canDeletePhoto({ id: 'u5', role: 'admin' }, photo), true);
});

test('показ клиенту включают владелец и менеджер', () => {
  assert.equal(canShareReportWithClient('owner'), true);
  assert.equal(canShareReportWithClient('sales'), true);
  assert.equal(canShareReportWithClient('crew'), false);
  assert.equal(canShareReportWithClient('measurer'), false);
});

test('подпись: пробелы, переводы строк и длина', () => {
  assert.equal(cleanPhotoCaption('  потолок \n до  '), 'потолок до');
  assert.equal(cleanPhotoCaption('x'.repeat(300)).length, 120);
  assert.equal(cleanPhotoCaption(null), '');
});

test('счётчики по ролям', () => {
  const photos = [{ stage: 'before' }, { stage: 'before' }, { stage: 'after' }, { stage: 'progress' }];
  assert.deepEqual(photoCountsFor(photos, 'owner'), { before: 2, progress: 1, after: 1 });
  assert.deepEqual(photoCountsFor(photos, 'measurer'), { before: 2, progress: 0, after: 0 });
});
