import { strict as assert } from 'node:assert';
import { isDocStale } from './docStale';

assert.equal(isDocStale({ areaM2: 8 }, { room: { areaM2: 8 } } as never), false);
assert.equal(isDocStale({ areaM2: 8 }, { room: { areaM2: 9.5 } } as never), true);
assert.equal(isDocStale({ areaM2: null } as never, { room: { areaM2: 9 } } as never), false);
assert.equal(isDocStale({ areaM2: 8 }, { room: null } as never), false);
