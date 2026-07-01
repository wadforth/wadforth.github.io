import { debounce } from '../utils/performance.js';

export let mitigationsSortBy = 'name';
export let mitigationsSortDir = 'asc';
export let mitigationsViewMode = 'grid';
export let mitigationsStatusFilter = 'all';
export let selectedMitigationId = null;

function getAlphaSectionLabel(name) {
    const first = String(name || '').trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : '#';
}

export function getMitigationTechniques(mitigationId) {
    const mit = state.mitigationsByStixId?.get(mitigationId) || state.mitigations.find(m => m.id === mitigationId);
    if (!mit) return [];
    return (state.relationshipsBySource?.get(mit.id) || [])
        .filter(r => r.relationship_type === 'mitigates')
        .map(r => {
            const tech = state.techniquesByStixId?.get(r.target_ref);
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

function renderCoverageRuler(techniques) {
    const blocks = techniques.slice(0, 12).map(tech => {
        const tid = tech.external_references?.[0]?.external_id || '';
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        const hasQuery = ann?.queries && ann.queries.length > 0;
        return `<span class="${hasQuery ? 'on' : 'gap'}" title="${tid}: ${escapeHtml(tech.name)} (${hasQuery ? 'covered' : 'gap'})"></span>`;
    }).join('');
    const filler = Array.from({ length: Math.max(0, 12 - techniques.length) })
        .map(() => '<span title="No mapped technique"></span>')
        .join('');
    return `<div class="mitigation-coverage-ruler" aria-label="Coverage ruler">${blocks}${filler}</div>`;
}

function getMitigationExternalId(mitigation) {
    return mitigation?.external_references?.[0]?.external_id || '';
}

function getMitigationCoverage(mitigation) {
    const techniques = getMitigationTechniques(mitigation.id);
    const covered = techniques.filter(t => {
        const tid = t.external_references?.[0]?.external_id || '';
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        return ann?.queries?.length > 0;
    });
    return {
        techniques,
        covered,
        gaps: techniques.filter(t => !covered.includes(t)),
        coveredCount: covered.length,
        gapCount: Math.max(0, techniques.length - covered.length),
        coveragePct: techniques.length ? Math.round((covered.length / techniques.length) * 100) : 0
    };
}

function getMitigationStatusMeta(status) {
    if (status === 'implemented') return { label: 'Implemented', icon: 'bi-check-circle-fill', className: 'implemented' };
    if (status === 'planned') return { label: 'Planned', icon: 'bi-clock-history', className: 'planned' };
    return { label: 'Untracked', icon: 'bi-circle', className: 'none' };
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
                const coverageFor = (mitigation) => {
                    const techs = getMitigationTechniques(mitigation.id);
                    if (techs.length === 0) return -1;
                    const covered = techs.filter(t => {
                        const tid = t.external_references?.[0]?.external_id || '';
                        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
                        return ann?.queries && ann.queries.length > 0;
                    }).length;
                    return covered / techs.length;
                };
                return (coverageFor(b) - coverageFor(a)) * dir;
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
            const tacticNames = techs.flatMap(t => t.kill_chain_phases || []).map(p => p.phase_name || '').join(' ').toLowerCase();
            const platforms = techs.flatMap(t => t.x_mitre_platforms || []).join(' ').toLowerCase();
            return m.name.toLowerCase().includes(query) ||
                (m.description || '').toLowerCase().includes(query) ||
                (m.external_references?.[0]?.external_id || '').toLowerCase().includes(query) ||
                techNames.includes(query) ||
                techIds.includes(query) ||
                tacticNames.includes(query) ||
                platforms.includes(query);
        });
    }
    
    mitigations = sortMitigations(mitigations);
    
    const totalTechniques = mitigations.reduce((sum, m) => sum + getMitigationTechniques(m.id).length, 0);
    const mappedMitigations = mitigations.filter(m => getMitigationTechniques(m.id).length > 0).length;
    const coveredTechniqueLinks = mitigations.reduce((sum, m) => sum + getMitigationTechniques(m.id).filter(t => {
        const tid = t.external_references?.[0]?.external_id || '';
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        return ann?.queries && ann.queries.length > 0;
    }).length, 0);
    const uncoveredTechniqueLinks = Math.max(0, totalTechniques - coveredTechniqueLinks);
    
    document.getElementById('mitigations-subtitle').textContent = `${mitigations.length} defensive controls mapped to ${totalTechniques} technique links, ${uncoveredTechniqueLinks} open detection gaps`;

    controlsContainer.innerHTML = `
        <div class="mitigations-filter-row">
            <div class="mitigations-sort-group">
                <label class="mitigations-sort-label" for="mitigations-sort-select">Sort</label>
                <select class="mitigations-sort-select" id="mitigations-sort-select">
                    <option value="name" ${mitigationsSortBy === 'name' ? 'selected' : ''}>Name</option>
                    <option value="id" ${mitigationsSortBy === 'id' ? 'selected' : ''}>ID</option>
                    <option value="techniques" ${mitigationsSortBy === 'techniques' ? 'selected' : ''}>Technique links</option>
                    <option value="status" ${mitigationsSortBy === 'status' ? 'selected' : ''}>Detection coverage</option>
                </select>
                <button class="btn btn-sm btn-ghost mitigations-sort-dir" id="mitigations-sort-dir" title="Toggle sort direction"><i class="bi bi-sort-${mitigationsSortDir === 'asc' ? 'up' : 'down'}"></i></button>
            </div>
            <div class="mitigation-status-filters" aria-label="Mitigation status filters">
                ${renderMitigationFilterButton('all', 'Status: any')}
                ${renderMitigationFilterButton('implemented', 'Implemented')}
                ${renderMitigationFilterButton('planned', 'Planned')}
                ${renderMitigationFilterButton('none', 'Untracked')}
            </div>
        </div>
    `;
    
    if (mitigations.length === 0) {
        container.className = 'mitigation-control-workbench';
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-shield-check"></i>
                <p>${query || mitigationsStatusFilter !== 'all' ? 'No mitigations match your filters.' : 'No mitigations loaded.'}</p>
            </div>
        `;
        bindMitigationsToolbar();
        return;
    }
    
    if (!selectedMitigationId || !mitigations.some(m => m.id === selectedMitigationId)) {
        selectedMitigationId = mitigations[0]?.id || null;
    }

    const selected = mitigations.find(m => m.id === selectedMitigationId) || mitigations[0];
    container.className = 'mitigation-control-workbench';
    container.innerHTML = `
        <main class="mitigation-controls-panel" aria-label="Mitigation controls">
            <div class="mitigation-panel-head"><strong>Controls</strong><span class="mitigation-chip">${mitigations.length} shown</span></div>
            <div class="mitigation-card-grid">
                ${renderMitigationCards(mitigations, selected?.id)}
            </div>
        </main>
        <aside class="mitigation-side-stack" aria-label="Selected mitigation">
            ${renderMitigationInspector(selected)}
            ${renderMitigationNextWork(selected)}
        </aside>
    `;
    bindMitigationsToolbar();
    bindMitigationCardActions();
}

function renderMitigationFilterButton(value, label) {
    return `<button type="button" class="mitigation-filter-chip ${mitigationsStatusFilter === value ? 'active' : ''}" data-mit-filter="${value}">${escapeHtml(label)}</button>`;
}

function renderMitigationCards(mitigations, selectedId) {
    return mitigations.map((m, index) => {
        const sectionLabel = getAlphaSectionLabel(m.name);
        const previousLabel = index > 0 ? getAlphaSectionLabel(mitigations[index - 1].name) : '';
        const sectionHeader = mitigationsSortBy === 'name' && sectionLabel !== previousLabel
            ? `<div class="mitigation-az-section"><span>${sectionLabel}</span></div>`
            : '';
        return sectionHeader + renderMitigationCard(m, selectedId);
    }).join('');
}

function renderMitigationCard(mitigation, selectedId) {
    const mitId = getMitigationExternalId(mitigation);
    const coverage = getMitigationCoverage(mitigation);
    const hasMappedTechniques = coverage.techniques.length > 0;
    const status = getMitigationStatus(mitigation.id);
    const statusMeta = getMitigationStatusMeta(status);
    const isNew = state.changelogDiff?.added?.mitigations?.has(mitId);
    const newBadge = isNew ? '<span class="mitigation-new-badge">NEW</span>' : '';
    return `
        <article class="mitigation-control-card ${!hasMappedTechniques ? 'mitigation-no-mapping' : ''} ${selectedId === mitigation.id ? 'selected' : ''}" data-mit="${escapeHtml(mitigation.id)}" data-status="${status}" tabindex="0" role="button" aria-label="Select mitigation ${escapeHtml(mitigation.name)}">
            <div class="mitigation-card-topline">
                <span class="mitigation-id-badge">${escapeHtml(mitId || 'N/A')}</span>
                <button class="mit-status-toggle ${statusMeta.className}" data-mit="${escapeHtml(mitigation.id)}" title="Cycle implementation status" aria-label="Cycle implementation status for ${escapeHtml(mitigation.name)}"><i class="bi ${statusMeta.icon}"></i><span class="mit-status-label">${statusMeta.label}</span></button>
            </div>
            <h4>${escapeHtml(mitigation.name)}${newBadge}</h4>
            <p>${escapeHtml(truncateDescription(mitigation.description || 'No description available.', 150))}</p>
            ${renderCoverageRuler(coverage.techniques)}
            <div class="mitigation-card-foot"><span>${coverage.techniques.length} mapped techniques</span><strong>${hasMappedTechniques ? `${coverage.coveragePct}% covered` : 'ATT&CK data not mapped'}</strong></div>
            ${!hasMappedTechniques ? '<div class="mitigation-data-note"><i class="bi bi-info-circle"></i> ATT&amp;CK relationship data does not list mapped techniques for this mitigation.</div>' : ''}
        </article>
    `;
}

function renderMitigationInspector(mitigation) {
    if (!mitigation) return `<section class="mitigation-inspector-panel"><div class="mitigation-panel-head"><strong>Selected control</strong></div><div class="mitigation-panel-body"><p class="mitigation-empty-copy">No matching control selected.</p></div></section>`;
    const coverage = getMitigationCoverage(mitigation);
    const status = getMitigationStatus(mitigation.id);
    const statusMeta = getMitigationStatusMeta(status);
    const mitId = getMitigationExternalId(mitigation);
    const modified = mitigation.modified ? new Date(mitigation.modified).toLocaleDateString('en-GB') : 'not recorded';
    const hasMappedTechniques = coverage.techniques.length > 0;
    return `
        <section class="mitigation-inspector-panel">
            <div class="mitigation-panel-head"><strong>Selected control</strong><span class="mitigation-status-pill ${statusMeta.className}">${statusMeta.label}</span></div>
            <div class="mitigation-panel-body">
                <span class="mitigation-id-badge">${escapeHtml(mitId || 'N/A')}</span>
                <h3>${escapeHtml(mitigation.name)}</h3>
                <p>${escapeHtml(truncateDescription(mitigation.description || 'No description available.', 220))}</p>
                <div class="mitigation-kv"><span>Implementation status</span><strong>${statusMeta.label}</strong></div>
                <div class="mitigation-kv"><span>Mapped detections</span><strong>${hasMappedTechniques ? coverage.coveredCount : 'N/A'}</strong></div>
                <div class="mitigation-kv"><span>Open detection gaps</span><strong class="mitigation-gap-value">${hasMappedTechniques ? coverage.gapCount : 'N/A'}</strong></div>
                <div class="mitigation-kv"><span>Mapped techniques</span><strong>${coverage.techniques.length}</strong></div>
                <div class="mitigation-kv"><span>ATT&CK modified</span><strong>${escapeHtml(modified)}</strong></div>
                ${hasMappedTechniques ? `<div class="mitigation-coverage-bar"><span style="width:${coverage.coveragePct}%"></span></div>` : '<div class="mitigation-data-note inspector"><i class="bi bi-info-circle"></i> This ATT&amp;CK mitigation entry does not include technique relationship mappings in the loaded dataset, so coverage cannot be calculated from this control alone.</div>'}
                <div class="mitigation-inspector-actions">
                    <button class="btn btn-primary btn-open-mitigation-detail" data-mit="${escapeHtml(mitigation.id)}">Open full details</button>
                </div>
            </div>
        </section>
    `;
}

function renderMitigationNextWork(mitigation) {
    if (!mitigation) return '';
    const coverage = getMitigationCoverage(mitigation);
    const status = getMitigationStatus(mitigation.id);
    const gapItems = coverage.gaps.slice(0, 2).map(t => {
        const tid = t.external_references?.[0]?.external_id || '';
        return `Map or attach detection coverage for ${tid} ${t.name}`;
    });
    const items = [
        ...gapItems,
        status === 'none' ? 'Set implementation status if this control is owned internally' : '',
        coverage.techniques.length ? 'Review linked techniques in full details for control validation' : 'Treat as unmapped ATT&CK source data rather than a detection coverage failure'
    ].filter(Boolean).slice(0, 3);
    return `
        <section class="mitigation-inspector-panel">
            <div class="mitigation-panel-head"><strong>Recommended next work</strong></div>
            <div class="mitigation-panel-body">
                <div class="mitigation-next-list">
                    ${items.map((item, index) => `<div><code>${index + 1}</code><span>${escapeHtml(item)}</span></div>`).join('')}
                </div>
            </div>
        </section>
    `;
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
        btn.addEventListener('keydown', (event) => {
            if (event.target !== btn) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const mitId = btn.dataset.mit;
            if (mitId) showMitigationModal(mitId);
        });
    });

    document.querySelectorAll('.mitigation-control-card').forEach(card => {
        const select = () => {
            selectedMitigationId = card.dataset.mit;
            renderMitigationsView();
        };
        card.addEventListener('click', select);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            select();
        });
    });

    document.querySelectorAll('.btn-open-mitigation-detail').forEach(btn => {
        btn.addEventListener('click', () => showMitigationModal(btn.dataset.mit));
    });
}

export function showMitigationModal(mitigationId) {
    const mitigation = state.mitigations.find(m => m.id === mitigationId);
    if (!mitigation) return;
    
    const mitIdDisplay = mitigation.external_references?.[0]?.external_id || 'N/A';
    const status = getMitigationStatus(mitigation.id);
    const statusMeta = getMitigationStatusMeta(status);
    const statusIcon = statusMeta.icon;
    const statusLabel = statusMeta.label;
    const techs = getMitigationTechniques(mitigation.id);
    
    const coveredTechs = techs.filter(t => {
        const tid = t.external_references?.[0]?.external_id || '';
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        return ann?.queries && ann.queries.length > 0;
    }).length;
    const maturityPct = techs.length > 0 ? Math.round((coveredTechs / techs.length) * 100) : 0;
    const progressColor = maturityPct >= 70 ? '#10b981' : maturityPct >= 40 ? '#f59e0b' : '#584cf4';
    const unmappedNotice = techs.length === 0 ? '<div class="mitigation-data-note modal-note"><i class="bi bi-info-circle"></i> The loaded ATT&amp;CK data does not include technique relationships for this mitigation. This is source-data absence, not proof that the control has no defensive relevance.</div>' : '';

    let relatedGroupsMap = new Map();
    let relatedSoftwareMap = new Map();
    
    techs.forEach(t => {
        (state.relationshipsByTarget?.get(t.id) || []).filter(r => r.relationship_type === 'uses').forEach(r => {
            if (r.source_ref.startsWith('intrusion-set--')) {
                const group = state.groupsByStixId?.get(r.source_ref);
                if (group) relatedGroupsMap.set(group.id, group);
            } else if (r.source_ref.startsWith('malware--') || r.source_ref.startsWith('tool--')) {
                const sw = state.softwareByStixId?.get(r.source_ref);
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
                    ${unmappedNotice}
                    
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
                    <div class="mitigation-maturity-ring" title="Query coverage">
                                <svg viewBox="0 0 48 48">
                                    <circle class="bg" cx="24" cy="24" r="20"></circle>
                                    <circle class="progress" cx="24" cy="24" r="20" stroke="${progressColor}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - maturityPct}"></circle>
                                </svg>
                                <div class="percentage" style="color: ${progressColor}">${maturityPct}%</div>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 0.7rem; font-weight: 700; color: var(--on-surface-secondary); text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">Query Coverage</span>
                                <span style="font-size: 0.8rem; color: var(--on-surface); font-weight: 600;">${techs.length ? `${coveredTechs} / ${techs.length} Techniques` : 'No technique mappings in ATT&CK data'}</span>
                                <span class="mitigation-detail-status ${status}"><i class="bi ${statusIcon}"></i> ${statusLabel}</span>
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
                                    return `<div class="entity-chip-clickable" data-software-id="${escapeHtml(sId)}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem;">
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

document.getElementById('mitigations-search-input')?.addEventListener('input', debounce(renderMitigationsView, 250));

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
