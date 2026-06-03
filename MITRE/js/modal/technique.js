let techNavHistory = [];
let currentTechId = null;

function showTechniqueModal(techniqueId, skipHistory = false) {
    const tech = state.techniques.find(t => t.external_references?.[0]?.external_id === techniqueId);
    if (!tech) return;

    if (!skipHistory && currentTechId && currentTechId !== techniqueId) {
        techNavHistory.push(currentTechId);
    }
    currentTechId = techniqueId;

    updateBreadcrumb();

    document.getElementById('technique-modal-title').textContent = tech.name || 'Unknown Technique';
    document.getElementById('technique-modal-id').textContent = techniqueId;
    document.getElementById('technique-modal-type').textContent = tech.x_mitre_is_subtechnique ? 'Sub-technique' : 'Technique';
    document.getElementById('technique-modal-description').innerHTML = parseDescription(tech.description || '');

    const revokedBadge = document.getElementById('technique-modal-revoked');
    if (tech.revoked || tech.x_mitre_deprecated) {
        revokedBadge.classList.remove('hidden');
    } else {
        revokedBadge.classList.add('hidden');
    }

    renderTacticBadges(tech);
    renderCoverageBar(techniqueId, tech);

    const platformsEl = document.getElementById('technique-modal-platforms');
    const platformIcons = {
        'Windows': 'bi-windows',
        'Linux': 'bi-ubuntu',
        'macOS': 'bi-apple',
        'Azure AD': 'bi-cloud',
        'Google Workspace': 'bi-google',
        'Office 365': 'bi-file-earmark-word',
        'SaaS': 'bi-cloud',
        'IaaS': 'bi-hdd-network',
        'Network': 'bi-diagram-3',
        'PRE': 'bi-shield-lock',
    };
    platformsEl.innerHTML = tech.x_mitre_platforms?.length
        ? tech.x_mitre_platforms.map(p => {
            const icon = platformIcons[p] || 'bi-circle';
            return `<span class="platform-chip"><i class="bi ${icon}"></i>${p}</span>`;
        }).join('')
        : '<span class="text-on-surface-tertiary text-sm">No platforms specified</span>';

    const ann = getTechniqueAnnotation(techniqueId);
    const monthAdded = ann?.monthAdded || new Date().toISOString().slice(0, 7);
    const monthsEl = document.getElementById('technique-modal-months');
    if (monthsEl) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthOptions = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const val = d.toISOString().slice(0, 7);
            const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            monthOptions.push(`<option value="${val}" ${val === monthAdded ? 'selected' : ''}>${label}</option>`);
        }
        monthsEl.innerHTML = `
            <div class="month-selector">
                <label class="text-on-surface-tertiary text-sm mb-1">Logged Month</label>
                <select class="form-select form-select-sm" onchange="updateTechniqueMonth('${techniqueId}', this.value)">
                    ${monthOptions.join('')}
                </select>
            </div>
        `;
    }

    const procs = state.relationships.filter(r => r.relationship_type === 'uses' && r.target_ref === tech.id);
    document.getElementById('tab-procedures').innerHTML = procs.length
        ? procs.map(r => {
            const source = state.groups.find(g => g.id === r.source_ref) || state.software.find(s => s.id === r.source_ref);
            if (!source) return '';
            const sourceType = state.groups.includes(source) ? 'Group' : (source.type === 'malware' ? 'Malware' : 'Tool');
            const sourceIcon = sourceType === 'Group' ? 'bi-people-fill' : (source.type === 'malware' ? 'bi-bug' : 'bi-wrench');
            return `<div class="tech-card">
                <div class="tech-card-header">
                    <i class="bi ${sourceIcon}"></i>
                    <span class="tech-card-name">${source.name}</span>
                    <span class="tech-card-id">${source.external_references?.[0]?.external_id}</span>
                    <span class="tech-card-type">${sourceType}</span>
                </div>
                <div class="tech-card-desc">${parseDescription(r.description || '')}</div>
            </div>`;
        }).join('')
        : '<div class="empty-state"><i class="bi bi-inbox"></i><p>No procedure examples found.</p></div>';
    document.getElementById('count-procedures').textContent = procs.length;

    const queryAnn = getTechniqueAnnotation(techniqueId);
    const queries = queryAnn?.queries || [];
    document.getElementById('tab-queries').innerHTML = `
        <div class="query-disclaimer">
            <i class="bi bi-info-circle"></i>
            <span>Queries stored here are drafts and may not reflect the final version deployed to your SIEM/EDR.</span>
        </div>
        <div class="tech-tab-toolbar">
            <span class="tech-tab-toolbar-count">${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}</span>
            <button class="btn-tech-primary" id="btn-add-query-modal" data-tech="${techniqueId}">
                <i class="bi bi-plus-lg"></i>
                <span>Add Query</span>
            </button>
        </div>
    ` + (queries.length
        ? queries.map(q => `
            <div class="tech-card query-card-item">
                <div class="tech-card-header">
                    <span class="tech-card-name">${escapeHtml(q.name)}</span>
                    <div class="query-header-badges">
                        ${q.sentinelCandidate ? '<span class="sentinel-candidate-badge" title="Candidate for Sentinel analytic"><i class="bi bi-robot"></i> Sentinel Candidate</span>' : ''}
                        <span class="query-lang-badge ${q.language}">${q.language}</span>
                    </div>
                </div>
                <div class="query-card-body">${highlightQuerySyntax(q.query, q.language)}</div>
                ${q.description ? `<p class="query-card-desc">${escapeHtml(q.description)}</p>` : ''}
                ${q.source ? `<div class="query-card-source"><i class="bi bi-link-45deg"></i>Source: ${escapeHtml(q.source)}</div>` : ''}
                <div class="tech-card-actions">
                    <button class="btn-tech-ghost btn-copy-query-inline" data-query="${encodeURIComponent(q.query)}">
                        <i class="bi bi-clipboard"></i>
                        <span>Copy</span>
                    </button>
                </div>
            </div>
        `).join('')
        : '<div class="empty-state"><i class="bi bi-code-slash"></i><p>No queries added yet.</p></div>');
    document.getElementById('count-queries').textContent = queries.length;

    document.getElementById('btn-add-query-modal')?.addEventListener('click', () => {
        state.currentModalTechniqueId = techniqueId;
        const techModal = bootstrap.Modal.getInstance(document.getElementById('technique-modal'));
        if (techModal) techModal.hide();
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
            openQueryEditor(null, techniqueId);
        }, 200);
    });

    document.querySelectorAll('.btn-copy-query-inline').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(decodeURIComponent(btn.dataset.query));
            showToast('Query copied!', 'success');
        });
    });

    state.currentModalTechniqueId = techniqueId;

    const mitigs = state.relationships.filter(r => r.relationship_type === 'mitigates' && r.target_ref === tech.id);
    document.getElementById('tab-mitigations').innerHTML = mitigs.length
        ? mitigs.map(r => {
            const m = state.mitigations.find(mit => mit.id === r.source_ref);
            if (!m) return '';
            return `<div class="tech-card">
                <div class="tech-card-header">
                    <i class="bi bi-shield-check"></i>
                    <span class="tech-card-name">${m.name}</span>
                    <span class="tech-card-id">${m.external_references?.[0]?.external_id}</span>
                </div>
                <div class="tech-card-desc">${parseDescription(m.description || '')}</div>
            </div>`;
        }).join('')
        : '<div class="empty-state"><i class="bi bi-shield-check"></i><p>No mitigations found.</p></div>';
    document.getElementById('count-mitigations').textContent = mitigs.length;

    const groupIds = [...new Set(procs.map(r => r.source_ref))];
    const relatedGroups = state.groups.filter(g => groupIds.includes(g.id));
    document.getElementById('tab-groups').innerHTML = relatedGroups.length
        ? `<div class="tech-entity-grid">${relatedGroups.map(g =>
            `<div class="entity-chip entity-chip-clickable" data-group-id="${g.id}" title="Click to view group details">
                <i class="bi bi-people-fill"></i>
                <span class="entity-name">${g.name}</span>
                <span class="entity-id">${g.external_references?.[0]?.external_id}</span>
                <i class="bi bi-arrow-right-short"></i>
            </div>`
        ).join('')}</div>`
        : '<div class="empty-state"><i class="bi bi-people"></i><p>No associated groups.</p></div>';
    document.getElementById('count-groups').textContent = relatedGroups.length;

    document.querySelectorAll('.entity-chip-clickable').forEach(chip => {
        chip.addEventListener('click', () => {
            showGroupModal(chip.dataset.groupId);
        });
    });

    const softIds = [...new Set(procs.map(r => r.source_ref))];
    const relatedSoftware = state.software.filter(s => softIds.includes(s.id));
    document.getElementById('tab-software').innerHTML = relatedSoftware.length
        ? `<div class="tech-entity-grid">${relatedSoftware.map(s => {
            const typeLabel = s.type === 'malware' ? 'Malware' : 'Tool';
            const typeIcon = s.type === 'malware' ? 'bi-bug' : 'bi-wrench';
            const softId = s.external_references?.[0]?.external_id || '';
            return `<div class="entity-chip entity-chip-clickable" data-soft-id="${softId}" title="Click to view software details">
                <i class="bi ${typeIcon}"></i>
                <span class="entity-name">${s.name}</span>
                <span class="entity-id">${softId}</span>
                <span class="entity-type-badge">${typeLabel}</span>
                <i class="bi bi-arrow-right-short"></i>
            </div>`;
        }).join('')}</div>`
        : '<div class="empty-state"><i class="bi bi-cpu"></i><p>No associated software.</p></div>';
    document.getElementById('count-software').textContent = relatedSoftware.length;

    document.querySelectorAll('#tab-software .entity-chip-clickable').forEach(chip => {
        chip.addEventListener('click', () => {
            showSoftwareModal(chip.dataset.softId);
        });
    });

    renderTechniqueDetails(tech);

    const modal = new bootstrap.Modal(document.getElementById('technique-modal'));
    
    document.getElementById('technique-modal').addEventListener('hidden.bs.modal', () => {
        techNavHistory = [];
        currentTechId = null;
    }, { once: true });
    
    modal.show();
}

function renderTacticBadges(tech) {
    const container = document.getElementById('technique-modal-tactics');
    const phases = tech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack') || [];
    
    if (phases.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const tacticNames = phases.map(p => {
        const tactic = state.tactics.find(t => t.x_mitre_shortname === p.phase_name);
        return tactic ? tactic.name : p.phase_name;
    });
    
    container.innerHTML = `<span class="tech-badge-tactics">${tacticNames.map(name => 
        `<span class="tech-tactic-pill">${escapeHtml(name)}</span>`
    ).join('')}</span>`;
}

function renderCoverageBar(techniqueId, tech) {
    const container = document.getElementById('tech-modal-coverage');
    const isSub = tech.x_mitre_is_subtechnique;
    
    if (isSub) {
        const ann = getTechniqueAnnotation(techniqueId);
        const hasQueries = ann?.queries?.length > 0;
        container.innerHTML = `
            <div class="tech-coverage-mini">
                <span class="tech-coverage-dot ${hasQueries ? 'has-queries' : ''}"></span>
                <span>${hasQueries ? `${ann.queries.length} quer${ann.queries.length === 1 ? 'y' : 'ies'}` : 'No queries'}</span>
            </div>
        `;
        return;
    }
    
    const subTechs = state.techniques.filter(t => {
        const tid = t.external_references?.[0]?.external_id || '';
        return tid.startsWith(techniqueId + '.') && t.x_mitre_is_subtechnique;
    });
    
    if (subTechs.length === 0) {
        const ann = getTechniqueAnnotation(techniqueId);
        const hasQueries = ann?.queries?.length > 0;
        container.innerHTML = `
            <div class="tech-coverage-mini">
                <span class="tech-coverage-dot ${hasQueries ? 'has-queries' : ''}"></span>
                <span>${hasQueries ? `${ann.queries.length} quer${ann.queries.length === 1 ? 'y' : 'ies'}` : 'No queries'}</span>
            </div>
        `;
        return;
    }
    
    let coveredCount = 0;
    for (const sub of subTechs) {
        const subId = sub.external_references?.[0]?.external_id || '';
        const subAnn = getTechniqueAnnotation(subId);
        if (subAnn?.queries?.length > 0) coveredCount++;
    }
    
    const pct = Math.round((coveredCount / subTechs.length) * 100);
    const fillClass = pct === 0 ? 'none' : (pct < 100 ? 'partial' : '');
    
    container.innerHTML = `
        <div class="tech-coverage-bar">
            <div class="tech-coverage-fill ${fillClass}" style="width: ${pct}%"></div>
        </div>
        <span class="tech-coverage-text">${coveredCount}/${subTechs.length} sub-techniques (${pct}%)</span>
    `;
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('tech-modal-breadcrumb');
    const path = document.getElementById('tech-breadcrumb-path');
    const backBtn = document.getElementById('tech-breadcrumb-back');
    
    if (techNavHistory.length === 0) {
        breadcrumb.classList.add('hidden');
        return;
    }
    
    breadcrumb.classList.remove('hidden');
    
    const items = techNavHistory.slice(-3).map(id => {
        const tech = state.techniques.find(t => t.external_references?.[0]?.external_id === id);
        return tech ? { id, name: tech.name } : { id, name: id };
    });
    
    path.innerHTML = items.map((item, i) => 
        `<span class="tech-breadcrumb-item">${escapeHtml(item.name)}</span>` +
        (i < items.length - 1 ? '<span class="tech-breadcrumb-sep">›</span>' : '')
    ).join('');
    
    backBtn.onclick = () => {
        const prevId = techNavHistory.pop();
        currentTechId = prevId;
        if (prevId) {
            showTechniqueModal(prevId, true);
        }
    };
}

function renderTechniqueDetails(tech) {
    const details = [];
    const techniqueId = tech.external_references?.[0]?.external_id || '';
    
    if (tech.x_mitre_is_subtechnique) {
        const parentId = techniqueId.split('.')[0];
        const parentTech = state.techniques.find(t => {
            const tid = t.external_references?.[0]?.external_id || '';
            return tid === parentId && !t.x_mitre_is_subtechnique;
        });
        if (parentTech) {
            details.push({
                icon: 'bi-diagram-3',
                title: 'Parent Technique',
                items: `<div class="entity-chip entity-chip-clickable" data-tech-id="${parentId}" style="cursor: pointer;">
                    <span class="entity-name">${parentTech.name}</span>
                    <span class="entity-id">${parentId}</span>
                    <i class="bi bi-arrow-right-short"></i>
                </div>`
            });
        }
    } else {
        const subTechs = state.techniques.filter(t => {
            const tid = t.external_references?.[0]?.external_id || '';
            return tid.startsWith(techniqueId + '.') && t.x_mitre_is_subtechnique;
        });
        if (subTechs.length) {
            details.push({
                icon: 'bi-diagram-3',
                title: `Sub-techniques (${subTechs.length})`,
                items: subTechs.map(st => {
                    const subId = st.external_references?.[0]?.external_id || '';
                    return `<div class="entity-chip entity-chip-clickable" data-tech-id="${subId}" style="cursor: pointer;">
                        <span class="entity-name">${st.name}</span>
                        <span class="entity-id">${subId}</span>
                        <i class="bi bi-arrow-right-short"></i>
                    </div>`;
                }).join('')
            });
        }
    }
    
    // Enrich Data Sources / Data Components from relationships
    const detectsRels = state.relationships.filter(r => r.relationship_type === 'detects' && r.target_ref === tech.id);
    if (detectsRels.length) {
        const componentItems = detectsRels.map(r => {
            const component = state.dataComponents.find(dc => dc.id === r.source_ref);
            if (!component) return '';
            const source = state.dataSources.find(ds => ds.id === component.x_mitre_data_source_ref);
            const sourceName = source ? source.name : 'Unknown Data Source';
            return `<div class="data-component-item border-bottom pb-2 mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="detail-tag font-semibold" style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.15); color: var(--accent-blue);">${escapeHtml(sourceName)}</span>
                    <span class="text-on-surface text-xs font-semibold ml-1">› ${escapeHtml(component.name)}</span>
                </div>
                ${r.description ? `<div class="text-on-surface-secondary text-xs mt-1 pl-2 border-left italic">${parseDescription(r.description)}</div>` : ''}
            </div>`;
        }).filter(Boolean).join('');

        if (componentItems) {
            details.push({
                icon: 'bi-database-check',
                title: 'Data Sources & Components',
                items: `<div class="data-components-list mt-2">${componentItems}</div>`
            });
        }
    } else if (tech.x_mitre_data_sources?.length) {
        details.push({
            icon: 'bi-database',
            title: 'Data Sources (Legacy)',
            items: tech.x_mitre_data_sources.map(ds => `<span class="detail-tag">${escapeHtml(ds)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_permissions_required?.length) {
        details.push({
            icon: 'bi-key',
            title: 'Permissions Required',
            items: tech.x_mitre_permissions_required.map(p => `<span class="detail-tag">${escapeHtml(p)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_effective_permissions?.length) {
        details.push({
            icon: 'bi-shield-lock',
            title: 'Effective Permissions',
            items: tech.x_mitre_effective_permissions.map(p => `<span class="detail-tag tag-effective-permissions">${escapeHtml(p)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_defense_bypassed?.length) {
        details.push({
            icon: 'bi-shield-slash',
            title: 'Defense Bypassed',
            items: tech.x_mitre_defense_bypassed.map(d => `<span class="detail-tag tag-defense-bypassed">${escapeHtml(d)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_network_requirements !== undefined) {
        details.push({
            icon: 'bi-globe',
            title: 'Network Requirements',
            items: `<span class="detail-tag ${tech.x_mitre_network_requirements ? 'tag-true' : 'tag-false'}">${tech.x_mitre_network_requirements ? 'Yes' : 'No'}</span>`
        });
    }
    
    if (tech.x_mitre_system_requirements?.length) {
        details.push({
            icon: 'bi-pc-display',
            title: 'System Requirements',
            items: tech.x_mitre_system_requirements.map(r => `<span class="detail-tag">${escapeHtml(r)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_remote_support !== undefined) {
        details.push({
            icon: 'bi-wifi',
            title: 'Remote Support',
            items: `<span class="detail-tag ${tech.x_mitre_remote_support ? 'tag-true' : 'tag-false'}">${tech.x_mitre_remote_support ? 'Yes' : 'No'}</span>`
        });
    }
    
    if (tech.x_mitre_impact_type?.length) {
        details.push({
            icon: 'bi-exclamation-triangle',
            title: 'Impact Type',
            items: tech.x_mitre_impact_type.map(t => `<span class="detail-tag">${escapeHtml(t)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_contributors?.length) {
        details.push({
            icon: 'bi-people',
            title: 'Contributors',
            items: tech.x_mitre_contributors.map(c => `<span class="detail-tag">${escapeHtml(c)}</span>`).join('')
        });
    }
    
    if (tech.x_mitre_detection) {
        details.push({
            icon: 'bi-search',
            title: 'Detection',
            items: `<div class="detail-text">${parseDescription(tech.x_mitre_detection)}</div>`
        });
    }
    
    const extRefs = tech.external_references?.filter(r => r.source_name !== 'mitre-attack') || [];
    if (extRefs.length) {
        details.push({
            icon: 'bi-link-45deg',
            title: 'External References',
            items: extRefs.map(r => `<a href="${r.url}" target="_blank" rel="noopener" class="detail-link">${escapeHtml(r.source_name)}${r.description ? ': ' + escapeHtml(r.description.substring(0, 60)) + '...' : ''}</a>`).join('')
        });
    }
    
    if (tech.created || tech.modified) {
        details.push({
            icon: 'bi-clock-history',
            title: 'Timeline',
            items: `<div class="detail-meta">
                ${tech.created ? `<span>Created: ${new Date(tech.created).toLocaleDateString()}</span>` : ''}
                ${tech.modified ? `<span>Modified: ${new Date(tech.modified).toLocaleDateString()}</span>` : ''}
                ${tech.x_mitre_version ? `<span>Version: ${tech.x_mitre_version}</span>` : ''}
            </div>`
        });
    }
    
    document.getElementById('tab-details').innerHTML = details.length
        ? `<div class="tech-details-grid">${details.map(d => `
            <div class="tech-detail-section">
                <div class="tech-detail-header">
                    <i class="bi ${d.icon}"></i>
                    <span>${d.title}</span>
                </div>
                <div class="tech-detail-content">${d.items}</div>
            </div>
        `).join('')}</div>`
        : '<div class="empty-state"><i class="bi bi-info-circle"></i><p>No additional details available.</p></div>';
    
    document.querySelectorAll('#tab-details .entity-chip-clickable').forEach(chip => {
        chip.addEventListener('click', () => {
            showTechniqueModal(chip.dataset.techId);
        });
    });
}

function refreshTechniqueModalQueries() {
    if (!state.currentModalTechniqueId) return;
    const techniqueId = state.currentModalTechniqueId;
    const ann = getTechniqueAnnotation(techniqueId);
    const queries = ann?.queries || [];
    
    document.getElementById('tab-queries').innerHTML = `
        <div class="query-disclaimer">
            <i class="bi bi-info-circle"></i>
            <span>Queries stored here are drafts and may not reflect the final version deployed to your SIEM/EDR.</span>
        </div>
        <div class="tech-tab-toolbar">
            <span class="tech-tab-toolbar-count">${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}</span>
            <button class="btn-tech-primary" id="btn-add-query-modal" data-tech="${techniqueId}">
                <i class="bi bi-plus-lg"></i>
                <span>Add Query</span>
            </button>
        </div>
    ` + (queries.length
        ? queries.map(q => {
            const modifiedStr = formatTimestamp(q.lastModified || q.created);
            return `
            <div class="tech-card query-card-item ${q.archived ? 'query-card-archived' : ''}">
                <div class="tech-card-header">
                    <div class="tech-card-header-left">
                        <button class="btn btn-sm btn-ghost query-fav-btn ${q.favorite ? 'query-fav-active' : ''}" data-tech="${techniqueId}" data-query="${q.id}" title="Toggle favorite">
                            <i class="bi bi-star${q.favorite ? '-fill' : ''}"></i>
                        </button>
                        <span class="tech-card-name">${escapeHtml(q.name)}${q.archived ? '<span class="query-archived-badge" title="Archived"><i class="bi bi-archive"></i> Archived</span>' : ''}</span>
                    </div>
                    <div class="query-header-badges">
                        ${q.sentinelCandidate ? '<span class="sentinel-candidate-badge" title="Candidate for Sentinel analytic"><i class="bi bi-robot"></i> Sentinel Candidate</span>' : ''}
                        <span class="query-lang-badge ${q.language}">${q.language}</span>
                    </div>
                </div>
                ${q.archived && q.archiveReason ? `<div class="query-archive-reason"><i class="bi bi-info-circle"></i> ${escapeHtml(q.archiveReason)}</div>` : ''}
                <div class="query-card-body">${highlightQuerySyntax(q.query, q.language)}</div>
                ${q.description ? `<p class="query-card-desc">${escapeHtml(q.description)}</p>` : ''}
                ${q.source ? `<div class="query-card-source"><i class="bi bi-link-45deg"></i>Source: ${escapeHtml(q.source)}</div>` : ''}
                <div class="query-card-item-footer">
                    <span class="query-modified"><i class="bi bi-clock"></i> ${modifiedStr}</span>
                    <div class="tech-card-actions">
                        <button class="btn-tech-ghost btn-copy-query-inline" data-query="${encodeURIComponent(q.query)}">
                            <i class="bi bi-clipboard"></i>
                            <span>Copy</span>
                        </button>
                        <button class="btn-tech-ghost btn-edit-query-modal" data-query-id="${q.id}" data-tech="${techniqueId}">
                            <i class="bi bi-pencil"></i>
                            <span>Edit</span>
                        </button>
                        ${q.archived 
                            ? `<button class="btn-tech-ghost btn-unarchive-query-modal" data-query-id="${q.id}" data-tech="${techniqueId}" title="Restore query"><i class="bi bi-arrow-counterclockwise"></i></button>`
                            : `<button class="btn-tech-ghost btn-archive-query-modal" data-query-id="${q.id}" data-tech="${techniqueId}" title="Archive query"><i class="bi bi-archive"></i></button>`
                        }
                        <button class="btn-tech-ghost btn-delete-query-modal" data-query-id="${q.id}" data-tech="${techniqueId}">
                            <i class="bi bi-trash"></i>
                            <span>Delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        }).join('')
        : '<div class="empty-state"><i class="bi bi-code-slash"></i><p>No queries added yet.</p></div>');
    document.getElementById('count-queries').textContent = queries.length;

    document.getElementById('btn-add-query-modal')?.addEventListener('click', () => {
        openQueryEditor(null, techniqueId);
    });

    document.querySelectorAll('.btn-copy-query-inline').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(decodeURIComponent(btn.dataset.query));
            showToast('Query copied!', 'success');
        });
    });
    
    document.querySelectorAll('.btn-edit-query-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = queries.find(q => q.id === btn.dataset.queryId);
            if (q) {
                const modalInstance = bootstrap.Modal.getInstance(document.getElementById('technique-modal'));
                if (modalInstance) modalInstance.hide();
                setTimeout(() => {
                    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
                    openQueryEditor(q, techniqueId);
                }, 400);
            }
        });
    });
    
    document.querySelectorAll('.btn-delete-query-modal').forEach(async (btn) => {
        btn.addEventListener('click', async () => {
            const q = queries.find(q => q.id === btn.dataset.queryId);
            if (!q) return;
            const confirmed = await showConfirm('Delete Query', `Delete "${q.name}"?`);
            if (confirmed) {
                deleteQuery(btn.dataset.tech, btn.dataset.queryId);
                refreshTechniqueModalQueries();
                showToast('Query deleted', 'info');
            }
        });
    });
    
    document.querySelectorAll('.query-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.tech, btn.dataset.query);
            refreshTechniqueModalQueries();
        });
    });
    
    document.querySelectorAll('.btn-archive-query-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openArchiveModal(btn.dataset.queryId, btn.dataset.tech);
            setTimeout(() => {
                const archiveModal = document.getElementById('archive-query-modal');
                archiveModal.addEventListener('hidden.bs.modal', () => {
                    refreshTechniqueModalQueries();
                }, { once: true });
            }, 100);
        });
    });
    
    document.querySelectorAll('.btn-unarchive-query-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            unarchiveQuery(btn.dataset.queryId, btn.dataset.tech);
            refreshTechniqueModalQueries();
        });
    });
}

function updateTechniqueMonth(techniqueId, month) {
    const ann = getTechniqueAnnotation(techniqueId);
    if (ann) {
        ann.monthAdded = month;
        autoSaveLayer();
        showToast('Month updated', 'success');
    }
}
