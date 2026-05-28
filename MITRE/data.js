async function fetchReleases() {
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
        console.warn('Could not fetch releases, falling back to master:', err);
        state.releases = [{ tag: 'master', name: 'Latest (master)', published: null }];
        populateVersionSelect();
        return [];
    }
}

function populateVersionSelect() {
    const select = document.getElementById('version-select');
    select.innerHTML = state.releases.map(r =>
        `<option value="${r.tag}">${r.name}</option>`
    ).join('');
}

async function loadSTIX(domain, version, layerData = null) {
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

        if (layerData) {
            state.currentLayer = layerData;
            if (!state.currentLayer.legend) state.currentLayer.legend = [...defaultLegend];
            if (!state.currentLayer.metadata) state.currentLayer.metadata = [];
            if (!state.currentLayer.techniques) state.currentLayer.techniques = [];
            if (!state.currentLayer.mitigationStatus) state.currentLayer.mitigationStatus = {};
            if (state.currentLayer.autoColorByQueries === undefined) state.currentLayer.autoColorByQueries = true;
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
        saveCurrentLayer();
        saveRecentLayer(state.currentLayer);
    } catch (err) {
        console.error('Failed to load STIX data:', err);
        document.getElementById('matrix-container').innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-warning mb-3" style="font-size: 2rem;"></i>
                <h5>Failed to load data</h5>
                <p class="text-on-surface-secondary">${err.message}</p>
                <button class="btn btn-primary btn-sm" onclick="loadSTIX('${domain}', '${version}')">Retry</button>
            </div>`;
    } finally {
        showLoading(false);
    }
}

function createNewLayer(domain, version) {
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

function updateVersionDisplay(version) {
    const el = document.getElementById('loaded-version');
    const release = state.releases.find(r => r.tag === version);
    if (release && release.published) {
        const date = new Date(release.published).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        el.textContent = `${release.name} — ${date}`;
    } else {
        el.textContent = `ATT&CK ${version}`;
    }
}

function updateLayerToolbar() {
    const layer = state.currentLayer;
    if (!layer) return;
    document.getElementById('layer-name-display').textContent = layer.name;
    const domainLabel = layer.domain.replace('-attack', '').charAt(0).toUpperCase() + layer.domain.replace('-attack', '').slice(1);
    document.getElementById('layer-domain-badge').textContent = domainLabel;
    document.getElementById('layer-version-badge').textContent = layer.attackVersion || state.currentVersion;
    
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

function parseSTIX(bundle) {
    const objects = bundle.objects || [];
    state.techniques = [];
    state.tactics = [];
    state.groups = [];
    state.software = [];
    state.mitigations = [];
    state.relationships = [];
    state.dataSources = [];
    state.dataComponents = [];
    state.platforms = new Set();

    state.revokedTechniques = [];

    for (const obj of objects) {
        if (obj.type === 'attack-pattern') {
            if (!obj.deprecated && !obj.revoked) {
                state.techniques.push(obj);
                if (obj.x_mitre_platforms) {
                    obj.x_mitre_platforms.forEach(p => state.platforms.add(p));
                }
            } else {
                state.revokedTechniques.push(obj);
            }
        } else if (obj.type === 'x-mitre-tactic' && !obj.deprecated && !obj.revoked) {
            state.tactics.push(obj);
        } else if (obj.type === 'intrusion-set' && !obj.deprecated && !obj.revoked) {
            state.groups.push(obj);
        } else if (obj.type === 'tool' && !obj.deprecated && !obj.revoked) {
            state.software.push(obj);
        } else if (obj.type === 'malware' && !obj.deprecated && !obj.revoked) {
            state.software.push(obj);
        } else if (obj.type === 'course-of-action' && !obj.deprecated && !obj.revoked) {
            state.mitigations.push(obj);
        } else if (obj.type === 'relationship') {
            state.relationships.push(obj);
        } else if (obj.type === 'x-mitre-data-source' && !obj.deprecated && !obj.revoked) {
            state.dataSources.push(obj);
        } else if (obj.type === 'x-mitre-data-component' && !obj.deprecated && !obj.revoked) {
            state.dataComponents.push(obj);
        }
    }

    state.activePlatforms = new Set(state.platforms);
    console.log(`Parsed: ${state.techniques.length} techniques, ${state.tactics.length} tactics, ${state.groups.length} groups, ${state.software.length} software, ${state.mitigations.length} mitigations, ${state.dataSources.length} data sources, ${state.dataComponents.length} data components`);
}
