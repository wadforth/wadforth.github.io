/* =========================================================================
   Shared IndexedDB Local Storage Wrapper
   ========================================================================= */

export const SIGMA_IDB = { name: 'SigmaHQExplorer', version: 2 };
export const SIGMA_CACHE_TTL = 24 * 60 * 60 * 1000;
export let sigmaDB = null;

export function openSigmaDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(SIGMA_IDB.name, SIGMA_IDB.version);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Delete old stores if upgrading
            if (db.objectStoreNames.contains('rules')) db.deleteObjectStore('rules');
            if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta');
            db.createObjectStore('rules', { keyPath: 'id' });
            db.createObjectStore('meta', { keyPath: 'key' });
        };
        req.onsuccess = (e) => { sigmaDB = e.target.result; resolve(sigmaDB); };
        req.onerror = (e) => reject(e.target.error);
    });
}

export function idbGet(store, key) {
    if (!sigmaDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const tx = sigmaDB.transaction(store, 'readonly');
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result?.value ?? r.result ?? null);
        r.onerror = () => reject(r.error);
    });
}

export function idbPut(store, record) {
    if (!sigmaDB) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const tx = sigmaDB.transaction(store, 'readwrite');
        tx.objectStore(store).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export function idbGetAll(store) {
    if (!sigmaDB) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const tx = sigmaDB.transaction(store, 'readonly');
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
    });
}

export async function idbBatchPut(store, records) {
    if (!sigmaDB || records.length === 0) return;
    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await new Promise((resolve, reject) => {
            const tx = sigmaDB.transaction(store, 'readwrite');
            const s = tx.objectStore(store);
            batch.forEach(r => s.put(r));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}

export function idbSetMeta(key, value) {
    return idbPut('meta', { key, value });
}

export async function idbGetMeta(key) {
    const rec = await idbGet('meta', key);
    return rec?.value !== undefined ? rec.value : rec;
}


// Legacy Window Bindings
window.SIGMA_IDB = SIGMA_IDB;
window.SIGMA_CACHE_TTL = SIGMA_CACHE_TTL;
window.sigmaDB = sigmaDB;
window.openSigmaDB = openSigmaDB;
window.idbGet = idbGet;
window.idbPut = idbPut;
window.idbGetAll = idbGetAll;
window.idbBatchPut = idbBatchPut;
window.idbSetMeta = idbSetMeta;
window.idbGetMeta = idbGetMeta;
