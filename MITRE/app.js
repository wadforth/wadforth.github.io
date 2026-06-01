function showLoading(show, text = 'Fetching STIX bundle...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = text;
    overlay.classList.toggle('hidden', !show);
}

function showLanding() {
    document.getElementById('landing-view').classList.remove('hidden');
    document.getElementById('workspace-view').classList.add('hidden');
    document.querySelector('.top-nav').classList.add('hidden');
    renderRecentLayers();
    setTimeout(() => enhanceLandingPage(), 100);
}

function showWorkspace() {
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('workspace-view').classList.remove('hidden');
    document.querySelector('.top-nav').classList.remove('hidden');
}

function initTheme() {
    const saved = localStorage.getItem('attack-explorer-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('theme-toggle').innerHTML = '<i class="bi bi-sun-fill"></i>';
    }
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('theme-toggle').innerHTML = isDark
        ? '<i class="bi bi-moon-fill"></i>'
        : '<i class="bi bi-sun-fill"></i>';
    localStorage.setItem('attack-explorer-theme', isDark ? 'light' : 'dark');
});

document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem('attack-explorer-current-view', link.dataset.view);
        document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
        document.getElementById(`${link.dataset.view}-view`).classList.remove('hidden');
        
        if (link.dataset.view === 'queries') {
            renderQueriesView();
        } else if (link.dataset.view === 'groups') {
            renderGroupsView();
        } else if (link.dataset.view === 'software') {
            renderSoftwareView();
        } else if (link.dataset.view === 'mitigations') {
            renderMitigationsView();
        } else if (link.dataset.view === 'reports') {
            loadReportsList();
        } else if (link.dataset.view === 'intel') {
            renderIntelView();
        }
    });
});

document.getElementById('nav-home').addEventListener('click', (e) => {
    e.preventDefault();
    saveCurrentLayer();
    showLanding();
});

document.getElementById('btn-create-new').addEventListener('click', () => {
    state.currentDomain = document.getElementById('domain-select').value;
    state.currentVersion = document.getElementById('version-select').value || 'master';
    state.expandedTechniques.clear();
    state.companyName = '';
    state.companyLogo = null;
    showWorkspace();
    loadSTIX(state.currentDomain, state.currentVersion);
});

document.getElementById('btn-view-matrix').addEventListener('click', () => {
    state.currentDomain = document.getElementById('domain-select').value;
    state.currentVersion = document.getElementById('version-select').value || 'master';
    state.expandedTechniques.clear();
    state.companyName = '';
    state.companyLogo = null;
    showWorkspace();
    loadSTIX(state.currentDomain, state.currentVersion);
});

document.getElementById('btn-import-layer').addEventListener('click', () => {
    document.getElementById('file-import').click();
});

document.getElementById('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const layerData = JSON.parse(ev.target.result);
            if (!layerData.id) {
                layerData.id = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            state.currentDomain = layerData.domain || 'enterprise-attack';
            
            const importedVer = layerData.attackVersion || 'master';
            const latestVer = state.releases[0]?.tag || 'master';
            
            state.companyName = layerData.companyName || '';
            state.companyLogo = layerData.companyLogo || null;
            state.author = layerData.author || '';
            state.autoColorRules = layerData.autoColorRules || state.autoColorRules;
            state.expandedTechniques.clear();
            
            showWorkspace();
            
            if (importedVer !== latestVer) {
                const proceed = await showConfirm(
                    'Upgrade Imported Layer?',
                    `This layer was created using ATT&CK ${importedVer}. Would you like to automatically upgrade and migrate your queries to the latest version (${latestVer})?`
                );
                
                if (proceed) {
                    showLoading(true, 'Fetching latest STIX dataset for migration...');
                    try {
                        const url = `${RAW_BASE}/${latestVer}/${state.currentDomain}/${state.currentDomain}.json`;
                        const resp = await fetch(url);
                        if (!resp.ok) throw new Error('Failed to load dataset');
                        const bundle = await resp.json();
                        
                        const tempState = {
                            techniques: [], revokedTechniques: [], tactics: [], groups: [], software: [], mitigations: [], relationships: [], dataSources: [], dataComponents: []
                        };
                        const objects = bundle.objects || [];
                        for (const obj of objects) {
                            if (obj.type === 'attack-pattern') {
                                if (!obj.deprecated && !obj.revoked) tempState.techniques.push(obj);
                                else tempState.revokedTechniques.push(obj);
                            } else if (obj.type === 'relationship') {
                                tempState.relationships.push(obj);
                            }
                        }
                        
                        const changes = MigrationEngine.analyzeMigration(layerData, latestVer, tempState.techniques, tempState.relationships);
                        showLoading(false);
                        
                        MigrationEngine.showMigrationWizard(layerData, latestVer, changes, async (migratedLayer) => {
                            state.currentVersion = latestVer;
                            document.getElementById('version-select').value = latestVer;
                            await loadSTIX(state.currentDomain, latestVer, migratedLayer);
                            showToast(`Layer migrated to ATT&CK ${latestVer}`, 'success');
                        }, async () => {
                            state.currentVersion = importedVer;
                            document.getElementById('version-select').value = importedVer;
                            await loadSTIX(state.currentDomain, importedVer, layerData);
                        });
                        return;
                    } catch (err) {
                        showLoading(false);
                        showToast('Failed to fetch migration data. Loading original layer.', 'warning');
                    }
                }
            }
            
            state.currentVersion = importedVer;
            document.getElementById('version-select').value = importedVer;
            await loadSTIX(state.currentDomain, importedVer, layerData);
            
        } catch (err) {
            showToast('Invalid layer file: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('domain-select').addEventListener('change', (e) => {
    state.currentDomain = e.target.value;
    if (state.currentLayer) {
        loadSTIX(state.currentDomain, state.currentVersion || 'master', state.currentLayer);
    }
});

document.getElementById('version-select').addEventListener('change', async (e) => {
    const newVersion = e.target.value;
    if (!state.currentLayer) {
        state.currentVersion = newVersion;
        loadSTIX(state.currentDomain, newVersion);
        return;
    }
    
    const currentVer = state.currentVersion;
    if (currentVer === newVersion) return;
    
    showLoading(true, 'Fetching STIX data for migration...');
    try {
        const url = `${RAW_BASE}/${newVersion}/${state.currentDomain}/${state.currentDomain}.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('STIX Fetch Failed');
        const bundle = await resp.json();
        
        const tempState = {
            techniques: [], revokedTechniques: [], tactics: [], groups: [], software: [], mitigations: [], relationships: [], dataSources: [], dataComponents: []
        };
        const objects = bundle.objects || [];
        for (const obj of objects) {
            if (obj.type === 'attack-pattern') {
                if (!obj.deprecated && !obj.revoked) tempState.techniques.push(obj);
                else tempState.revokedTechniques.push(obj);
            } else if (obj.type === 'relationship') {
                tempState.relationships.push(obj);
            }
        }
        
        const changes = MigrationEngine.analyzeMigration(state.currentLayer, newVersion, tempState.techniques, tempState.relationships);
        showLoading(false);
        
        MigrationEngine.showMigrationWizard(state.currentLayer, newVersion, changes, async (migratedLayer) => {
            state.currentVersion = newVersion;
            await loadSTIX(state.currentDomain, newVersion, migratedLayer);
            showToast(`Layer migrated to ATT&CK ${newVersion}`, 'success');
        }, () => {
            document.getElementById('version-select').value = currentVer;
            state.currentVersion = currentVer;
            showToast('Migration cancelled', 'info');
        });
    } catch (err) {
        showLoading(false);
        document.getElementById('version-select').value = currentVer;
        showToast('Failed to load version: ' + err.message, 'error');
    }
});

window.triggerVersionUpgrade = function(targetVersion) {
    const select = document.getElementById('version-select');
    const option = Array.from(select.options).find(opt => 
        opt.value.replace(/v/i, '') === targetVersion.replace(/v/i, '')
    );
    if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
    } else {
        const latestRelease = state.releases[0]?.tag;
        if (latestRelease) {
            select.value = latestRelease;
            select.dispatchEvent(new Event('change'));
        }
    }
};

async function checkForUpdates() {
    try {
        const cachedVer = localStorage.getItem('attack-explorer-latest-version');
        const cachedTs = localStorage.getItem('attack-explorer-latest-version-timestamp');
        const currentVer = (state.currentVersion || '').replace(/v/i, '');
        
        if (cachedVer && cachedTs && (Date.now() - parseInt(cachedTs, 10)) < 12 * 60 * 60 * 1000) {
            if (cachedVer && currentVer && cachedVer !== currentVer) {
                showToastWithOptions(`ATT&CK ${cachedVer} is available!`, {
                    type: 'info',
                    duration: 10000,
                    actionLabel: 'Upgrade Layer',
                    action: () => { window.triggerVersionUpgrade(localStorage.getItem('attack-explorer-latest-version')) }
                });
            }
            return;
        }

        const res = await fetch('https://api.github.com/repos/mitre/cti/releases/latest');
        if (!res.ok) return;
        const data = await res.json();
        const rawTag = data.tag_name || '';
        const latestVer = rawTag.replace(/ATT&CK-?v?/i, '');
        
        if (latestVer) {
            localStorage.setItem('attack-explorer-latest-version', latestVer);
            localStorage.setItem('attack-explorer-latest-version-timestamp', Date.now().toString());
            
            if (currentVer && latestVer !== currentVer) {
                showToastWithOptions(`ATT&CK ${latestVer} is available!`, {
                    type: 'info',
                    duration: 10000,
                    actionLabel: 'Upgrade Layer',
                    action: () => { window.triggerVersionUpgrade(localStorage.getItem('attack-explorer-latest-version')) }
                });
            }
        }
    } catch {
        // Silently fail - offline or rate limited
    }
}

async function init() {
    initTheme();
    initUI();

    await fetchReleases();

    const lastVersion = localStorage.getItem('attack-explorer-last-version');
    if (lastVersion && state.releases.some(r => r.tag === lastVersion)) {
        state.currentVersion = lastVersion;
        document.getElementById('version-select').value = lastVersion;
    } else {
        state.currentVersion = state.releases[0]?.tag || 'master';
        document.getElementById('version-select').value = state.currentVersion;
    }

    // Restore current layer if exists
    const savedLayer = loadCurrentLayer();
    if (savedLayer) {
        state.currentDomain = localStorage.getItem('attack-explorer-current-domain') || 'enterprise-attack';
        state.currentVersion = localStorage.getItem('attack-explorer-current-version') || state.currentVersion;
        const savedExpanded = JSON.parse(localStorage.getItem('attack-explorer-expanded') || '[]');
        state.expandedTechniques = new Set(savedExpanded);

        document.getElementById('domain-select').value = state.currentDomain;
        document.getElementById('version-select').value = state.currentVersion;
        showWorkspace();
        await loadSTIX(state.currentDomain, state.currentVersion, savedLayer);
        
        // Restore last active view selection
        const savedView = localStorage.getItem('attack-explorer-current-view') || 'matrix';
        const targetLink = document.querySelector(`[data-view="${savedView}"]`);
        if (targetLink) {
            targetLink.click();
        }
    } else {
        showLanding();
    }

    await checkForUpdates();
}

init();
