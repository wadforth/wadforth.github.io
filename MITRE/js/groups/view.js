import { debounce } from '../utils/performance.js';

export let groupsSortBy = 'name';
export let groupsSortDir = 'asc';
export let groupsViewMode = 'grid';

function getAlphaSectionLabel(name) {
    const first = String(name || '').trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : '#';
}



export function getGroupTechniqueCount(groupId) {
    return (state.relationshipsBySource?.get(groupId) || [])
        .filter(r => r.relationship_type === 'uses')
        .length;
}

export function getGroupSoftwareCount(groupId) {
    const techIds = new Set(
        (state.relationshipsBySource?.get(groupId) || [])
            .filter(r => r.relationship_type === 'uses')
            .map(r => r.target_ref)
    );
    return state.software.filter(s =>
        (state.relationshipsBySource?.get(s.id) || []).some(r => r.relationship_type === 'uses' && techIds.has(r.target_ref))
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
    renderThreatIntelCatalogue('groups');
}

export function bindGroupsToolbar() {
    bindThreatIntelCatalogue('groups');
}

export function bindGroupCardActions() {
    bindThreatIntelCatalogue('groups');
}

let entitySortBy = 'name';
let entitySortDir = 'asc';
let entityTypeFilter = 'all';
let selectedEntityKey = null;

function getEntityExternalId(item) {
    return item.external_references?.[0]?.external_id || '';
}

function getInitials(name) {
    const words = String(name || '').match(/[A-Za-z0-9]+/g) || [];
    return (words[0]?.[0] || '?') + (words[1]?.[0] || words[0]?.[1] || '');
}

function isEntityDeprecated(item) {
    const description = String(item?.description || '').toLowerCase();
    return !!(item?.x_mitre_deprecated || item?.deprecated || item?.revoked || description.includes('deprecated') || description.includes('revoked'));
}

function getEntityStatusLabel(item) {
    if (item?.revoked) return 'revoked';
    const description = String(item?.description || '').toLowerCase();
    if (item?.x_mitre_deprecated || item?.deprecated || description.includes('deprecated')) return 'deprecated';
    if (description.includes('revoked')) return 'revoked';
    return '';
}

function renderEntityAvatar(entity) {
    if (entity.type === 'group' && typeof getProceduralAvatarSVG === 'function') {
        return `<div class="entity-avatar entity-avatar-svg" aria-hidden="true">${getProceduralAvatarSVG(entity.item.id, entity.name)}</div>`;
    }
    if (entity.family === 'software' && typeof getProceduralSoftwareAvatarSVG === 'function') {
        return `<div class="entity-avatar entity-avatar-svg" aria-hidden="true">${getProceduralSoftwareAvatarSVG(entity.item.id, entity.name, entity.item.type)}</div>`;
    }
    return `<div class="entity-avatar" aria-hidden="true">${escapeHtml(getInitials(entity.name).toUpperCase())}</div>`;
}

function getEntitySearchText(entity) {
    const item = entity.item;
    return [
        entity.id,
        entity.name,
        entity.kind,
        entity.family,
        item.description,
        ...(item.aliases || []),
        ...(item.x_mitre_aliases || []),
        ...(item.x_mitre_platforms || []),
        ...(item.x_mitre_contributors || []),
        ...(item.x_mitre_domains || [])
    ].filter(Boolean).join(' ').toLowerCase();
}

function getEntityTechniques(entity) {
    return (state.relationshipsBySource?.get(entity.item.id) || [])
        .filter(r => r.relationship_type === 'uses')
        .map(r => state.techniquesByStixId?.get(r.target_ref))
        .filter(Boolean);
}

function getCoverageStats(techniques) {
    const covered = techniques.filter(tech => {
        const tid = getEntityExternalId(tech);
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        return ann?.queries?.length > 0;
    }).length;
    const total = techniques.length;
    return { covered, total, gaps: Math.max(0, total - covered), pct: total ? Math.round((covered / total) * 100) : 0 };
}

function getEntities() {
    const groups = state.groups.map(item => ({
        key: `group:${item.id}`,
        type: 'group',
        family: 'group',
        kind: 'Group',
        icon: 'bi-people',
        item,
        id: getEntityExternalId(item),
        name: item.name || 'Unnamed group'
    }));
    const software = state.software.map(item => ({
        key: `software:${getEntityExternalId(item)}`,
        type: item.type === 'malware' ? 'malware' : 'tool',
        family: 'software',
        kind: item.type === 'malware' ? 'Malware' : 'Tool',
        icon: item.type === 'malware' ? 'bi-bug' : 'bi-wrench-adjustable',
        item,
        id: getEntityExternalId(item),
        name: item.name || 'Unnamed software'
    }));
    return [...groups, ...software];
}

function sortEntities(entities) {
    const dir = entitySortDir === 'asc' ? 1 : -1;
    return [...entities].sort((a, b) => {
        if (entitySortBy === 'techniques') return (getEntityTechniques(b).length - getEntityTechniques(a).length) * dir;
        if (entitySortBy === 'type') return a.kind.localeCompare(b.kind) * dir || a.name.localeCompare(b.name) * dir;
        if (entitySortBy === 'modified') return ((a.item.modified || a.item.created || '') < (b.item.modified || b.item.created || '') ? -dir : dir);
        if (entitySortBy === 'id') return a.id.localeCompare(b.id, undefined, { numeric: true }) * dir;
        return a.name.localeCompare(b.name) * dir;
    });
}

function getRouteElements(route) {
    const isSoftware = route === 'software';
    return {
        view: document.getElementById(isSoftware ? 'software-view' : 'groups-view'),
        controls: document.getElementById(isSoftware ? 'software-controls' : 'groups-controls'),
        list: document.getElementById(isSoftware ? 'software-list' : 'groups-list'),
        search: document.getElementById(isSoftware ? 'software-search-input' : 'groups-search-input'),
        subtitle: document.getElementById(isSoftware ? 'software-subtitle' : 'groups-subtitle'),
        title: document.querySelector(`#${isSoftware ? 'software-view' : 'groups-view'} .view-title`),
        softwareType: document.getElementById('software-type-filter')
    };
}

export function renderThreatIntelCatalogue(route = 'groups') {
    const els = getRouteElements(route);
    if (!els.controls || !els.list) return;

    if (route === 'software' && els.softwareType?.value && els.softwareType.value !== 'all') {
        entityTypeFilter = els.softwareType.value;
    }

    const query = (els.search?.value || '').toLowerCase().trim();
    const allEntities = getEntities();
    const counts = {
        all: allEntities.length,
        group: allEntities.filter(e => e.type === 'group').length,
        tool: allEntities.filter(e => e.type === 'tool').length,
        malware: allEntities.filter(e => e.type === 'malware').length
    };

    let entities = allEntities;
    if (entityTypeFilter !== 'all') entities = entities.filter(e => e.type === entityTypeFilter);
    if (query) entities = entities.filter(e => getEntitySearchText(e).includes(query));
    entities = sortEntities(entities);

    if (!selectedEntityKey || !entities.some(e => e.key === selectedEntityKey)) selectedEntityKey = entities[0]?.key || null;
    const selected = entities.find(e => e.key === selectedEntityKey) || entities[0] || null;
    const totalTechniqueLinks = entities.reduce((sum, entity) => sum + getEntityTechniques(entity).length, 0);
    const coveredLinks = entities.reduce((sum, entity) => sum + getCoverageStats(getEntityTechniques(entity)).covered, 0);

    if (els.title) els.title.textContent = 'Threat Intelligence';
    if (els.subtitle) {
        els.subtitle.textContent = `${entities.length} entities, ${totalTechniqueLinks} technique links, ${coveredLinks} covered by selected layer`;
    }

    els.controls.innerHTML = `
        <div class="entity-intel-summary" aria-label="Threat intelligence summary">
            ${renderEntityStat('Entities', entities.length)}
            ${renderEntityStat('Groups', counts.group)}
            ${renderEntityStat('Software', counts.tool + counts.malware)}
            ${renderEntityStat('Technique links', totalTechniqueLinks)}
        </div>
    `;

    els.list.className = 'entity-intel-shell';
    els.list.innerHTML = `
        <aside class="entity-facet-panel entity-panel" aria-label="Catalogue facets">
            <div class="entity-panel-head"><strong>Facets</strong><span class="entity-chip">Enterprise</span></div>
            <div class="entity-panel-body">
                <div class="entity-facet-list">
                    ${renderFacetButton('all', 'All entities', counts.all, 'bi-diagram-3')}
                    ${renderFacetButton('group', 'Groups', counts.group, 'bi-people')}
                    ${renderFacetButton('tool', 'Tools', counts.tool, 'bi-wrench-adjustable')}
                    ${renderFacetButton('malware', 'Malware', counts.malware, 'bi-bug')}
                </div>
                <div class="entity-sort-block">
                    <label for="entity-sort-select">Sort</label>
                    <div class="entity-sort-row">
                        <select id="entity-sort-select" class="entity-sort-select">
                            <option value="techniques" ${entitySortBy === 'techniques' ? 'selected' : ''}>Technique count</option>
                            <option value="name" ${entitySortBy === 'name' ? 'selected' : ''}>Name</option>
                            <option value="id" ${entitySortBy === 'id' ? 'selected' : ''}>ATT&CK ID</option>
                            <option value="type" ${entitySortBy === 'type' ? 'selected' : ''}>Entity type</option>
                            <option value="modified" ${entitySortBy === 'modified' ? 'selected' : ''}>Modified</option>
                        </select>
                        <button class="btn btn-sm btn-ghost" id="entity-sort-dir" title="Toggle sort direction"><i class="bi bi-sort-${entitySortDir === 'asc' ? 'up' : 'down'}"></i></button>
                    </div>
                </div>
                <div class="entity-facet-kv">
                    <div><span>Coverage</span><strong>${totalTechniqueLinks ? Math.round((coveredLinks / totalTechniqueLinks) * 100) : 0}%</strong></div>
                    <div><span>View</span><strong>Combined catalogue</strong></div>
                </div>
            </div>
        </aside>
        <main class="entity-results-panel entity-panel" aria-label="Entity results">
            <div class="entity-panel-head"><strong>Entity results</strong><span class="entity-chip">${entities.length} shown</span></div>
            <div class="entity-panel-body entity-results-scroll">
                ${entities.length ? `<div class="entity-card-grid">${renderEntityCards(entities, selected?.key)}</div>` : renderEntityEmpty(query)}
            </div>
        </main>
        <aside class="entity-side-stack" aria-label="Selected entity details">
            ${renderEntityInspector(selected)}
        </aside>
    `;

    bindThreatIntelCatalogue(route);
}

function renderEntityStat(label, value) {
    return `<div class="entity-stat"><span>${value}</span><strong>${escapeHtml(label)}</strong></div>`;
}

function renderFacetButton(type, label, count, icon) {
    return `
        <button type="button" class="entity-facet-btn ${entityTypeFilter === type ? 'active' : ''}" data-entity-filter="${type}">
            <code><i class="bi ${icon}"></i></code><span>${escapeHtml(label)}</span><strong>${count}</strong>
        </button>
    `;
}

function renderEntityCards(entities, selectedKey) {
    return entities.map((entity, index) => {
        const sectionLabel = getAlphaSectionLabel(entity.name);
        const previousLabel = index > 0 ? getAlphaSectionLabel(entities[index - 1].name) : '';
        const sectionHeader = entitySortBy === 'name' && sectionLabel !== previousLabel
            ? `<div class="entity-az-section"><span>${sectionLabel}</span></div>`
            : '';
        return sectionHeader + renderEntityCard(entity, selectedKey);
    }).join('');
}

function renderEntityCard(entity, selectedKey) {
    const techniques = getEntityTechniques(entity);
    const coverage = getCoverageStats(techniques);
    const isHighRiskGap = coverage.total > 0 && coverage.pct === 0;
    const aliases = (entity.item.x_mitre_aliases || entity.item.aliases || []).slice(0, 2);
    const desc = truncateDescription(entity.item.description || 'No description available.', 150);
    const className = entity.type === 'group' ? 'entity-kind-group' : entity.type === 'malware' ? 'entity-kind-malware' : 'entity-kind-tool';
    const statusLabel = getEntityStatusLabel(entity.item);
    return `
        <article class="entity-result-card ${className} ${isHighRiskGap ? 'entity-high-risk-gap' : ''} ${isEntityDeprecated(entity.item) ? 'entity-deprecated' : ''} ${selectedKey === entity.key ? 'selected' : ''}" data-entity-key="${escapeHtml(entity.key)}" tabindex="0" role="button" aria-label="Select ${escapeHtml(entity.name)}">
            <div class="entity-result-topline">
                ${renderEntityAvatar(entity)}
                <span class="entity-status"><i class="bi ${entity.icon}"></i>${escapeHtml(entity.kind)}</span>
            </div>
            <h4>${escapeHtml(entity.name)}</h4>
            <div class="entity-id-row"><code>${escapeHtml(entity.id || 'N/A')}</code>${statusLabel ? `<span class="entity-deprecated-badge">${statusLabel}</span>` : ''}${aliases.map(a => `<span>${escapeHtml(a)}</span>`).join('')}</div>
            <p>${escapeHtml(desc)}</p>
            <div class="entity-sparkline" title="${coverage.covered} covered, ${coverage.gaps} gaps">
                ${renderCoverageSparkline(techniques)}
            </div>
            <div class="entity-card-foot"><span>${techniques.length} techniques</span><strong>${coverage.pct}% covered</strong></div>
            ${isHighRiskGap ? '<div class="entity-risk-banner"><i class="bi bi-exclamation-triangle-fill"></i> High risk: no linked detection queries</div>' : ''}
        </article>
    `;
}

function renderCoverageSparkline(techniques) {
    const blocks = techniques.slice(0, 12).map(tech => {
        const tid = getEntityExternalId(tech);
        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
        return `<span class="${ann?.queries?.length ? 'covered' : 'gap'}" title="${escapeHtml(tid)} ${escapeHtml(tech.name)}"></span>`;
    });
    while (blocks.length < 12) blocks.push('<span></span>');
    return blocks.join('');
}

function renderEntityInspector(entity) {
    if (!entity) {
        return `<section class="entity-panel"><div class="entity-panel-head"><strong>Inspector</strong></div><div class="entity-panel-body"><p class="entity-empty-copy">No matching entity selected.</p></div></section>`;
    }
    const techniques = getEntityTechniques(entity);
    const coverage = getCoverageStats(techniques);
    const isHighRiskGap = coverage.total > 0 && coverage.pct === 0;
    const related = getRelatedEntities(entity, techniques).slice(0, 5);
    const detailType = entity.type === 'group' ? 'group' : 'software';
    const detailId = entity.type === 'group' ? entity.item.id : entity.id;
    return `
        <section class="entity-panel entity-inspector-card">
            <div class="entity-panel-head"><strong>Relationship map</strong><span class="entity-chip">selected</span></div>
            <div class="entity-panel-body">
                <div class="entity-map" aria-hidden="true">
                    <svg viewBox="0 0 400 260"><path d="M200 130 L75 58 M200 130 L325 66 M200 130 L72 212 M200 130 L325 205 M200 130 L200 38" fill="none" stroke="rgba(137,183,174,.5)" stroke-dasharray="4 7" stroke-width="1"></path></svg>
                    <span class="entity-node primary">${escapeHtml(entity.name)}</span>
                    ${related.map((r, index) => `<span class="entity-node n${index + 1}">${escapeHtml(r)}</span>`).join('')}
                </div>
                <button type="button" class="btn btn-primary entity-open-detail" data-detail-type="${detailType}" data-detail-id="${escapeHtml(detailId)}">Open full details</button>
            </div>
        </section>
        <section class="entity-panel ${isHighRiskGap ? 'entity-high-risk-panel' : ''}">
            <div class="entity-panel-head"><strong>Coverage against layer</strong>${isHighRiskGap ? '<span class="entity-risk-chip">High risk</span>' : ''}</div>
            <div class="entity-panel-body">
                <div class="entity-kv"><span>Type</span><strong>${escapeHtml(entity.kind)}</strong></div>
                <div class="entity-kv"><span>ATT&CK ID</span><strong>${escapeHtml(entity.id || 'N/A')}</strong></div>
                <div class="entity-kv"><span>Techniques</span><strong>${coverage.total}</strong></div>
                <div class="entity-kv"><span>Covered</span><strong>${coverage.covered}</strong></div>
                <div class="entity-kv"><span>Priority gaps</span><strong class="entity-gap-value">${coverage.gaps}</strong></div>
                <div class="entity-coverage-bar"><span style="width:${coverage.pct}%"></span></div>
                ${isHighRiskGap ? '<p class="entity-risk-note">This entity has mapped ATT&amp;CK techniques, but none currently link to active detection queries in this layer.</p>' : ''}
                <div class="entity-tech-preview">${techniques.slice(0, 8).map(tech => `<span title="${escapeHtml(tech.name)}">${escapeHtml(getEntityExternalId(tech))}</span>`).join('')}</div>
            </div>
        </section>
    `;
}

function getRelatedEntities(entity, techniques) {
    const values = [];
    if (entity.type === 'group') {
        values.push(...(entity.item.x_mitre_aliases || entity.item.aliases || []).slice(0, 2));
        values.push(...state.software.filter(sw => {
            const swTechIds = new Set(getEntityTechniques({ item: sw }).map(t => t.id));
            return techniques.some(t => swTechIds.has(t.id));
        }).slice(0, 3).map(sw => sw.name));
    } else {
        const techIds = new Set(techniques.map(t => t.id));
        values.push(...state.groups.filter(group => getEntityTechniques({ item: group }).some(t => techIds.has(t.id))).slice(0, 3).map(group => group.name));
        values.push(...(entity.item.x_mitre_platforms || []).slice(0, 2));
    }
    values.push(...techniques.slice(0, 2).map(t => getEntityExternalId(t)));
    return [...new Set(values.filter(Boolean))];
}

function renderEntityEmpty(query) {
    return `<div class="empty-state"><i class="bi bi-diagram-3"></i><p>${query ? 'No entities match your filters.' : 'No ATT&CK entities loaded.'}</p></div>`;
}

export function bindThreatIntelCatalogue(route = 'groups') {
    const rerender = () => renderThreatIntelCatalogue(route);
    document.querySelectorAll('[data-entity-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            entityTypeFilter = btn.dataset.entityFilter || 'all';
            const softwareType = document.getElementById('software-type-filter');
            if (softwareType) softwareType.value = entityTypeFilter === 'group' ? 'all' : entityTypeFilter;
            rerender();
        });
    });
    document.getElementById('entity-sort-select')?.addEventListener('change', event => {
        entitySortBy = event.target.value;
        rerender();
    });
    document.getElementById('entity-sort-dir')?.addEventListener('click', () => {
        entitySortDir = entitySortDir === 'asc' ? 'desc' : 'asc';
        rerender();
    });
    document.querySelectorAll('.entity-result-card').forEach(card => {
        const select = () => {
            selectedEntityKey = card.dataset.entityKey;
            rerender();
        };
        card.addEventListener('click', select);
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            select();
        });
    });
    document.querySelectorAll('.entity-open-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.detailType === 'group') {
                showGroupModal(btn.dataset.detailId);
            } else {
                showSoftwareModal(btn.dataset.detailId);
            }
        });
    });
}

document.getElementById('groups-search-input')?.addEventListener('input', debounce(renderGroupsView, 250));

// Legacy Window Bindings
window.groupsSortBy = groupsSortBy;
window.groupsSortDir = groupsSortDir;
window.groupsViewMode = groupsViewMode;
window.getGroupTechniqueCount = getGroupTechniqueCount;
window.getGroupSoftwareCount = getGroupSoftwareCount;
window.getGroupDomains = getGroupDomains;
window.sortGroups = sortGroups;
window.renderGroupsView = renderGroupsView;
window.renderThreatIntelCatalogue = renderThreatIntelCatalogue;
window.bindGroupsToolbar = bindGroupsToolbar;
window.bindGroupCardActions = bindGroupCardActions;
