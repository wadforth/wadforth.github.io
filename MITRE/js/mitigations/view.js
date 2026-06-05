export let mitigationsSortBy = 'name';
export let mitigationsSortDir = 'asc';
export let mitigationsViewMode = 'grid';
export let mitigationsStatusFilter = 'all';

export function getMitigationTechniques(mitigationId) {
    const mit = state.mitigations.find(m => m.id === mitigationId);
    if (!mit) return [];
    return state.relationships
        .filter(r => r.relationship_type === 'mitigates' && r.source_ref === mit.id)
        .map(r => {
            const tech = state.techniques.find(t => t.id === r.target_ref);
            return tech || null;
        })
        .filter(Boolean);
}

export function getMitigationStatus(mitigationId) {
    if (!state.currentLayer?.mitigationStatus) return 'none';
    return state.currentLayer.mitigationStatus[mitigationId] || 'none';
}

export function setMitigationStatus(mitigationId, status) {
    if (!state.currentLayer) return;
    if (!state.currentLayer.mitigationStatus) state.currentLayer.mitigationStatus = {};
    state.currentLayer.mitigationStatus[mitigationId] = status;
    logActivity('mitigation_status', null, `${mitigationId}: ${status}`);
    autoSaveLayer();
}

export function sortMitigations(mitigations) {
    const dir = mitigationsSortDir === 'asc' ? 1 : -1;
    return [...mitigations].sort((a, b) => {
        let valA, valB;
        switch (mitigationsSortBy) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'id':
                valA = a.external_references?.[0]?.external_id || '';
                valB = b.external_references?.[0]?.external_id || '';
                return valA.localeCompare(valB, undefined, { numeric: true }) * dir;
            case 'techniques':
                return (getMitigationTechniques(b.id).length - getMitigationTechniques(a.id).length) * dir;
            case 'status':
                const statusOrder = { implemented: 0, planned: 1, none: 2 };
                return ((statusOrder[getMitigationStatus(b.id)] || 2) - (statusOrder[getMitigationStatus(a.id)] || 2)) * dir;
            default:
                return 0;
        }
    });
}

export function renderMitigationsView() {
    const container = document.getElementById('mitigations-list');
    const controlsContainer = document.getElementById('mitigations-controls');
    const searchInput = document.getElementById('mitigations-search-input');
    
    if (!controlsContainer) return;
    
    const query = (searchInput?.value || '').toLowerCase().trim();
    
    let mitigations = [...state.mitigations];
    
    if (mitigationsStatusFilter !== 'all') {
        mitigations = mitigations.filter(m => getMitigationStatus(m.id) === mitigationsStatusFilter);
    }
    
    if (query) {
        mitigations = mitigations.filter(m => {
            const techs = getMitigationTechniques(m.id);
            const techNames = techs.map(t => t.name.toLowerCase()).join(' ');
            const techIds = techs.map(t => (t.external_references?.[0]?.external_id || '').toLowerCase()).join(' ');
            return m.name.toLowerCase().includes(query) ||
                (m.description || '').toLowerCase().includes(query) ||
                (m.external_references?.[0]?.external_id || '').toLowerCase().includes(query) ||
                techNames.includes(query) ||
                techIds.includes(query);
        });
    }
    
    mitigations = sortMitigations(mitigations);
    
    const implemented = mitigations.filter(m => getMitigationStatus(m.id) === 'implemented').length;
    const planned = mitigations.filter(m => getMitigationStatus(m.id) === 'planned').length;
    const notStarted = mitigations.filter(m => getMitigationStatus(m.id) === 'none').length;
    const totalTechniques = mitigations.reduce((sum, m) => sum + getMitigationTechniques(m.id).length, 0);
    
    const statsHtml = `
        <div class="mitigations-stats-bar">
            <div class="mitigations-stat">
                <span class="mitigations-stat-value">${mitigations.length}</span>
                <span class="mitigations-stat-label">Mitigations</span>
            </div>
            <div class="mitigations-stat">
                <span class="mitigations-stat-value" style="color: #198754;">${implemented}</span>
                <span class="mitigations-stat-label">Implemented</span>
            </div>
            <div class="mitigations-stat">
                <span class="mitigations-stat-value" style="color: #ffc107;">${planned}</span>
                <span class="mitigations-stat-label">Planned</span>
            </div>
            <div class="mitigations-stat">
                <span class="mitigations-stat-value" style="color: var(--on-surface-tertiary);">${notStarted}</span>
                <span class="mitigations-stat-label">Not Started</span>
            </div>
            <div class="mitigations-stat">
                <span class="mitigations-stat-value">${totalTechniques}</span>
                <span class="mitigations-stat-label">Technique Links</span>
            </div>
        </div>
    `;
    
    const toolbarHtml = `
        <div class="mitigations-toolbar">
            <div class="mitigations-toolbar-left">
                <div class="mitigations-sort-group">
                    <label class="mitigations-sort-label">Sort:</label>
                    <select class="mitigations-sort-select" id="mitigations-sort-select">
                        <option value="name" ${mitigationsSortBy === 'name' ? 'selected' : ''}>Name</option>
                        <option value="id" ${mitigationsSortBy === 'id' ? 'selected' : ''}>ID</option>
                        <option value="techniques" ${mitigationsSortBy === 'techniques' ? 'selected' : ''}>Techniques</option>
                        <option value="status" ${mitigationsSortBy === 'status' ? 'selected' : ''}>Status</option>
                    </select>
                    <button class="btn btn-sm btn-ghost mitigations-sort-dir" id="mitigations-sort-dir" title="Toggle sort direction">
                        <i class="bi bi-sort-${mitigationsSortDir === 'asc' ? 'up' : 'down'}"></i>
                    </button>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn ${mitigationsStatusFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}" data-mit-filter="all">All</button>
                    <button class="btn ${mitigationsStatusFilter === 'implemented' ? 'btn-success' : 'btn-outline-secondary'}" data-mit-filter="implemented"><i class="bi bi-check-circle"></i> Done</button>
                    <button class="btn ${mitigationsStatusFilter === 'planned' ? 'btn-warning' : 'btn-outline-secondary'}" data-mit-filter="planned"><i class="bi bi-clock"></i> Planned</button>
                    <button class="btn ${mitigationsStatusFilter === 'none' ? 'btn-outline-secondary' : 'btn-outline-secondary'}" data-mit-filter="none"><i class="bi bi-circle"></i> None</button>
                </div>
            </div>
            <div class="mitigations-toolbar-right">
                <div class="btn-group btn-group-sm">
                    <button class="btn ${mitigationsViewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}" id="mitigations-view-grid" title="Grid view">
                        <i class="bi bi-grid-3x3-gap"></i>
                    </button>
                    <button class="btn ${mitigationsViewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}" id="mitigations-view-list" title="List view">
                        <i class="bi bi-list-ul"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    controlsContainer.innerHTML = statsHtml + toolbarHtml;
    
    if (mitigations.length === 0) {
        container.className = 'mitigations-grid';
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-shield-check"></i>
                <p>${query || mitigationsStatusFilter !== 'all' ? 'No mitigations match your filters.' : 'No mitigations loaded.'}</p>
            </div>
        `;
        bindMitigationsToolbar();
        return;
    }
    
    container.className = mitigationsViewMode === 'grid' ? 'mitigations-grid' : 'mitigations-list-view';
    
    const cardsHtml = mitigations.map(m => {
        const mitId = m.external_references?.[0]?.external_id || '';
        const techs = getMitigationTechniques(m.id);
        const status = getMitigationStatus(m.id);
        const desc = m.description || '';
        const truncatedDesc = truncateDescription(desc, 140);
        
        const isNew = state.changelogDiff?.added?.mitigations?.has(mitId);
        const newBadge = isNew ? `<span class="badge bg-success text-xxs shadow-sm" style="font-size: 0.55rem; padding: 2px 4px; margin-left: 4px; vertical-align: middle;">NEW</span>` : '';

        // Pre-calculate real-time query coverage maturity grade for the mitigation
        const coveredTechs = techs.filter(t => {
            const tid = t.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        const maturityPct = techs.length > 0 ? Math.round((coveredTechs / techs.length) * 100) : 0;
        const progressColor = maturityPct >= 70 ? '#10b981' : maturityPct >= 40 ? '#f59e0b' : '#584cf4';

        const maturityBarHtml = techs.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 1rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.04);">
                <div class="mitigation-maturity-ring" title="Maturity Grade">
                    <svg viewBox="0 0 48 48">
                        <circle class="bg" cx="24" cy="24" r="20"></circle>
                        <circle class="progress" cx="24" cy="24" r="20" stroke="${progressColor}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - maturityPct}"></circle>
                    </svg>
                    <div class="percentage" style="color: ${progressColor}">${maturityPct}%</div>
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">Maturity Grade</span>
                    <span style="font-size: 0.72rem; color: var(--on-surface-tertiary);">${coveredTechs} / ${techs.length} Techniques covered</span>
                </div>
            </div>
        ` : `
            <div style="display: flex; align-items: center; gap: 1rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.04);">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: var(--on-surface-tertiary);">
                    <i class="bi bi-dash" style="font-size: 1.2rem;"></i>
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">Maturity Grade N/A</span>
                    <span style="font-size: 0.72rem; color: var(--on-surface-tertiary);">Cannot calculate grade without mapped techniques</span>
                </div>
            </div>
        `;
        
        if (mitigationsViewMode === 'list') {
            const listMaturityBar = techs.length > 0 ? `
                <div class="mitigation-maturity-ring" title="Maturity Grade">
                    <svg viewBox="0 0 48 48">
                        <circle class="bg" cx="24" cy="24" r="20"></circle>
                        <circle class="progress" cx="24" cy="24" r="20" stroke="${progressColor}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - maturityPct}"></circle>
                    </svg>
                    <div class="percentage" style="color: ${progressColor}">${maturityPct}%</div>
                </div>
            ` : `<div style="width: 48px; text-align: center; font-size: 0.62rem; color: var(--on-surface-tertiary); font-style: italic;">N/A</div>`;

            return `
                <div class="mitigation-card mitigation-card-list mitigation-card-clickable" data-mit="${m.id}" data-status="${status}" style="cursor: pointer;">
                    <div class="mitigation-list-row" style="display: grid !important; grid-template-columns: 28px minmax(200px, 2fr) minmax(130px, 1.2fr) 60px minmax(150px, 1.5fr) 20px !important; align-items: center; gap: 1rem !important; width: 100%;">
                        <button class="btn btn-sm mit-status-toggle ${status}" data-mit="${m.id}" title="Toggle status" style="flex-shrink: 0;">
                            <i class="bi ${status === 'implemented' ? 'bi-check-circle-fill' : status === 'planned' ? 'bi-clock-fill' : 'bi-circle'}"></i>
                        </button>
                        <div class="mitigation-list-info" style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
                            <span class="mitigation-list-name" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.name)}${newBadge}</span>
                            <span class="mitigation-list-id" style="background: rgba(139, 92, 246, 0.12); color: var(--primary); font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; border-radius: 4px; padding: 2px 6px; flex-shrink: 0;">${mitId}</span>
                        </div>
                        <span class="mitigation-tech-count" style="font-size: 0.72rem; font-weight: 600; white-space: nowrap;">${techs.length} technique${techs.length === 1 ? '' : 's'}</span>
                        ${listMaturityBar}
                        <div class="mitigation-list-techs" style="display: flex; align-items: center; gap: 0.25rem; overflow: hidden;">
                            ${techs.length === 0 ? '<span class="mitigation-no-techs" style="font-size: 0.68rem; color: var(--on-surface-tertiary); display: inline-flex; align-items: center; gap: 4px;"><i class="bi bi-exclamation-triangle"></i> No mappings</span>' : ''}
                            ${techs.slice(0, 3).map(t => {
                                const tid = t.external_references?.[0]?.external_id || '';
                                return `<span class="mitigation-tech-tag" style="font-size: 0.65rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--on-surface-secondary); font-family: 'JetBrains Mono', monospace;">${tid}</span>`;
                            }).join('')}
                            ${techs.length > 3 ? `<span class="mitigation-tech-more" style="font-size: 0.65rem; color: var(--on-surface-tertiary); font-weight: 600;">+${techs.length - 3}</span>` : ''}
                        </div>
                        <i class="bi bi-chevron-right" style="color: var(--on-surface-tertiary); justify-self: end;"></i>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="mitigation-card mitigation-card-clickable" data-mit="${m.id}" data-status="${status}" style="cursor: pointer; display: flex; flex-direction: column; height: 100%;">
                <div class="mitigation-card-header">
                    <div class="mitigation-card-header-left">
                        <span class="mitigation-id-badge" style="background: rgba(139, 92, 246, 0.12); color: var(--primary); font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; border-radius: 4px; padding: 2px 6px;">${mitId}</span>
                        <h6 class="mitigation-card-title" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}${newBadge}</h6>
                    </div>
                    <button class="btn btn-sm mit-status-toggle ${status}" data-mit="${m.id}" title="Click to cycle: None → Planned → Implemented">
                        <i class="bi ${status === 'implemented' ? 'bi-check-circle-fill' : status === 'planned' ? 'bi-clock-fill' : 'bi-circle'}"></i>
                        <span class="mit-status-label">${status === 'implemented' ? 'Done' : status === 'planned' ? 'Planned' : 'None'}</span>
                    </button>
                </div>
                <p class="mitigation-card-desc">${escapeHtml(truncatedDesc)}</p>
                <div class="mitigation-card-techs" style="margin-top: 0.75rem;">
                    <span class="mitigation-tech-count-badge" style="font-size: 0.7rem; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">${techs.length} Techniques Covered</span>
                    ${techs.length === 0 ? '<div class="mitigation-no-techs" style="font-size: 0.68rem; color: var(--on-surface-tertiary); margin-top: 0.25rem;"><i class="bi bi-exclamation-triangle"></i> No technique mappings</div>' : ''}
                    <div class="mitigation-tech-tags" style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem;">
                        ${techs.slice(0, 5).map(t => {
                            const tid = t.external_references?.[0]?.external_id || '';
                            return `<span class="mitigation-tech-tag" style="font-size: 0.65rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--on-surface-secondary); font-family: 'JetBrains Mono', monospace;">${tid}</span>`;
                        }).join('')}
                        ${techs.length > 5 ? `<span class="mitigation-tech-more" style="font-size: 0.65rem; color: var(--on-surface-tertiary); font-weight: 600; line-height: 1.8;">+${techs.length - 5} more</span>` : ''}
                    </div>
                </div>
                <div style="margin-top: auto;">
                    ${maturityBarHtml}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = cardsHtml;
    bindMitigationsToolbar();
    bindMitigationCardActions();
}

export function bindMitigationsToolbar() {
    const sortSelect = document.getElementById('mitigations-sort-select');
    const sortDir = document.getElementById('mitigations-sort-dir');
    const viewGrid = document.getElementById('mitigations-view-grid');
    const viewList = document.getElementById('mitigations-view-list');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            mitigationsSortBy = e.target.value;
            renderMitigationsView();
        });
    }
    
    if (sortDir) {
        sortDir.addEventListener('click', () => {
            mitigationsSortDir = mitigationsSortDir === 'asc' ? 'desc' : 'asc';
            renderMitigationsView();
        });
    }
    
    if (viewGrid) {
        viewGrid.addEventListener('click', () => {
            mitigationsViewMode = 'grid';
            renderMitigationsView();
        });
    }
    
    if (viewList) {
        viewList.addEventListener('click', () => {
            mitigationsViewMode = 'list';
            renderMitigationsView();
        });
    }
    
    document.querySelectorAll('[data-mit-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            mitigationsStatusFilter = btn.dataset.mitFilter;
            renderMitigationsView();
        });
    });
}

export function bindMitigationCardActions() {
    document.querySelectorAll('.mit-status-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const mitId = btn.dataset.mit;
            const current = getMitigationStatus(mitId);
            const next = current === 'none' ? 'planned' : current === 'planned' ? 'implemented' : 'none';
            setMitigationStatus(mitId, next);
            renderMitigationsView();
        });
    });
    
    document.querySelectorAll('.mitigation-card-clickable').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const mitId = btn.dataset.mit;
            if (mitId) showMitigationModal(mitId);
        });
    });
}

export function showMitigationModal(mitigationId) {
    const mitigation = state.mitigations.find(m => m.id === mitigationId);
    if (!mitigation) return;
    
    const mitIdDisplay = mitigation.external_references?.[0]?.external_id || 'N/A';
    const status = getMitigationStatus(mitigation.id);
    const techs = getMitigationTechniques(mitigation.id);
    
    const coveredTechs = techs.filter(t => {
        const tid = t.external_references?.[0]?.external_id || '';
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        return ann?.queries && ann.queries.length > 0;
    }).length;
    const maturityPct = techs.length > 0 ? Math.round((coveredTechs / techs.length) * 100) : 0;
    const progressColor = maturityPct >= 70 ? '#10b981' : maturityPct >= 40 ? '#f59e0b' : '#584cf4';

    let relatedGroupsMap = new Map();
    let relatedSoftwareMap = new Map();
    
    techs.forEach(t => {
        state.relationships.filter(r => r.relationship_type === 'uses' && r.target_ref === t.id).forEach(r => {
            if (r.source_ref.startsWith('intrusion-set--')) {
                const group = state.groups.find(g => g.id === r.source_ref);
                if (group) relatedGroupsMap.set(group.id, group);
            } else if (r.source_ref.startsWith('malware--') || r.source_ref.startsWith('tool--')) {
                const sw = state.software.find(s => s.id === r.source_ref);
                if (sw) relatedSoftwareMap.set(sw.id, sw);
            }
        });
    });
    
    const relatedGroups = Array.from(relatedGroupsMap.values());
    const relatedSoftware = Array.from(relatedSoftwareMap.values());

    let modal = document.getElementById('mitigation-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'mitigation-detail-modal';
        modal.tabIndex = -1;
        document.body.appendChild(modal);
    }
    
    const created = mitigation.created ? new Date(mitigation.created).toLocaleDateString() : '';
    const modified = mitigation.modified ? new Date(mitigation.modified).toLocaleDateString() : '';
    
    const overviewHtml = `
        <div class="mitigation-tab-pane active" id="mit-tab-overview">
            <div class="mitigation-overview-layout">
                <div class="mitigation-overview-main">
                    <div style="font-size: 0.95rem; line-height: 1.6; color: var(--on-surface);">${parseDescription(mitigation.description || 'No description available.')}</div>
                    
                    ${techs.length ? `
                        <div style="margin-top: 2rem;">
                            <h6 style="font-size: 0.85rem; font-weight: 700; color: var(--primary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace; margin-bottom: 1rem;"><i class="bi bi-grid"></i> Mitigated Techniques (${techs.length})</h6>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem;">
                                ${techs.map(t => {
                                    const tid = t.external_references?.[0]?.external_id || '';
                                    const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
                                    const hasQuery = ann?.queries && ann.queries.length > 0;
                                    return `<div class="entity-chip-clickable" data-tech-id="${tid}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-sm); padding: 0.75rem; transition: var(--transition); display: flex; flex-direction: column; gap: 0.4rem;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: bold; color: ${hasQuery ? '#10b981' : 'var(--primary)'};">${tid}</span>
                                            ${hasQuery ? '<i class="bi bi-check-circle-fill" style="color: #10b981; font-size: 0.8rem;"></i>' : ''}
                                        </div>
                                        <span style="font-size: 0.8rem; color: var(--on-surface-secondary); line-height: 1.3;">${escapeHtml(t.name)}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="mitigation-overview-sidebar">
                    <div class="mitigation-meta-grid">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div class="mitigation-maturity-ring" title="Maturity Grade">
                                <svg viewBox="0 0 48 48">
                                    <circle class="bg" cx="24" cy="24" r="20"></circle>
                                    <circle class="progress" cx="24" cy="24" r="20" stroke="${progressColor}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - maturityPct}"></circle>
                                </svg>
                                <div class="percentage" style="color: ${progressColor}">${maturityPct}%</div>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 0.7rem; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">Query Coverage</span>
                                <span style="font-size: 0.8rem; color: var(--on-surface); font-weight: 600;">${coveredTechs} / ${techs.length} Techniques</span>
                            </div>
                        </div>
                        ${created ? `<div style="display: flex; flex-direction: column; gap: 0.25rem;"><span style="font-size: 0.65rem; color: var(--on-surface-tertiary); text-transform: uppercase;">Created</span><span style="font-size: 0.85rem;">${created}</span></div>` : ''}
                        ${modified ? `<div style="display: flex; flex-direction: column; gap: 0.25rem;"><span style="font-size: 0.65rem; color: var(--on-surface-tertiary); text-transform: uppercase;">Modified</span><span style="font-size: 0.85rem;">${modified}</span></div>` : ''}
                    </div>
                    
                    ${relatedGroups.length ? `
                        <div style="margin-top: 1rem;">
                            <h6 style="font-size: 0.75rem; font-weight: 700; color: var(--on-surface-tertiary); text-transform: uppercase; margin-bottom: 0.75rem;"><i class="bi bi-people"></i> Mitigates Groups</h6>
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                ${relatedGroups.map(g => {
                                    const gId = g.external_references?.[0]?.external_id || '';
                                    return `<div class="entity-chip-clickable" data-group-id="${g.id}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
                                        <span style="color: var(--primary); font-family: 'JetBrains Mono', monospace; font-weight: bold; font-size: 0.65rem;">${gId}</span>
                                        <span>${escapeHtml(g.name)}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${relatedSoftware.length ? `
                        <div style="margin-top: 1rem;">
                            <h6 style="font-size: 0.75rem; font-weight: 700; color: var(--on-surface-tertiary); text-transform: uppercase; margin-bottom: 0.75rem;"><i class="bi bi-laptop"></i> Mitigates Software</h6>
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                ${relatedSoftware.map(s => {
                                    const sId = s.external_references?.[0]?.external_id || '';
                                    return `<div class="entity-chip-clickable" data-software-id="${s.id}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
                                        <span style="color: var(--primary); font-family: 'JetBrains Mono', monospace; font-weight: bold; font-size: 0.65rem;">${sId}</span>
                                        <span>${escapeHtml(s.name)}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    modal.innerHTML = `
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content" style="border: 1px solid rgba(139, 92, 246, 0.2) !important; box-shadow: 0 5px 30px rgba(0,0,0,0.5), 0 0 25px rgba(139, 92, 246, 0.1) !important;">
                <div style="padding: 2rem 2rem 1.5rem; border-bottom: 1px solid rgba(139, 92, 246, 0.15) !important; background: rgba(139, 92, 246, 0.03) !important;">
                    <button type="button" class="btn-close" data-bs-dismiss="modal" style="position: absolute; right: 1.5rem; top: 1.5rem; filter: invert(1) opacity(0.5);"></button>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); box-shadow: 0 0 15px rgba(139, 92, 246, 0.2); display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 1.8rem;">
                            <i class="bi bi-shield-check"></i>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                ${mitIdDisplay !== 'N/A' ? `<span style="background: rgba(139, 92, 246, 0.12); color: var(--primary); font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; font-weight: bold; border-radius: 4px; padding: 2px 6px;">${escapeHtml(mitIdDisplay)}</span>` : ''}
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--on-surface-tertiary); text-transform: uppercase;">Mitigation</span>
                            </div>
                            <h3 style="margin: 0; font-size: 1.4rem; font-weight: 800; color: var(--on-surface); text-shadow: 0 0 12px rgba(139, 92, 246, 0.15);">${escapeHtml(mitigation.name)}</h3>
                        </div>
                    </div>
                </div>
                <div class="mit-modal-scroll">
                    ${overviewHtml}
                </div>
            </div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    modal.querySelectorAll('.entity-chip-clickable[data-tech-id]').forEach(chip => {
        chip.addEventListener('click', () => {
            const tId = chip.dataset.techId;
            bsModal.hide();
            if (window.showTechniqueModal) setTimeout(() => window.showTechniqueModal(tId), 300);
        });
    });
    
    modal.querySelectorAll('.entity-chip-clickable[data-group-id]').forEach(chip => {
        chip.addEventListener('click', () => {
            const gId = chip.dataset.groupId;
            bsModal.hide();
            if (window.showGroupModal) setTimeout(() => window.showGroupModal(gId), 300);
        });
    });

    modal.querySelectorAll('.entity-chip-clickable[data-software-id]').forEach(chip => {
        chip.addEventListener('click', () => {
            const sId = chip.dataset.softwareId;
            bsModal.hide();
            if (window.showSoftwareModal) setTimeout(() => window.showSoftwareModal(sId), 300);
        });
    });
}

document.getElementById('mitigations-search-input')?.addEventListener('input', renderMitigationsView);

// Legacy Window Bindings
window.mitigationsSortBy = mitigationsSortBy;
window.mitigationsSortDir = mitigationsSortDir;
window.mitigationsViewMode = mitigationsViewMode;
window.mitigationsStatusFilter = mitigationsStatusFilter;
window.getMitigationTechniques = getMitigationTechniques;
window.getMitigationStatus = getMitigationStatus;
window.setMitigationStatus = setMitigationStatus;
window.sortMitigations = sortMitigations;
window.renderMitigationsView = renderMitigationsView;
window.bindMitigationsToolbar = bindMitigationsToolbar;
window.bindMitigationCardActions = bindMitigationCardActions;
window.showMitigationModal = showMitigationModal;
