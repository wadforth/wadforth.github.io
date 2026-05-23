const REPORTS_DB = 'mitre-reports-db';
const REPORTS_STORE = 'reports';

function initReportsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(REPORTS_DB, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(REPORTS_STORE)) {
                const store = db.createObjectStore(REPORTS_STORE, { keyPath: 'id' });
                store.createIndex('layerId', 'layerId', { unique: false });
                store.createIndex('generatedAt', 'generatedAt', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveReport(report) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initReportsDB();
            const tx = db.transaction(REPORTS_STORE, 'readwrite');
            tx.objectStore(REPORTS_STORE).put(report);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        } catch (e) { reject(e); }
    });
}

function getReportsForLayer(layerId) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initReportsDB();
            const tx = db.transaction(REPORTS_STORE, 'readonly');
            const index = tx.objectStore(REPORTS_STORE).index('layerId');
            const request = index.getAll(layerId);
            request.onsuccess = () => {
                const reports = request.result.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
                resolve(reports);
            };
            request.onerror = () => reject(request.error);
        } catch (e) { reject(e); }
    });
}

function deleteReport(reportId) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initReportsDB();
            const tx = db.transaction(REPORTS_STORE, 'readwrite');
            tx.objectStore(REPORTS_STORE).delete(reportId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        } catch (e) { reject(e); }
    });
}

function logActivity(type, techniqueId, details = '') {
    if (!state.currentLayer) return;
    if (!state.currentLayer.activityLog) state.currentLayer.activityLog = [];
    state.currentLayer.activityLog.push({
        timestamp: new Date().toISOString(),
        type,
        techniqueId,
        details
    });
    saveCurrentLayer();
}

function getActivitiesSince(dateStr) {
    if (!state.currentLayer?.activityLog) return [];
    const cutoff = new Date(dateStr).getTime();
    return state.currentLayer.activityLog.filter(a => new Date(a.timestamp).getTime() > cutoff);
}

function getLayerSnapshot() {
    if (!state.currentLayer) return null;
    const techniques = (state.currentLayer.techniques || []).map(t => ({
        techniqueID: t.techniqueID,
        color: t.color || null,
        enabled: t.enabled !== false,
        queryCount: t.queries ? t.queries.length : 0,
        queries: t.queries ? t.queries.map(q => ({ id: q.id, name: q.name, language: q.language })) : []
    }));
    
    return {
        techniqueCount: techniques.length,
        totalQueries: techniques.reduce((sum, t) => sum + t.queryCount, 0),
        techniques,
        mitigationStatus: state.currentLayer.mitigationStatus || {},
        companyName: state.currentLayer.companyName || '',
        companyLogo: state.currentLayer.companyLogo || null
    };
}

function detectChanges(lastReport) {
    if (!lastReport) return { new: [], modified: [], all: [] };
    
    const activities = getActivitiesSince(lastReport.periodEnd || lastReport.generatedAt);
    const currentSnapshot = getLayerSnapshot();
    const lastSnapshot = lastReport.snapshot;
    
    const changes = {
        newTechniques: [],
        newQueries: [],
        colorChanges: [],
        mitigationChanges: [],
        all: []
    };
    
    // New techniques
    if (currentSnapshot && lastSnapshot) {
        const lastTechIds = new Set(lastSnapshot.techniques.map(t => t.techniqueID));
        const currentTechIds = new Set(currentSnapshot.techniques.map(t => t.techniqueID));
        
        currentSnapshot.techniques.forEach(t => {
            if (!lastTechIds.has(t.techniqueID)) {
                changes.newTechniques.push(t);
                changes.all.push({ type: 'new_technique', data: t });
            }
        });
        
        // New queries and color changes
        currentSnapshot.techniques.forEach(curr => {
            const last = lastSnapshot.techniques.find(t => t.techniqueID === curr.techniqueID);
            if (!last) return;
            
            if (curr.color !== last.color) {
                changes.colorChanges.push({ techniqueID: curr.techniqueID, from: last.color, to: curr.color });
                changes.all.push({ type: 'color_change', data: { techniqueID: curr.techniqueID, from: last.color, to: curr.color } });
            }
            
            if (curr.queryCount > last.queryCount) {
                const newQueries = curr.queries.slice(last.queryCount);
                newQueries.forEach(q => {
                    changes.newQueries.push({ techniqueID: curr.techniqueID, ...q });
                    changes.all.push({ type: 'new_query', data: { techniqueID: curr.techniqueID, ...q } });
                });
            }
        });
        
        // Mitigation changes
        const currentMit = currentSnapshot.mitigationStatus || {};
        const lastMit = lastSnapshot.mitigationStatus || {};
        Object.keys(currentMit).forEach(mitId => {
            if (currentMit[mitId] !== lastMit[mitId]) {
                changes.mitigationChanges.push({ mitigationID: mitId, from: lastMit[mitId] || 'none', to: currentMit[mitId] });
                changes.all.push({ type: 'mitigation_change', data: { mitigationID: mitId, from: lastMit[mitId] || 'none', to: currentMit[mitId] } });
            }
        });
    }
    
    // Also include recent activities that might not be captured in snapshot diff
    activities.forEach(a => {
        if (!changes.all.some(c => c.type === a.type && c.data?.techniqueID === a.techniqueId)) {
            changes.all.push({ type: a.type, data: { techniqueID: a.techniqueId, details: a.details, timestamp: a.timestamp } });
        }
    });
    
    return changes;
}
