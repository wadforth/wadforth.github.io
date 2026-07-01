// IndexedDB configuration
export const LAYER_DB_NAME = 'attack-explorer-layer-db';
export const LAYER_DB_VERSION = 1;
export const STORE_SNAPSHOTS = 'layer_snapshots';
export const STORE_DELTAS = 'layer_deltas';

export let autoSaveTimer = null;
export let pendingSave = false;
export let lastSnapshotHash = null;
export let lastSavedLayer = null;
export let deltaBuffer = [];
export const DELTA_FLUSH_THRESHOLD = 5; // Consolidate after this many deltas
const CURRENT_LAYER_KEY = 'attack-explorer-current-layer';
const RECENT_LAYERS_KEY = 'attack-explorer-recent';
const MAX_RECENT_LAYERS = 6;
const LAYER_EXPORT_SCHEMA_VERSION = 2;

function buildLayerExportPayload(layer) {
    const payload = JSON.parse(JSON.stringify(layer));
    payload.domain = payload.domain || state.currentDomain;
    payload.versions = {
        ...(payload.versions || {}),
        attack: payload.versions?.attack || payload.attackVersion || state.currentVersion
    };
    payload.attackVersion = payload.attackVersion || payload.versions.attack;
    payload.companyName = state.companyName || payload.companyName || '';
    payload.companyLogo = state.companyLogo || payload.companyLogo || null;
    payload.author = state.author || payload.author || '';
    payload.autoColorRules = state.autoColorRules || payload.autoColorRules;
    payload.autoColorByQueries = state.autoColorByQueries || false;
    payload.exportMetadata = {
        schemaVersion: LAYER_EXPORT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        includes: ['technique annotations', 'query data', 'Sigma rule IDs', 'Sigma rule titles', 'Sigma rule URLs', 'linked metadata'],
        sigmaLinkedQueries: countSigmaLinkedQueries(payload)
    };
    return payload;
}

function countSigmaLinkedQueries(layer) {
    return (layer.techniques || []).reduce((count, technique) => {
        return count + (technique.queries || []).filter(query => query?.sigmaRuleId || query?.sigmaRuleTitle || query?.sigmaRuleUrl).length;
    }, 0);
}

function isQuotaExceededError(err) {
    return err && (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
    );
}

function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        if (!isQuotaExceededError(err)) {
            console.warn(`Unable to persist ${key}:`, err);
            return false;
        }
        recoverLocalStorageQuota();
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (retryErr) {
            console.warn(`Unable to persist ${key} after quota recovery:`, retryErr);
            return false;
        }
    }
}

function recoverLocalStorageQuota() {
    try {
        const recent = JSON.parse(localStorage.getItem(RECENT_LAYERS_KEY) || '[]')
            .slice(0, 3)
            .map(compactRecentLayer);
        localStorage.setItem(RECENT_LAYERS_KEY, JSON.stringify(recent));
    } catch {}
}

function compactLayerRef(layer) {
    return {
        id: layer.id,
        storage: 'indexeddb',
        name: layer.name,
        domain: 'enterprise-attack',
        attackVersion: layer.versions?.attack || layer.attackVersion || state.currentVersion,
        timestamp: Date.now()
    };
}

function compactRecentLayer(layer, preserveLegacyData = false) {
    const legacyData = layer.data || (layer.techniques ? layer : null);
    const compact = {
        id: layer.id || legacyData?.id || `${layer.name || legacyData?.name || 'layer'}${layer.domain || legacyData?.domain || ''}`,
        layerId: layer.layerId || layer.id || legacyData?.id,
        name: layer.name || legacyData?.name || 'Untitled Layer',
        domain: 'enterprise-attack',
        attackVersion: layer.attackVersion || layer.versions?.attack || legacyData?.versions?.attack || legacyData?.attackVersion,
        timestamp: layer.timestamp || Date.now()
    };
    if (preserveLegacyData && legacyData) compact.data = legacyData;
    return compact;
}

function normalizeRecentVersion(value) {
    return String(value || '').trim().replace(/^v/i, '').toLowerCase();
}

function getRecentLayerIdCandidates(layer) {
    return [...new Set([
        layer?.layerId,
        layer?.id,
        layer?.data?.id
    ].filter(Boolean))];
}

function layerMatchesRecentEntry(layerData, recentLayer) {
    if (!layerData?.techniques) return false;
    const candidates = getRecentLayerIdCandidates(recentLayer);
    if (layerData.id && candidates.includes(layerData.id)) return true;
    const sameName = !recentLayer.name || !layerData.name || layerData.name === recentLayer.name;
    const sameDomain = !recentLayer.domain || !layerData.domain || layerData.domain === recentLayer.domain;
    const layerVersion = layerData.versions?.attack || layerData.attackVersion;
    const sameVersion = !recentLayer.attackVersion || !layerVersion || normalizeRecentVersion(layerVersion) === normalizeRecentVersion(recentLayer.attackVersion);
    return sameName && sameDomain && sameVersion;
}

async function readLayerSnapshotDirect(layerId) {
    if (!layerId) return null;
    const snapshot = await getSnapshot(layerId);
    if (!snapshot?.data) return null;
    let layer = snapshot.data;
    const deltas = await getDeltas(layerId);
    for (const delta of deltas) {
        layer = applyDelta(layer, delta.ops);
    }
    return layer;
}

async function resolveRecentLayerData(recentLayer) {
    const embedded = recentLayer?.data || (recentLayer?.techniques ? recentLayer : null);
    if (layerMatchesRecentEntry(embedded, recentLayer)) return embedded;

    for (const layerId of getRecentLayerIdCandidates(recentLayer)) {
        const layerData = await readLayerSnapshotDirect(layerId);
        if (layerMatchesRecentEntry(layerData, recentLayer)) return layerData;
    }

    try {
        const currentLayer = JSON.parse(localStorage.getItem(CURRENT_LAYER_KEY) || 'null');
        if (layerMatchesRecentEntry(currentLayer, recentLayer)) return currentLayer;
    } catch {}

    return null;
}

function persistCurrentLayerReference(layer) {
    safeLocalStorageSet(CURRENT_LAYER_KEY, JSON.stringify(compactLayerRef(layer)));
}

// IndexedDB initialization
export function openLayerDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(LAYER_DB_NAME, LAYER_DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'layerId' });
            }
            if (!db.objectStoreNames.contains(STORE_DELTAS)) {
                const deltaStore = db.createObjectStore(STORE_DELTAS, { keyPath: 'id', autoIncrement: true });
                deltaStore.createIndex('layerId', 'layerId', { unique: false });
                deltaStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// Compute a simple hash for change detection
export function computeHash(obj) {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

// Generate JSON patch operations between two objects
export function computeDelta(oldObj, newObj, basePath = '') {
    const ops = [];
    
    if (oldObj === newObj) return ops;
    if (typeof oldObj !== typeof newObj) {
        ops.push({ op: 'replace', path: basePath, value: newObj });
        return ops;
    }
    if (typeof oldObj !== 'object' || oldObj === null || newObj === null) {
        if (oldObj !== newObj) {
            ops.push({ op: 'replace', path: basePath, value: newObj });
        }
        return ops;
    }
    
    const oldKeys = new Set(Object.keys(oldObj));
    const newKeys = new Set(Object.keys(newObj));
    
    // Removed keys
    for (const key of oldKeys) {
        if (!newKeys.has(key)) {
            ops.push({ op: 'remove', path: basePath ? `${basePath}.${key}` : key });
        }
    }
    
    // Added/modified keys
    for (const key of newKeys) {
        const fullPath = basePath ? `${basePath}.${key}` : key;
        if (!oldKeys.has(key)) {
            ops.push({ op: 'add', path: fullPath, value: newObj[key] });
        } else if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            if (Array.isArray(oldObj[key]) && Array.isArray(newObj[key])) {
                // For arrays, check if length changed or items differ
                if (oldObj[key].length !== newObj[key].length || 
                    oldObj[key].some((v, i) => JSON.stringify(v) !== JSON.stringify(newObj[key][i]))) {
                    ops.push({ op: 'replace', path: fullPath, value: newObj[key] });
                }
            } else if (typeof oldObj[key] === 'object' && oldObj[key] !== null && 
                       typeof newObj[key] === 'object' && newObj[key] !== null) {
                ops.push(...computeDelta(oldObj[key], newObj[key], fullPath));
            } else {
                ops.push({ op: 'replace', path: fullPath, value: newObj[key] });
            }
        }
    }
    
    return ops;
}

// Apply delta operations to an object
export function applyDelta(obj, ops) {
    const result = JSON.parse(JSON.stringify(obj));
    
    for (const op of ops) {
        const parts = op.path.split('.');
        let current = result;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) current[parts[i]] = {};
            current = current[parts[i]];
        }
        
        const lastKey = parts[parts.length - 1];
        if (op.op === 'remove') {
            delete current[lastKey];
        } else {
            current[lastKey] = JSON.parse(JSON.stringify(op.value));
        }
    }
    
    return result;
}

// Store a full snapshot in IndexedDB
export async function storeSnapshot(layer) {
    const db = await openLayerDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const snapshot = {
            layerId: layer.id,
            data: JSON.parse(JSON.stringify(layer)),
            timestamp: Date.now(),
            hash: computeHash(layer)
        };
        store.put(snapshot);
        tx.oncomplete = () => resolve(snapshot.hash);
        tx.onerror = () => reject(tx.error);
    });
}

// Store a delta in IndexedDB
export async function storeDelta(layerId, ops) {
    if (ops.length === 0) return;
    const db = await openLayerDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_DELTAS, 'readwrite');
        const store = tx.objectStore(STORE_DELTAS);
        store.add({
            layerId,
            ops,
            timestamp: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Get all deltas for a layer, sorted by timestamp
export async function getDeltas(layerId) {
    const db = await openLayerDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_DELTAS, 'readonly');
        const store = tx.objectStore(STORE_DELTAS);
        const index = store.index('layerId');
        const request = index.getAll(layerId);
        request.onsuccess = () => {
            const results = request.result || [];
            results.sort((a, b) => a.timestamp - b.timestamp);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
}

// Get the latest snapshot for a layer
export async function getSnapshot(layerId) {
    const db = await openLayerDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const request = store.get(layerId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

// Clear deltas for a layer
export async function clearDeltas(layerId) {
    const db = await openLayerDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_DELTAS, 'readwrite');
        const store = tx.objectStore(STORE_DELTAS);
        const index = store.index('layerId');
        const request = index.openCursor(IDBKeyRange.only(layerId));
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Consolidate: apply all deltas to snapshot, store new snapshot, clear deltas
export async function consolidateDeltas(layer) {
    const newHash = await storeSnapshot(layer);
    await clearDeltas(layer.id);
    lastSnapshotHash = newHash;
    lastSavedLayer = JSON.parse(JSON.stringify(layer));
    deltaBuffer = [];
}

// Save current layer with delta tracking
export async function saveCurrentLayer() {
    if (!state.currentLayer) return;
    state.currentLayer.companyName = state.companyName;
    state.currentLayer.companyLogo = state.companyLogo;
    state.currentLayer.author = state.author || '';
    state.currentLayer.autoColorRules = state.autoColorRules;
    
    // Also persist to localStorage for backward compatibility and quick access
    safeLocalStorageSet('attack-explorer-current-domain', state.currentDomain);
    safeLocalStorageSet('attack-explorer-current-version', state.currentVersion);
    safeLocalStorageSet('attack-explorer-expanded', JSON.stringify([...state.expandedTechniques]));
    
    try {
        const currentHash = computeHash(state.currentLayer);
        
        if (!lastSnapshotHash) {
            // First save - store full snapshot
            lastSnapshotHash = await storeSnapshot(state.currentLayer);
            lastSavedLayer = JSON.parse(JSON.stringify(state.currentLayer));
        } else if (currentHash !== lastSnapshotHash) {
            // Compute and store delta
            const baseline = lastSavedLayer || (await getSnapshot(state.currentLayer.id))?.data;
            if (baseline) {
                const ops = computeDelta(baseline, state.currentLayer);
                if (ops.length > 0) {
                    deltaBuffer.push(ops);
                    await storeDelta(state.currentLayer.id, ops);
                    lastSnapshotHash = currentHash;
                    lastSavedLayer = JSON.parse(JSON.stringify(state.currentLayer));
                    
                    // Consolidate if buffer is large
                    if (deltaBuffer.length >= DELTA_FLUSH_THRESHOLD) {
                        await consolidateDeltas(state.currentLayer);
                    }
                }
            } else {
                // Snapshot missing - create new one
                lastSnapshotHash = await storeSnapshot(state.currentLayer);
                lastSavedLayer = JSON.parse(JSON.stringify(state.currentLayer));
            }
        }
        
        // Keep localStorage compact; IndexedDB stores the full layer payload.
        persistCurrentLayerReference(state.currentLayer);
    } catch (err) {
        console.error('IndexedDB save failed, falling back to localStorage:', err);
        safeLocalStorageSet(CURRENT_LAYER_KEY, JSON.stringify(state.currentLayer));
    }
}

// Debounced auto-save: coalesces rapid saves into a single write after 800ms
export function autoSaveLayer() {
    if (!state.currentLayer) return;
    pendingSave = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        if (pendingSave) {
            saveCurrentLayer();
            pendingSave = false;
        }
    }, 800);
}

// Force immediate save (bypasses debounce) - use for explicit user actions
export function saveCurrentLayerNow() {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    pendingSave = false;
    return saveCurrentLayer();
}

// Load layer from IndexedDB with delta replay
export async function loadCurrentLayer() {
    // Try IndexedDB first
    const savedId = localStorage.getItem(CURRENT_LAYER_KEY);
    if (!savedId) {
        // Try to parse old format
        try {
            const oldFormat = JSON.parse(savedId);
            if (oldFormat && oldFormat.id) {
                return await loadLayerFromIndexedDB(oldFormat.id);
            }
        } catch {}
        return null;
    }
    
    try {
        const layerData = JSON.parse(savedId);
        if (layerData?.storage === 'indexeddb' && layerData.id) {
            return await loadLayerFromIndexedDB(layerData.id);
        }
        if (layerData && layerData.id) {
            return await loadLayerFromIndexedDB(layerData.id);
        }
    } catch {}
    
    // Fallback to old localStorage format
    return loadLayerFromLocalStorage();
}

export async function loadLayerFromIndexedDB(layerId) {
    try {
        const snapshot = await getSnapshot(layerId);
        if (!snapshot) {
            return loadLayerFromLocalStorage();
        }
        
        // Apply all deltas
        const deltas = await getDeltas(layerId);
        let layer = snapshot.data;
        
        for (const delta of deltas) {
            layer = applyDelta(layer, delta.ops);
        }
        
        // Restore state
        state.companyName = layer.companyName || '';
        state.companyLogo = layer.companyLogo || null;
        state.author = layer.author || '';
        state.autoColorRules = layer.autoColorRules || state.autoColorRules;
        state.autoColorByQueries = layer.autoColorByQueries || false;
        
        if (!layer.id) {
            layer.id = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        if (layer.techniques) {
            const currentMonth = new Date().toISOString().slice(0, 7);
            layer.techniques.forEach(ann => {
                if (!ann.monthAdded) ann.monthAdded = currentMonth;
            });
        }
        
        state.currentLayer = layer;
        lastSnapshotHash = computeHash(layer);
        lastSavedLayer = JSON.parse(JSON.stringify(layer));
        
        // Update compact localStorage reference
        persistCurrentLayerReference(layer);
        
        return layer;
    } catch (err) {
        console.error('IndexedDB load failed, falling back to localStorage:', err);
        return loadLayerFromLocalStorage();
    }
}

export function loadLayerFromLocalStorage() {
    const saved = localStorage.getItem(CURRENT_LAYER_KEY);
    if (!saved) return null;
    try {
        const layer = JSON.parse(saved);
        if (layer?.storage === 'indexeddb' && !layer.techniques) return null;
        state.companyName = layer.companyName || '';
        state.companyLogo = layer.companyLogo || null;
        state.author = layer.author || '';
        state.autoColorRules = layer.autoColorRules || state.autoColorRules;
        
        if (!layer.id) {
            layer.id = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        if (layer.techniques) {
            const currentMonth = new Date().toISOString().slice(0, 7);
            layer.techniques.forEach(ann => {
                if (!ann.monthAdded) ann.monthAdded = currentMonth;
            });
        }
        
        state.currentLayer = layer;
        lastSnapshotHash = computeHash(layer);
        lastSavedLayer = JSON.parse(JSON.stringify(layer));
        saveCurrentLayerNow();
        return layer;
    } catch {
        return null;
    }
}


export function saveRecentLayer(layer) {
    let recent = JSON.parse(localStorage.getItem(RECENT_LAYERS_KEY) || '[]');
    const item = compactRecentLayer({
        id: layer.id,
        layerId: layer.id,
        name: layer.name,
        domain: 'enterprise-attack',
        attackVersion: layer.versions?.attack || layer.attackVersion || state.currentVersion,
        timestamp: Date.now()
    });
    recent = recent.filter(l => (l.layerId || l.id) !== item.layerId);
    recent.unshift(item);
    recent = recent.slice(0, MAX_RECENT_LAYERS).map(compactRecentLayer);
    safeLocalStorageSet(RECENT_LAYERS_KEY, JSON.stringify(recent));
}

export function renderRecentLayers() {
    const recent = JSON.parse(localStorage.getItem(RECENT_LAYERS_KEY) || '[]').map(layer => compactRecentLayer(layer, true));
    const section = document.getElementById('recent-layers-section');
    const list = document.getElementById('recent-layers-list');
    const countBadge = document.getElementById('recent-layers-count');

    if (recent.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    if (countBadge) countBadge.textContent = recent.length;
    list.className = 'recent-layers-grid';
    list.innerHTML = recent.map(l => {
        const domainLabel = l.domain ? (l.domain.replace('-attack', '').charAt(0).toUpperCase() + l.domain.replace('-attack', '').slice(1)) : 'Enterprise';
        const versionLabel = l.attackVersion === 'master' ? 'master' : ((l.attackVersion || '').toString().startsWith('v') ? '' : 'v') + (l.attackVersion || '');
        return `
            <div class="recent-layer-card" data-id="${escapeHtml(l.id)}" role="button" tabindex="0">
                <div class="recent-layer-icon">
                    <i class="bi bi-layers"></i>
                </div>
                <div class="recent-layer-info">
                    <div class="recent-layer-name">${escapeHtml(l.name)}</div>
                    <div class="recent-layer-meta">
                        <span class="recent-layer-badge">${escapeHtml(domainLabel)}</span>
                        <span>${escapeHtml(versionLabel)}</span>
                        <span>&bull;</span>
                        <span>${new Date(l.timestamp).toLocaleDateString()}</span>
                    </div>
                </div>
                <button class="recent-layer-delete" data-id="${escapeHtml(l.id)}" title="Delete Saved Layer" aria-label="Delete saved layer ${escapeHtml(l.name)}">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.recent-layer-card').forEach(item => {
        const openRecentLayer = async (e) => {
            if (e.target.closest('.recent-layer-delete')) return;
            const layer = recent.find(l => l.id === item.dataset.id);
            if (layer) {
                state.currentDomain = 'enterprise-attack';
                state.currentVersion = layer.versions?.attack || layer.attackVersion;
                const domainSelect = document.getElementById('domain-select');
                if (domainSelect) domainSelect.value = state.currentDomain;
                const versionSelect = document.getElementById('version-select');
                if (versionSelect) versionSelect.value = state.currentVersion;
                showWorkspace();
                const layerData = await resolveRecentLayerData(layer);
                if (layerData) {
                    await loadSTIX(state.currentDomain, state.currentVersion, layerData);
                } else {
                    showToast('Saved layer data could not be loaded. Re-import the JSON once to repair this recent-layer shortcut.', 'error');
                }
            }
        };
        item.addEventListener('click', openRecentLayer);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openRecentLayer(e);
            }
        });
    });

    list.querySelectorAll('.recent-layer-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let r = JSON.parse(localStorage.getItem(RECENT_LAYERS_KEY) || '[]');
            r = r.filter(l => l.id !== btn.dataset.id);
            safeLocalStorageSet(RECENT_LAYERS_KEY, JSON.stringify(r));
            renderRecentLayers();
        });
    });
}

document.getElementById('btn-save-layer').addEventListener('click', async () => {
    if (!state.currentLayer) return;
    const name = await showPrompt('Layer name', state.currentLayer.name);
    if (name !== null && name.trim()) {
        state.currentLayer.name = name.trim();
        state.currentLayer.autoColorByQueries = state.autoColorByQueries;
        updateLayerToolbar();
        await consolidateDeltas(state.currentLayer);
        saveRecentLayer(state.currentLayer);
        showToast('Layer saved!', 'success');
    }
});

document.getElementById('btn-export-layer').addEventListener('click', () => {
    if (!state.currentLayer) return;
    saveCurrentLayerNow();
    const exportPayload = buildLayerExportPayload(state.currentLayer);
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(state.currentLayer.name || 'layer').replace(/[^a-z0-9_-]+/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Layer exported!', 'success');
});

document.getElementById('layer-name-display').addEventListener('click', async () => {
    if (!state.currentLayer) return;
    const name = await showPrompt('Rename layer', state.currentLayer.name);
    if (name !== null && name.trim()) {
        state.currentLayer.name = name.trim();
        updateLayerToolbar();
        saveCurrentLayerNow();
        saveRecentLayer(state.currentLayer);
        showToast('Layer renamed', 'success');
    }
});

document.getElementById('btn-close-layer').addEventListener('click', async () => {
    const confirmed = await showConfirm('Close Layer', 'Unsaved changes will be lost.');
    if (confirmed) {
        state.currentLayer = null;
        lastSnapshotHash = null;
        lastSavedLayer = null;
        deltaBuffer = [];
        localStorage.removeItem(CURRENT_LAYER_KEY);
        if (window.loadReportsList) {
            window.loadReportsList().catch(() => {});
        }
        showLanding();
    }
});

// Legacy Window Bindings
window.LAYER_DB_NAME = LAYER_DB_NAME;
window.LAYER_DB_VERSION = LAYER_DB_VERSION;
window.STORE_SNAPSHOTS = STORE_SNAPSHOTS;
window.STORE_DELTAS = STORE_DELTAS;
window.autoSaveTimer = autoSaveTimer;
window.pendingSave = pendingSave;
window.lastSnapshotHash = lastSnapshotHash;
window.lastSavedLayer = lastSavedLayer;
window.deltaBuffer = deltaBuffer;
window.DELTA_FLUSH_THRESHOLD = DELTA_FLUSH_THRESHOLD;
window.openLayerDB = openLayerDB;
window.computeHash = computeHash;
window.computeDelta = computeDelta;
window.applyDelta = applyDelta;
window.storeSnapshot = storeSnapshot;
window.storeDelta = storeDelta;
window.getDeltas = getDeltas;
window.getSnapshot = getSnapshot;
window.clearDeltas = clearDeltas;
window.consolidateDeltas = consolidateDeltas;
window.saveCurrentLayer = saveCurrentLayer;
window.autoSaveLayer = autoSaveLayer;
window.saveCurrentLayerNow = saveCurrentLayerNow;
window.loadCurrentLayer = loadCurrentLayer;
window.loadLayerFromIndexedDB = loadLayerFromIndexedDB;
window.loadLayerFromLocalStorage = loadLayerFromLocalStorage;
window.saveRecentLayer = saveRecentLayer;
window.renderRecentLayers = renderRecentLayers;
