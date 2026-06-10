export async function fetchReleases() {
    try {
        const cached = localStorage.getItem('attack-explorer-releases');
        const cachedTs = localStorage.getItem('attack-explorer-releases-timestamp');
        if (cached && cachedTs && (Date.now() - parseInt(cachedTs, 10)) < 2 * 60 * 60 * 1000) {
            state.releases = JSON.parse(cached);
            populateVersionSelect();
            return state.releases;
        }
    } catch (cacheErr) {
        console.warn('Failed to read releases from cache:', cacheErr);
    }

    try {
        const resp = await fetch(`${GITHUB_API}/releases?per_page=10`);
        if (!resp.ok) throw new Error('Failed');
        const releases = await resp.json();
        state.releases = releases.map(r => ({
            tag: r.tag_name,
            name: r.name,
            published: r.published_at,
        }));
        
        try {
            localStorage.setItem('attack-explorer-releases', JSON.stringify(state.releases));
            localStorage.setItem('attack-explorer-releases-timestamp', Date.now().toString());
        } catch (cacheErr) {
            console.warn('Failed to write releases to cache:', cacheErr);
        }

        populateVersionSelect();
        return releases;
    } catch (err) {
        console.warn('Could not fetch releases, falling back to latest stable:', err);
        state.releases = [{ tag: 'v19.1', name: 'v19.1 (Latest)', published: null }];
        populateVersionSelect();
        return [];
    }
}

export function populateVersionSelect() {
    const select = document.getElementById('version-select');
    select.innerHTML = state.releases.map(r =>
        `<option value="${r.tag}">${r.name}</option>`
    ).join('');
}

export async function loadSTIX(domain, version, layerData = null) {
    if (typeof version === 'string') version = version.replace(/^v+/, 'v');
    state.currentDomain = domain;
    state.currentVersion = version;
    showLoading(true, 'Fetching STIX bundle...');
    try {
        const url = `${RAW_BASE}/${version}/${domain}/${domain}.json`;
        console.log(`Loading: ${url}`);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);

        showLoading(true, 'Parsing STIX data...');
        const bundle = await resp.json();
        parseSTIX(bundle);
        
        if (window.generateChangelog) {
            window.generateChangelog().catch(err => console.warn('Changelog error:', err));
        }

        if (layerData) {
            state.currentLayer = layerData;
            state.currentLayer.domain = domain;
            state.currentLayer.attackVersion = version;
            if (!state.currentLayer.legend) state.currentLayer.legend = [...defaultLegend];
            if (!state.currentLayer.metadata) state.currentLayer.metadata = [];
            if (!state.currentLayer.techniques) state.currentLayer.techniques = [];
            if (!state.currentLayer.mitigationStatus) state.currentLayer.mitigationStatus = {};
            if (state.currentLayer.autoColorByQueries === undefined) state.currentLayer.autoColorByQueries = true;
            const attackVersionMeta = state.currentLayer.metadata.find(m => m.name === 'ATT&CK Version');
            if (attackVersionMeta) attackVersionMeta.value = version;
            else state.currentLayer.metadata.push({ name: 'ATT&CK Version', value: version });
            state.autoColorByQueries = state.currentLayer.autoColorByQueries;
        } else {
            state.currentLayer = createNewLayer(domain, version);
        }

        showLoading(true, 'Rendering views...');
        updateVersionDisplay(version);
        updateLayerToolbar();
        renderAll();
        
        if (window.loadReportsList) {
            window.loadReportsList().catch(() => {});
        }

        localStorage.setItem('attack-explorer-last-version', version);
        saveCurrentLayerNow();
        saveRecentLayer(state.currentLayer);
    } catch (err) {
        console.error('Failed to load STIX data:', err);
        document.getElementById('matrix-container').innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-warning mb-3" style="font-size: 2rem;"></i>
                <h5>Failed to load data</h5>
                <p class="text-on-surface-secondary">${escapeHtml(err.message)}</p>
                <button class="btn btn-primary btn-sm" id="btn-retry-stix-load">Retry</button>
            </div>`;
        document.getElementById('btn-retry-stix-load')?.addEventListener('click', () => loadSTIX(domain, version));
    } finally {
        showLoading(false);
    }
}

export function createNewLayer(domain, version) {
    return {
        id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: 'Untitled Layer',
        version: LAYER_VERSION,
        domain: domain,
        attackVersion: version,
        description: '',
        techniques: [],
        mitigationStatus: {},
        legend: [...defaultLegend],
        autoColorByQueries: true,
        metadata: [
            { name: 'Created', value: new Date().toISOString().split('T')[0] },
            { name: 'ATT&CK Version', value: version },
        ],
    };
}

export function updateVersionDisplay(version) {
    const el = document.getElementById('loaded-version');
    const release = state.releases.find(r => r.tag === version);
    if (release && release.published) {
        const date = new Date(release.published).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        el.textContent = `${release.name} — ${date}`;
    } else {
        el.textContent = `ATT&CK ${version}`;
    }
}

export function updateLayerToolbar() {
    const layer = state.currentLayer;
    if (!layer) return;
    document.getElementById('layer-name-display').textContent = layer.name;
    const domainLabel = layer.domain.replace('-attack', '').charAt(0).toUpperCase() + layer.domain.replace('-attack', '').slice(1);
    const domainBadge = document.getElementById('layer-domain-badge');
    if (domainBadge) domainBadge.textContent = domainLabel;
    
    const versionBadge = document.getElementById('layer-version-badge');
    if (versionBadge) versionBadge.textContent = layer.attackVersion || state.currentVersion;
    
    const logoContainer = document.getElementById('company-logo-container');
    const logoImg = document.getElementById('company-logo-img');
    if (state.companyLogo) {
        logoImg.src = state.companyLogo;
        logoContainer.classList.remove('hidden');
    } else {
        logoContainer.classList.add('hidden');
    }
    
    const nameDisplay = document.getElementById('company-name-display');
    if (state.companyName) {
        nameDisplay.textContent = state.companyName;
        nameDisplay.classList.remove('hidden');
    } else {
        nameDisplay.classList.add('hidden');
    }
}

export function parseSTIX(bundle) {
    const objects = bundle.objects || [];
    
    const tempState = {
        techniques: [],
        revokedTechniques: [],
        tactics: [],
        groups: [],
        software: [],
        mitigations: [],
        relationships: [],
        dataSources: [],
        dataComponents: [],
        platforms: new Set()
    };

    for (const obj of objects) {
        if (obj.type === 'attack-pattern') {
            if (!obj.deprecated && !obj.revoked) {
                tempState.techniques.push(obj);
                if (obj.x_mitre_platforms) {
                    obj.x_mitre_platforms.forEach(p => tempState.platforms.add(p));
                }
            } else {
                tempState.revokedTechniques.push(obj);
            }
        } else if (obj.type === 'x-mitre-tactic' && !obj.deprecated && !obj.revoked) {
            tempState.tactics.push(obj);
        } else if (obj.type === 'intrusion-set' && !obj.deprecated && !obj.revoked) {
            tempState.groups.push(obj);
        } else if (obj.type === 'tool' && !obj.deprecated && !obj.revoked) {
            tempState.software.push(obj);
        } else if (obj.type === 'malware' && !obj.deprecated && !obj.revoked) {
            tempState.software.push(obj);
        } else if (obj.type === 'course-of-action' && !obj.deprecated && !obj.revoked) {
            tempState.mitigations.push(obj);
        } else if (obj.type === 'relationship') {
            tempState.relationships.push(obj);
        } else if (obj.type === 'x-mitre-data-source' && !obj.deprecated && !obj.revoked) {
            tempState.dataSources.push(obj);
        } else if (obj.type === 'x-mitre-data-component' && !obj.deprecated && !obj.revoked) {
            tempState.dataComponents.push(obj);
        }
    }

    // Atomic update to eliminate race conditions
    window.StateManager.setSTIXData(tempState);
    console.log(`Parsed: ${tempState.techniques.length} techniques, ${tempState.tactics.length} tactics, ${tempState.groups.length} groups, ${tempState.software.length} software, ${tempState.mitigations.length} mitigations, ${tempState.dataSources.length} data sources, ${tempState.dataComponents.length} data components`);
}

// Legacy Window Bindings
window.fetchReleases = fetchReleases;
window.populateVersionSelect = populateVersionSelect;
window.loadSTIX = loadSTIX;
window.createNewLayer = createNewLayer;
window.updateVersionDisplay = updateVersionDisplay;
window.updateLayerToolbar = updateLayerToolbar;
window.parseSTIX = parseSTIX;
