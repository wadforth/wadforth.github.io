export let groupsSortBy = 'name';
export let groupsSortDir = 'asc';
export let groupsViewMode = 'grid';



export function getGroupTechniqueCount(groupId) {
    return state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === groupId).length;
}

export function getGroupSoftwareCount(groupId) {
    const techIds = new Set(
        state.relationships
            .filter(r => r.relationship_type === 'uses' && r.source_ref === groupId)
            .map(r => r.target_ref)
    );
    return state.software.filter(s =>
        state.relationships.some(r => r.relationship_type === 'uses' && r.source_ref === s.id && techIds.has(r.target_ref))
    ).length;
}

export function getGroupDomains(group) {
    return group.x_mitre_domains || [];
}

export function sortGroups(groups) {
    const dir = groupsSortDir === 'asc' ? 1 : -1;
    return [...groups].sort((a, b) => {
        let valA, valB;
        switch (groupsSortBy) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'id':
                valA = a.external_references?.[0]?.external_id || '';
                valB = b.external_references?.[0]?.external_id || '';
                return valA.localeCompare(valB, undefined, { numeric: true }) * dir;
            case 'techniques':
                return (getGroupTechniqueCount(b.id) - getGroupTechniqueCount(a.id)) * dir;
            case 'modified':
                valA = a.modified || a.created || '';
                valB = b.modified || b.created || '';
                return valA < valB ? -dir : valA > valB ? dir : 0;
            default:
                return 0;
        }
    });
}

export function renderGroupsView() {
    const container = document.getElementById('groups-list');
    const controlsContainer = document.getElementById('groups-controls');
    const searchInput = document.getElementById('groups-search-input');
    
    if (!controlsContainer) return;
    
    const query = (searchInput?.value || '').toLowerCase().trim();
    
    let groups = [...state.groups];
    
    if (query) {
        groups = groups.filter(g =>
            g.name.toLowerCase().includes(query) ||
            (g.description || '').toLowerCase().includes(query) ||
            (g.external_references?.[0]?.external_id || '').toLowerCase().includes(query) ||
            (g.aliases || []).some(a => a.toLowerCase().includes(query)) ||
            (g.x_mitre_aliases || []).some(a => a.toLowerCase().includes(query))
        );
    }
    
    groups = sortGroups(groups);
    
    const totalTechniques = groups.reduce((sum, g) => sum + getGroupTechniqueCount(g.id), 0);
    const avgTechniques = groups.length ? Math.round(totalTechniques / groups.length) : 0;
    const maxTechniques = groups.length ? Math.max(...groups.map(g => getGroupTechniqueCount(g.id))) : 0;
    
    const statsHtml = `
        <div class="groups-stats-bar">
            <div class="groups-stat">
                <span class="groups-stat-value">${groups.length}</span>
                <span class="groups-stat-label">Groups</span>
            </div>
            <div class="groups-stat">
                <span class="groups-stat-value">${totalTechniques}</span>
                <span class="groups-stat-label">Technique Links</span>
            </div>
            <div class="groups-stat">
                <span class="groups-stat-value">${avgTechniques}</span>
                <span class="groups-stat-label">Avg Techniques</span>
            </div>
            <div class="groups-stat">
                <span class="groups-stat-value">${maxTechniques}</span>
                <span class="groups-stat-label">Max Techniques</span>
            </div>
        </div>
    `;
    
    const toolbarHtml = `
        <div class="groups-toolbar">
            <div class="groups-toolbar-left">
                <div class="groups-sort-group">
                    <label class="groups-sort-label">Sort:</label>
                    <select class="groups-sort-select" id="groups-sort-select">
                        <option value="name" ${groupsSortBy === 'name' ? 'selected' : ''}>Name</option>
                        <option value="id" ${groupsSortBy === 'id' ? 'selected' : ''}>ID</option>
                        <option value="techniques" ${groupsSortBy === 'techniques' ? 'selected' : ''}>Techniques</option>
                        <option value="modified" ${groupsSortBy === 'modified' ? 'selected' : ''}>Modified</option>
                    </select>
                    <button class="btn btn-sm btn-ghost groups-sort-dir" id="groups-sort-dir" title="Toggle sort direction">
                        <i class="bi bi-sort-${groupsSortDir === 'asc' ? 'up' : 'down'}"></i>
                    </button>
                </div>
            </div>
            <div class="groups-toolbar-right">
                <div class="btn-group btn-group-sm">
                    <button class="btn ${groupsViewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}" id="groups-view-grid" title="Grid view">
                        <i class="bi bi-grid-3x3-gap"></i>
                    </button>
                    <button class="btn ${groupsViewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}" id="groups-view-list" title="List view">
                        <i class="bi bi-list-ul"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    controlsContainer.innerHTML = statsHtml + toolbarHtml;
    
    if (groups.length === 0) {
        container.className = 'groups-grid';
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-people"></i>
                <p>${query ? 'No groups match your search.' : 'No adversary groups loaded.'}</p>
            </div>
        `;
        bindGroupsToolbar();
        return;
    }
    
    container.className = groupsViewMode === 'grid' ? 'groups-grid' : 'groups-list-view';
    
    const cardsHtml = groups.map(g => {
        const groupId = g.external_references?.[0]?.external_id || '';
        const techCount = getGroupTechniqueCount(g.id);
        const desc = g.description || '';
        const truncatedDesc = truncateDescription(desc, 140);
        const domains = getGroupDomains(g);
        const aliases = (g.x_mitre_aliases || g.aliases || []).slice(0, 2);
        
        const theme = getAttributionTheme(g);
        const themeClass = `group-theme-${theme.id}`;
        const avatarSvg = getProceduralAvatarSVG(g.id, g.name);
        
        const isNew = state.changelogDiff?.added?.groups?.has(groupId);
        const newBadge = isNew ? `<span class="badge bg-success text-xxs shadow-sm" style="font-size: 0.55rem; padding: 2px 4px; margin-left: 4px; vertical-align: middle;">NEW</span>` : '';

        // Retrieve techniques related to this group
        const groupTechniques = state.relationships
            .filter(r => r.relationship_type === 'uses' && r.source_ref === g.id)
            .map(r => state.techniques.find(t => t.id === r.target_ref))
            .filter(Boolean);
            
        // Build 12-block tactical sparkline indicators representing covered/gap status
        const sparklineBlocks = groupTechniques.slice(0, 12).map(tech => {
            const tid = tech.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
            const hasQuery = ann?.queries && ann.queries.length > 0;
            return `<div class="group-spark-block ${hasQuery ? 'covered' : 'uncovered'}" title="${tid}: ${escapeHtml(tech.name)} (${hasQuery ? 'Covered' : 'Gap Blindspot'})"></div>`;
        }).join('');
        
        const fillerCount = Math.max(0, 12 - groupTechniques.length);
        const sparklineFiller = Array.from({ length: fillerCount }).map(() => {
            return `<div class="group-spark-block" style="background: rgba(255,255,255,0.02); cursor: default;" title="No Technique link"></div>`;
        }).join('');
        
        const sparklineHtml = `<div class="group-sparkline" title="Defensive Sparkline Preview (Covered vs Gaps)">
            ${sparklineBlocks}
            ${sparklineFiller}
        </div>`;
        
        if (groupsViewMode === 'list') {
            return `
                <div class="group-card group-card-list group-card-glass ${themeClass}" data-group-id="${g.id}" style="cursor: pointer;">
                    <div class="group-list-row">
                        <div class="group-avatar-container" style="width: 26px; height: 26px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: none; padding: 0;">
                            ${avatarSvg}
                        </div>
                        <div class="group-list-info">
                            <span class="group-list-name" style="font-weight: 700;">${escapeHtml(g.name)} <i class="bi bi-terminal-fill hacker-glow-icon" title="Threat Actor Group" style="font-size: 0.7rem; margin-left: 2px; color: ${theme.accentHex}; text-shadow: 0 0 6px rgba(${theme.accentRGB}, 0.8);"></i>${newBadge}</span>
                            <span class="group-list-id" style="background: rgba(${theme.accentRGB}, 0.1); color: ${theme.accentHex}; font-family: 'JetBrains Mono', monospace; border-radius: 4px; font-weight: bold; font-size: 0.65rem; padding: 2px 6px;">${groupId}</span>
                            <span class="${theme.badgeClass}" style="transform: scale(0.9); transform-origin: left center; margin-left: 4px;"><i class="bi ${theme.icon} mr-1"></i>${theme.name}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 170px;">
                            <span class="group-tech-count" style="font-weight: 600; font-size: 0.72rem; min-width: 65px; margin: 0; white-space: nowrap;">${techCount} tech${techCount === 1 ? '' : 's'}</span>
                            ${sparklineHtml}
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.25rem; overflow: hidden;">
                            ${domains.length ? `<span class="group-domain-badge" style="margin: 0; font-size: 0.68rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><i class="bi bi-globe mr-1"></i>${escapeHtml(domains[0])}</span>` : `<span class="text-on-surface-tertiary text-xs">—</span>`}
                        </div>
                        <i class="bi bi-chevron-right group-list-arrow" style="color: ${theme.accentHex}; font-size: 0.85rem; justify-self: end;"></i>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="group-card group-card-glass ${themeClass}" data-group-id="${g.id}" style="cursor: pointer;">
                <div class="group-card-avatar-row" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem;">
                    <div class="group-avatar-container" style="width: 42px; height: 42px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: none; padding: 0;">
                        ${avatarSvg}
                    </div>
                    <div class="group-card-header-left" style="display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span class="group-id-badge" style="background: rgba(${theme.accentRGB}, 0.12); color: ${theme.accentHex}; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: bold; border-radius: 4px; padding: 2px 6px;">${groupId}</span>
                            <span class="${theme.badgeClass}"><i class="bi ${theme.icon} mr-1"></i>${theme.name}</span>
                        </div>
                        <h6 class="group-card-title" style="margin: 0; font-size: 0.88rem; font-weight: 700; color: var(--on-surface); display: flex; align-items: center; gap: 4px;">
                            ${escapeHtml(g.name)}
                            <i class="bi bi-terminal-fill hacker-glow-icon" title="Threat Actor Group" style="color: ${theme.accentHex}; text-shadow: 0 0 8px rgba(${theme.accentRGB}, 0.8); margin: 0; font-size: 0.8rem; vertical-align: middle;"></i>${newBadge}
                        </h6>
                    </div>
                    <span class="group-tech-badge" style="background: rgba(${theme.accentRGB}, 0.08); color: ${theme.accentHex}; border: 1px solid rgba(${theme.accentRGB}, 0.15); border-radius: 6px; font-weight: 800; font-size: 0.75rem; padding: 3px 7px;">${techCount}</span>
                </div>
                ${aliases.length ? `
                    <div class="group-aliases">
                        ${aliases.map(a => `<span class="group-alias-tag">${escapeHtml(a)}</span>`).join('')}
                    </div>
                ` : ''}
                <p class="group-card-desc">${escapeHtml(truncatedDesc)}</p>
                ${sparklineHtml}
                <div class="group-card-footer" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 0.6rem;">
                    ${domains.length ? `<span class="group-domain-badge"><i class="bi bi-globe"></i> ${escapeHtml(domains.join(', '))}</span>` : ''}
                    <span class="group-card-link" style="color: ${theme.accentHex};"><i class="bi bi-arrow-right"></i> View details</span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = cardsHtml;
    bindGroupsToolbar();
    bindGroupCardActions();
}

export function bindGroupsToolbar() {
    const sortSelect = document.getElementById('groups-sort-select');
    const sortDir = document.getElementById('groups-sort-dir');
    const viewGrid = document.getElementById('groups-view-grid');
    const viewList = document.getElementById('groups-view-list');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            groupsSortBy = e.target.value;
            renderGroupsView();
        });
    }
    
    if (sortDir) {
        sortDir.addEventListener('click', () => {
            groupsSortDir = groupsSortDir === 'asc' ? 'desc' : 'asc';
            renderGroupsView();
        });
    }
    
    if (viewGrid) {
        viewGrid.addEventListener('click', () => {
            groupsViewMode = 'grid';
            renderGroupsView();
        });
    }
    
    if (viewList) {
        viewList.addEventListener('click', () => {
            groupsViewMode = 'list';
            renderGroupsView();
        });
    }
}

export function bindGroupCardActions() {
    document.querySelectorAll('.group-card').forEach(card => {
        card.addEventListener('click', () => {
            showGroupModal(card.dataset.groupId);
        });
    });
}

document.getElementById('groups-search-input')?.addEventListener('input', renderGroupsView);

// Legacy Window Bindings
window.groupsSortBy = groupsSortBy;
window.groupsSortDir = groupsSortDir;
window.groupsViewMode = groupsViewMode;
window.getGroupTechniqueCount = getGroupTechniqueCount;
window.getGroupSoftwareCount = getGroupSoftwareCount;
window.getGroupDomains = getGroupDomains;
window.sortGroups = sortGroups;
window.renderGroupsView = renderGroupsView;
window.bindGroupsToolbar = bindGroupsToolbar;
window.bindGroupCardActions = bindGroupCardActions;
