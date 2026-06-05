

export function showSoftwareModal(softwareId) {
    const software = state.software.find(s => {
        const sid = s.external_references?.[0]?.external_id || '';
        return sid === softwareId;
    });
    if (!software) return;
    
    const prevModal = document.querySelector('.modal.show');
    const prevModalId = prevModal?.id || '';
    if (prevModalId) {
        const instance = bootstrap.Modal.getInstance(prevModal);
        if (instance) instance.hide();
    }
    
    setTimeout(() => {
        const swId_display = software.external_references?.[0]?.external_id || 'N/A';
        const created = software.created ? new Date(software.created).toLocaleDateString() : '';
        const modified = software.modified ? new Date(software.modified).toLocaleDateString() : '';
        const aliases = software.x_mitre_aliases || software.aliases || [];
        const platforms = software.x_mitre_platforms || [];
        const contributors = software.x_mitre_contributors || [];
        
        const theme = getSoftwareTheme(software);
        const avatarSvg = getProceduralSoftwareAvatarSVG(software.id, software.name, software.type);
        
        const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === software.id);
        const relatedTechniques = techRels.map(r => {
            const tech = state.techniques.find(t => t.id === r.target_ref);
            return tech ? { ...tech, relationshipId: r.id } : null;
        }).filter(Boolean);
        
        const techByTactic = {};
        for (const tech of relatedTechniques) {
            const phases = tech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack') || [];
            for (const phase of phases) {
                const tactic = state.tactics.find(t => t.x_mitre_shortname === phase.phase_name);
                const tacticName = tactic?.name || phase.phase_name;
                if (!techByTactic[tacticName]) techByTactic[tacticName] = [];
                techByTactic[tacticName].push(tech);
            }
        }
        
        const orderedTactics = state.tactics
            .filter(t => t.x_mitre_shortname)
            .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
        
        const groupIds = new Set(techRels.map(r => r.target_ref));
        const relatedGroups = state.groups.filter(g => 
            state.relationships.some(r => r.relationship_type === 'uses' && r.source_ref === g.id && groupIds.has(r.target_ref))
        );
        
        const techCount = relatedTechniques.length;
        const groupCount = relatedGroups.length;
        const coveredCount = relatedTechniques.filter(t => {
            const tid = t.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
        
        // Render beautiful OS platform badges with custom styling
        const platformBadgesHtml = platforms.map(p => {
            let pClass = '';
            let pIcon = 'bi-laptop';
            const pLower = p.toLowerCase();
            if (pLower.includes('windows')) {
                pClass = 'platform-windows';
                pIcon = 'bi-windows';
            } else if (pLower.includes('macos') || pLower.includes('mac')) {
                pClass = 'platform-macos';
                pIcon = 'bi-apple';
            } else if (pLower.includes('linux')) {
                pClass = 'platform-linux';
                pIcon = 'bi-terminal';
            } else {
                pClass = 'platform-other';
                pIcon = 'bi-cpu';
            }
            return `<span class="software-platform-badge ${pClass}" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;" title="Platform: ${escapeHtml(p)}"><i class="bi ${pIcon} mr-1"></i>${escapeHtml(p)}</span>`;
        }).join('');
        
        let tabsHtml = `
            <div class="software-tab-nav" style="border-bottom: 1px solid rgba(${theme.accentRGB}, 0.15) !important;">
                <button class="software-tab-btn active" data-sw-tab="overview" style="border-bottom-color: ${theme.accentHex} !important; color: ${theme.accentHex} !important;">
                    <i class="bi bi-info-circle"></i> Overview
                </button>
                <button class="software-tab-btn" data-sw-tab="techniques">
                    <i class="bi bi-grid"></i> Techniques <span class="software-tab-count" style="background: rgba(${theme.accentRGB}, 0.1) !important; color: ${theme.accentHex} !important;">${techCount}</span>
                </button>
                <button class="software-tab-btn" data-sw-tab="heatmap">
                    <i class="bi bi-grid-3x3-gap"></i> Heatmap
                </button>
                <button class="software-tab-btn" data-sw-tab="groups">
                    <i class="bi bi-people"></i> Groups <span class="software-tab-count">${groupCount}</span>
                </button>
            </div>
        `;
        
        const coverageValueStyle = coveragePct > 0 ? `color: ${theme.accentHex}; font-weight: 700; text-shadow: 0 0 8px rgba(${theme.accentRGB}, 0.3);` : '';
        
        let overviewHtml = `
            <div class="software-tab-pane active" id="software-tab-overview">
                <div class="software-overview-layout">
                    <!-- Main Content Column -->
                    <div class="software-overview-main">
                        <div class="software-detail-desc" style="font-size: 0.9rem;">${parseDescription(software.description || 'No description available.')}</div>
                        
                        ${techCount > 0 ? `
                            <div class="software-coverage-bar-container" style="border-color: rgba(${theme.accentRGB}, 0.15) !important;">
                                <div class="software-coverage-bar-label">Technique Query Coverage</div>
                                <div class="software-coverage-bar-track">
                                    <div class="software-coverage-bar-fill" style="width: ${coveragePct}%; background: linear-gradient(90deg, ${theme.accentHex}, #20c997); box-shadow: 0 0 10px rgba(${theme.accentRGB}, 0.35);"></div>
                                </div>
                                <div class="software-coverage-bar-stats">
                                    <span class="software-coverage-stat covered" style="color: ${theme.accentHex} !important; font-weight: 600;"><i class="bi bi-check-circle-fill"></i> ${coveredCount} covered</span>
                                    <span class="software-coverage-stat uncovered"><i class="bi bi-x-circle"></i> ${techCount - coveredCount} uncovered</span>
                                    <button class="btn btn-sm btn-outline-primary ms-auto software-view-matrix-btn" style="color: ${theme.accentHex} !important; border-color: rgba(${theme.accentRGB}, 0.4) !important;" data-sw-id="${swId_display}">
                                        <i class="bi bi-grid-3x2"></i> View in Matrix
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${relatedTechniques.length ? `
                            <div class="software-section">
                                <h6 class="software-section-title"><i class="bi bi-grid"></i> Top Techniques</h6>
                                <div class="software-tech-preview">
                                    ${relatedTechniques.slice(0, 12).map(tech => {
                                        const techId = tech.external_references?.[0]?.external_id || '';
                                        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                                        const hasQuery = ann?.queries && ann.queries.length > 0;
                                        return `<div class="software-tech-chip entity-chip-clickable ${hasQuery ? 'software-tech-chip-covered' : ''}" data-tech-id="${techId}">
                                            ${hasQuery ? '<i class="bi bi-check-circle-fill software-tech-query-indicator"></i>' : ''}
                                            <span class="software-tech-chip-id" style="background: rgba(${theme.accentRGB}, 0.1); color: ${theme.accentHex}; font-weight: 700;">${techId}</span>
                                            <span class="software-tech-chip-name">${escapeHtml(tech.name)}</span>
                                        </div>`;
                                    }).join('')}
                                    ${relatedTechniques.length > 12 ? `<span class="software-tech-more">+${relatedTechniques.length - 12} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Sidebar Content Column -->
                    <div class="software-overview-sidebar">
                        <div class="software-meta-grid" style="grid-template-columns: 1fr; margin-bottom: 0;">
                            ${created ? `<div class="software-meta-item"><span class="software-meta-label">Created</span><span class="software-meta-value">${created}</span></div>` : ''}
                            ${modified ? `<div class="software-meta-item"><span class="software-meta-label">Modified</span><span class="software-meta-value">${modified}</span></div>` : ''}
                            <div class="software-meta-item"><span class="software-meta-label">Type</span><span class="software-meta-value"><span class="${theme.badgeClass}"><i class="bi ${theme.icon} mr-1"></i>${theme.name}</span></span></div>
                            <div class="software-meta-item"><span class="software-meta-label">Query Coverage</span><span class="software-meta-value ${coveragePct > 0 ? 'software-coverage-good' : 'software-coverage-none'}" style="${coverageValueStyle}">${coveragePct}% (${coveredCount}/${techCount})</span></div>
                        </div>
                        
                        ${aliases.length ? `
                            <div class="software-section mb-0">
                                <h6 class="software-section-title"><i class="bi bi-tag"></i> Aliases</h6>
                                <div class="software-tags flex flex-wrap gap-2">${aliases.map(a => `<span class="detail-tag">${escapeHtml(a)}</span>`).join('')}</div>
                            </div>
                        ` : ''}
                        
                        ${platforms.length ? `
                            <div class="software-section mb-0">
                                <h6 class="software-section-title"><i class="bi bi-laptop"></i> Platforms</h6>
                                <div class="software-tags flex flex-wrap gap-2">${platformBadgesHtml}</div>
                            </div>
                        ` : ''}
                        
                        ${contributors.length ? `
                            <div class="software-section mb-0">
                                <h6 class="software-section-title"><i class="bi bi-person-fill-check"></i> Contributors</h6>
                                <div class="software-tags flex flex-wrap gap-2">${contributors.map(c => `<span class="detail-tag">${escapeHtml(c)}</span>`).join('')}</div>
                            </div>
                        ` : ''}
                        
                        ${relatedGroups.length ? `
                            <div class="software-section mb-0">
                                <h6 class="software-section-title"><i class="bi bi-people"></i> Associated Groups</h6>
                                <div class="software-group-preview">
                                    ${relatedGroups.slice(0, 8).map(g => {
                                        const gId = g.external_references?.[0]?.external_id || '';
                                        return `<div class="software-group-chip entity-chip-clickable" data-group-id="${g.id}">
                                            <span class="software-group-chip-id" style="background: rgba(${theme.accentRGB}, 0.08); color: ${theme.accentHex}; font-weight: 700;">${gId}</span>
                                            <span class="software-group-chip-name">${escapeHtml(g.name)}</span>
                                        </div>`;
                                    }).join('')}
                                    ${relatedGroups.length > 8 ? `<span class="software-group-more">+${relatedGroups.length - 8} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        let techniquesHtml = `
            <div class="software-tab-pane" id="software-tab-techniques">
                <div class="software-tech-filters mb-3">
                    <input type="text" class="form-control form-control-sm" id="software-tech-filter" placeholder="Filter techniques...">
                    <div class="software-tech-filter-btns">
                        <button class="btn btn-sm btn-outline-secondary active" data-tech-filter="all">All</button>
                        <button class="btn btn-sm btn-outline-success" data-tech-filter="covered"><i class="bi bi-check-circle"></i> Covered</button>
                        <button class="btn btn-sm btn-outline-secondary" data-tech-filter="uncovered"><i class="bi bi-x-circle"></i> Uncovered</button>
                    </div>
                </div>
                <div class="software-tech-list" id="software-tech-list">
        `;
        
        for (const tactic of orderedTactics) {
            const tacticName = tactic.name;
            const techs = techByTactic[tacticName] || [];
            if (techs.length === 0) continue;
            
            techniquesHtml += `
                <div class="software-tactic-section" data-tactic="${escapeHtml(tacticName)}">
                    <h6 class="software-tactic-header" style="background: rgba(${theme.accentRGB}, 0.1) !important; color: ${theme.accentHex} !important; border-left: 3px solid ${theme.accentHex};">${escapeHtml(tacticName)}</h6>
                    <div class="software-tactic-techs">
                        ${techs.map(tech => {
                            const techId = tech.external_references?.[0]?.external_id || '';
                            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                            const hasQuery = ann?.queries && ann.queries.length > 0;
                            return `<div class="software-tech-item entity-chip-clickable ${hasQuery ? 'software-tech-item-covered' : ''}" data-tech-id="${techId}" data-covered="${hasQuery}">
                                ${hasQuery ? '<i class="bi bi-check-circle-fill software-tech-query-icon"></i>' : ''}
                                <span class="software-tech-item-id" style="background: rgba(${theme.accentRGB}, 0.1) !important; color: ${theme.accentHex} !important;">${techId}</span>
                                <span class="software-tech-item-name">${escapeHtml(tech.name)}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        techniquesHtml += `</div></div>`;
        
        let heatmapHtml = `
            <div class="software-tab-pane" id="software-tab-heatmap">
                <div class="software-heatmap-container">
        `;
        
        if (relatedTechniques.length === 0) {
            heatmapHtml += `<div class="empty-state"><i class="bi bi-grid-3x3-gap"></i><p>No techniques to display.</p></div>`;
        } else {
            const techSet = new Set(relatedTechniques.map(t => t.external_references?.[0]?.external_id));
            
            const heatmapTactics = orderedTactics.filter(tactic => {
                const shortname = tactic.x_mitre_shortname;
                return state.techniques.some(t => {
                    if (t.type !== 'attack-pattern') return false;
                    const phases = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack') || [];
                    return phases.some(p => p.phase_name === shortname) && techSet.has(t.external_references?.[0]?.external_id);
                });
            });
            
            heatmapHtml += `<div class="software-heatmap-scroll"><table class="software-heatmap-table">`;
            heatmapHtml += `<thead><tr><th class="software-heatmap-header" style="min-width:200px; position:sticky; left:0; z-index:3; background: rgba(${theme.accentRGB}, 0.12) !important; color: ${theme.accentHex} !important;">Technique</th>`;
            
            for (const tactic of heatmapTactics) {
                heatmapHtml += `<th class="software-heatmap-header" style="background: rgba(${theme.accentRGB}, 0.08) !important; color: ${theme.accentHex} !important;">${escapeHtml(tactic.name)}</th>`;
            }
            heatmapHtml += `</tr></thead><tbody>`;
            
            for (const tech of relatedTechniques) {
                const techId = tech.external_references?.[0]?.external_id || '';
                const phases = tech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack') || [];
                const techTactics = new Set(phases.map(p => p.phase_name));
                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                const hasQuery = ann?.queries && ann.queries.length > 0;
                
                heatmapHtml += `<tr class="software-heatmap-row">`;
                heatmapHtml += `<td class="software-heatmap-tech-cell">
                    <span class="software-heatmap-tech-id" style="color: ${theme.accentHex} !important;">${techId}</span>
                    <span class="software-heatmap-tech-name">${escapeHtml(tech.name)}</span>
                </td>`;
                
                for (const tactic of heatmapTactics) {
                    const shortname = tactic.x_mitre_shortname;
                    if (techTactics.has(shortname)) {
                        heatmapHtml += `<td class="software-heatmap-cell ${hasQuery ? 'software-heatmap-cell-covered' : 'software-heatmap-cell-active'}" data-tech-id="${techId}" title="${techId}: ${escapeHtml(tech.name)}${hasQuery ? ' (Has queries)' : ''}" style="${!hasQuery ? `background: rgba(${theme.accentRGB}, 0.04) !important;` : ''}">
                            ${hasQuery ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-circle"></i>'}
                        </td>`;
                    } else {
                        heatmapHtml += `<td class="software-heatmap-cell"></td>`;
                    }
                }
                heatmapHtml += `</tr>`;
            }
            
            heatmapHtml += `</tbody></table></div>`;
        }
        
        heatmapHtml += `</div></div>`;
        
        let groupsHtml = `
            <div class="software-tab-pane" id="software-tab-groups">
        `;
        
        if (relatedGroups.length === 0) {
            groupsHtml += `<div class="empty-state"><i class="bi bi-people"></i><p>No associated groups.</p></div>`;
        } else {
            groupsHtml += `<div class="software-group-list">`;
            for (const g of relatedGroups) {
                const gId = g.external_references?.[0]?.external_id || '';
                groupsHtml += `
                    <div class="software-group-item entity-chip-clickable" data-group-id="${g.id}">
                        <div class="software-group-item-header">
                            <span class="software-group-id" style="background: rgba(${theme.accentRGB}, 0.1) !important; color: ${theme.accentHex} !important;">${gId}</span>
                            <span class="software-group-name" style="font-weight: 700;">${escapeHtml(g.name)}</span>
                        </div>
                        ${g.description ? `<p class="software-group-desc">${escapeHtml(g.description.substring(0, 120))}${g.description.length > 120 ? '...' : ''}</p>` : ''}
                    </div>
                `;
            }
            groupsHtml += `</div>`;
        }
        
        groupsHtml += `</div>`;
        
        const modalHtml = `
            <div class="modal fade" id="software-detail-modal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content technique-modal" style="border: 1px solid rgba(${theme.accentRGB}, 0.2) !important; box-shadow: 0 5px 30px rgba(0,0,0,0.5), 0 0 25px rgba(${theme.accentRGB}, 0.1) !important;">
                        <div class="tech-modal-header software-modal-header" style="border-bottom: 1px solid rgba(${theme.accentRGB}, 0.15) !important; background: rgba(${theme.accentRGB}, 0.03) !important;">
                            <button type="button" class="btn-close tech-modal-close" data-bs-dismiss="modal"></button>
                            <div class="software-detail-header-wrap" style="display: flex; align-items: center; gap: 1rem;">
                                <div class="detail-modal-avatar" style="width: 52px; height: 52px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: none; padding: 0; border: 1px solid rgba(${theme.accentRGB}, 0.3); box-shadow: 0 0 15px rgba(${theme.accentRGB}, 0.2);">
                                    ${avatarSvg}
                                </div>
                                <div class="tech-modal-header-content" style="display: flex; flex-direction: column; gap: 0.25rem;">
                                    <div class="tech-modal-badges" style="display: flex; align-items: center; gap: 0.5rem;">
                                        ${swId_display && swId_display !== 'N/A' && swId_display.trim() !== '' ? `<span class="tech-badge-id" style="background: rgba(${theme.accentRGB}, 0.12); color: ${theme.accentHex}; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; font-weight: bold; border-radius: 4px; padding: 2px 6px;">${escapeHtml(swId_display)}</span>` : ''}
                                        <span class="${theme.badgeClass}"><i class="bi ${theme.icon}"></i> ${theme.name}</span>
                                    </div>
                                    <h3 class="tech-modal-title" style="margin: 0; font-size: 1.4rem; font-weight: 800; color: var(--on-surface); text-shadow: 0 0 12px rgba(${theme.accentRGB}, 0.15);">${escapeHtml(software.name)}</h3>
                                </div>
                            </div>
                        </div>
                        <div class="tech-modal-body">
                            <div class="tech-modal-scroll">
                                ${tabsHtml}
                                ${overviewHtml}
                                ${techniquesHtml}
                                ${heatmapHtml}
                                ${groupsHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const existing = document.getElementById('software-detail-modal');
        if (existing) existing.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = new bootstrap.Modal(document.getElementById('software-detail-modal'));
        modal.show();
        
        document.getElementById('software-detail-modal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('software-detail-modal').remove();
            if (prevModalId) {
                const prevInstance = bootstrap.Modal.getInstance(document.getElementById(prevModalId));
                if (prevInstance) prevInstance.show();
            }
        });
        
        document.querySelectorAll('#software-detail-modal .software-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#software-detail-modal .software-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.borderBottomColor = 'transparent';
                    b.style.color = 'var(--on-surface-secondary)';
                    const countSpan = b.querySelector('.software-tab-count');
                    if (countSpan) {
                        countSpan.style.background = 'rgba(21, 27, 43, 0.6)';
                        countSpan.style.color = 'inherit';
                    }
                });
                document.querySelectorAll('#software-detail-modal .software-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                btn.style.borderBottomColor = theme.accentHex;
                btn.style.color = theme.accentHex;
                const activeCountSpan = btn.querySelector('.software-tab-count');
                if (activeCountSpan) {
                    activeCountSpan.style.background = `rgba(${theme.accentRGB}, 0.12)`;
                    activeCountSpan.style.color = theme.accentHex;
                }
                document.getElementById(`software-tab-${btn.dataset.swTab}`).classList.add('active');
            });
        });
        
        document.querySelectorAll('#software-detail-modal .entity-chip-clickable').forEach(chip => {
            chip.addEventListener('click', () => {
                const sModal = bootstrap.Modal.getInstance(document.getElementById('software-detail-modal'));
                if (sModal) sModal.hide();
                if (chip.dataset.techId) {
                    setTimeout(() => showTechniqueModal(chip.dataset.techId), 300);
                } else if (chip.dataset.groupId) {
                    setTimeout(() => showGroupModal(chip.dataset.groupId), 300);
                }
            });
        });
        
        const techFilter = document.getElementById('software-tech-filter');
        if (techFilter) {
            const applyFilters = () => {
                const textFilter = techFilter.value.toLowerCase();
                const coverageFilter = document.querySelector('#software-detail-modal .software-tech-filter-btns .btn.active')?.dataset.techFilter || 'all';
                
                document.querySelectorAll('#software-tech-list .software-tech-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const isCovered = item.dataset.covered === 'true';
                    const matchesText = !textFilter || text.includes(textFilter);
                    const matchesCoverage = coverageFilter === 'all' || 
                        (coverageFilter === 'covered' && isCovered) || 
                        (coverageFilter === 'uncovered' && !isCovered);
                    item.style.display = (matchesText && matchesCoverage) ? '' : 'none';
                });
                document.querySelectorAll('#software-tech-list .software-tactic-section').forEach(section => {
                    const visible = section.querySelectorAll('.software-tech-item[style=""], .software-tech-item:not([style])');
                    section.style.display = visible.length > 0 ? '' : 'none';
                });
            };
            
            techFilter.addEventListener('input', applyFilters);
            
            document.querySelectorAll('#software-detail-modal .software-tech-filter-btns .btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#software-detail-modal .software-tech-filter-btns .btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    applyFilters();
                });
            });
        }
        
        document.querySelectorAll('#software-detail-modal .software-view-matrix-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sModal = bootstrap.Modal.getInstance(document.getElementById('software-detail-modal'));
                if (sModal) sModal.hide();
                setTimeout(() => {
                    document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'));
                    document.querySelector('[data-view="matrix"]')?.classList.add('active');
                    document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                    document.getElementById('matrix-view')?.classList.remove('hidden');
                    
                    const sw = state.software.find(s => {
                        const sid = s.external_references?.[0]?.external_id || '';
                        return sid === btn.dataset.swId;
                    });
                    if (sw) {
                        const techIds = state.relationships
                            .filter(r => r.relationship_type === 'uses' && r.source_ref === sw.id)
                            .map(r => r.target_ref);
                        const techObjects = techIds.map(id => state.techniques.find(t => t.id === id)).filter(Boolean);
                        const extIds = techObjects.map(t => t.external_references?.[0]?.external_id).filter(Boolean);
                        
                        if (state.currentLayer) {
                            extIds.forEach(tid => {
                                let ann = state.currentLayer.techniques.find(a => a.techniqueID === tid);
                                if (!ann) {
                                    ann = { techniqueID: tid, enabled: true, queries: [] };
                                    state.currentLayer.techniques.push(ann);
                                }
                                ann.enabled = true;
                            });
                            autoSaveLayer();
                            renderMatrix();
                        }
                    }
                }, 300);
            });
        });
    }, 300);
}

// Legacy Window Bindings
window.showSoftwareModal = showSoftwareModal;
