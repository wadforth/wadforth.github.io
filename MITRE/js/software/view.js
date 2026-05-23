let softwareSortBy = 'name';
let softwareSortDir = 'asc';
let softwareViewMode = 'grid';
let softwareFilterType = 'all';

function getSoftwareTechniqueCount(softwareId) {
    const sw = state.software.find(s => {
        const sid = s.external_references?.[0]?.external_id || '';
        return sid === softwareId;
    });
    if (!sw) return 0;
    return state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === sw.id).length;
}

function getSoftwareGroupCount(softwareId) {
    const sw = state.software.find(s => {
        const sid = s.external_references?.[0]?.external_id || '';
        return sid === softwareId;
    });
    if (!sw) return 0;
    const techIds = new Set(
        state.relationships
            .filter(r => r.relationship_type === 'uses' && r.source_ref === sw.id)
            .map(r => r.target_ref)
    );
    const groupIds = new Set(
        state.relationships
            .filter(r => r.relationship_type === 'uses' && techIds.has(r.target_ref))
            .map(r => r.source_ref)
    );
    return state.groups.filter(g => groupIds.has(g.id)).length;
}

function sortSoftware(software) {
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

function renderSoftwareView() {
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
    
    software = sortSoftware(software);
    
    const tools = software.filter(s => s.type === 'tool');
    const malware = software.filter(s => s.type === 'malware');
    const totalTechniques = software.reduce((sum, s) => sum + getSoftwareTechniqueCount(s.external_references?.[0]?.external_id), 0);
    
    const statsHtml = `
        <div class="software-stats-bar">
            <div class="software-stat">
                <span class="software-stat-value">${software.length}</span>
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
    
    if (software.length === 0) {
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
    
    const cardsHtml = software.map(s => {
        const swId = s.external_references?.[0]?.external_id || '';
        const swType = s.type === 'malware' ? 'Malware' : 'Tool';
        const swTypeClass = s.type === 'malware' ? 'software-sw-malware' : 'software-sw-tool';
        const swTypeIcon = s.type === 'malware' ? 'bi-bug' : 'bi-wrench';
        const techCount = getSoftwareTechniqueCount(swId);
        const desc = s.description || '';
        const truncatedDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
        
        if (softwareViewMode === 'list') {
            return `
                <div class="software-card software-card-list" data-sw-id="${swId}" style="cursor: pointer;">
                    <div class="software-list-row">
                        <div class="software-list-info">
                            <span class="software-list-name">${escapeHtml(s.name)}</span>
                            <span class="software-list-id">${swId}</span>
                            <span class="software-type-badge ${swTypeClass}"><i class="bi ${swTypeIcon}"></i> ${swType}</span>
                        </div>
                        <span class="software-tech-count">${techCount} technique${techCount === 1 ? '' : 's'}</span>
                        <i class="bi bi-chevron-right software-list-arrow"></i>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="software-card" data-sw-id="${swId}" style="cursor: pointer;">
                <div class="software-card-header">
                    <div class="software-card-header-left">
                        <span class="software-id-badge">${swId}</span>
                        <span class="software-type-badge ${swTypeClass}"><i class="bi ${swTypeIcon}"></i> ${swType}</span>
                    </div>
                    <span class="software-tech-badge">${techCount}</span>
                </div>
                <h6 class="software-card-title">${escapeHtml(s.name)}</h6>
                <p class="software-card-desc">${escapeHtml(truncatedDesc)}</p>
                <div class="software-card-footer">
                    <span class="software-card-link"><i class="bi bi-arrow-right"></i> View details</span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = cardsHtml;
    bindSoftwareToolbar();
    bindSoftwareCardActions();
}

function bindSoftwareToolbar() {
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

function bindSoftwareCardActions() {
    document.querySelectorAll('.software-card').forEach(card => {
        card.addEventListener('click', () => {
            showSoftwareModal(card.dataset.swId);
        });
    });
}

document.getElementById('software-search-input')?.addEventListener('input', renderSoftwareView);
document.getElementById('software-type-filter')?.addEventListener('change', (e) => {
    softwareFilterType = e.target.value;
    renderSoftwareView();
});
