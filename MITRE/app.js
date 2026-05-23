function showLoading(show, text = 'Fetching STIX bundle...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = text;
    overlay.classList.toggle('d-none', !show);
}

function showLanding() {
    document.getElementById('landing-view').classList.remove('d-none');
    document.getElementById('workspace-view').classList.add('d-none');
    document.querySelector('.top-nav').classList.add('d-none');
    renderRecentLayers();
}

function showWorkspace() {
    document.getElementById('landing-view').classList.add('d-none');
    document.getElementById('workspace-view').classList.remove('d-none');
    document.querySelector('.top-nav').classList.remove('d-none');
}

function initTheme() {
    const saved = localStorage.getItem('attack-explorer-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
        document.getElementById('theme-toggle').innerHTML = '<i class="bi bi-sun-fill"></i>';
    }
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    document.documentElement.setAttribute('data-bs-theme', isDark ? 'light' : 'dark');
    document.getElementById('theme-toggle').innerHTML = isDark
        ? '<i class="bi bi-moon-fill"></i>'
        : '<i class="bi bi-sun-fill"></i>';
    localStorage.setItem('attack-explorer-theme', isDark ? 'light' : 'dark');
});

document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('d-none'));
        document.getElementById(`${link.dataset.view}-view`).classList.remove('d-none');
        
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
            state.currentDomain = layerData.domain || 'enterprise-attack';
            state.currentVersion = layerData.attackVersion || 'master';
            state.companyName = layerData.companyName || '';
            state.companyLogo = layerData.companyLogo || null;
            state.author = layerData.author || '';
            state.autoColorRules = layerData.autoColorRules || state.autoColorRules;
            state.expandedTechniques.clear();
            
            // Normalize version for dropdown matching
            const normalizedVersion = state.currentVersion.replace(/^v/i, '');
            const dropdown = document.getElementById('version-select');
            const matchingOption = Array.from(dropdown.options).find(opt => 
                opt.value.replace(/^v/i, '') === normalizedVersion
            );
            dropdown.value = matchingOption ? matchingOption.value : state.currentVersion;
            
            showWorkspace();
            await loadSTIX(state.currentDomain, state.currentVersion, layerData);
            
            if (state.currentLayer) {
                const orphans = findOrphanedTechniques(state.currentLayer, state.techniques);
                if (orphans.length > 0) {
                    const layerVer = normalizeVersion(layerData.attackVersion);
                    const currentVer = normalizeVersion(state.currentVersion);
                    const versionsMatch = layerVer && currentVer && layerVer === currentVer;
                    
                    const title = versionsMatch 
                        ? 'Technique Compatibility Warning' 
                        : 'Version Compatibility Warning';
                    const message = versionsMatch
                        ? `${orphans.length} technique(s) in this layer are not available in ATT&CK ${state.currentVersion} and will be hidden. They may have been deprecated or revoked.`
                        : `This layer was created for ATT&CK ${layerData.attackVersion || 'unknown'}. ${orphans.length} technique(s) are not available in the current version (${state.currentVersion}) and will be hidden.`;
                    
                    showVersionWarningModal(title, message, orphans,
                        () => {
                            state.currentLayer.techniques = state.currentLayer.techniques.filter(ann => 
                                state.techniques.some(t => t.external_references?.[0]?.external_id === ann.techniqueID)
                            );
                            saveCurrentLayer();
                            renderMatrix();
                            showToast('Orphaned techniques removed', 'info');
                        },
                        () => {}
                    );
                }
            }
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
    const currentLayerBackup = JSON.parse(JSON.stringify(state.currentLayer));
    
    state.currentVersion = newVersion;
    await loadSTIX(state.currentDomain, newVersion, state.currentLayer);
    
    const orphans = findOrphanedTechniques(state.currentLayer, state.techniques);
    if (orphans.length > 0) {
        showVersionWarningModal(
            'Version Downgrade Warning',
            `Switching from ${currentVer} to ${newVersion} hides ${orphans.length} technique(s) not available in the older version. Annotations are preserved but hidden.`,
            orphans,
            () => {
                showToast('Version changed. Orphaned techniques hidden.', 'info');
            },
            () => {
                state.currentVersion = currentVer;
                state.currentLayer = currentLayerBackup;
                document.getElementById('version-select').value = currentVer;
                loadSTIX(state.currentDomain, currentVer, state.currentLayer);
                showToast('Version change cancelled', 'info');
            }
        );
    }
});

async function checkForUpdates() {
    try {
        const res = await fetch('https://api.github.com/repos/mitre/cti/releases/latest');
        if (!res.ok) return;
        const data = await res.json();
        const rawTag = data.tag_name || '';
        const latestVer = rawTag.replace(/ATT&CK-?v?/i, '');
        const currentVer = (state.currentVersion || '').replace(/v/i, '');
        
        if (latestVer && currentVer && latestVer !== currentVer) {
            showToast(`ATT&CK ${latestVer} is available. You're on ${currentVer}.`, 'info');
        }
    } catch {
        // Silently fail - offline or rate limited
    }
}

async function init() {
    initTheme();

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
    } else {
        showLanding();
    }

    await checkForUpdates();
}

init();
