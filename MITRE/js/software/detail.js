function showSoftwareModal(softwareId) {
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
        const swType = software.type === 'malware' ? 'Malware' : 'Tool';
        const swTypeIcon = software.type === 'malware' ? 'bi-bug' : 'bi-wrench';
        const created = software.created ? new Date(software.created).toLocaleDateString() : '';
        const modified = software.modified ? new Date(software.modified).toLocaleDateString() : '';
        
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
        
        let tabsHtml = `
            <div class="software-tab-nav">
                <button class="software-tab-btn active" data-sw-tab="overview">
                    <i class="bi bi-info-circle"></i> Overview
                </button>
                <button class="software-tab-btn" data-sw-tab="techniques">
                    <i class="bi bi-grid"></i> Techniques <span class="software-tab-count">${techCount}</span>
                </button>
                <button class="software-tab-btn" data-sw-tab="heatmap">
                    <i class="bi bi-grid-3x3-gap"></i> Heatmap
                </button>
                <button class="software-tab-btn" data-sw-tab="groups">
                    <i class="bi bi-people"></i> Groups <span class="software-tab-count">${groupCount}</span>
                </button>
            </div>
        `;
        
        let overviewHtml = `
            <div class="software-tab-pane active" id="software-tab-overview">
                <div class="software-detail-desc">${parseDescription(software.description || 'No description available.')}</div>
                
                <div class="software-meta-grid">
                    ${created ? `<div class="software-meta-item"><span class="software-meta-label">Created</span><span class="software-meta-value">${created}</span></div>` : ''}
                    ${modified ? `<div class="software-meta-item"><span class="software-meta-label">Modified</span><span class="software-meta-value">${modified}</span></div>` : ''}
                    <div class="software-meta-item"><span class="software-meta-label">Type</span><span class="software-meta-value"><i class="bi ${swTypeIcon}"></i> ${swType}</span></div>
                    <div class="software-meta-item"><span class="software-meta-label">Query Coverage</span><span class="software-meta-value ${coveragePct > 0 ? 'software-coverage-good' : 'software-coverage-none'}">${coveragePct}% (${coveredCount}/${techCount})</span></div>
                </div>
                
                ${techCount > 0 ? `
                    <div class="software-coverage-bar-container">
                        <div class="software-coverage-bar-label">Technique Query Coverage</div>
                        <div class="software-coverage-bar-track">
                            <div class="software-coverage-bar-fill" style="width: ${coveragePct}%"></div>
                        </div>
                        <div class="software-coverage-bar-stats">
                            <span class="software-coverage-stat covered"><i class="bi bi-check-circle-fill"></i> ${coveredCount} covered</span>
                            <span class="software-coverage-stat uncovered"><i class="bi bi-x-circle"></i> ${techCount - coveredCount} uncovered</span>
                            <button class="btn btn-sm btn-outline-primary ms-auto software-view-matrix-btn" data-sw-id="${swId_display}">
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
                                    <span class="software-tech-chip-id">${techId}</span>
                                    <span class="software-tech-chip-name">${escapeHtml(tech.name)}</span>
                                </div>`;
                            }).join('')}
                            ${relatedTechniques.length > 12 ? `<span class="software-tech-more">+${relatedTechniques.length - 12} more</span>` : ''}
                        </div>
                    </div>
                ` : ''}
                
                ${relatedGroups.length ? `
                    <div class="software-section">
                        <h6 class="software-section-title"><i class="bi bi-people"></i> Associated Groups</h6>
                        <div class="software-group-preview">
                            ${relatedGroups.slice(0, 8).map(g => {
                                const gId = g.external_references?.[0]?.external_id || '';
                                return `<div class="software-group-chip entity-chip-clickable" data-group-id="${g.id}">
                                    <span class="software-group-chip-id">${gId}</span>
                                    <span class="software-group-chip-name">${escapeHtml(g.name)}</span>
                                </div>`;
                            }).join('')}
                            ${relatedGroups.length > 8 ? `<span class="software-group-more">+${relatedGroups.length - 8} more</span>` : ''}
                        </div>
                    </div>
                ` : ''}
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
                    <h6 class="software-tactic-header">${escapeHtml(tacticName)}</h6>
                    <div class="software-tactic-techs">
                        ${techs.map(tech => {
                            const techId = tech.external_references?.[0]?.external_id || '';
                            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                            const hasQuery = ann?.queries && ann.queries.length > 0;
                            return `<div class="software-tech-item entity-chip-clickable ${hasQuery ? 'software-tech-item-covered' : ''}" data-tech-id="${techId}" data-covered="${hasQuery}">
                                ${hasQuery ? '<i class="bi bi-check-circle-fill software-tech-query-icon"></i>' : ''}
                                <span class="software-tech-item-id">${techId}</span>
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
            heatmapHtml += `<thead><tr><th class="software-heatmap-header" style="min-width:200px; position:sticky; left:0; z-index:3;">Technique</th>`;
            
            for (const tactic of heatmapTactics) {
                heatmapHtml += `<th class="software-heatmap-header">${escapeHtml(tactic.name)}</th>`;
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
                    <span class="software-heatmap-tech-id">${techId}</span>
                    <span class="software-heatmap-tech-name">${escapeHtml(tech.name)}</span>
                </td>`;
                
                for (const tactic of heatmapTactics) {
                    const shortname = tactic.x_mitre_shortname;
                    if (techTactics.has(shortname)) {
                        heatmapHtml += `<td class="software-heatmap-cell ${hasQuery ? 'software-heatmap-cell-covered' : 'software-heatmap-cell-active'}" data-tech-id="${techId}" title="${techId}: ${escapeHtml(tech.name)}${hasQuery ? ' (Has queries)' : ''}">
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
                            <span class="software-group-id">${gId}</span>
                            <span class="software-group-name">${escapeHtml(g.name)}</span>
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
                    <div class="modal-content technique-modal">
                        <div class="tech-modal-header software-modal-header">
                            <button type="button" class="btn-close tech-modal-close" data-bs-dismiss="modal"></button>
                            <div class="tech-modal-header-content">
                                <div class="tech-modal-badges">
                                    <span class="tech-badge-id">${swId_display}</span>
                                    <span class="tech-badge-type"><i class="bi ${swTypeIcon}"></i> ${swType}</span>
                                </div>
                                <h3 class="tech-modal-title">${escapeHtml(software.name)}</h3>
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
                document.querySelectorAll('#software-detail-modal .software-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#software-detail-modal .software-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
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
                    document.querySelectorAll('.view-section').forEach(s => s.classList.add('d-none'));
                    document.getElementById('matrix-view')?.classList.remove('d-none');
                    
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
                            saveCurrentLayer();
                            renderMatrix();
                        }
                    }
                }, 300);
            });
        });
    }, 300);
}
