import assert from 'node:assert/strict';
import test from 'node:test';
import { describeDevice } from './feedbackContext';

test('устройство по строке браузера', () => {
  assert.equal(
    describeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36'),
    'Телефон · Android · Chrome',
  );
  assert.equal(
    describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'),
    'Телефон · iOS · Safari',
  );
  assert.equal(
    describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36 Edg/124.0'),
    'Компьютер · Windows · Edge',
  );
  assert.equal(
    describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15', 5),
    'Планшет · iPadOS · Safari',
  );
  assert.equal(
    describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124.0 YaBrowser/24.4 Safari/537.36'),
    'Компьютер · Windows · Яндекс Браузер',
  );
  assert.equal(describeDevice(''), 'Компьютер · Другая система · браузер');
});
