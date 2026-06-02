

function showGroupModal(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const prevModal = document.querySelector('.modal.show');
    const prevModalId = prevModal?.id || '';
    if (prevModalId) {
        const instance = bootstrap.Modal.getInstance(prevModal);
        if (instance) instance.hide();
    }
    
    setTimeout(() => {
        const theme = getAttributionTheme(group);
        const avatarSvg = getProceduralAvatarSVG(group.id, group.name);
        const groupId_display = group.external_references?.[0]?.external_id || 'N/A';
        const domains = group.x_mitre_domains || [];
        const aliases = group.x_mitre_aliases || group.aliases || [];
        const motivations = [group.primary_motivation, ...(group.secondary_motivations || [])].filter(Boolean);
        const sophistication = group.sophistication || '';
        const resourceLevel = group.resource_level || '';
        const created = group.created ? new Date(group.created).toLocaleDateString() : '';
        const modified = group.modified ? new Date(group.modified).toLocaleDateString() : '';
        const firstSeen = group.first_seen ? new Date(group.first_seen).toLocaleDateString() : '';
        const lastSeen = group.last_seen ? new Date(group.last_seen).toLocaleDateString() : '';
        const goals = group.goals || [];
        const contributors = group.x_mitre_contributors || [];
        
        const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
        const techIds = techRels.map(r => r.target_ref);
        const relatedTechniques = techRels.map(r => {
            const tech = state.techniques.find(t => t.id === r.target_ref);
            return tech ? { ...tech, relationshipId: r.id } : null;
        }).filter(Boolean);
        
        const softwareRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
        const relatedSoftware = softwareRels.map(r => {
            const sw = state.software.find(s => s.id === r.target_ref && (s.type === 'malware' || s.type === 'tool'));
            return sw ? { ...sw, relationshipId: r.id } : null;
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
        
        const techCount = relatedTechniques.length;
        const softwareCount = relatedSoftware.length;
        const coveredCount = relatedTechniques.filter(t => {
            const tid = t.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
        
        let tabsHtml = '';
        
        tabsHtml += `
            <div class="group-tab-nav">
                <button class="group-tab-btn active" data-group-tab="overview">
                    <i class="bi bi-info-circle"></i> Overview
                </button>
                <button class="group-tab-btn" data-group-tab="techniques">
                    <i class="bi bi-grid"></i> Techniques <span class="group-tab-count">${techCount}</span>
                </button>
                <button class="group-tab-btn" data-group-tab="gap-mapper" style="position: relative;">
                    <i class="bi bi-shield-slash"></i> Gap Mapper 
                    ${techCount - coveredCount > 0 ? `<span class="group-tab-count" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-weight: 700; font-size: 10px;">${techCount - coveredCount} Gaps</span>` : `<span class="group-tab-count" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-weight: 700; font-size: 10px;">100% Ready</span>`}
                </button>
                <button class="group-tab-btn" data-group-tab="heatmap">
                    <i class="bi bi-grid-3x3-gap"></i> Heatmap
                </button>
                <button class="group-tab-btn" data-group-tab="software">
                    <i class="bi bi-box"></i> Software <span class="group-tab-count">${softwareCount}</span>
                </button>
            </div>
        `;
        
        // Search the global live feeds for mentions of this threat group
        const matchedArticles = [];
        if (window.intelArticles && window.intelArticles.length > 0) {
            const groupNameLower = group.name.toLowerCase();
            const aliasNames = (group.x_mitre_aliases || group.aliases || []).map(a => a.toLowerCase());
            
            window.intelArticles.forEach(art => {
                const searchTarget = (art.title + ' ' + art.description).toLowerCase();
                const isMatch = searchTarget.includes(groupNameLower) || aliasNames.some(alias => searchTarget.includes(alias));
                if (isMatch) {
                    matchedArticles.push(art);
                }
            });
        }
        
        let liveFeedHtml = '';
        if (matchedArticles.length === 0) {
            liveFeedHtml = `
                <div class="group-live-feed-container">
                    <div class="group-live-feed-header" style="color: var(--on-surface-secondary);">
                        <i class="bi bi-shield-radar text-primary animate-pulse" style="animation: pulse 2s infinite;"></i> Live Intelligence Trackings
                    </div>
                    <div class="text-xs text-on-surface-tertiary" style="background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.05); border-radius: 6px; padding: 15px; text-align: center; font-size: 0.72rem;">
                        No active in-the-wild campaigns or news mentions currently recorded in Aggregated Feeds for this actor.
                    </div>
                </div>
            `;
        } else {
            liveFeedHtml = `
                <div class="group-live-feed-container">
                    <div class="group-live-feed-header" style="color: ${theme.accentHex};">
                        <i class="bi bi-shield-radar text-primary animate-pulse" style="color: ${theme.accentHex} !important; animation: pulse 2s infinite;"></i> Active Campaign Alerts (${matchedArticles.length})
                    </div>
                    <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                        ${matchedArticles.map(art => {
                            const dateStr = art.pubDate ? new Date(art.pubDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                            const sourcesStr = art.sources ? art.sources.map(s => s.name).join(', ') : 'Intel Source';
                            return `
                                <div class="group-live-card">
                                    <div class="d-flex align-items-center justify-content-between mb-1" style="font-size: 10px;">
                                        <span style="color: ${theme.accentHex}; font-weight: 700;">${escapeHtml(sourcesStr)}</span>
                                        <span class="text-on-surface-tertiary"><i class="bi bi-calendar3"></i> ${dateStr}</span>
                                    </div>
                                    <h6 style="font-size: 12px; font-weight: 700; margin: 4px 0; color: var(--on-surface-primary);">${escapeHtml(art.title)}</h6>
                                    <p style="font-size: 11px; color: var(--on-surface-secondary); line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(art.description)}</p>
                                    <div class="d-flex align-items-center mt-2" style="border-top: 1px solid rgba(255,255,255,0.03); padding-top: 4px;">
                                        <a href="${art.link}" target="_blank" class="btn btn-xs btn-outline-primary" style="font-size: 8.5px; height: 18px; padding: 1px 6px; display: inline-flex; align-items: center; gap: 3px;">
                                            <i class="bi bi-box-arrow-up-right"></i> Read Report
                                        </a>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        let overviewHtml = `
            <div class="group-tab-pane active" id="group-tab-overview">
                <div class="group-detail-desc">${parseDescription(group.description || 'No description available.')}</div>
                
                <div class="group-meta-grid">
                    ${created ? `<div class="group-meta-item"><span class="group-meta-label">Created</span><span class="group-meta-value">${created}</span></div>` : ''}
                    ${modified ? `<div class="group-meta-item"><span class="group-meta-label">Modified</span><span class="group-meta-value">${modified}</span></div>` : ''}
                    ${firstSeen ? `<div class="group-meta-item"><span class="group-meta-label">First Observed</span><span class="group-meta-value">${firstSeen}</span></div>` : ''}
                    ${lastSeen ? `<div class="group-meta-item"><span class="group-meta-label">Last Observed</span><span class="group-meta-value">${lastSeen}</span></div>` : ''}
                    ${sophistication ? `<div class="group-meta-item"><span class="group-meta-label">Sophistication</span><span class="group-meta-value">${escapeHtml(sophistication)}</span></div>` : ''}
                    ${resourceLevel ? `<div class="group-meta-item"><span class="group-meta-label">Resource Level</span><span class="group-meta-value">${escapeHtml(resourceLevel)}</span></div>` : ''}
                    ${techCount > 0 ? `<div class="group-meta-item"><span class="group-meta-label">Query Coverage</span><span class="group-meta-value" style="color: ${theme.accentHex}; font-weight: bold; text-shadow: 0 0 8px rgba(${theme.accentRGB}, 0.2);">${coveragePct}% (${coveredCount}/${techCount})</span></div>` : ''}
                </div>
                
                ${techCount > 0 ? `
                    <div class="group-coverage-bar-container" style="border-color: rgba(${theme.accentRGB}, 0.15);">
                        <div class="group-coverage-bar-label">Technique Query Coverage</div>
                        <div class="group-coverage-bar-track">
                            <div class="group-coverage-bar-fill" style="width: ${coveragePct}%; background: ${theme.accentHex}; box-shadow: 0 0 10px rgba(${theme.accentRGB}, 0.35);"></div>
                        </div>
                        <div class="group-coverage-bar-stats">
                            <span class="group-coverage-stat covered" style="color: ${theme.accentHex};"><i class="bi bi-check-circle-fill"></i> ${coveredCount} covered</span>
                            <span class="group-coverage-stat uncovered"><i class="bi bi-x-circle"></i> ${techCount - coveredCount} uncovered</span>
                            <button class="btn btn-sm btn-outline-primary ms-auto group-view-matrix-btn" data-group-id="${groupId_display}">
                                <i class="bi bi-grid-3x2"></i> View in Matrix
                            </button>
                        </div>
                    </div>
                ` : ''}
                
                ${goals.length ? `
                    <div class="group-section">
                        <h6 class="group-section-title"><i class="bi bi-target"></i> Group Goals</h6>
                        <ul class="group-goals-list text-sm pl-4 mb-0" style="list-style-type: square; color: var(--on-surface-secondary); line-height: 1.6;">
                            ${goals.map(g => `<li>${escapeHtml(g)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                ${domains.length ? `
                    <div class="group-section">
                        <h6 class="group-section-title"><i class="bi bi-globe"></i> Domains</h6>
                        <div class="group-tags">${domains.map(d => `<span class="group-tag">${escapeHtml(d)}</span>`).join('')}</div>
                    </div>
                ` : ''}
                
                ${aliases.length ? `
                    <div class="group-section">
                        <h6 class="group-section-title"><i class="bi bi-tag"></i> Aliases</h6>
                        <div class="group-tags">${aliases.map(a => `<span class="group-tag group-tag-alias">${escapeHtml(a)}</span>`).join('')}</div>
                    </div>
                ` : ''}
                
                ${motivations.length ? `
                    <div class="group-section">
                        <h6 class="group-section-title"><i class="bi bi-heart"></i> Motivations</h6>
                        <div class="group-tags">${motivations.map(m => `<span class="group-tag group-tag-motivation" style="background: rgba(${theme.accentRGB}, 0.08); border-color: rgba(${theme.accentRGB}, 0.2); color: ${theme.accentHex};">${escapeHtml(m)}</span>`).join('')}</div>
                    </div>
                ` : ''}
                
                ${contributors.length ? `
                    <div class="group-section">
                        <h6 class="group-section-title"><i class="bi bi-person-fill-check"></i> Contributors</h6>
                        <div class="group-tags">${contributors.map(c => `<span class="group-tag group-tag-contributor">${escapeHtml(c)}</span>`).join('')}</div>
                    </div>
                ` : ''}
                
                ${relatedTechniques.length ? `
                    <div class="group-section">
                        <h6 class="group-section-title"><i class="bi bi-grid"></i> Top Techniques</h6>
                        <div class="group-tech-preview">
                            ${relatedTechniques.slice(0, 12).map(tech => {
                                const techId = tech.external_references?.[0]?.external_id || '';
                                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                                const hasQuery = ann?.queries && ann.queries.length > 0;
                                return `<div class="group-tech-chip entity-chip-clickable ${hasQuery ? 'group-tech-chip-covered' : ''}" data-tech-id="${techId}">
                                    ${hasQuery ? '<i class="bi bi-check-circle-fill group-tech-query-indicator"></i>' : ''}
                                    <span class="group-tech-chip-id" style="background: rgba(${theme.accentRGB}, 0.1); color: ${theme.accentHex};">${techId}</span>
                                    <span class="group-tech-chip-name">${escapeHtml(tech.name)}</span>
                                </div>`;
                            }).join('')}
                            ${relatedTechniques.length > 12 ? `<span class="group-tech-more">+${relatedTechniques.length - 12} more</span>` : ''}
                        </div>
                    </div>
                ` : ''}
                
                ${liveFeedHtml}
            </div>
        `;
        
        let techniquesHtml = `
            <div class="group-tab-pane" id="group-tab-techniques">
                <div class="group-tech-filters mb-3">
                    <input type="text" class="form-control form-control-sm" id="group-tech-filter" placeholder="Filter techniques...">
                    <div class="group-tech-filter-btns">
                        <button class="btn btn-sm btn-outline-secondary active" data-tech-filter="all">All</button>
                        <button class="btn btn-sm btn-outline-success" data-tech-filter="covered"><i class="bi bi-check-circle"></i> Covered</button>
                        <button class="btn btn-sm btn-outline-secondary" data-tech-filter="uncovered"><i class="bi bi-x-circle"></i> Uncovered</button>
                    </div>
                </div>
                <div class="group-tech-list" id="group-tech-list">
        `;
        
        for (const tactic of orderedTactics) {
            const tacticName = tactic.name;
            const techs = techByTactic[tacticName] || [];
            if (techs.length === 0) continue;
            
            techniquesHtml += `
                <div class="group-tactic-section" data-tactic="${escapeHtml(tacticName)}">
                    <h6 class="group-tactic-header">${escapeHtml(tacticName)}</h6>
                    <div class="group-tactic-techs">
                        ${techs.map(tech => {
                            const techId = tech.external_references?.[0]?.external_id || '';
                            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                            const hasQuery = ann?.queries && ann.queries.length > 0;
                            return `<div class="group-tech-item entity-chip-clickable ${hasQuery ? 'group-tech-item-covered' : ''}" data-tech-id="${techId}" data-covered="${hasQuery}">
                                ${hasQuery ? '<i class="bi bi-check-circle-fill group-tech-query-icon"></i>' : ''}
                                <span class="group-tech-item-id">${techId}</span>
                                <span class="group-tech-item-name">${escapeHtml(tech.name)}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        techniquesHtml += `</div></div>`;
        
        let softwareHtml = `
            <div class="group-tab-pane" id="group-tab-software">
        `;
        
        if (relatedSoftware.length === 0) {
            softwareHtml += `<div class="empty-state"><i class="bi bi-box"></i><p>No associated software.</p></div>`;
        } else {
            softwareHtml += `<div class="group-software-list">`;
            for (const sw of relatedSoftware) {
                const swId = sw.external_references?.[0]?.external_id || '';
                const swType = sw.type === 'malware' ? 'Malware' : 'Tool';
                const swTypeClass = sw.type === 'malware' ? 'group-sw-malware' : 'group-sw-tool';
                softwareHtml += `
                    <div class="group-sw-item group-sw-clickable" data-sw-id="${swId}">
                        <div class="group-sw-item-header">
                            <span class="group-sw-id">${swId}</span>
                            <span class="group-sw-type ${swTypeClass}">${swType}</span>
                            <span class="group-sw-name">${escapeHtml(sw.name)}</span>
                        </div>
                        ${sw.description ? `<p class="group-sw-desc">${escapeHtml(sw.description.substring(0, 150))}${sw.description.length > 150 ? '...' : ''}</p>` : ''}
                    </div>
                `;
            }
            softwareHtml += `</div>`;
        }
        
        softwareHtml += `</div>`;
        
        let heatmapHtml = `
            <div class="group-tab-pane" id="group-tab-heatmap">
                <div class="group-heatmap-container">
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
            
            heatmapHtml += `<div class="group-heatmap-scroll"><table class="group-heatmap-table">`;
            heatmapHtml += `<thead><tr><th class="group-heatmap-header" style="min-width:200px; position:sticky; left:0; z-index:3;">Technique</th>`;
            
            for (const tactic of heatmapTactics) {
                heatmapHtml += `<th class="group-heatmap-header">${escapeHtml(tactic.name)}</th>`;
            }
            heatmapHtml += `</tr></thead><tbody>`;
            
            for (const tech of relatedTechniques) {
                const techId = tech.external_references?.[0]?.external_id || '';
                const phases = tech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack') || [];
                const techTactics = new Set(phases.map(p => p.phase_name));
                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                const hasQuery = ann?.queries && ann.queries.length > 0;
                
                heatmapHtml += `<tr class="group-heatmap-row">`;
                heatmapHtml += `<td class="group-heatmap-tech-cell">
                    <span class="group-heatmap-tech-id">${techId}</span>
                    <span class="group-heatmap-tech-name">${escapeHtml(tech.name)}</span>
                </td>`;
                
                for (const tactic of heatmapTactics) {
                    const shortname = tactic.x_mitre_shortname;
                    if (techTactics.has(shortname)) {
                        heatmapHtml += `<td class="group-heatmap-cell ${hasQuery ? 'group-heatmap-cell-covered' : 'group-heatmap-cell-active'}" data-tech-id="${techId}" title="${techId}: ${escapeHtml(tech.name)}${hasQuery ? ' (Has queries)' : ''}">
                            ${hasQuery ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-circle"></i>'}
                        </td>`;
                    } else {
                        heatmapHtml += `<td class="group-heatmap-cell"></td>`;
                    }
                }
                heatmapHtml += `</tr>`;
            }
            
            heatmapHtml += `</tbody></table></div>`;
        }
        
        heatmapHtml += `</div></div>`;
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        let gapMapperHtml = `
            <div class="group-tab-pane" id="group-tab-gap-mapper">
                <div class="group-coverage-bar-container mb-4" style="background: ${isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-md);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div>
                            <h5 style="margin: 0; font-size: 15px; font-weight: 700; color: ${isDark ? '#f3f4f6' : '#1f2937'};">Defensive Readiness Index against ${escapeHtml(group.name)}</h5>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--on-surface-secondary);">Measures your active coverage against this specific threat actor's known techniques.</p>
                        </div>
                        <div style="width: 58px; height: 58px; display: flex; align-items: center; justify-content: center; background: ${coveragePct >= 70 ? 'rgba(16, 185, 129, 0.1)' : coveragePct >= 40 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border: 2px solid ${coveragePct >= 70 ? 'var(--accent-green)' : coveragePct >= 40 ? 'var(--accent-tan)' : 'var(--accent-red)'}; border-radius: 50%; font-weight: 800; font-size: 15px; color: ${coveragePct >= 70 ? 'var(--accent-green)' : coveragePct >= 40 ? 'var(--accent-tan)' : 'var(--accent-red)'}; box-shadow: 0 0 10px ${coveragePct >= 70 ? 'rgba(16, 185, 129, 0.2)' : coveragePct >= 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'};">
                            ${coveragePct}%
                        </div>
                    </div>
                    <div class="group-coverage-bar-track" style="height: 8px; border-radius: 4px; background: ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}; overflow: hidden; position: relative;">
                        <div class="group-coverage-bar-fill" style="width: ${coveragePct}%; height: 100%; border-radius: 4px; background: ${coveragePct >= 70 ? 'var(--accent-green)' : coveragePct >= 40 ? 'var(--accent-tan)' : 'var(--accent-red)'}; transition: width 0.3s ease;"></div>
                    </div>
                    <div class="d-flex text-xs mt-2" style="font-weight: 600; color: var(--on-surface-secondary);">
                        <span>✓ ${coveredCount} Covered Techniques</span>
                        <span class="ms-auto" style="color: ${techCount - coveredCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">
                            ${techCount - coveredCount > 0 ? `⚠️ ${techCount - coveredCount} Critical Blindspots` : '🛡️ Fully Ready'}
                        </span>
                    </div>
                </div>

                <h6 style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--on-surface-tertiary); letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                    <i class="bi bi-shield-slash" style="color: var(--accent-red); font-size: 14px;"></i> Threat Actor Gap Coverage Details
                </h6>
                <div class="gap-mapper-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; max-height: 380px; overflow-y: auto; padding-right: 4px; margin-bottom: 10px;">
                    ${relatedTechniques.map(tech => {
                        const techId = tech.external_references?.[0]?.external_id || '';
                        const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === techId);
                        const hasQuery = ann?.queries && ann.queries.length > 0;
                        return `
                            <div style="background: ${isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.005)'}; border: 1px solid ${hasQuery ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease;">
                                <div>
                                    <div class="d-flex align-items-center justify-content-between mb-1">
                                        <span style="font-family: monospace; font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background: ${hasQuery ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${hasQuery ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                            ${techId}
                                        </span>
                                        <span class="text-xs" style="font-weight: 700; font-size: 9px; letter-spacing: 0.03em; color: ${hasQuery ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                            ${hasQuery ? '✓ COVERED' : '⚠️ GAP BLINDSPOT'}
                                        </span>
                                    </div>
                                    <h6 style="margin: 6px 0; font-size: 12px; font-weight: 600; color: var(--on-surface); line-height: 1.4;">${escapeHtml(tech.name)}</h6>
                                </div>
                                <div class="d-flex align-items-center mt-3 pt-2" style="border-top: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'};">
                                    <span style="font-size: 10px; color: var(--on-surface-tertiary);">
                                        ${hasQuery ? `${ann.queries.length} active quer${ann.queries.length === 1 ? 'y' : 'ies'}` : '0 queries deployed'}
                                    </span>
                                    <button class="btn btn-xs ${hasQuery ? 'btn-outline-secondary' : 'btn-outline-primary'} ms-auto ${hasQuery ? 'view-tech-btn' : 'create-hunt-btn'}" data-tech-id="${techId}" style="font-size: 9px; padding: 2px 8px; font-weight: bold; height: 22px;">
                                        ${hasQuery ? '<i class="bi bi-eye mr-1"></i>View' : '<i class="bi bi-plus-lg mr-1"></i>Create Hunt'}
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        const modalHtml = `
            <div class="modal fade" id="group-detail-modal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content technique-modal" style="border: 1px solid rgba(${theme.accentRGB}, 0.2); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(${theme.accentRGB}, 0.1);">
                        <div class="tech-modal-header" style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <button type="button" class="btn-close tech-modal-close" data-bs-dismiss="modal"></button>
                            <div class="group-detail-header-wrap" style="display: flex; align-items: center; gap: 1rem;">
                                <div class="detail-modal-avatar" style="width: 58px; height: 58px; border-radius: 12px; overflow: hidden; flex-shrink: 0; background: none; padding: 0;">
                                    ${avatarSvg}
                                </div>
                                <div class="tech-modal-header-content" style="flex: 1; min-width: 0;">
                                    <div class="tech-modal-badges" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                        <span class="tech-badge-id" style="background: rgba(${theme.accentRGB}, 0.12); color: ${theme.accentHex}; font-family: 'JetBrains Mono', monospace; font-weight: bold; border-radius: 4px; padding: 2px 6px; font-size: 0.72rem;">${groupId_display}</span>
                                        <span class="${theme.badgeClass}"><i class="bi ${theme.icon} mr-1"></i>${theme.name}</span>
                                    </div>
                                    <h3 class="tech-modal-title" style="margin: 0; font-size: 1.35rem; font-weight: 800; display: flex; align-items: center; gap: 6px; color: var(--on-surface-primary);">
                                        ${escapeHtml(group.name)} 
                                        <i class="bi bi-terminal-fill hacker-glow-icon" title="Threat Actor Group" style="font-size: 1.15rem; margin: 0; color: ${theme.accentHex}; text-shadow: 0 0 10px rgba(${theme.accentRGB}, 0.85); vertical-align: middle;"></i>
                                    </h3>
                                </div>
                            </div>
                        </div>
                        <div class="tech-modal-body">
                            <div class="tech-modal-scroll">
                                ${tabsHtml}
                                ${overviewHtml}
                                ${techniquesHtml}
                                ${softwareHtml}
                                ${heatmapHtml}
                                ${gapMapperHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const existing = document.getElementById('group-detail-modal');
        if (existing) existing.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = new bootstrap.Modal(document.getElementById('group-detail-modal'));
        modal.show();
        
        document.getElementById('group-detail-modal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('group-detail-modal').remove();
            if (prevModalId) {
                const prevInstance = bootstrap.Modal.getInstance(document.getElementById(prevModalId));
                if (prevInstance) prevInstance.show();
            }
        });
        
        document.querySelectorAll('#group-detail-modal .group-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#group-detail-modal .group-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#group-detail-modal .group-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`group-tab-${btn.dataset.groupTab}`).classList.add('active');
            });
        });
        
        document.querySelectorAll('#group-detail-modal .entity-chip-clickable').forEach(chip => {
            chip.addEventListener('click', () => {
                const gModal = bootstrap.Modal.getInstance(document.getElementById('group-detail-modal'));
                if (gModal) gModal.hide();
                setTimeout(() => showTechniqueModal(chip.dataset.techId), 300);
            });
        });
        
        document.querySelectorAll('#group-detail-modal .group-heatmap-cell-active').forEach(cell => {
            cell.addEventListener('click', () => {
                const gModal = bootstrap.Modal.getInstance(document.getElementById('group-detail-modal'));
                if (gModal) gModal.hide();
                setTimeout(() => showTechniqueModal(cell.dataset.techId), 300);
            });
        });
        
        document.querySelectorAll('#group-detail-modal .group-sw-clickable').forEach(item => {
            item.addEventListener('click', () => {
                const gModal = bootstrap.Modal.getInstance(document.getElementById('group-detail-modal'));
                if (gModal) gModal.hide();
                setTimeout(() => showSoftwareModal(item.dataset.swId), 300);
            });
        });

        document.querySelectorAll('#group-detail-modal .create-hunt-btn, #group-detail-modal .view-tech-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gModal = bootstrap.Modal.getInstance(document.getElementById('group-detail-modal'));
                if (gModal) gModal.hide();
                
                const techId = btn.dataset.techId;
                const isCreate = btn.classList.contains('create-hunt-btn');
                
                setTimeout(() => {
                    document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'));
                    document.querySelector('[data-view="matrix"]')?.classList.add('active');
                    document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                    document.getElementById('matrix-view')?.classList.remove('hidden');
                    
                    showTechniqueModal(techId);
                    
                    if (isCreate) {
                        setTimeout(() => {
                            document.getElementById('btn-add-query-modal')?.click();
                        }, 500);
                    }
                }, 350);
            });
        });
        
        const techFilter = document.getElementById('group-tech-filter');
        if (techFilter) {
            const applyFilters = () => {
                const textFilter = techFilter.value.toLowerCase();
                const coverageFilter = document.querySelector('#group-detail-modal .group-tech-filter-btns .btn.active')?.dataset.techFilter || 'all';
                
                document.querySelectorAll('#group-tech-list .group-tech-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const isCovered = item.dataset.covered === 'true';
                    const matchesText = !textFilter || text.includes(textFilter);
                    const matchesCoverage = coverageFilter === 'all' || 
                        (coverageFilter === 'covered' && isCovered) || 
                        (coverageFilter === 'uncovered' && !isCovered);
                    item.style.display = (matchesText && matchesCoverage) ? '' : 'none';
                });
                document.querySelectorAll('#group-tech-list .group-tactic-section').forEach(section => {
                    const visible = section.querySelectorAll('.group-tech-item[style=""], .group-tech-item:not([style])');
                    section.style.display = visible.length > 0 ? '' : 'none';
                });
            };
            
            techFilter.addEventListener('input', applyFilters);
            
            document.querySelectorAll('#group-detail-modal .group-tech-filter-btns .btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#group-detail-modal .group-tech-filter-btns .btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    applyFilters();
                });
            });
        }
        
        document.querySelectorAll('#group-detail-modal .group-view-matrix-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gModal = bootstrap.Modal.getInstance(document.getElementById('group-detail-modal'));
                if (gModal) gModal.hide();
                setTimeout(() => {
                    document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'));
                    document.querySelector('[data-view="matrix"]')?.classList.add('active');
                    document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                    document.getElementById('matrix-view')?.classList.remove('hidden');
                    
                    const grp = state.groups.find(g => {
                        const gid = g.external_references?.[0]?.external_id || '';
                        return gid === btn.dataset.groupId;
                    });
                    if (grp) {
                        const techIds = state.relationships
                            .filter(r => r.relationship_type === 'uses' && r.source_ref === grp.id)
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
