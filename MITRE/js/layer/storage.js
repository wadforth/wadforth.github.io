function saveCurrentLayer() {
    if (!state.currentLayer) return;
    state.currentLayer.companyName = state.companyName;
    state.currentLayer.companyLogo = state.companyLogo;
    state.currentLayer.author = state.author || '';
    state.currentLayer.autoColorRules = state.autoColorRules;
    localStorage.setItem('attack-explorer-current-layer', JSON.stringify(state.currentLayer));
    localStorage.setItem('attack-explorer-current-domain', state.currentDomain);
    localStorage.setItem('attack-explorer-current-version', state.currentVersion);
    localStorage.setItem('attack-explorer-expanded', JSON.stringify([...state.expandedTechniques]));
}

function loadCurrentLayer() {
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
        saveCurrentLayer();
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
    list.innerHTML = recent.map(l => `
        <div class="recent-layer-item" data-id="${l.id}">
            <div class="recent-layer-info">
                <h6>${l.name}</h6>
                <small>${l.domain} • ${l.attackVersion} • ${new Date(l.timestamp).toLocaleDateString()}</small>
            </div>
            <span class="recent-layer-delete" data-id="${l.id}"><i class="bi bi-trash"></i></span>
        </div>
    `).join('');

    list.querySelectorAll('.recent-layer-item').forEach(item => {
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
        saveCurrentLayer();
        saveRecentLayer(state.currentLayer);
        showToast('Layer saved!', 'success');
    }
});

document.getElementById('btn-export-layer').addEventListener('click', () => {
    if (!state.currentLayer) return;
    saveCurrentLayer();
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
        saveCurrentLayer();
        saveRecentLayer(state.currentLayer);
        showToast('Layer renamed', 'success');
    }
});

document.getElementById('btn-close-layer').addEventListener('click', async () => {
    const confirmed = await showConfirm('Close Layer', 'Unsaved changes will be lost.');
    if (confirmed) {
        state.currentLayer = null;
        localStorage.removeItem('attack-explorer-current-layer');
        if (window.loadReportsList) {
            window.loadReportsList().catch(() => {});
        }
        showLanding();
    }
});
