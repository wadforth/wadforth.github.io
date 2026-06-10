export function renderAll() {
    renderPlatformFilters();
    renderMatrix();
}

export const KILL_CHAIN_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', 
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', 
    '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'
];

export function getSpectrumColor(index) {
    return KILL_CHAIN_COLORS[index % KILL_CHAIN_COLORS.length];
}

export function renderPlatformFilters() {
    const container = document.getElementById('platform-filters');
    const sorted = [...state.platforms].sort();
    if (sorted.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = sorted.map(p => `
        <input type="checkbox" class="btn-check platform-check" id="pf-${safeId(p)}" value="${escapeHtml(p)}" checked autocomplete="off">
        <label class="btn" for="pf-${safeId(p)}">${escapeHtml(p)}</label>
    `).join('');

    container.querySelectorAll('.platform-check').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) state.activePlatforms.add(cb.value);
            else state.activePlatforms.delete(cb.value);
            renderMatrix();
        });
    });
}

export function getFilteredTechniques() {
    const platformFiltered = state.techniques.filter(t => {
        const platforms = t.x_mitre_platforms || [];
        const platformMatch = platforms.length === 0 || platforms.some(p => state.activePlatforms.has(p));
        return platformMatch;
    });

    if (!state.matrixSearchQuery) return platformFiltered;

    const query = state.matrixSearchQuery.toLowerCase();
    const byId = new Map();
    const subsByParentId = new Map();

    for (const t of platformFiltered) {
        const id = t.external_references?.[0]?.external_id || '';
        byId.set(id, t);

        if (t.x_mitre_is_subtechnique) {
            const parent = id.split('.')[0];
            if (!subsByParentId.has(parent)) subsByParentId.set(parent, []);
            subsByParentId.get(parent).push(t);
        }
    }

    const matched = new Set();

    for (const t of platformFiltered) {
        const id = t.external_references?.[0]?.external_id || '';
        const name = t.name || '';
        const desc = t.description || '';
        const isMatch = id.toLowerCase().includes(query) ||
            name.toLowerCase().includes(query) ||
            desc.toLowerCase().includes(query);

        if (!isMatch) continue;
        matched.add(t);

        if (t.x_mitre_is_subtechnique) {
            const parent = byId.get(id.split('.')[0]);
            if (parent) matched.add(parent);
        } else {
            for (const subTechnique of subsByParentId.get(id) || []) matched.add(subTechnique);
        }
    }

    return [...matched];
}

export function renderMatrix() {
    const container = document.getElementById('matrix-container');
    const noResults = document.getElementById('matrix-no-results');
    const filtered = getFilteredTechniques();

    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname)
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));

    const techniqueMap = {};
    for (const t of filtered) {
        const phaseNames = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        for (const phase of phaseNames) {
            if (!techniqueMap[phase]) techniqueMap[phase] = [];
            techniqueMap[phase].push(t);
        }
    }

    const isSub = (t) => t.x_mitre_is_subtechnique;
    const parentId = (t) => t.external_references?.[0]?.external_id?.split('.')[0];

    let hasAnyVisible = false;
    let html = '<table class="matrix-table"><thead><tr>';
    let tacticIndex = 0;
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const count = techniqueMap[short]?.length || 0;
        if (count > 0) hasAnyVisible = true;
        const spectrumColor = getSpectrumColor(tacticIndex);
        html += `<th style="border-top: 3px solid ${spectrumColor};"><div class="font-bold">${tactic.name}</div><div class="tactic-short">${short}</div><div class="tactic-count">${count} techniques</div></th>`;
        tacticIndex++;
    }
    html += '</tr></thead><tbody><tr>';

    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = techniques.filter(t => !isSub(t)).sort((a, b) => {
            const idA = a.external_references?.[0]?.external_id || '';
            const idB = b.external_references?.[0]?.external_id || '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
        const subTechs = techniques.filter(t => isSub(t));

        html += '<td><div>';
        for (const tech of parentTechs) {
            const id = tech.external_references?.[0]?.external_id || '';
            const subs = subTechs.filter(s => parentId(s) === id).sort((a, b) => {
                const idA = a.external_references?.[0]?.external_id || '';
                const idB = b.external_references?.[0]?.external_id || '';
                return idA.localeCompare(idB, undefined, { numeric: true });
            });
            html += buildTechniqueCell(tech, subs);
        }
        html += '</div></td>';
    }
    html += '</tr></tbody></table>';

    container.innerHTML = window.DOMSanitizer ? window.DOMSanitizer.sanitize(html) : html;
    noResults.classList.toggle('hidden', hasAnyVisible || filtered.length > 0);

    container.querySelectorAll('.technique-cell[data-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.expand-btn') && !e.target.closest('.sub-toggle')) {
                showTechniqueModal(el.dataset.id);
            }
        });
    });

    if (!container.dataset.contextMenuBound) {
        container.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('.technique-cell[data-id]');
            if (cell) {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e, cell.dataset.id);
            }
        });
        container.dataset.contextMenuBound = 'true';
    }

    container.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSubTechniques(btn.dataset.parent, btn);
        });
    });

    container.querySelectorAll('.sub-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSubTechniques(el.dataset.parent, el);
        });
    });

    const domainLabel = state.currentDomain.replace('-attack', '').charAt(0).toUpperCase() + state.currentDomain.replace('-attack', '').slice(1);
    document.getElementById('matrix-title').textContent = `${domainLabel} ATT&CK Matrix`;
    
    const totalFiltered = filtered.length;
    const isSearching = state.matrixSearchQuery;
    document.getElementById('matrix-subtitle').textContent = isSearching 
        ? `${totalFiltered} technique${totalFiltered === 1 ? '' : 's'} match "${state.matrixSearchQuery}"`
        : `${totalFiltered} techniques across ${tacticOrder.length} tactics`;
    
    const legendBar = document.getElementById('matrix-legend-bar');
    
    if (state.autoColorByQueries) {
        const sections = buildAutoLegendSections();
        legendBar.classList.toggle('hidden', sections.length === 0);
        legendBar.innerHTML = sections.map(section => `
            <div class="matrix-legend-section">
                <span class="matrix-legend-section-title">${escapeHtml(section.title)}</span>
                ${section.items.map(item => `
                    <div class="matrix-legend-item">
                        <span class="matrix-legend-color" style="background: ${item.color}"></span>
                        ${escapeHtml(item.label)}
                    </div>
                `).join('')}
            </div>
        `).join('');
    } else {
        const legend = state.currentLayer?.legend || defaultLegend;
        legendBar.classList.toggle('hidden', legend.length === 0);
        legendBar.innerHTML = legend.map(l => `
            <div class="matrix-legend-item">
                <span class="matrix-legend-color" style="background: ${l.color}"></span>
                ${escapeHtml(l.label)}
            </div>
        `).join('');
    }
}

function safeId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function toggleSubTechniques(pid, btnElement) {
    let td = btnElement?.closest?.('td');
    if (!td) {
        td = document.querySelector(`.technique-cell[data-id="${pid}"]`)?.closest('td');
    }
    const subContainer = td?.querySelector(`.sub-techniques-container[data-parent="${pid}"]`);
    if (!subContainer) return;
    const isHidden = subContainer.classList.contains('hidden');

    if (isHidden) {
        state.expandedTechniques.add(pid);
    } else {
        state.expandedTechniques.delete(pid);
    }

    subContainer.classList.toggle('hidden', !isHidden);

    const parentBtn = td.querySelector(`.expand-btn[data-parent="${pid}"]`);
    if (parentBtn) {
        parentBtn.classList.toggle('expanded', isHidden);
        parentBtn.querySelector('i').classList.toggle('bi-chevron-down', !isHidden);
        parentBtn.querySelector('i').classList.toggle('bi-chevron-up', isHidden);
    }

    const subToggle = subContainer.querySelector('.sub-toggle i');
    if (subToggle) {
        subToggle.classList.toggle('bi-caret-right-fill', !isHidden);
        subToggle.classList.toggle('bi-caret-down-fill', isHidden);
    }
}

export function buildTechniqueCell(tech, subs = []) {
    const id = tech.external_references?.[0]?.external_id || '';
    const name = tech.name;
    const hasSubs = subs.length > 0;
    const expandBtn = hasSubs ? `<span class="expand-btn" data-parent="${id}" title="Toggle sub-techniques"><i class="bi bi-chevron-down"></i></span>` : '';
    
    const autoColor = getAutoColorForTechnique(id, subs);
    const ann = getTechniqueAnnotation(id);
    const effectiveColor = state.autoColorByQueries ? autoColor : ann?.color;
    const annotatedClass = effectiveColor ? 'annotated' : '';
    const bgColor = effectiveColor ? effectiveColor : '';
    const textColor = effectiveColor ? getContrastColor(effectiveColor.replace(/80$/, '')) : '';
    const colorStyle = effectiveColor ? `style="background: ${bgColor}; color: ${textColor};"` : '';
    
    const hasSentinelCandidate = ann?.queries?.some(q => q.sentinelCandidate);
    const sentinelBadge = hasSentinelCandidate ? '<span class="matrix-sentinel-badge" title="Has Sentinel candidate queries"><i class="bi bi-robot"></i></span>' : '';
    
    const allQueriesArchived = ann?.queries?.length > 0 && ann.queries.every(q => q.archived);
    const someQueriesArchived = ann?.queries?.some(q => q.archived);
    const archivedBadge = allQueriesArchived 
        ? '<span class="matrix-archived-badge" title="All queries archived"><i class="bi bi-archive"></i></span>'
        : someQueriesArchived 
            ? '<span class="matrix-partial-archived-badge" title="Some queries archived"><i class="bi bi-archive"></i></span>'
            : '';

    const displayId = highlightText(id, state.matrixSearchQuery);
    const displayName = highlightText(name, state.matrixSearchQuery);

    const isNew = state.changelogDiff?.added?.techniques?.has(id);
    const newBadge = isNew ? '<span class="badge bg-success text-xxs px-1 py-0 shadow-sm mr-1" title="Added in this version" style="font-size: 0.5rem; vertical-align: top;">NEW</span>' : '';

    let html = `<div class="technique-cell ${hasSubs ? 'has-children' : ''} ${annotatedClass}" data-id="${id}" ${colorStyle}>
        <div class="tech-id" ${textColor ? `style="color: ${textColor};"` : ''}>${displayId}</div>
        <div class="tech-name" ${textColor ? `style="color: ${textColor};"` : ''}>${displayName}</div>
        <div class="matrix-badges">
            ${newBadge}${sentinelBadge}
            ${archivedBadge}
        </div>
        ${expandBtn}
    </div>`;

    if (hasSubs) {
        const isExpanded = state.expandedTechniques.has(id);
        html += `<div class="sub-techniques-container ${isExpanded ? '' : 'hidden'}" data-parent="${id}">`;
        html += subs.map(s => {
            const subId = s.external_references?.[0]?.external_id || '';
            const subName = s.name;
            const subAutoColor = getAutoColorForTechnique(subId, []);
            const subAnn = getTechniqueAnnotation(subId);
            const subEffectiveColor = state.autoColorByQueries ? subAutoColor : subAnn?.color;
            const subAnnotated = subEffectiveColor ? 'annotated' : '';
            const subBgColor = subEffectiveColor ? subEffectiveColor : '';
            const subTextColor = subEffectiveColor ? getContrastColor(subEffectiveColor.replace(/80$/, '')) : '';
            const subColor = subEffectiveColor ? `style="background: ${subBgColor}; color: ${subTextColor};"` : '';
            const subDisplayId = highlightText(subId, state.matrixSearchQuery);
            const subDisplayName = highlightText(subName, state.matrixSearchQuery);
            
            const isSubNew = state.changelogDiff?.added?.techniques?.has(subId);
            const subNewBadge = isSubNew ? '<span class="badge bg-success text-xxs px-1 py-0 shadow-sm ml-1" title="Added in this version" style="font-size: 0.5rem; vertical-align: middle;">NEW</span>' : '';

            return `<div class="technique-cell sub-technique ${subAnnotated}" data-id="${subId}" ${subColor}>
                <span class="sub-connector"></span>
                <span class="tech-id" ${subTextColor ? `style="color: ${subTextColor};"` : ''}>${subDisplayId}</span> <span class="tech-name" ${subTextColor ? `style="color: ${subTextColor};"` : ''}>${subDisplayName}</span>${subNewBadge}
            </div>`;
        }).join('');
        html += `</div>`;
    }

    return html;
}

// Legacy Window Bindings
window.renderAll = renderAll;
window.renderPlatformFilters = renderPlatformFilters;
window.getFilteredTechniques = getFilteredTechniques;
window.renderMatrix = renderMatrix;
window.toggleSubTechniques = toggleSubTechniques;
window.buildTechniqueCell = buildTechniqueCell;
window.KILL_CHAIN_COLORS = KILL_CHAIN_COLORS;
window.getSpectrumColor = getSpectrumColor;
