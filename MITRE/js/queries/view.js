import { debounce } from '../utils/performance.js';

export let queriesSortBy = 'date';
export let queriesSortDir = 'desc';
export let queriesViewMode = 'grid';
export let queriesShowFavoritesOnly = false;
export let queriesShowHeatmap = false;

export function getDateGroup(timestamp) {
    if (!timestamp) return 'older';
    const now = new Date();
    const date = new Date(timestamp);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - (now.getDay() * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    const ts = date.getTime();
    if (ts >= todayStart) return 'today';
    if (ts >= yesterdayStart) return 'yesterday';
    if (ts >= weekStart) return 'thisWeek';
    if (ts >= monthStart) return 'thisMonth';
    return 'older';
}

export function getDateGroupLabel(group) {
    const labels = {
        today: 'Today',
        yesterday: 'Yesterday',
        thisWeek: 'This Week',
        thisMonth: 'This Month',
        older: 'Older'
    };
    return labels[group] || 'Older';
}

export function getDateGroupIcon(group) {
    const icons = {
        today: 'bi-calendar-check',
        yesterday: 'bi-calendar-minus',
        thisWeek: 'bi-calendar-week',
        thisMonth: 'bi-calendar-month',
        older: 'bi-clock-history'
    };
    return icons[group] || 'bi-clock-history';
}

export const DATE_GROUP_ORDER = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'older'];

export function getAllQueries() {
    const queryMap = new Map();
    if (!state.currentLayer?.techniques) return [];
    
    for (const tech of state.currentLayer.techniques) {
        if (tech.queries) {
            for (const q of tech.queries) {
                if (queryMap.has(q.id)) {
                    const existing = queryMap.get(q.id);
                    if (!existing.techniqueIDs.includes(tech.techniqueID)) {
                        existing.techniqueIDs.push(tech.techniqueID);
                    }
                } else {
                    queryMap.set(q.id, { ...q, techniqueID: tech.techniqueID, techniqueIDs: [tech.techniqueID] });
                }
            }
        }
    }
    return [...queryMap.values()];
}

export function sortQueries(queries) {
    const dir = queriesSortDir === 'asc' ? 1 : -1;
    return [...queries].sort((a, b) => {
        let valA, valB;
        switch (queriesSortBy) {
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'date':
                valA = a.created || a.lastModified || '';
                valB = b.created || b.lastModified || '';
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'technique':
                valA = a.techniqueID || '';
                valB = b.techniqueID || '';
                return valA.localeCompare(valB, undefined, { numeric: true }) * dir;
            case 'language':
                valA = (a.language || '').toLowerCase();
                valB = (b.language || '').toLowerCase();
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'modified':
                valA = a.lastModified || a.created || '';
                valB = b.lastModified || b.created || '';
                return valA < valB ? -dir : valA > valB ? dir : 0;
            case 'favorite':
                return ((b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)) * dir;
            default:
                return 0;
        }
    });
}

export function renderQueriesView() {
    const container = document.getElementById('queries-list');
    const heatmapContainer = document.getElementById('queries-heatmap');
    const controlsContainer = document.getElementById('queries-controls');
    const searchInput = document.getElementById('query-search-input');
    const langFilter = document.getElementById('query-language-filter');
    
    if (queriesShowHeatmap) {
        container.classList.add('hidden');
        heatmapContainer.classList.remove('hidden');
        controlsContainer.classList.add('hidden');
        renderQueriesHeatmap(heatmapContainer);
        return;
    }
    
    container.classList.remove('hidden');
    heatmapContainer.classList.add('hidden');
    controlsContainer.classList.remove('hidden');
    
    const query = (searchInput?.value || '').toLowerCase().trim();
    const lang = langFilter?.value || 'all';
    
    let queries = getAllQueries();
    
    if (queriesShowFavoritesOnly) {
        queries = queries.filter(q => q.favorite);
    }
    
    if (query) {
        queries = queries.filter(q => {
            const techniqueIds = q.techniqueIDs || [q.techniqueID].filter(Boolean);
            return String(q.name || '').toLowerCase().includes(query) ||
                String(q.query || '').toLowerCase().includes(query) ||
                String(q.description || '').toLowerCase().includes(query) ||
                techniqueIds.some(id => String(id || '').toLowerCase().includes(query));
        });
    }
    
    if (lang !== 'all') {
        queries = queries.filter(q => q.language === lang);
    }
    
    const techsWithQueries = new Set(queries.flatMap(q => q.techniqueIDs || [q.techniqueID]));
    const langCounts = {};
    queries.forEach(q => {
        langCounts[q.language] = (langCounts[q.language] || 0) + 1;
    });
    
    document.getElementById('queries-subtitle').textContent = 
        `${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} across ${techsWithQueries.size} techniques`;
    
    const statsHtml = `
        <div class="queries-stats-bar">
            <div class="queries-stat">
                <span class="queries-stat-value">${queries.length}</span>
                <span class="queries-stat-label">Queries</span>
            </div>
            <div class="queries-stat">
                <span class="queries-stat-value">${techsWithQueries.size}</span>
                <span class="queries-stat-label">Techniques</span>
            </div>
            ${Object.entries(langCounts).map(([lang, count]) => `
                <div class="queries-stat">
                    <span class="queries-stat-value">${count}</span>
                    <span class="queries-stat-label">${lang}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    const toolbarHtml = `
        <div class="queries-toolbar">
            <div class="queries-toolbar-left">
                <div class="queries-sort-group">
                    <label class="queries-sort-label">Sort:</label>
                    <select class="queries-sort-select" id="queries-sort-select">
                        <option value="date" ${queriesSortBy === 'date' ? 'selected' : ''}>Date Created</option>
                        <option value="name" ${queriesSortBy === 'name' ? 'selected' : ''}>Name</option>
                        <option value="technique" ${queriesSortBy === 'technique' ? 'selected' : ''}>Technique</option>
                        <option value="language" ${queriesSortBy === 'language' ? 'selected' : ''}>Language</option>
                        <option value="favorite" ${queriesSortBy === 'favorite' ? 'selected' : ''}>Favorites</option>
                    </select>
                    <button class="btn btn-sm btn-ghost queries-sort-dir" id="queries-sort-dir" title="Toggle sort direction">
                        <i class="bi bi-sort-${queriesSortDir === 'asc' ? 'up' : 'down'}"></i>
                    </button>
                </div>
                <button class="btn btn-sm ${queriesShowFavoritesOnly ? 'btn-warning' : 'btn-ghost'}" id="queries-fav-filter" title="Show favorites only">
                    <i class="bi bi-star${queriesShowFavoritesOnly ? '-fill' : ''}"></i>
                </button>
            </div>
            <div class="queries-toolbar-right">
                <div class="btn-group btn-group-sm">
                    <button class="btn ${queriesViewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}" id="queries-view-grid" title="Grid view">
                        <i class="bi bi-grid-3x3-gap"></i>
                    </button>
                    <button class="btn ${queriesViewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}" id="queries-view-list" title="List view">
                        <i class="bi bi-list-ul"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    if (queries.length === 0) {
        controlsContainer.innerHTML = statsHtml + toolbarHtml;
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-code-slash"></i>
                <p>${query || lang !== 'all' || queriesShowFavoritesOnly ? 'No queries match your filters.' : 'No queries added yet. Right-click a technique to add one.'}</p>
            </div>
        `;
        bindQueriesToolbar();
        return;
    }
    
    controlsContainer.innerHTML = statsHtml + toolbarHtml;
    
    const groupedQueries = groupQueriesByDate(queries);
    
    let cardsHtml = '';
    for (const group of DATE_GROUP_ORDER) {
        const groupQueries = groupedQueries[group];
        if (!groupQueries || groupQueries.length === 0) continue;
        
        cardsHtml += `
            <div class="query-date-group">
                <div class="query-date-group-header">
                    <i class="bi ${getDateGroupIcon(group)}"></i>
                    <span>${getDateGroupLabel(group)}</span>
                    <span class="query-date-group-count">${groupQueries.length}</span>
                </div>
                <div class="query-date-group-content ${queriesViewMode === 'grid' ? 'queries-grid' : 'queries-list-view'}">
                    ${groupQueries.map(q => renderQueryCard(q)).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = cardsHtml;
    bindQueriesToolbar();
    bindQueryCardActions(queries);
}

export function groupQueriesByDate(queries) {
    const sorted = sortQueries(queries);
    const groups = { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] };
    
    for (const q of sorted) {
        const group = getDateGroup(q.created || q.lastModified);
        groups[group].push(q);
    }
    
    return groups;
}

export function renderQueryCard(q) {
    const techIds = q.techniqueIDs || [q.techniqueID];
    const primaryTech = state.techniques.find(t => t.external_references?.[0]?.external_id === techIds[0]);
    const primaryTechName = primaryTech?.name || techIds[0];
    const modifiedStr = formatTimestamp(q.lastModified || q.created);
    const createdStr = formatTimestamp(q.created);
    const techBadges = techIds.map(tid => `<span class="query-tech-ref">${tid}</span>`).join('');
    const multiTechLabel = techIds.length > 1 ? `<span class="text-on-surface-tertiary text-xs">+${techIds.length - 1} more</span>` : `<span class="text-on-surface-tertiary text-xs">${escapeHtml(primaryTechName)}</span>`;
    
    if (queriesViewMode === 'list') {
        return `
            <div class="query-card query-card-list ${q.archived ? 'query-card-archived' : ''}" data-query-id="${q.id}">
                <div class="query-list-row">
                    <button class="btn btn-sm btn-ghost query-fav-btn ${q.favorite ? 'query-fav-active' : ''}" data-tech="${q.techniqueID}" data-query="${q.id}" title="Toggle favorite">
                        <i class="bi bi-star${q.favorite ? '-fill' : ''}"></i>
                    </button>
                    <div class="query-list-info">
                        <span class="query-list-name">${escapeHtml(q.name)}${q.archived ? '<span class="query-archived-badge" title="Archived"><i class="bi bi-archive"></i> Archived</span>' : ''}</span>
                        <span class="query-list-tech">${escapeHtml(primaryTechName)}</span>
                    </div>
                    <div class="query-list-badges">
                        ${q.sentinelCandidate ? '<span class="sentinel-candidate-badge" title="Candidate for Sentinel analytic"><i class="bi bi-robot"></i> Sentinel Candidate</span>' : ''}
                        <span class="query-lang-badge ${q.language}">${q.language}</span>
                    </div>
                    <span class="query-list-id">${techIds.join(', ')}</span>
                    <span class="query-list-modified" title="${q.lastModified || q.created}">${modifiedStr}</span>
                    <div class="query-list-actions">
                        <button class="btn btn-ghost btn-sm btn-copy-query" data-query-id="${q.id}" title="Copy query">
                            <i class="bi bi-clipboard"></i>
                        </button>
                        <button class="btn btn-ghost btn-sm btn-edit-query" data-query-id="${q.id}" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        ${q.archived 
                            ? `<button class="btn btn-ghost btn-sm btn-unarchive-query" data-query-id="${q.id}" data-tech="${q.techniqueID}" title="Restore query"><i class="bi bi-arrow-counterclockwise"></i></button>`
                            : `<button class="btn btn-ghost btn-sm btn-archive-query" data-query-id="${q.id}" data-tech="${q.techniqueID}" title="Archive query"><i class="bi bi-archive"></i></button>`
                        }
                        <button class="btn btn-ghost btn-sm btn-delete-query" data-query-id="${q.id}" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="query-card ${q.archived ? 'query-card-archived' : ''}" data-query-id="${q.id}">
            <div class="query-card-header">
                <div class="query-card-header-left">
                    <button class="btn btn-sm btn-ghost query-fav-btn ${q.favorite ? 'query-fav-active' : ''}" data-tech="${q.techniqueID}" data-query="${q.id}" title="Toggle favorite">
                        <i class="bi bi-star${q.favorite ? '-fill' : ''}"></i>
                    </button>
                    <div>
                        <h6 class="query-card-title">${escapeHtml(q.name)}${q.archived ? '<span class="query-archived-badge" title="Archived"><i class="bi bi-archive"></i> Archived</span>' : ''}</h6>
                        <div class="query-header-badges">
                            ${q.sentinelCandidate ? '<span class="sentinel-candidate-badge" title="Candidate for Sentinel analytic"><i class="bi bi-robot"></i> Sentinel Candidate</span>' : ''}
                            <span class="query-lang-badge ${q.language}">${q.language}</span>
                        </div>
                    </div>
                </div>
                <div class="query-card-actions">
                    <button class="btn btn-ghost btn-expand-query" data-query-id="${q.id}" title="Expand/Collapse">
                        <i class="bi bi-chevron-down"></i>
                    </button>
                    <button class="btn btn-ghost btn-copy-query" data-query-id="${q.id}" title="Copy query">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    <button class="btn btn-ghost btn-edit-query" data-query-id="${q.id}" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    ${q.archived 
                        ? `<button class="btn btn-ghost btn-unarchive-query" data-query-id="${q.id}" data-tech="${q.techniqueID}" title="Restore query"><i class="bi bi-arrow-counterclockwise"></i></button>`
                        : `<button class="btn btn-ghost btn-archive-query" data-query-id="${q.id}" data-tech="${q.techniqueID}" title="Archive query"><i class="bi bi-archive"></i></button>`
                    }
                    <button class="btn btn-ghost btn-delete-query" data-query-id="${q.id}" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            ${q.description ? `<p class="query-card-desc" title="${escapeHtml(cleanDescription(q.description))}">${escapeHtml(truncateDescription(q.description, 150))}</p>` : ''}
            ${q.archived && q.archiveReason ? `<div class="query-archive-reason"><i class="bi bi-info-circle"></i> ${escapeHtml(q.archiveReason)}</div>` : ''}
            <div class="query-card-collapsible">
                <div class="query-card-body">${highlightQuerySyntax(q.query, q.language)}</div>
                <div class="query-card-techs">
                    ${techBadges}
                    ${multiTechLabel}
                </div>
            </div>
            <div class="query-card-footer">
                <div class="query-card-techs-summary">
                    <i class="bi bi-grid-3x3"></i> ${techIds.length} technique${techIds.length > 1 ? 's' : ''}
                </div>
                <div class="query-card-dates">
                    ${q.archivedAt ? `<span class="query-archived-date" title="Archived on ${formatTimestamp(q.archivedAt)}"><i class="bi bi-archive"></i> Archived ${formatTimestamp(q.archivedAt)}</span>` : ''}
                    <span class="query-modified"><i class="bi bi-clock"></i> ${modifiedStr}</span>
                    ${q.created ? `<span class="query-created"><i class="bi bi-calendar-plus"></i> Created ${createdStr}</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

export function bindQueriesToolbar() {
    const sortSelect = document.getElementById('queries-sort-select');
    const sortDir = document.getElementById('queries-sort-dir');
    const favFilter = document.getElementById('queries-fav-filter');
    const viewGrid = document.getElementById('queries-view-grid');
    const viewList = document.getElementById('queries-view-list');
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            queriesSortBy = e.target.value;
            renderQueriesView();
        });
    }
    
    if (sortDir) {
        sortDir.addEventListener('click', () => {
            queriesSortDir = queriesSortDir === 'asc' ? 'desc' : 'asc';
            renderQueriesView();
        });
    }
    
    if (favFilter) {
        favFilter.addEventListener('click', () => {
            queriesShowFavoritesOnly = !queriesShowFavoritesOnly;
            renderQueriesView();
        });
    }
    
    if (viewGrid) {
        viewGrid.addEventListener('click', () => {
            queriesViewMode = 'grid';
            renderQueriesView();
        });
    }
    
    if (viewList) {
        viewList.addEventListener('click', () => {
            queriesViewMode = 'list';
            renderQueriesView();
        });
    }

    // Expand/Collapse handler
    const queriesList = document.getElementById('queries-list');
    if (queriesList && !queriesList.dataset.expandBound) {
        queriesList.dataset.expandBound = 'true';
        queriesList.addEventListener('click', (e) => {
            const expandBtn = e.target.closest('.btn-expand-query');
            if (expandBtn) {
                const card = expandBtn.closest('.query-card');
                if (card) {
                    card.classList.toggle('query-card-expanded');
                }
            }
        });
    }
}

export function bindQueryCardActions(queries) {
    document.querySelectorAll('.btn-copy-query').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = queries.find(q => q.id === btn.dataset.queryId);
            if (q) {
                navigator.clipboard.writeText(q.query).then(() => showToast('Query copied to clipboard!', 'success'));
            }
        });
    });
    
    document.querySelectorAll('.btn-edit-query').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = queries.find(q => q.id === btn.dataset.queryId);
            if (q) openQueryEditor(q);
        });
    });
    
    document.querySelectorAll('.btn-delete-query').forEach(btn => {
        btn.addEventListener('click', async () => {
            const q = queries.find(q => q.id === btn.dataset.queryId);
            if (!q) return;
            const confirmed = await showConfirm('Delete Query', `Delete "${q.name}"?`);
            if (confirmed) {
                deleteQuery(q.techniqueID, q.id);
                renderQueriesView();
                showToast('Query deleted', 'info');
            }
        });
    });
    
    document.querySelectorAll('.query-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.tech, btn.dataset.query);
        });
    });
    
    document.querySelectorAll('.btn-archive-query').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openArchiveModal(btn.dataset.queryId, btn.dataset.tech);
        });
    });
    
    document.querySelectorAll('.btn-unarchive-query').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            unarchiveQuery(btn.dataset.queryId, btn.dataset.tech);
        });
    });
}

document.getElementById('query-search-input')?.addEventListener('input', debounce(renderQueriesView, 250));
document.getElementById('query-language-filter')?.addEventListener('change', renderQueriesView);

document.getElementById('btn-queries-cards')?.addEventListener('click', () => {
    queriesShowHeatmap = false;
    document.getElementById('btn-queries-cards').classList.add('active');
    document.getElementById('btn-queries-heatmap').classList.remove('active');
    renderQueriesView();
});

document.getElementById('btn-queries-heatmap')?.addEventListener('click', () => {
    queriesShowHeatmap = true;
    document.getElementById('btn-queries-heatmap').classList.add('active');
    document.getElementById('btn-queries-cards').classList.remove('active');
    renderQueriesView();
});

export function renderQueriesHeatmap(container) {
    if (!state.currentLayer?.techniques || !state.techniques || !state.tactics) {
        container.innerHTML = '<div class="empty-state"><p>No data available.</p></div>';
        return;
    }
    
    const techQueries = {};
    for (const tech of state.currentLayer.techniques) {
        const activeQueries = tech.queries?.filter(q => !q.archived) || [];
        if (activeQueries.length > 0) {
            techQueries[tech.techniqueID] = activeQueries.length;
        }
    }
    
    const orderedTactics = state.tactics
        .filter(t => t.x_mitre_shortname)
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
    
    const techToTactics = {};
    for (const tech of state.techniques) {
        if (tech.type !== 'attack-pattern') continue;
        const techId = tech.external_references?.[0]?.external_id;
        if (!techId) continue;
        const phases = tech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack') || [];
        techToTactics[techId] = new Set(phases.map(p => p.phase_name));
    }
    
    const maxQueries = Math.max(...Object.values(techQueries), 1);
    
    function getHeatColor(count) {
        if (count === 0) return 'transparent';
        const intensity = count / maxQueries;
        if (intensity > 0.75) return 'rgba(99, 102, 241, 0.85)';
        if (intensity > 0.5) return 'rgba(99, 102, 241, 0.65)';
        if (intensity > 0.25) return 'rgba(99, 102, 241, 0.45)';
        return 'rgba(99, 102, 241, 0.25)';
    }
    
    function getTextColor(count) {
        return count > 0 ? 'var(--on-primary)' : 'var(--on-surface-tertiary)';
    }
    
    let html = '<div class="queries-heatmap-scroll"><table class="queries-heatmap-table">';
    html += '<thead><tr><th class="heatmap-tactic-header" style="min-width:200px; position:sticky; left:0; z-index:3;">Technique</th>';
    
    for (const tactic of orderedTactics) {
        html += `<th class="heatmap-tactic-header">${escapeHtml(tactic.name)}</th>`;
    }
    html += '</tr></thead><tbody>';
    
    const allTechniques = state.techniques.filter(t => t.type === 'attack-pattern');
    
    for (const tech of allTechniques) {
        const techId = tech.external_references?.[0]?.external_id;
        if (!techId) continue;
        const count = techQueries[techId] || 0;
        if (count === 0) continue;
        
        const techTactics = techToTactics[techId] || new Set();
        
        html += `<tr class="heatmap-row">`;
        html += `<td class="heatmap-tech-cell">
            <span class="heatmap-tech-id">${techId}</span>
            <span class="heatmap-tech-name">${escapeHtml(tech.name)}</span>
        </td>`;
        
        for (const tactic of orderedTactics) {
            const shortname = tactic.x_mitre_shortname;
            const belongsToTactic = techTactics.has(shortname);
            
            if (belongsToTactic) {
                html += `<td class="heatmap-cell" data-tech-id="${techId}" style="background: ${getHeatColor(count)}; color: ${getTextColor(count)}; cursor: pointer;" title="${techId}: ${count} quer${count === 1 ? 'y' : 'ies'}">${count}</td>`;
            } else {
                html += `<td class="heatmap-cell heatmap-cell-empty"></td>`;
            }
        }
        html += '</tr>';
    }
    
    html += '</tbody></table></div>';
    
    const totalQueries = Object.values(techQueries).reduce((a, b) => a + b, 0);
    const coveredTechniques = Object.keys(techQueries).length;
    
    html = `
        <div class="queries-heatmap-header">
            <div class="queries-heatmap-summary">
                <span><strong>${totalQueries}</strong> queries across <strong>${coveredTechniques}</strong> techniques</span>
            </div>
            <div class="queries-heatmap-legend">
                <span class="heatmap-legend-label">Intensity:</span>
                <span class="heatmap-legend-item" style="background: rgba(99,102,241,0.25);">1</span>
                <span class="heatmap-legend-item" style="background: rgba(99,102,241,0.45);">2-3</span>
                <span class="heatmap-legend-item" style="background: rgba(99,102,241,0.65);">4-5</span>
                <span class="heatmap-legend-item" style="background: rgba(99,102,241,0.85);">6+</span>
            </div>
        </div>
    ` + html;
    
    container.innerHTML = html;
    
    container.querySelectorAll('.heatmap-cell[data-tech-id]').forEach(cell => {
        cell.addEventListener('click', () => {
            const techId = cell.dataset.techId;
            if (techId) {
                queriesShowHeatmap = false;
                document.getElementById('btn-queries-cards').classList.add('active');
                document.getElementById('btn-queries-heatmap').classList.remove('active');
                const searchInput = document.getElementById('query-search-input');
                if (searchInput) searchInput.value = techId.toLowerCase();
                renderQueriesView();
            }
        });
    });
}

// Legacy Window Bindings
window.queriesSortBy = queriesSortBy;
window.queriesSortDir = queriesSortDir;
window.queriesViewMode = queriesViewMode;
window.queriesShowFavoritesOnly = queriesShowFavoritesOnly;
window.queriesShowHeatmap = queriesShowHeatmap;
window.getDateGroup = getDateGroup;
window.getDateGroupLabel = getDateGroupLabel;
window.getDateGroupIcon = getDateGroupIcon;
window.DATE_GROUP_ORDER = DATE_GROUP_ORDER;
window.getAllQueries = getAllQueries;
window.sortQueries = sortQueries;
window.renderQueriesView = renderQueriesView;
window.groupQueriesByDate = groupQueriesByDate;
window.renderQueryCard = renderQueryCard;
window.bindQueriesToolbar = bindQueriesToolbar;
window.bindQueryCardActions = bindQueryCardActions;
window.renderQueriesHeatmap = renderQueriesHeatmap;
