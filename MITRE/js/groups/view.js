let groupsSortBy = 'name';
let groupsSortDir = 'asc';
let groupsViewMode = 'grid';

function getGroupTechniqueCount(groupId) {
    return state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === groupId).length;
}

function getGroupSoftwareCount(groupId) {
    const techIds = new Set(
        state.relationships
            .filter(r => r.relationship_type === 'uses' && r.source_ref === groupId)
            .map(r => r.target_ref)
    );
    return state.software.filter(s =>
        state.relationships.some(r => r.relationship_type === 'uses' && r.source_ref === s.id && techIds.has(r.target_ref))
    ).length;
}

function getGroupDomains(group) {
    return group.x_mitre_domains || [];
}

function sortGroups(groups) {
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

function renderGroupsView() {
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
        const truncatedDesc = desc.length > 120 ? desc.substring(0, 120) + '...' : desc;
        const domains = getGroupDomains(g);
        const aliases = (g.x_mitre_aliases || g.aliases || []).slice(0, 2);
        
        if (groupsViewMode === 'list') {
            return `
                <div class="group-card group-card-list" data-group-id="${g.id}" style="cursor: pointer;">
                    <div class="group-list-row">
                        <div class="group-list-info">
                            <span class="group-list-name">${escapeHtml(g.name)}</span>
                            <span class="group-list-id">${groupId}</span>
                        </div>
                        <span class="group-tech-count">${techCount} technique${techCount === 1 ? '' : 's'}</span>
                        ${domains.length ? `<span class="group-domain-badge">${escapeHtml(domains[0])}</span>` : ''}
                        <i class="bi bi-chevron-right group-list-arrow"></i>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="group-card" data-group-id="${g.id}" style="cursor: pointer;">
                <div class="group-card-header">
                    <div class="group-card-header-left">
                        <span class="group-id-badge">${groupId}</span>
                        <h6 class="group-card-title">${escapeHtml(g.name)}</h6>
                    </div>
                    <span class="group-tech-badge">${techCount}</span>
                </div>
                ${aliases.length ? `
                    <div class="group-aliases">
                        ${aliases.map(a => `<span class="group-alias-tag">${escapeHtml(a)}</span>`).join('')}
                    </div>
                ` : ''}
                <p class="group-card-desc">${escapeHtml(truncatedDesc)}</p>
                <div class="group-card-footer">
                    ${domains.length ? `<span class="group-domain-badge"><i class="bi bi-globe"></i> ${escapeHtml(domains.join(', '))}</span>` : ''}
                    <span class="group-card-link"><i class="bi bi-arrow-right"></i> View details</span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = cardsHtml;
    bindGroupsToolbar();
    bindGroupCardActions();
}

function bindGroupsToolbar() {
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

function bindGroupCardActions() {
    document.querySelectorAll('.group-card').forEach(card => {
        card.addEventListener('click', () => {
            showGroupModal(card.dataset.groupId);
        });
    });
}

document.getElementById('groups-search-input')?.addEventListener('input', renderGroupsView);
