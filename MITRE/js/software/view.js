import { debounce } from '../utils/performance.js';

export let softwareSortBy = 'name';
export let softwareSortDir = 'asc';
export let softwareViewMode = 'grid';
export let softwareFilterType = 'all';
export let softwareRenderToken = 0;



export function getSoftwareTechniqueCount(softwareId) {
    const sw = state.softwareByExternalId?.get(softwareId);
    if (!sw) return 0;
    return (state.relationshipsBySource?.get(sw.id) || []).filter(r => r.relationship_type === 'uses').length;
}

export function getSoftwareGroupCount(softwareId) {
    const sw = state.softwareByExternalId?.get(softwareId);
    if (!sw) return 0;
    const techIds = new Set(
        (state.relationshipsBySource?.get(sw.id) || [])
            .filter(r => r.relationship_type === 'uses')
            .map(r => r.target_ref)
    );
    const groupIds = new Set();
    techIds.forEach(techId => {
        (state.relationshipsByTarget?.get(techId) || []).forEach(r => {
            if (r.relationship_type === 'uses' && r.source_ref?.startsWith('intrusion-set--')) groupIds.add(r.source_ref);
        });
    });
    return state.groups.filter(g => groupIds.has(g.id)).length;
}

export function sortSoftware(software) {
    const dir = softwareSortDir === 'asc' ? 1 : -1;
    return [...software].sort((a, b) => {
        let valA, valB;
        switch (softwareSortBy) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'id':
                valA = a.external_references?.[0]?.external_id || '';
                valB = b.external_references?.[0]?.external_id || '';
                return valA.localeCompare(valB, undefined, { numeric: true }) * dir;
            case 'type':
                valA = a.type || '';
                valB = b.type || '';
                return valA.localeCompare(valB) * dir;
            case 'techniques':
                return (getSoftwareTechniqueCount(b.external_references?.[0]?.external_id) - getSoftwareTechniqueCount(a.external_references?.[0]?.external_id)) * dir;
            case 'modified':
                valA = a.modified || a.created || '';
                valB = b.modified || b.created || '';
                return valA < valB ? -dir : valA > valB ? dir : 0;
            default:
                return 0;
        }
    });
}

export function renderSoftwareView() {
    const renderToken = ++softwareRenderToken;
    const container = document.getElementById('software-list');
    const controlsContainer = document.getElementById('software-controls');
    const searchInput = document.getElementById('software-search-input');
    const typeFilter = document.getElementById('software-type-filter');
    
    if (!controlsContainer) return;
    
    const query = (searchInput?.value || '').toLowerCase().trim();
    const type = typeFilter?.value || 'all';
    
    let software = [...state.software];
    
    if (softwareFilterType !== 'all') {
        software = software.filter(s => s.type === softwareFilterType);
    }
    
    if (type !== 'all') {
        software = software.filter(s => s.type === type);
    }
    
    if (query) {
        software = software.filter(s =>
            s.name.toLowerCase().includes(query) ||
            (s.description || '').toLowerCase().includes(query) ||
            (s.external_references?.[0]?.external_id || '').toLowerCase().includes(query)
        );
    }
    
    // 1. Instantly render high-fidelity skeleton loading screen to prevent UI locking
    container.innerHTML = `
        <div class="skeletons-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 0.75rem; width: 100%;">
            ${Array.from({ length: 9 }).map(() => `
                <div class="skeleton-card" style="height: 180px; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem; overflow: hidden; position: relative;">
                    <div class="skeleton-shimmer" style="position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent); transform: translateX(-100%); animation: shimmer 1.5s infinite;"></div>
                    <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
                        <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 6px;"></div>
                        <div style="flex: 1;">
                            <div style="height: 12px; width: 60%; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 6px;"></div>
                            <div style="height: 8px; width: 30%; background: rgba(255,255,255,0.05); border-radius: 4px;"></div>
                        </div>
                    </div>
                    <div style="height: 10px; width: 90%; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 8px;"></div>
                    <div style="height: 10px; width: 80%; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 8px;"></div>
                </div>
            `).join('')}
        </div>
    `;

    // 2. Perform indexed O(1) relationships calculation on a deferred event loop task
    setTimeout(() => {
        if (renderToken !== softwareRenderToken) return;

        const relsBySource = state.relationshipsBySource || new Map();
        const techById = state.techniquesByStixId || new Map();
        
        // Cache technique count per software external ID
        const indexedTechCounts = new Map();
        state.software.forEach(s => {
            const extId = s.external_references?.[0]?.external_id || '';
            const rels = relsBySource.get(s.id) || [];
            indexedTechCounts.set(extId, rels.length);
        });

        // Fast sorting
        const dir = softwareSortDir === 'asc' ? 1 : -1;
        const sorted = [...software].sort((a, b) => {
            let valA, valB;
            switch (softwareSortBy) {
                case 'name':
                    valA = (a.name || '').toLowerCase();
                    valB = (b.name || '').toLowerCase();
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                case 'id':
                    valA = a.external_references?.[0]?.external_id || '';
                    valB = b.external_references?.[0]?.external_id || '';
                    return valA.localeCompare(valB, undefined, { numeric: true }) * dir;
                case 'type':
                    valA = a.type || '';
                    valB = b.type || '';
                    return valA.localeCompare(valB) * dir;
                case 'techniques':
                    const countA = indexedTechCounts.get(a.external_references?.[0]?.external_id) || 0;
                    const countB = indexedTechCounts.get(b.external_references?.[0]?.external_id) || 0;
                    return (countB - countA) * dir;
                case 'modified':
                    valA = a.modified || a.created || '';
                    valB = b.modified || b.created || '';
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                default:
                    return 0;
            }
        });

        const tools = sorted.filter(s => s.type === 'tool');
        const malware = sorted.filter(s => s.type === 'malware');
        const totalTechniques = sorted.reduce((sum, s) => sum + (indexedTechCounts.get(s.external_references?.[0]?.external_id) || 0), 0);

        const statsHtml = `
            <div class="software-stats-bar">
                <div class="software-stat">
                    <span class="software-stat-value">${sorted.length}</span>
                    <span class="software-stat-label">Total</span>
                </div>
                <div class="software-stat">
                    <span class="software-stat-value">${tools.length}</span>
                    <span class="software-stat-label">Tools</span>
                </div>
                <div class="software-stat">
                    <span class="software-stat-value">${malware.length}</span>
                    <span class="software-stat-label">Malware</span>
                </div>
                <div class="software-stat">
                    <span class="software-stat-value">${totalTechniques}</span>
                    <span class="software-stat-label">Technique Links</span>
                </div>
            </div>
        `;

        const toolbarHtml = `
            <div class="software-toolbar">
                <div class="software-toolbar-left">
                    <div class="software-sort-group">
                        <label class="software-sort-label">Sort:</label>
                        <select class="software-sort-select" id="software-sort-select">
                            <option value="name" ${softwareSortBy === 'name' ? 'selected' : ''}>Name</option>
                            <option value="id" ${softwareSortBy === 'id' ? 'selected' : ''}>ID</option>
                            <option value="type" ${softwareSortBy === 'type' ? 'selected' : ''}>Type</option>
                            <option value="techniques" ${softwareSortBy === 'techniques' ? 'selected' : ''}>Techniques</option>
                            <option value="modified" ${softwareSortBy === 'modified' ? 'selected' : ''}>Modified</option>
                        </select>
                        <button class="btn btn-sm btn-ghost software-sort-dir" id="software-sort-dir" title="Toggle sort direction">
                            <i class="bi bi-sort-${softwareSortDir === 'asc' ? 'up' : 'down'}"></i>
                        </button>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn ${softwareFilterType === 'all' ? 'btn-primary' : 'btn-outline-secondary'}" data-sw-filter="all">All</button>
                        <button class="btn ${softwareFilterType === 'tool' ? 'btn-success' : 'btn-outline-secondary'}" data-sw-filter="tool"><i class="bi bi-wrench"></i> Tools</button>
                        <button class="btn ${softwareFilterType === 'malware' ? 'btn-danger' : 'btn-outline-secondary'}" data-sw-filter="malware"><i class="bi bi-bug"></i> Malware</button>
                    </div>
                </div>
                <div class="software-toolbar-right">
                    <div class="btn-group btn-group-sm">
                        <button class="btn ${softwareViewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}" id="software-view-grid" title="Grid view">
                            <i class="bi bi-grid-3x3-gap"></i>
                        </button>
                        <button class="btn ${softwareViewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}" id="software-view-list" title="List view">
                            <i class="bi bi-list-ul"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        controlsContainer.innerHTML = statsHtml + toolbarHtml;

        if (sorted.length === 0) {
            container.className = 'software-grid';
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-box"></i>
                    <p>${query || type !== 'all' ? 'No software match your filters.' : 'No software loaded.'}</p>
                </div>
            `;
            bindSoftwareToolbar();
            return;
        }

        container.className = softwareViewMode === 'grid' ? 'software-grid' : 'software-list-view';

        const cardsHtml = sorted.map(s => {
            const swId = s.external_references?.[0]?.external_id || '';
            const swType = s.type === 'malware' ? 'Malware' : 'Tool';
            const techCount = indexedTechCounts.get(swId) || 0;
            const desc = s.description || '';
            const truncatedDesc = truncateDescription(desc, 140);
            
            const theme = getSoftwareTheme(s);
            const themeClass = `software-theme-${theme.id}`;
            const avatarSvg = getProceduralSoftwareAvatarSVG(s.id, s.name, s.type);
            
            const isNew = state.changelogDiff?.added?.software?.has(swId);
            const newBadge = isNew ? `<span class="badge bg-success text-xxs shadow-sm" style="font-size: 0.55rem; padding: 2px 4px; margin-left: 4px; vertical-align: middle;">NEW</span>` : '';

            // Optimized target lookup
            const techRels = relsBySource.get(s.id) || [];
            const relatedTechniques = techRels.map(r => techById.get(r.target_ref)).filter(Boolean);
            
            // Build 12-block tactical sparkline indicators representing covered/gap status
            const sparklineBlocks = relatedTechniques.slice(0, 12).map(tech => {
                const tid = tech.external_references?.[0]?.external_id || '';
                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
                const hasQuery = ann?.queries && ann.queries.length > 0;
                return `<div class="software-spark-block ${hasQuery ? 'covered' : 'uncovered'}" title="${tid}: ${escapeHtml(tech.name)} (${hasQuery ? 'Covered' : 'Gap Blindspot'})"></div>`;
            }).join('');
            
            const fillerCount = Math.max(0, 12 - relatedTechniques.length);
            const sparklineFiller = Array.from({ length: fillerCount }).map(() => {
                return `<div class="software-spark-block" style="background: rgba(255,255,255,0.02); cursor: default;" title="No Technique link"></div>`;
            }).join('');
            
            const sparklineHtml = `<div class="software-sparkline" title="Defensive Sparkline Preview (Covered vs Gaps)">
                ${sparklineBlocks}
                ${sparklineFiller}
            </div>`;
            
            // Render compact OS platform badges
            const platforms = s.x_mitre_platforms || [];
            const platformIconsHtml = platforms.map(p => {
                let pClass = '';
                let pIcon = 'bi-laptop';
                const pLower = p.toLowerCase();
                if (pLower.includes('windows')) {
                    pClass = 'platform-windows';
                    pIcon = 'bi-windows';
                } else if (pLower.includes('macos') || pLower.includes('mac')) {
                    pClass = 'platform-macos';
                    pIcon = 'bi-apple';
                } else if (pLower.includes('linux')) {
                    pClass = 'platform-linux';
                    pIcon = 'bi-terminal';
                } else {
                    pClass = 'platform-other';
                    pIcon = 'bi-cpu';
                }
                return `<span class="software-platform-badge ${pClass}" title="Platform: ${escapeHtml(p)}"><i class="bi ${pIcon}"></i></span>`;
            }).join('');
            
            if (softwareViewMode === 'list') {
                const listSparklineHtml = `<div class="software-sparkline" title="Defensive Sparkline Preview (Covered vs Gaps)" style="margin: 0; width: 100px; flex-shrink: 0;">
                    ${sparklineBlocks}
                    ${sparklineFiller}
                </div>`;

                return `
                    <div class="software-card software-card-list software-card-glass ${themeClass}" data-sw-id="${swId}" role="button" tabindex="0" aria-label="View software details for ${escapeHtml(s.name)}" style="cursor: pointer;">
                        <div class="software-list-row">
                            <div class="software-avatar-container" style="width: 26px; height: 26px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: none; padding: 0;">
                                ${avatarSvg}
                            </div>
                            <div class="software-list-info">
                                <span class="software-list-name" style="font-weight: 700;">${escapeHtml(s.name)}${newBadge}</span>
                                <span class="software-list-id" style="background: rgba(${theme.accentRGB}, 0.1); color: ${theme.accentHex}; font-family: 'JetBrains Mono', monospace; border-radius: 4px; font-weight: bold; font-size: 0.65rem; padding: 2px 6px;">${swId}</span>
                                <span class="${theme.badgeClass}" style="transform: scale(0.9); transform-origin: left center; margin-left: 4px;"><i class="bi ${theme.icon} mr-1"></i>${theme.name}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 170px;">
                                <span class="software-tech-count" style="font-weight: 600; font-size: 0.72rem; min-width: 65px; margin: 0; white-space: nowrap;">${techCount} tech${techCount === 1 ? '' : 's'}</span>
                                ${listSparklineHtml}
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.25rem;">
                                ${platformIconsHtml || `<span class="text-on-surface-tertiary text-xs">—</span>`}
                            </div>
                            <i class="bi bi-chevron-right software-list-arrow" style="color: ${theme.accentHex}; font-size: 0.85rem; justify-self: end;"></i>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="software-card software-card-glass ${themeClass}" data-sw-id="${swId}" role="button" tabindex="0" aria-label="View software details for ${escapeHtml(s.name)}" style="cursor: pointer;">
                    <div class="software-card-avatar-row" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem;">
                        <div class="software-avatar-container" style="width: 42px; height: 42px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: none; padding: 0;">
                            ${avatarSvg}
                        </div>
                        <div class="software-card-header-left" style="display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 0.4rem;">
                                <span class="software-id-badge" style="background: rgba(${theme.accentRGB}, 0.12); color: ${theme.accentHex}; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; border-radius: 4px; padding: 2px 6px;">${swId}</span>
                                <span class="${theme.badgeClass}"><i class="bi ${theme.icon} mr-1"></i>${theme.name}</span>
                            </div>
                            <h6 class="software-card-title" style="margin: 0; font-size: 0.88rem; font-weight: 700; color: var(--on-surface); display: flex; align-items: center; gap: 4px;">
                                ${escapeHtml(s.name)}${newBadge}
                            </h6>
                        </div>
                        <span class="software-tech-badge" style="background: rgba(${theme.accentRGB}, 0.08); color: ${theme.accentHex}; border: 1px solid rgba(${theme.accentRGB}, 0.15); border-radius: 6px; font-weight: 800; font-size: 0.75rem; padding: 3px 7px;">${techCount}</span>
                    </div>
                    <p class="software-card-desc">${escapeHtml(truncatedDesc)}</p>
                    ${sparklineHtml}
                    <div class="software-card-footer" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 0.6rem; display: flex; justify-content: space-between; align-items: center;">
                        <div class="software-platform-icons" style="display: flex; gap: 0.25rem;">
                            ${platformIconsHtml}
                        </div>
                        <span class="software-card-link" style="color: ${theme.accentHex};"><i class="bi bi-arrow-right"></i> View details</span>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = cardsHtml;
        bindSoftwareToolbar();
        bindSoftwareCardActions();
    }, 50);
}

export function bindSoftwareToolbar() {
    const sortSelect = document.getElementById('software-sort-select');
    const sortDir = document.getElementById('software-sort-dir');
    const viewGrid = document.getElementById('software-view-grid');
    const viewList = document.getElementById('software-view-list');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            softwareSortBy = e.target.value;
            renderSoftwareView();
        });
    }
    
    if (sortDir) {
        sortDir.addEventListener('click', () => {
            softwareSortDir = softwareSortDir === 'asc' ? 'desc' : 'asc';
            renderSoftwareView();
        });
    }
    
    if (viewGrid) {
        viewGrid.addEventListener('click', () => {
            softwareViewMode = 'grid';
            renderSoftwareView();
        });
    }
    
    if (viewList) {
        viewList.addEventListener('click', () => {
            softwareViewMode = 'list';
            renderSoftwareView();
        });
    }
    
    document.querySelectorAll('[data-sw-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            softwareFilterType = btn.dataset.swFilter;
            renderSoftwareView();
        });
    });
}

export function bindSoftwareCardActions() {
    document.querySelectorAll('.software-card').forEach(card => {
        card.addEventListener('click', () => {
            showSoftwareModal(card.dataset.swId);
        });
        card.addEventListener('keydown', (event) => {
            if (event.target !== card) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            showSoftwareModal(card.dataset.swId);
        });
    });
}

document.getElementById('software-search-input')?.addEventListener('input', debounce(renderSoftwareView, 250));
document.getElementById('software-type-filter')?.addEventListener('change', (e) => {
    softwareFilterType = e.target.value;
    renderSoftwareView();
});

// Legacy Window Bindings
window.softwareSortBy = softwareSortBy;
window.softwareSortDir = softwareSortDir;
window.softwareViewMode = softwareViewMode;
window.softwareFilterType = softwareFilterType;
window.getSoftwareTechniqueCount = getSoftwareTechniqueCount;
window.getSoftwareGroupCount = getSoftwareGroupCount;
window.sortSoftware = sortSoftware;
window.renderSoftwareView = renderSoftwareView;
window.bindSoftwareToolbar = bindSoftwareToolbar;
window.bindSoftwareCardActions = bindSoftwareCardActions;
