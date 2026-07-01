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
    let html = '<table class="matrix-table" aria-describedby="matrix-subtitle"><thead><tr>';
    let tacticIndex = 0;
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const count = techniqueMap[short]?.length || 0;
        const spectrumColor = getSpectrumColor(tacticIndex);
        html += `<th scope="col" style="border-top: 3px solid ${spectrumColor};"><div class="font-bold">${tactic.name}</div><div class="tactic-short">${short}</div><div class="tactic-count">${count} techniques</div></th>`;
        tacticIndex++;
    }
    html += '</tr></thead><tbody><tr>';

    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        const techniques = techniqueMap[short] || [];
        const parentTechs = [];
        const subTechsByParent = new Map();
        for (const technique of techniques) {
            if (isSub(technique)) {
                const parent = parentId(technique);
                if (!subTechsByParent.has(parent)) subTechsByParent.set(parent, []);
                subTechsByParent.get(parent).push(technique);
            } else {
                parentTechs.push(technique);
            }
        }

        parentTechs.sort((a, b) => {
            const idA = a.external_references?.[0]?.external_id || '';
            const idB = b.external_references?.[0]?.external_id || '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
        if (parentTechs.length > 0) hasAnyVisible = true;

        html += `<td><div class="matrix-column" data-tactic="${escapeHtml(short)}">`;
        for (const tech of parentTechs) {
            const id = tech.external_references?.[0]?.external_id || '';
            const subs = (subTechsByParent.get(id) || []).sort((a, b) => {
                const idA = a.external_references?.[0]?.external_id || '';
                const idB = b.external_references?.[0]?.external_id || '';
                return idA.localeCompare(idB, undefined, { numeric: true });
            });
            html += buildTechniqueCell(tech, subs);
        }
        html += '</div></td>';
    }
    html += '</tr></tbody></table>';

    if (!state.matrixSelectedTechniqueId && filtered.length > 0) {
        state.matrixSelectedTechniqueId = filtered.find(t => !t.x_mitre_is_subtechnique)?.external_references?.[0]?.external_id ||
            filtered[0]?.external_references?.[0]?.external_id || '';
    }

    container.innerHTML = window.DOMSanitizer ? window.DOMSanitizer.sanitize(html) : html;
    noResults.classList.toggle('hidden', hasAnyVisible);

    if (state.matrixFocusPending && state.matrixFocusTechniques?.size) {
        requestAnimationFrame(() => {
            const firstFocused = container.querySelector('.matrix-focused-technique');
            firstFocused?.scrollIntoView({ block: 'center', inline: 'center' });
        });
        state.matrixFocusPending = false;
    }

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

    if (!container.dataset.clickBound) {
        container.addEventListener('click', handleMatrixInteraction);
        container.addEventListener('keydown', handleMatrixKeyboardInteraction);
        container.dataset.clickBound = 'true';
    }

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

    updateMatrixWorkbenchStats(filtered);
    updateMatrixInspector();
}

function updateMatrixWorkbenchStats(filteredTechniques) {
    const layerTechniques = state.currentLayer?.techniques || [];
    const covered = layerTechniques.filter(ann => ann?.color || ann?.queries?.length > 0).length;
    const queryCount = layerTechniques.reduce((sum, ann) => sum + (ann?.queries?.length || 0), 0);
    const sigmaCount = layerTechniques.reduce((sum, ann) => sum + (ann?.queries || []).filter(q => q?.sentinelCandidate || q?.sigmaRuleId || q?.sigmaRuleTitle || q?.sigmaRuleUrl).length, 0);
    const visibleTechniqueIds = new Set(filteredTechniques.map(t => t.external_references?.[0]?.external_id).filter(Boolean));
    const coveredTechniqueIds = new Set(layerTechniques.filter(ann => ann?.color || ann?.queries?.length > 0).map(ann => ann.techniqueID));
    const visibleGaps = [...visibleTechniqueIds].filter(id => !coveredTechniqueIds.has(id)).length;

    setText('matrix-stat-covered', covered);
    setText('matrix-stat-queries', queryCount);
    setText('matrix-stat-sigma', sigmaCount);
    setText('matrix-stat-gaps', visibleGaps);
    setText('matrix-stat-platforms', state.activePlatforms?.size || 0);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

function selectMatrixTechnique(techniqueId) {
    state.matrixSelectedTechniqueId = techniqueId;
    document.querySelectorAll('.technique-cell.matrix-selected-technique').forEach(cell => cell.classList.remove('matrix-selected-technique'));
    document.querySelectorAll(`.technique-cell[data-id="${cssEscape(techniqueId)}"]`).forEach(cell => cell.classList.add('matrix-selected-technique'));
    updateMatrixInspector();
}

function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value || '').replace(/"/g, '\\"');
}

function updateMatrixInspector() {
    const inspector = document.getElementById('matrix-inspector');
    if (!inspector) return;

    const selectedId = state.matrixSelectedTechniqueId;
    const technique = state.techniquesByExternalId?.get(selectedId) || state.techniques.find(t => t.external_references?.[0]?.external_id === selectedId);
    if (!technique) {
        inspector.innerHTML = `
            <div class="matrix-inspector-title-card">
                <span class="matrix-inspector-chip">Selection</span>
                <h3>No technique selected</h3>
                <p>Select a technique in the matrix to inspect procedures, linked queries, Sigma candidates, mitigations and coverage state without losing browsing context.</p>
            </div>
        `;
        return;
    }

    const id = technique.external_references?.[0]?.external_id || selectedId;
    const ann = getTechniqueAnnotation(id);
    const queries = ann?.queries || [];
    const activeQueries = queries.filter(q => !q.archived);
    const sigmaQueries = queries.filter(q => q?.sentinelCandidate || q?.sigmaRuleId || q?.sigmaRuleTitle || q?.sigmaRuleUrl);
    const subTechniques = state.techniques.filter(t => t.x_mitre_is_subtechnique && t.external_references?.[0]?.external_id?.startsWith(`${id}.`));
    const coveredSubs = subTechniques.filter(t => {
        const subId = t.external_references?.[0]?.external_id;
        const subAnn = getTechniqueAnnotation(subId);
        return subAnn?.color || subAnn?.queries?.length > 0;
    }).length;
    const coverageTotal = subTechniques.length || 1;
    const coverageValue = subTechniques.length ? Math.round((coveredSubs / coverageTotal) * 100) : (queries.length > 0 || ann?.color ? 100 : 0);
    const relationships = state.relationshipsByTarget?.get(technique.id) || [];
    const linkedProcedures = relationships.filter(rel => rel.relationship_type === 'uses').length;
    const linkedMitigations = relationships.filter(rel => {
        const source = state.mitigationsByStixId?.get(rel.source_ref);
        return Boolean(source);
    }).length;
    const tactics = (technique.kill_chain_phases || [])
        .filter(phase => phase.kill_chain_name === 'mitre-attack')
        .map(phase => phase.phase_name.replace(/-/g, ' '));
    const tacticLabel = tactics[0] || 'Technique';
    const priorityClass = coverageValue === 0 ? 'bad' : coverageValue < 60 ? 'warn' : 'good';
    const priorityLabel = coverageValue === 0 ? 'High' : coverageValue < 60 ? 'Medium' : 'Covered';
    const queryRows = queries.slice(0, 4).map(query => `
        <div class="matrix-link-row">
            <code>${escapeHtml((query.language || query.type || 'query').slice(0, 4).toUpperCase())}</code>
            <span>${escapeHtml(query.name || query.title || 'Untitled detection logic')}</span>
            <span class="matrix-status ${query.archived ? 'warn' : 'good'}">${query.archived ? 'stale' : 'live'}</span>
        </div>
    `).join('') || '<div class="matrix-empty-link">No linked queries yet.</div>';

    inspector.innerHTML = `
        <div class="matrix-inspector-title-card">
            <div class="matrix-inspector-chips">
                <span class="matrix-inspector-chip">${escapeHtml(id)}</span>
                <span class="matrix-inspector-chip">${escapeHtml(tacticLabel)}</span>
            </div>
            <h3>${escapeHtml(technique.name || id)}</h3>
            <p>${escapeHtml(stripHtml(technique.description || 'Review linked detection logic, procedures and coverage state for the selected technique.'))}</p>
        </div>
        <div class="matrix-inspector-body">
            <div class="matrix-kv"><span>Coverage</span><strong>${subTechniques.length ? `${coveredSubs} / ${subTechniques.length}` : `${coverageValue}%`}</strong></div>
            <div class="matrix-coverage-bar" aria-label="Coverage ${coverageValue} percent"><span style="width:${coverageValue}%"></span></div>
            <div class="matrix-kv"><span>Linked queries</span><strong>${activeQueries.length} / ${queries.length}</strong></div>
            <div class="matrix-kv"><span>Sigma candidates</span><strong>${sigmaQueries.length}</strong></div>
            <div class="matrix-kv"><span>Linked procedures</span><strong>${linkedProcedures}</strong></div>
            <div class="matrix-kv"><span>Mitigations</span><strong>${linkedMitigations}</strong></div>
            <div class="matrix-kv"><span>Priority</span><strong class="matrix-priority-${priorityClass}">${priorityLabel}</strong></div>
            <div class="matrix-link-stack">${queryRows}</div>
            <button type="button" class="btn btn-sm btn-primary matrix-open-detail" data-technique-id="${escapeHtml(id)}">
                <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Open full details
            </button>
        </div>
    `;

    inspector.querySelector('.matrix-open-detail')?.addEventListener('click', () => showTechniqueModal(id));
}

function stripHtml(value) {
    const div = document.createElement('div');
    div.innerHTML = value;
    return div.textContent || div.innerText || '';
}

function handleMatrixInteraction(event) {
    const toggle = event.target.closest('.expand-btn, .sub-toggle');
    if (toggle) {
        event.stopPropagation();
        toggleSubTechniques(toggle.dataset.parent, toggle);
        return;
    }

    const cell = event.target.closest('.technique-cell[data-id]');
    if (cell) selectMatrixTechnique(cell.dataset.id);
}

function handleMatrixKeyboardInteraction(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const toggle = event.target.closest('.expand-btn, .sub-toggle');
    if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleSubTechniques(toggle.dataset.parent, toggle);
        return;
    }

    const cell = event.target.closest('.technique-cell[data-id]');
    if (!cell || event.target !== cell) return;
    event.preventDefault();
    selectMatrixTechnique(cell.dataset.id);
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
    const expandBtn = hasSubs ? `<span class="expand-btn" data-parent="${id}" title="Toggle sub-techniques" role="button" tabindex="0" aria-label="Toggle sub-techniques for ${escapeHtml(id)}"><i class="bi bi-chevron-down"></i></span>` : '';
    
    const autoColor = getAutoColorForTechnique(id, subs);
    const ann = getTechniqueAnnotation(id);
    const queryCount = ann?.queries?.length || 0;
    const activeQueryCount = ann?.queries?.filter(q => !q.archived).length || 0;
    const effectiveColor = state.autoColorByQueries ? autoColor : ann?.color;
    const annotatedClass = effectiveColor ? 'annotated' : '';
    const focusedClass = state.matrixFocusTechniques?.has(id) ? 'matrix-focused-technique' : '';
    const queryClass = activeQueryCount > 0 ? 'has-active-queries' : (queryCount > 0 ? 'has-archived-queries' : 'has-no-queries');
    const subCountClass = hasSubs ? 'has-subtechniques' : 'no-subtechniques';
    const bgColor = effectiveColor ? effectiveColor : '';
    const textColor = effectiveColor ? '#e9efea' : '';
    const colorStyle = effectiveColor ? `style="--tech-fill: ${bgColor}; --tech-text: ${textColor}; background: ${bgColor}; color: ${textColor};"` : '';
    
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

    const metaItems = [];
    if (hasSubs) metaItems.push(`<span><i class="bi bi-diagram-2"></i>${subs.length}</span>`);
    if (queryCount > 0) metaItems.push(`<span><i class="bi bi-code-slash"></i>${activeQueryCount}/${queryCount}</span>`);
    const metaHtml = metaItems.length ? `<div class="tech-meta" aria-hidden="true">${metaItems.join('')}</div>` : '';

    const selectedClass = state.matrixSelectedTechniqueId === id ? 'matrix-selected-technique' : '';

    let html = `<div class="technique-cell ${hasSubs ? 'has-children' : ''} ${annotatedClass} ${focusedClass} ${selectedClass} ${queryClass} ${subCountClass}" data-id="${id}" data-query-count="${queryCount}" data-active-query-count="${activeQueryCount}" data-sub-count="${subs.length}" role="button" tabindex="0" aria-label="Inspect technique ${escapeHtml(id)} ${escapeHtml(name)}" ${colorStyle}>
        <div class="tech-id" ${textColor ? `style="color: ${textColor};"` : ''}>${displayId}</div>
        <div class="tech-name" ${textColor ? `style="color: ${textColor};"` : ''}>${displayName}</div>
        ${metaHtml}
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
            const subQueryCount = subAnn?.queries?.length || 0;
            const subActiveQueryCount = subAnn?.queries?.filter(q => !q.archived).length || 0;
            const subEffectiveColor = state.autoColorByQueries ? subAutoColor : subAnn?.color;
            const subAnnotated = subEffectiveColor ? 'annotated' : '';
            const subFocusedClass = state.matrixFocusTechniques?.has(subId) ? 'matrix-focused-technique' : '';
            const subQueryClass = subActiveQueryCount > 0 ? 'has-active-queries' : (subQueryCount > 0 ? 'has-archived-queries' : 'has-no-queries');
            const subBgColor = subEffectiveColor ? subEffectiveColor : '';
            const subTextColor = subEffectiveColor ? '#e9efea' : '';
            const subColor = subEffectiveColor ? `style="--tech-fill: ${subBgColor}; --tech-text: ${subTextColor}; background: ${subBgColor}; color: ${subTextColor};"` : '';
            const subDisplayId = highlightText(subId, state.matrixSearchQuery);
            const subDisplayName = highlightText(subName, state.matrixSearchQuery);
            
            const isSubNew = state.changelogDiff?.added?.techniques?.has(subId);
            const subNewBadge = isSubNew ? '<span class="badge bg-success text-xxs px-1 py-0 shadow-sm ml-1" title="Added in this version" style="font-size: 0.5rem; vertical-align: middle;">NEW</span>' : '';

            const subMetaHtml = subQueryCount > 0 ? `<span class="sub-tech-meta" aria-hidden="true"><i class="bi bi-code-slash"></i>${subActiveQueryCount}/${subQueryCount}</span>` : '';

            const selectedSubClass = state.matrixSelectedTechniqueId === subId ? 'matrix-selected-technique' : '';

            return `<div class="technique-cell sub-technique ${subAnnotated} ${subFocusedClass} ${selectedSubClass} ${subQueryClass}" data-id="${subId}" data-query-count="${subQueryCount}" data-active-query-count="${subActiveQueryCount}" role="button" tabindex="0" aria-label="Inspect technique ${escapeHtml(subId)} ${escapeHtml(subName)}" ${subColor}>
                <span class="sub-connector"></span>
                <span class="tech-id" ${subTextColor ? `style="color: ${subTextColor};"` : ''}>${subDisplayId}</span> <span class="tech-name" ${subTextColor ? `style="color: ${subTextColor};"` : ''}>${subDisplayName}</span>${subNewBadge}${subMetaHtml}
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
