import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('infra and API contain no literal or public-ID-derived deployment secrets', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const patterns = [
    /["']?(?:JWT_SECRET(?:_PREVIOUS)?|ANALYTICS_ADMIN_KEY)["']?\s*[:=]\s*["'][^"'\r\n]+["']/,
    /process\.env\.(?:JWT_SECRET|ANALYTICS_ADMIN_KEY)\s*\|\|\s*["'][^"']+["']/,
    /(?:jwt_secret|JWT_SECRET)\s*=.*(?:hashlib|FOLDER_ID|SA_ID)/,
  ];
  for (const dir of ['infra', 'apps/api']) {
    for (const entry of readdirSync(path.join(root, dir), { recursive: true })) {
      if (String(entry).split(/[\\/]/).includes('node_modules') || /(?:\.test\.|_test\.py$)/.test(entry)) continue;
      if (!/\.(?:py|js|mjs|json|md|ya?ml)$/.test(entry)) continue;
      const content = readFileSync(path.join(root, dir, entry), 'utf8');
      for (const pattern of patterns) assert.equal(pattern.test(content), false, `Secret regression in ${dir}/${entry}`);
    }
  }
});

test('web client sends no hardcoded analytics admin key', () => {
  const root = fileURLToPath(new URL('../../apps/web/src/', import.meta.url));
  for (const entry of readdirSync(root, { recursive: true })) {
    if (!/\.(?:ts|tsx|js|mjs)$/.test(entry)) continue;
    const content = readFileSync(path.join(root, entry), 'utf8');
    assert.equal(/X-Analytics-Key['"]\]?\s*[:=]\s*['"]/.test(content), false, `Hardcoded analytics key in apps/web/src/${entry}`);
  }
});
