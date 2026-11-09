/* Background Sync for the partner outbox. Classic script imported by the generated SW. */
/*
 * Версия и хранилища — те же, что в src/partner/offlineDb.ts (DB_VERSION, DB_STORES).
 * Раньше здесь стояла версия 1 при базе версии 2: браузер отвечал VersionError, и фоновая выгрузка молча
 * не работала. Совпадение проверяет src/partner/swSync.test.ts.
 */
const DB_NAME = 'mf-partner-offline';
const DB_VERSION = 3;
const DB_STORES = [
  ['objects', 'id'],
  ['outbox', 'id'],
  ['calculations', 'id'],
  ['analytics', 'id'],
  ['meta', 'key'],
  ['projects', 'id'],
  ['projectOutbox', 'id'],
  ['queue', 'id'],
];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of DB_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function getAll(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function putRow(db, store, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteRow(db, store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushOutboxInSw() {
  const db = await openDb();
  const metaRows = await getAll(db, 'meta');
  const session = metaRows.find((row) => row.key === 'session')?.value;
  if (!session?.token || !session.apiBase || !session.userId) return;
  // Записи с конфликтом этапа ждут решения человека в приложении.
  const items = (await getAll(db, 'outbox'))
    .filter((op) => op.userId === session.userId && !op.conflict)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
  const base = String(session.apiBase).replace(/\/$/, '');
  for (const item of items) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    };
    let res;
    if (item.op === 'delete') {
      const q = encodeURIComponent(item.updatedAt || '');
      res = await fetch(`${base}/objects/${item.id}?updatedAt=${q}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ updatedAt: item.updatedAt }),
      });
    } else {
      const payload = { ...(item.payload || {}) };
      delete payload.documents;
      delete payload.photoCounts;
      delete payload.pendingSync;
      if (item.baseStatus && payload.status && payload.status !== item.baseStatus) payload.baseStatus = item.baseStatus;
      res = await fetch(`${base}/objects/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.status === 404) {
        res = await fetch(`${base}/objects`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      }
    }
    if (res.status === 401) {
      await putRow(db, 'meta', { key: 'session', value: { ...session, token: null } });
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.code === 'stage_conflict') {
      await putRow(db, 'outbox', {
        ...item,
        conflict: {
          serverStatus: (data.object && data.object.status) || '',
          message: data.message || '',
          at: new Date().toISOString(),
        },
      });
      continue;
    }
    if (!res.ok) return;
    if (item.op === 'delete' && data.conflict === 'server-newer' && data.object) {
      await putRow(db, 'objects', data.object);
    } else if (item.op === 'delete') {
      await deleteRow(db, 'objects', item.id);
    } else if (data.object) {
      await putRow(db, 'objects', data.object);
    }
    await deleteRow(db, 'outbox', item.id);
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'mf-outbox') return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      await flushOutboxInSw();
      for (const client of clients) client.postMessage({ type: 'mf-flush' });
    })(),
  );
});
