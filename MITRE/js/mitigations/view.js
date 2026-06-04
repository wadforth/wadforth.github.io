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
        
        // Pre-calculate real-time query coverage maturity grade for the mitigation
        const coveredTechs = techs.filter(t => {
            const tid = t.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        const maturityPct = techs.length > 0 ? Math.round((coveredTechs / techs.length) * 100) : 0;
        const progressColor = maturityPct >= 70 ? '#10b981' : maturityPct >= 40 ? '#f59e0b' : '#584cf4';
        
        const maturityBarHtml = techs.length > 0 ? `
            <div class="mitigation-maturity-bar" style="margin-top: 0.65rem; display: flex; align-items: center; gap: 0.5rem; background: rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.02);">
                <div style="font-size: 0.62rem; color: var(--on-surface-tertiary); font-weight: 700; min-width: 90px; text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">Maturity Grade:</div>
                <div style="flex: 1; height: 5px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${maturityPct}%; background: ${progressColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 0.65rem; font-weight: 700; color: ${progressColor}; min-width: 30px; text-align: right; font-family: 'JetBrains Mono', monospace;">${maturityPct}%</div>
            </div>
        ` : '';
        
        if (mitigationsViewMode === 'list') {
            const listMaturityBar = techs.length > 0 ? `
                <div style="display: flex; align-items: center; gap: 0.35rem; width: 110px; flex-shrink: 0; background: rgba(0,0,0,0.15); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.02);">
                    <div style="flex: 1; height: 4px; background: rgba(255,255,255,0.04); border-radius: 2px; overflow: hidden;">
                        <div style="height: 100%; width: ${maturityPct}%; background: ${progressColor}; border-radius: 2px;"></div>
                    </div>
                    <span style="font-size: 0.62rem; font-weight: 700; color: ${progressColor}; font-family: 'JetBrains Mono', monospace;">${maturityPct}%</span>
                </div>
            ` : `<div style="width: 110px; flex-shrink: 0; font-size: 0.62rem; color: var(--on-surface-tertiary); font-style: italic;">No techniques</div>`;

            return `
                <div class="mitigation-card mitigation-card-list" data-mit-id="${m.id}" data-status="${status}">
                    <div class="mitigation-list-row" style="display: grid !important; grid-template-columns: 28px minmax(200px, 2.5fr) minmax(130px, 1.2fr) 110px minmax(150px, 1.5fr) 20px !important; align-items: center; gap: 1rem !important; width: 100%;">
                        <button class="btn btn-sm mit-status-toggle ${status}" data-mit="${m.id}" title="Toggle status" style="flex-shrink: 0;">
                            <i class="bi ${status === 'implemented' ? 'bi-check-circle-fill' : status === 'planned' ? 'bi-clock-fill' : 'bi-circle'}"></i>
                        </button>
                        <div class="mitigation-list-info" style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
                            <span class="mitigation-list-name" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.name)}</span>
                            <span class="mitigation-list-id" style="background: rgba(139, 92, 246, 0.12); color: var(--primary); font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; border-radius: 4px; padding: 2px 6px; flex-shrink: 0;">${mitId}</span>
                        </div>
                        <span class="mitigation-tech-count" style="font-size: 0.72rem; font-weight: 600; white-space: nowrap;">${techs.length} technique${techs.length === 1 ? '' : 's'}</span>
                        ${listMaturityBar}
                        <div class="mitigation-list-techs" style="display: flex; align-items: center; gap: 0.25rem; overflow: hidden;">
                            ${techs.length === 0 ? '<span class="mitigation-no-techs" style="font-size: 0.68rem; color: var(--on-surface-tertiary); display: inline-flex; align-items: center; gap: 4px;"><i class="bi bi-exclamation-triangle"></i> No mappings</span>' : ''}
                            ${techs.slice(0, 3).map(t => {
                                const tid = t.external_references?.[0]?.external_id || '';
                                return `<span class="mitigation-tech-tag clickable" data-tech-id="${tid}" style="font-size: 0.65rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--on-surface-secondary); font-family: 'JetBrains Mono', monospace;">${tid}</span>`;
                            }).join('')}
                            ${techs.length > 3 ? `<span class="mitigation-tech-more" style="font-size: 0.65rem; color: var(--on-surface-tertiary); font-weight: 600;">+${techs.length - 3}</span>` : ''}
                        </div>
                        <button class="btn btn-sm btn-ghost mit-expand-btn" data-mit="${m.id}" title="Expand details" style="justify-self: end;">
                            <i class="bi bi-chevron-down"></i>
                        </button>
                    </div>
                    <div class="mitigation-list-details hidden" data-mit-details="${m.id}">
                        <div class="mitigation-list-desc" style="padding: 1rem 0 0.5rem; border-top: 1px solid rgba(255,255,255,0.04); font-size: 0.8rem; line-height: 1.6; color: var(--on-surface-secondary);">${parseDescription(desc)}</div>
                        <div class="mitigation-list-all-techs" style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem;">
                            ${techs.map(t => {
                                const tid = t.external_references?.[0]?.external_id || '';
                                return `<span class="mitigation-tech-tag clickable" data-tech-id="${tid}" style="font-size: 0.68rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 3px 8px; border-radius: var(--radius-sm); font-family: 'JetBrains Mono', monospace; color: var(--primary); font-weight: 600;">${tid} <span style="font-family: var(--font-sans); color: var(--on-surface-secondary); font-weight: 500; margin-left: 2px;">${escapeHtml(t.name)}</span></span>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="mitigation-card" data-mit-id="${m.id}" data-status="${status}">
                <div class="mitigation-card-header">
                    <div class="mitigation-card-header-left">
                        <span class="mitigation-id-badge" style="background: rgba(139, 92, 246, 0.12); color: var(--primary); font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; border-radius: 4px; padding: 2px 6px;">${mitId}</span>
                        <h6 class="mitigation-card-title" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</h6>
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
                            return `<span class="mitigation-tech-tag clickable" data-tech-id="${tid}" style="font-size: 0.65rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--on-surface-secondary); font-family: 'JetBrains Mono', monospace;">${tid}</span>`;
                        }).join('')}
                        ${techs.length > 5 ? `<span class="mitigation-tech-more" style="font-size: 0.65rem; color: var(--on-surface-tertiary); font-weight: 600; line-height: 1.8;">+${techs.length - 5} more</span>` : ''}
                    </div>
                </div>
                ${maturityBarHtml}
                <div style="border-top: 1px solid rgba(255,255,255,0.04); margin-top: 0.75rem; padding-top: 0.5rem; display: flex; justify-content: flex-end;">
                    <button class="btn btn-sm btn-ghost mit-expand-btn" data-mit="${m.id}" style="color: var(--primary); font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: 4px;">
                        <i class="bi bi-chevron-down"></i> <span>View details</span>
                    </button>
                </div>
                <div class="mitigation-card-details hidden" data-mit-details="${m.id}" style="margin-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 0.75rem;">
                    <div class="mitigation-card-full-desc" style="font-size: 0.8rem; line-height: 1.6; color: var(--on-surface-secondary); margin-bottom: 0.75rem;">${parseDescription(desc)}</div>
                    ${techs.length ? `
                        <div class="mitigation-card-all-techs">
                            <h6 class="mitigation-detail-section-title" style="font-size: 0.7rem; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace; margin-bottom: 0.5rem;"><i class="bi bi-grid"></i> Mitigated Techniques</h6>
                            <div class="mitigation-tech-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.35rem;">
                                ${techs.map(t => {
                                    const tid = t.external_references?.[0]?.external_id || '';
                                    return `<div class="mitigation-tech-item clickable" data-tech-id="${tid}" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-sm); padding: 0.4rem; cursor: pointer; transition: var(--transition);">
                                        <span class="mitigation-tech-item-id" style="display: block; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; color: var(--primary);">${tid}</span>
                                        <span class="mitigation-tech-item-name" style="display: block; font-size: 0.62rem; color: var(--on-surface-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">${escapeHtml(t.name)}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
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
    
    document.querySelectorAll('.mitigation-card:not(.mitigation-card-list) .mit-expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.mitigation-card');
            const details = card ? card.querySelector('.mitigation-card-details') : null;
            if (details) {
                details.classList.toggle('hidden');
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.classList.toggle('bi-chevron-down');
                    icon.classList.toggle('bi-chevron-up');
                }
                const textSpan = btn.querySelector('span');
                if (textSpan) {
                    textSpan.textContent = details.classList.contains('hidden') ? 'View details' : 'Hide details';
                }
            }
        });
    });
    
    document.querySelectorAll('.mitigation-card-list .mit-expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.mitigation-card-list');
            const details = card ? card.querySelector('.mitigation-list-details') : null;
            if (details) {
                details.classList.toggle('hidden');
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.classList.toggle('bi-chevron-down');
                    icon.classList.toggle('bi-chevron-up');
                }
            }
        });
    });
    
    document.querySelectorAll('.mitigation-tech-tag.clickable, .mitigation-tech-item').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            const techId = tag.dataset.techId;
            if (techId) showTechniqueModal(techId);
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
