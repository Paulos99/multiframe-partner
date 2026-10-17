/* Background Sync for the partner outbox. Classic script imported by the generated SW. */
const DB_NAME = 'mf-partner-offline';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('objects')) db.createObjectStore('objects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('calculations')) db.createObjectStore('calculations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('analytics')) db.createObjectStore('analytics', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
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
  const items = (await getAll(db, 'outbox')).filter((op) => op.userId === session.userId);
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
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
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
