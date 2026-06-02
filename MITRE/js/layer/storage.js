// IndexedDB configuration
const LAYER_DB_NAME = 'attack-explorer-layer-db';
const LAYER_DB_VERSION = 1;
const STORE_SNAPSHOTS = 'layer_snapshots';
const STORE_DELTAS = 'layer_deltas';

let autoSaveTimer = null;
let pendingSave = false;
let lastSnapshotHash = null;
let deltaBuffer = [];
const DELTA_FLUSH_THRESHOLD = 5; // Consolidate after this many deltas

// IndexedDB initialization
function openLayerDB() {
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
function computeHash(obj) {
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
function computeDelta(oldObj, newObj, basePath = '') {
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
function applyDelta(obj, ops) {
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
async function storeSnapshot(layer) {
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
async function storeDelta(layerId, ops) {
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
async function getDeltas(layerId) {
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
async function getSnapshot(layerId) {
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
async function clearDeltas(layerId) {
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
async function consolidateDeltas(layer) {
    const newHash = await storeSnapshot(layer);
    await clearDeltas(layer.id);
    lastSnapshotHash = newHash;
    deltaBuffer = [];
}

// Save current layer with delta tracking
async function saveCurrentLayer() {
    if (!state.currentLayer) return;
    state.currentLayer.companyName = state.companyName;
    state.currentLayer.companyLogo = state.companyLogo;
    state.currentLayer.author = state.author || '';
    state.currentLayer.autoColorRules = state.autoColorRules;
    
    // Also persist to localStorage for backward compatibility and quick access
    localStorage.setItem('attack-explorer-current-domain', state.currentDomain);
    localStorage.setItem('attack-explorer-current-version', state.currentVersion);
    localStorage.setItem('attack-explorer-expanded', JSON.stringify([...state.expandedTechniques]));
    
    try {
        const currentHash = computeHash(state.currentLayer);
        
        if (!lastSnapshotHash) {
            // First save - store full snapshot
            lastSnapshotHash = await storeSnapshot(state.currentLayer);
        } else if (currentHash !== lastSnapshotHash) {
            // Compute and store delta
            const snapshot = await getSnapshot(state.currentLayer.id);
            if (snapshot) {
                const ops = computeDelta(snapshot.data, state.currentLayer);
                if (ops.length > 0) {
                    deltaBuffer.push(ops);
                    await storeDelta(state.currentLayer.id, ops);
                    
                    // Consolidate if buffer is large
                    if (deltaBuffer.length >= DELTA_FLUSH_THRESHOLD) {
                        await consolidateDeltas(state.currentLayer);
                    }
                }
            } else {
                // Snapshot missing - create new one
                lastSnapshotHash = await storeSnapshot(state.currentLayer);
            }
        }
        
        // Update localStorage fallback
        localStorage.setItem('attack-explorer-current-layer', JSON.stringify(state.currentLayer));
    } catch (err) {
        console.error('IndexedDB save failed, falling back to localStorage:', err);
        localStorage.setItem('attack-explorer-current-layer', JSON.stringify(state.currentLayer));
    }
}

// Debounced auto-save: coalesces rapid saves into a single write after 800ms
function autoSaveLayer() {
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
function saveCurrentLayerNow() {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    pendingSave = false;
    saveCurrentLayer();
}

// Load layer from IndexedDB with delta replay
async function loadCurrentLayer() {
    // Try IndexedDB first
    const savedId = localStorage.getItem('attack-explorer-current-layer');
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
        if (layerData && layerData.id) {
            return await loadLayerFromIndexedDB(layerData.id);
        }
    } catch {}
    
    // Fallback to old localStorage format
    return loadLayerFromLocalStorage();
}

async function loadLayerFromIndexedDB(layerId) {
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
        lastSnapshotHash = snapshot.hash;
        
        // Update localStorage reference
        localStorage.setItem('attack-explorer-current-layer', JSON.stringify(layer));
        
        return layer;
    } catch (err) {
        console.error('IndexedDB load failed, falling back to localStorage:', err);
        return loadLayerFromLocalStorage();
    }
}

function loadLayerFromLocalStorage() {
    const saved = localStorage.getItem('attack-explorer-current-layer');
    if (!saved) return null;
    try {
        const layer = JSON.parse(saved);
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
        saveCurrentLayerNow();
        return layer;
    } catch {
        return null;
    }
}

function saveRecentLayer(layer) {
    let recent = JSON.parse(localStorage.getItem('attack-explorer-recent') || '[]');
    recent = recent.filter(l => l.id !== layer.name + layer.domain);
    recent.unshift({
        id: layer.name + layer.domain,
        name: layer.name,
        domain: layer.domain,
        attackVersion: layer.attackVersion,
        timestamp: Date.now(),
        data: layer,
    });
    recent = recent.slice(0, 10);
    localStorage.setItem('attack-explorer-recent', JSON.stringify(recent));
}

function renderRecentLayers() {
    const recent = JSON.parse(localStorage.getItem('attack-explorer-recent') || '[]');
    const section = document.getElementById('recent-layers-section');
    const list = document.getElementById('recent-layers-list');

    if (recent.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.className = 'recent-layers';
    list.innerHTML = recent.map(l => {
        const domainLabel = l.domain ? (l.domain.replace('-attack', '').charAt(0).toUpperCase() + l.domain.replace('-attack', '').slice(1)) : 'Enterprise';
        return `
            <div class="recent-layer-card" data-id="${l.id}">
                <div class="recent-layer-icon">
                    <i class="bi bi-layers"></i>
                </div>
                <div class="recent-layer-info">
                    <div class="recent-layer-name">${escapeHtml(l.name)}</div>
                    <div class="recent-layer-meta">
                        <span class="recent-layer-badge">${domainLabel}</span>
                        <span>v${l.attackVersion}</span>
                        <span>&bull;</span>
                        <span>${new Date(l.timestamp).toLocaleDateString()}</span>
                    </div>
                </div>
                <button class="recent-layer-delete" data-id="${l.id}" title="Delete Saved Layer">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.recent-layer-card').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.recent-layer-delete')) return;
            const layer = recent.find(l => l.id === item.dataset.id);
            if (layer) {
                state.currentDomain = layer.domain;
                state.currentVersion = layer.attackVersion;
                document.getElementById('domain-select').value = state.currentDomain;
                document.getElementById('version-select').value = state.currentVersion;
                showWorkspace();
                loadSTIX(state.currentDomain, state.currentVersion, layer.data);
            }
        });
    });

    list.querySelectorAll('.recent-layer-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let r = JSON.parse(localStorage.getItem('attack-explorer-recent') || '[]');
            r = r.filter(l => l.id !== btn.dataset.id);
            localStorage.setItem('attack-explorer-recent', JSON.stringify(r));
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
    const blob = new Blob([JSON.stringify(state.currentLayer, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.currentLayer.name.replace(/\s+/g, '_')}.json`;
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
        deltaBuffer = [];
        localStorage.removeItem('attack-explorer-current-layer');
        if (window.loadReportsList) {
            window.loadReportsList().catch(() => {});
        }
        showLanding();
    }
});
