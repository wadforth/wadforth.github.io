const BANNER_THEMES = {
    blue: { bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', accent: '#3b82f6', label: 'Blue' },
    orange: { bg: 'linear-gradient(135deg, #1a0f00 0%, #4a2800 100%)', accent: '#f97316', label: 'Orange' },
    green: { bg: 'linear-gradient(135deg, #052e16 0%, #0f4a2e 100%)', accent: '#22c55e', label: 'Green' },
    purple: { bg: 'linear-gradient(135deg, #1a0a2e 0%, #3b1d6e 100%)', accent: '#a855f7', label: 'Purple' },
    red: { bg: 'linear-gradient(135deg, #2a0a0a 0%, #5f1e1e 100%)', accent: '#ef4444', label: 'Red' },
    teal: { bg: 'linear-gradient(135deg, #042f2e 0%, #0e4a47 100%)', accent: '#14b8a6', label: 'Teal' },
    slate: { bg: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', accent: '#94a3b8', label: 'Slate' },
};

async function loadReportsList() {
    if (!state.currentLayer) {
        const container = document.getElementById('reports-list');
        if (container) container.innerHTML = '<p class="text-on-surface-secondary">No active layer loaded.</p>';
        return;
    }

    try {
        const reports = await getReportsForLayer(state.currentLayer.id || 'default');
        state._cachedReports = reports;
        renderReportsList(reports);
    } catch (err) {
        const container = document.getElementById('reports-list');
        if (container) container.innerHTML = `<p class="text-danger">Failed to load reports: ${err.message}</p>`;
    }
}

function getTechniquesByMonth() {
    if (!state.currentLayer?.techniques) return {};
    const byMonth = {};
    
    state.currentLayer.techniques.forEach(ann => {
        const baseMonth = ann.monthAdded || new Date().toISOString().slice(0, 7);
        const techId = ann.techniqueID;
        const isSub = isSubTechnique(techId);
        
        let hasSubs = false;
        if (!isSub && state.techniques) {
            hasSubs = state.techniques.some(t => {
                const ref = t.external_references?.[0]?.external_id;
                return ref && ref.startsWith(techId + '.');
            });
        }
        
        // Strict filtering: Sub-techniques and standalone techniques must have a color
        // or have logged queries to be considered "active" for the report.
        if (!hasSubs && !ann.color && !(ann.queries && ann.queries.length > 0)) return;
        
        if (ann.queries && ann.queries.length > 0) {
            ann.queries.forEach(q => {
                const qMonth = q.monthAdded || baseMonth;
                if (!byMonth[qMonth]) byMonth[qMonth] = [];
                const existing = byMonth[qMonth].find(t => t.techniqueID === ann.techniqueID);
                if (!existing) {
                    byMonth[qMonth].push({ ...ann, queries: [q] });
                } else {
                    if (!existing.queries) existing.queries = [];
                    existing.queries.push(q);
                }
            });
        } else {
            // According to user requirements: sub-techniques and standalone techniques 
            // should only show up in the report if they have logged queries.
            // Parent techniques (which have sub-techniques) can be included under baseMonth if annotated.
            if (hasSubs) {
                if (!byMonth[baseMonth]) byMonth[baseMonth] = [];
                byMonth[baseMonth].push(ann);
            }
        }
    });
    
    return Object.fromEntries(
        Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]))
    );
}

function getAvailableMonths() {
    const byMonth = getTechniquesByMonth();
    const months = Object.keys(byMonth);
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!months.includes(currentMonth)) {
        months.unshift(currentMonth);
    }
    
    return months;
}

function getMonthLabel(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getPreviousMonths(selectedMonth) {
    const allMonths = getAvailableMonths();
    const idx = allMonths.indexOf(selectedMonth);
    return allMonths.slice(idx + 1);
}

function getExistingTechniqueIds(selectedMonth) {
    const prevMonths = getPreviousMonths(selectedMonth);
    const byMonth = getTechniquesByMonth();
    const existingIds = new Set();
    
    prevMonths.forEach(month => {
        (byMonth[month] || []).forEach(ann => {
            existingIds.add(ann.techniqueID);
        });
    });
    
    return existingIds;
}

function isSubTechnique(techId) {
    return techId.includes('.');
}

function getColorName(color, techType) {
    if (!color) return 'None';
    
    const rules = state.autoColorRules || [];
    const typeFilter = techType === 'sub' ? 'query-count' : 'sub-coverage';
    
    for (const rule of rules) {
        if (rule.type === typeFilter && (rule.color + '80' === color || rule.color === color)) {
            return rule.label;
        }
    }
    
    const colorMap = {
        '#ef4444': 'Red',
        '#f97316': 'Orange',
        '#eab308': 'Yellow',
        '#22c55e': 'Green',
        '#3b82f6': 'Blue',
        '#8b5cf6': 'Purple',
    };
    
    const baseColor = color.replace('80', '');
    return colorMap[baseColor] || 'Custom';
}

function renderReportsList(reports) {
    const container = document.getElementById('reports-list');
    const emptyState = document.getElementById('reports-empty');
    if (!container) return;

    if (emptyState) emptyState.classList.add('hidden');

    const stats = getFullCoverageStats();
    const availableMonths = getAvailableMonths();
    const selectedMonth = availableMonths[0];
    const version = state.currentVersion || state.currentLayer?.attackVersion || 'N/A';

    let html = `
        <div class="reports-container">
            <div class="reports-header">
                <div>
                    <h2>${state.currentLayer.name || 'Coverage Reports'}</h2>
                    <p>Track and analyze your MITRE ATT&CK detection coverage over time</p>
                </div>
                <div class="reports-actions">
                    <button class="btn btn-outline-success" onclick="openThreatHuntReportModal()">
                        <i class="bi bi-crosshair mr-2"></i>Threat Hunt Report
                    </button>
                </div>
            </div>

            <div class="reports-stats">
                <div class="stat-card">
                    <div class="stat-value">${stats.total}</div>
                    <div class="stat-label">Total Techniques</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.logged}</div>
                    <div class="stat-label">Logged Techniques</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.covered}</div>
                    <div class="stat-label">With Queries</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.pct % 1 === 0 ? stats.pct : stats.pct.toFixed(1)}%</div>
                    <div class="stat-label">Coverage</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${version}</div>
                    <div class="stat-label">ATT&CK Version</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${reports.length > 0 ? new Date(reports[0].generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
                    <div class="stat-label">Last Report</div>
                </div>
            </div>

            <div class="month-selector-bar mb-4">
                <label class="text-on-surface-tertiary text-sm mr-2">View by Month:</label>
                <select class="form-select form-select-sm" style="width: auto; min-width: 200px;" onchange="renderMonthChangelog(this.value)">
                    ${availableMonths.map(m => `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('')}
                </select>
            </div>

            <div id="month-changelog-container">
                ${renderMonthChangelogHTML(selectedMonth)}
            </div>
    `;

    if (reports.length > 0) {
        html += `
            <div class="reports-section-header mt-5 mb-3">
                <h5><i class="bi bi-journal-text mr-2"></i>Generated Reports</h5>
            </div>
            <div class="reports-list">
        `;
        reports.forEach(report => {
            const changeCount = report.changes?.all?.length || 0;
            const typeClass = report.type === 'initial' ? 'initial' : 'update';
            html += `
                <div class="report-card" onclick="viewReport('${report.id}')">
                    <span class="report-type-badge ${typeClass}">${report.type}</span>
                    <div class="report-info">
                        <div class="report-title">${report.reportMonth || report.generatedDate}</div>
                        <p class="report-summary">${report.executiveSummary?.substring(0, 150)}...</p>
                    </div>
                    <div class="report-meta">
                        ${changeCount > 0 ? `<span class="report-changes">${changeCount} change${changeCount > 1 ? 's' : ''}</span>` : ''}
                        <button class="report-delete" onclick="event.stopPropagation(); confirmDeleteReport('${report.id}')" title="Delete report">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
}

function renderMonthChangelogHTML(month) {
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    if (techniques.length === 0) {
        return `
            <div class="changelog-empty">
                <i class="bi bi-calendar-x"></i>
                <h5>No Techniques Logged</h5>
                <p>No techniques have been logged for ${getMonthLabel(month)}. Add queries to techniques to see them here.</p>
            </div>
        `;
    }

    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const existingTechniques = techniques.filter(t => existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);

    let html = `
        <div class="changelog-header">
            <h4><i class="bi bi-calendar-event mr-2"></i>${getMonthLabel(month)}</h4>
            <span class="changelog-count">${techniques.length} technique${techniques.length === 1 ? '' : 's'} logged</span>
        </div>
    `;

    if (colorChanges.length > 0) {
        html += `
            <div class="changelog-section">
                <h5><i class="bi bi-palette mr-2"></i>Status Changes</h5>
                <div class="changelog-items">
        `;
        colorChanges.forEach(change => {
            const techName = getTechniqueName(change.techniqueID);
            const isSub = isSubTechnique(change.techniqueID);
            const typeBadge = isSub 
                ? '<span class="tech-type-badge sub">Sub-technique</span>' 
                : '<span class="tech-type-badge main">Technique</span>';
            
            html += `
                <div class="changelog-item color-change">
                    <div class="changelog-item-content">
                        <div class="changelog-item-title">
                            ${change.techniqueID} - ${techName}
                            ${typeBadge}
                        </div>
                        <div class="status-change-minimal">
                            <span class="status-swatch-small" style="background: ${change.from || 'transparent'}; border-color: ${change.from || '#555'}"></span>
                            <span class="status-label-small">${change.fromLabel}</span>
                            <i class="bi bi-arrow-right status-arrow-small"></i>
                            <span class="status-swatch-small" style="background: ${change.to || 'transparent'}; border-color: ${change.to || '#555'}"></span>
                            <span class="status-label-small">${change.toLabel}</span>
                        </div>
                        <div class="changelog-item-meta">
                            <i class="bi bi-code-slash mr-1"></i>
                            Triggered by: "${change.queryName}"
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }

    if (newTechniques.length > 0) {
        const newSubs = newTechniques.filter(t => isSubTechnique(t.techniqueID));
        const newMains = newTechniques.filter(t => !isSubTechnique(t.techniqueID));
        
        if (newMains.length > 0) {
            html += `
                <div class="changelog-section">
                    <h5><i class="bi bi-plus-circle mr-2"></i>New Techniques Added</h5>
                    <div class="changelog-items">
            `;
            newMains.forEach(ann => {
                const techName = getTechniqueName(ann.techniqueID);
                const queryCount = ann.queries?.length || 0;
                const threatHunts = getThreatHuntsForTechnique(ann.techniqueID);
                
                html += `
                    <div class="changelog-item new">
                        <div class="changelog-item-icon"><i class="bi bi-plus-circle"></i></div>
                        <div class="changelog-item-content">
                            <div class="changelog-item-title">${ann.techniqueID} - ${techName}</div>
                            ${queryCount > 0 ? `
                                <div class="changelog-queries">
                                    ${ann.queries.map(q => `<span class="query-chip">${escapeHtml(q.name)}</span>`).join('')}
                                </div>
                            ` : '<div class="changelog-item-detail">No queries yet (Check sub-techniques)</div>'}
                            ${threatHunts.length > 0 ? `
                                <div class="changelog-item-meta">
                                    <i class="bi bi-crosshair mr-1"></i>
                                    ${threatHunts.map(h => `"${h}"`).join(', ')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }
        
        if (newSubs.length > 0) {
            html += `
                <div class="changelog-section">
                    <h5><i class="bi bi-plus-circle mr-2"></i>New Sub-techniques Added</h5>
                    <div class="changelog-items">
            `;
            newSubs.forEach(ann => {
                const techName = getTechniqueName(ann.techniqueID);
                const queryCount = ann.queries?.length || 0;
                const threatHunts = getThreatHuntsForTechnique(ann.techniqueID);
                
                html += `
                    <div class="changelog-item new">
                        <div class="changelog-item-icon"><i class="bi bi-plus-circle"></i></div>
                        <div class="changelog-item-content">
                            <div class="changelog-item-title">${ann.techniqueID} - ${techName}</div>
                            ${queryCount > 0 ? `
                                <div class="changelog-queries">
                                    ${ann.queries.map(q => `<span class="query-chip">${escapeHtml(q.name)}</span>`).join('')}
                                </div>
                            ` : '<div class="changelog-item-detail">No queries yet</div>'}
                            ${threatHunts.length > 0 ? `
                                <div class="changelog-item-meta">
                                    <i class="bi bi-crosshair mr-1"></i>
                                    ${threatHunts.map(h => `"${h}"`).join(', ')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }
    }

    if (newHunts.length > 0) {
        html += `
            <div class="changelog-section">
                <h5><i class="bi bi-crosshair mr-2"></i>New Hunts on Existing Techniques</h5>
                <div class="changelog-items">
        `;
        newHunts.forEach(hunt => {
            const techName = getTechniqueName(hunt.techniqueID);
            const isSub = isSubTechnique(hunt.techniqueID);
            const typeBadge = isSub 
                ? '<span class="tech-type-badge sub">Sub-technique</span>' 
                : '<span class="tech-type-badge main">Technique</span>';
            
            html += `
                <div class="changelog-item hunt">
                    <div class="changelog-item-icon"><i class="bi bi-crosshair"></i></div>
                    <div class="changelog-item-content">
                        <div class="changelog-item-title">
                            ${hunt.techniqueID} - ${techName}
                            ${typeBadge}
                        </div>
                        <div class="changelog-item-detail">New hunt added: "${hunt.huntName}"</div>
                        ${hunt.sirTicket ? `<div class="changelog-item-meta"><i class="bi bi-ticket-perforated mr-1"></i>SIR: ${hunt.sirTicket}</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }

    if (existingTechniques.length > 0 && newHunts.length === 0) {
        html += `
            <div class="changelog-section">
                <h5><i class="bi bi-arrow-repeat mr-2"></i>Existing Techniques (No New Hunts)</h5>
                <div class="changelog-items">
        `;
        existingTechniques.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const isSub = isSubTechnique(ann.techniqueID);
            const typeBadge = isSub 
                ? '<span class="tech-type-badge sub">Sub-technique</span>' 
                : '<span class="tech-type-badge main">Technique</span>';
            const queryCount = ann.queries?.length || 0;
            
            html += `
                <div class="changelog-item existing">
                    <div class="changelog-item-icon"><i class="bi bi-check-circle"></i></div>
                    <div class="changelog-item-content">
                        <div class="changelog-item-title">
                            ${ann.techniqueID} - ${techName}
                            ${typeBadge}
                        </div>
                        <div class="changelog-item-detail">${queryCount} quer${queryCount === 1 ? 'y' : 'ies'} logged</div>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }

    return html;
}

function getColorChangesForMonth(month) {
    if (!state.currentLayer?.techniques) return [];
    
    const changes = [];
    const rules = state.autoColorRules || [];
    const byMonth = getTechniquesByMonth();
    const prevMonths = getPreviousMonths(month);
    
    state.currentLayer.techniques.forEach(ann => {
        if (!ann.queries || ann.queries.length === 0) return;
        
        const hasQueryThisMonth = ann.queries.some(q => {
            const qMonth = q.monthAdded || (q.created ? q.created.slice(0, 7) : null);
            return qMonth === month;
        });
        if (!hasQueryThisMonth) return;
        
        const techId = ann.techniqueID;
        const isSub = isSubTechnique(techId);
        const currentQueryCount = ann.queries.length;
        
        let queriesBeforeThisMonth = 0;
        prevMonths.forEach(prevMonth => {
            const prevTechniques = byMonth[prevMonth] || [];
            const prevAnn = prevTechniques.find(t => t.techniqueID === techId);
            if (prevAnn?.queries) {
                queriesBeforeThisMonth += prevAnn.queries.length;
            }
        });
        
        let previousColor = null;
        let previousLabel = 'NO COLOR';
        let currentColor = null;
        let currentLabel = 'NO COLOR';
        
        if (isSub) {
            currentColor = getAutoColorForTechnique(techId, []);
            const currentRule = rules.find(r => (r.color + '80') === currentColor || r.color === currentColor);
            currentLabel = currentRule?.label || 'NO COLOR';
            
            if (queriesBeforeThisMonth > 0) {
                const prevRules = rules.filter(r => r.type === 'query-count');
                for (const rule of prevRules) {
                    let match = false;
                    switch (rule.operator) {
                        case '>=': match = queriesBeforeThisMonth >= rule.value; break;
                        case '>': match = queriesBeforeThisMonth > rule.value; break;
                        case '<=': match = queriesBeforeThisMonth <= rule.value; break;
                        case '<': match = queriesBeforeThisMonth < rule.value; break;
                        case '=': match = queriesBeforeThisMonth === rule.value; break;
                    }
                    if (match) {
                        previousColor = rule.color + '80';
                        previousLabel = rule.label;
                        break;
                    }
                }
            }
        } else {
            const allSubs = state.techniques.filter(t => {
                const ref = t.external_references?.[0]?.external_id;
                return ref && ref.startsWith(techId + '.');
            });
            
            let currentCoveredCount = 0;
            let prevCoveredCount = 0;
            
            allSubs.forEach(sub => {
                const subId = sub.external_references?.[0]?.external_id;
                const subAnn = state.currentLayer.techniques.find(a => a.techniqueID === subId);
                if (subAnn?.queries?.length > 0) {
                    currentCoveredCount++;
                    
                    let subQueriesBeforeThisMonth = 0;
                    prevMonths.forEach(prevMonth => {
                        const prevTechniques = byMonth[prevMonth] || [];
                        const prevSubAnn = prevTechniques.find(t => t.techniqueID === subId);
                        if (prevSubAnn?.queries) {
                            subQueriesBeforeThisMonth += prevSubAnn.queries.length;
                        }
                    });
                    if (subQueriesBeforeThisMonth > 0) {
                        prevCoveredCount++;
                    }
                }
            });
            
            const currentPct = allSubs.length > 0 ? (currentCoveredCount / allSubs.length) * 100 : 0;
            const prevPct = allSubs.length > 0 ? (prevCoveredCount / allSubs.length) * 100 : 0;
            
            const subRules = rules.filter(r => r.type === 'sub-coverage');
            
            for (const rule of subRules) {
                let match = false;
                switch (rule.operator) {
                    case '>=': match = currentPct >= rule.value; break;
                    case '>': match = currentPct > rule.value; break;
                    case '<=': match = currentPct <= rule.value; break;
                    case '<': match = currentPct < rule.value; break;
                    case '=': match = currentPct === rule.value; break;
                }
                if (match) {
                    currentColor = rule.color + '80';
                    currentLabel = rule.label;
                    break;
                }
            }
            
            if (prevCoveredCount > 0) {
                for (const rule of subRules) {
                    let match = false;
                    switch (rule.operator) {
                        case '>=': match = prevPct >= rule.value; break;
                        case '>': match = prevPct > rule.value; break;
                        case '<=': match = prevPct <= rule.value; break;
                        case '<': match = prevPct < rule.value; break;
                        case '=': match = prevPct === rule.value; break;
                    }
                    if (match) {
                        previousColor = rule.color + '80';
                        previousLabel = rule.label;
                        break;
                    }
                }
            }
        }
        
        if (previousColor !== currentColor) {
            const techType = isSub ? 'sub' : 'main';
            changes.push({
                techniqueID: ann.techniqueID,
                from: previousColor,
                fromLabel: getColorName(previousColor, techType),
                to: currentColor,
                toLabel: getColorName(currentColor, techType),
                queryName: ann.queries[ann.queries.length - 1]?.name
            });
        }
    });
    
    return changes;
}

function getNewHuntsForExistingTechniques(month, existingIds) {
    const hunts = [];
    const byMonth = getTechniquesByMonth();
    const currentTechniques = byMonth[month] || [];
    
    currentTechniques.forEach(ann => {
        if (!existingIds.has(ann.techniqueID)) return;
        if (!ann.queries || ann.queries.length === 0) return;
        
        ann.queries.forEach(q => {
            const queryMonth = q.monthAdded || (q.created ? q.created.slice(0, 7) : null);
            if (queryMonth === month) {
                hunts.push({
                    techniqueID: ann.techniqueID,
                    huntName: q.name,
                    sirTicket: '',
                    queryId: q.id
                });
            }
        });
    });
    
    return hunts;
}

function getThreatHuntsForTechnique(techniqueId) {
    const hunts = [];
    state._cachedReports?.forEach(report => {
        report.detectionResults?.forEach(result => {
            if (result.techniqueIds?.includes(techniqueId) && result.huntName) {
                hunts.push(result.huntName);
            }
        });
    });
    return [...new Set(hunts)];
}

function getTechniqueName(techId) {
    if (!state.techniques) return '';
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    return tech?.name || '';
}

function getTechniqueStixId(techId) {
    if (!state.techniques) return null;
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    return tech?.id || null;
}

function getTechniqueIdFromStix(stixId) {
    if (!state.techniques) return null;
    const tech = state.techniques.find(t => t.id === stixId);
    return tech?.external_references?.[0]?.external_id || null;
}

function getTechniqueDescription(techId) {
    if (!state.techniques) return '';
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    if (!tech?.description) return '';
    
    // Get first sentence only (ends with period followed by space or end of string)
    const firstSentence = tech.description.match(/^[^.]*\./);
    return firstSentence ? firstSentence[0] : tech.description.substring(0, 100);
}

function getTechniqueTactics(techId) {
    if (!state.techniques) return [];
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    if (!tech || !tech.kill_chain_phases) return [];
    return tech.kill_chain_phases.map(kp => kp.phase_name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
}

function renderMonthChangelog(month) {
    const container = document.getElementById('month-changelog-container');
    if (container) {
        container.innerHTML = renderMonthChangelogHTML(month);
    }
}

function openThreatHuntReportModal(selectedMonth = null) {
    if (!selectedMonth) {
        selectedMonth = document.querySelector('.month-selector-bar select')?.value || new Date().toISOString().slice(0, 7);
    }
    const now = new Date();
    
    const report = {
        id: `report_${Date.now()}`,
        type: 'update',
        layerId: state.currentLayer.id || 'default',
        layerName: state.currentLayer.name || 'Untitled Layer',
        generatedAt: now.toISOString(),
        generatedDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        reportMonth: getMonthLabel(selectedMonth),
        selectedMonth: selectedMonth,
        periodStart: selectedMonth + '-01T00:00:00.000Z',
        periodEnd: now.toISOString(),
        snapshot: getLayerSnapshot(),
        changes: (() => {
            const byMonth = getTechniquesByMonth();
            const monthTechniques = byMonth[selectedMonth] || [];
            const existingIds = getExistingTechniqueIds(selectedMonth);
            
            const colorChanges = getColorChangesForMonth(selectedMonth);
            const newTechniques = monthTechniques.filter(t => !existingIds.has(t.techniqueID));
            const newHunts = getNewHuntsForExistingTechniques(selectedMonth, existingIds);
            
            const compiledChanges = {
                all: [],
                newTechniques: newTechniques,
                newQueries: [],
                colorChanges: colorChanges,
                mitigationChanges: []
            };
            
            newTechniques.forEach(t => {
                compiledChanges.all.push({ type: 'new_technique', data: t });
            });
            
            colorChanges.forEach(c => {
                compiledChanges.all.push({ type: 'color_change', data: c });
            });
            
            newHunts.forEach(h => {
                compiledChanges.all.push({ type: 'new_query', data: h });
                compiledChanges.newQueries.push(h);
            });
            
            return compiledChanges;
        })(),
        topThreats: [],
        coverageByTactic: getCoverageByTactic(),
        coverageByLanguage: getCoverageByLanguage(),
        fullStats: getFullCoverageStats(),
        author: state.author || '',
        companyName: state.companyName,
        companyLogo: state.companyLogo,
        executiveSummary: '',
        monthlyFocus: '',
        detectionResults: [],
        gapAnalysis: '',
        prioritization: '',
        references: [],
        methodology: {},
        scope: {},
        methodologyNotes: '',
        appendix: {
            methodology: '',
            scope: '',
            limitations: '',
            additionalNotes: ''
        },
        threatHuntFocus: true
    };
    
    state._cachedReports = state._cachedReports || [];
    state._cachedReports.unshift(report);
    
    snapshotDynamicContent(report);
    
    saveReport(report).then(() => {
        renderReportsList(state._cachedReports);
        viewReport(report.id);
    }).catch(err => {
        showToast('Failed to create report: ' + err.message, 'error');
    });
}

function snapshotDynamicContent(report) {
    if (!report.executiveSummary || report.executiveSummary.trim() === '') {
        report.executiveSummary = generateDynamicExecutiveSummary(report);
    }
    if (!report.monthlyFocus || report.monthlyFocus.trim() === '') {
        report.monthlyFocus = generateDynamicMonthlyFocus(report);
    }
    if (!report.gapAnalysis || report.gapAnalysis.trim() === '') {
        report.gapAnalysis = generateDynamicGapAnalysis(report);
    }
    if (!report.leadershipOverview || report.leadershipOverview.trim() === '') {
        report.leadershipOverview = generateLeadershipOverview(report);
    }
    if (!report.attckVersion) {
        report.attckVersion = '19.1';
    }
}

function viewReport(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    snapshotDynamicContent(report);

    const modal = document.getElementById('report-view-modal');
    const body = document.getElementById('report-view-body');
    
    const logoHtml = report.companyLogo 
        ? `<img src="${report.companyLogo}" alt="Company Logo" class="company-logo">` 
        : '';
    
    const changesHtml = report.changes?.all?.length > 0 
        ? buildChangesSection(report.changes) 
        : '<p class="text-on-surface-secondary">No changes detected during this period.</p>';
    
    const threatsHtml = buildThreatsSection(report);
    
    const tacticTableHtml = (report.coverageByTactic?.length > 0 || report.type === 'initial') 
        ? buildTacticTable(report.coverageByTactic || getCoverageByTactic(), report) 
        : '<p class="text-on-surface-secondary">No tactic data available.</p>';
    
    const langTableHtml = (report.coverageByLanguage?.length > 0 || report.type === 'initial') 
        ? buildLanguageTable(report.coverageByLanguage || getCoverageByLanguage(), report) 
        : '<p class="text-on-surface-secondary">No language data available.</p>';

    const detectionResultsHtml = buildDetectionResults(report);
    const referencesHtml = buildReferences(report);
    const appendixHtml = buildAppendix(report);
    const methodologyHtml = buildMethodology(report);
    const monthlyChangelogHtml = buildMonthlyChangelog(report);
    const tacticsGraphHtml = buildTacticsGraph(report);
    const newQueriesHtml = buildNewQueriesSection(report);
    const techniquesAtRiskHtml = buildTechniquesAtRisk(report);

    const availableMonths = getAvailableMonths();
    const currentMonth = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const currentTheme = report.bannerTheme || 'blue';
    const themeOptionsHtml = Object.entries(BANNER_THEMES).map(([key, t]) =>
        `<option value="${key}" ${key === currentTheme ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    const monthSelectorHtml = `
        <div class="report-month-selector">
            <label class="text-on-surface-tertiary text-sm mr-2">Report Month:</label>
            <select class="form-select form-select-sm" style="width: auto; min-width: 180px;" onchange="changeReportMonth('${report.id}', this.value)">
                ${availableMonths.map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('')}
            </select>
            <label class="text-on-surface-tertiary text-sm ml-3 mr-2">Banner Theme:</label>
            <select class="form-select form-select-sm" style="width: auto; min-width: 140px;" onchange="changeReportTheme('${report.id}', this.value)">
                ${themeOptionsHtml}
            </select>
        </div>
    `;

    // Dynamic Milestone Board Metrics calculated perfectly for the selected month
    const stats = getMonthStats(currentMonth);
    const coverageStats = getOverallCoverageStatsUpToMonth(currentMonth);
    
    const queriesDeployed = stats.queries; // dynamic queries added this month
    const techniquesCovered = stats.techIds.size; // dynamic techniques covered this month
    const frameworkCoverage = coverageStats.pct; // dynamic overall coverage up to this month
    const threatsDisrupted = getThreatsDisruptedCount(currentMonth); // dynamic threat groups/software disrupted this month

    const availableMonthsSorted = getAvailableMonths().sort((a, b) => b.localeCompare(a));
    const currentIdx = availableMonthsSorted.indexOf(currentMonth);
    const prevMonth = currentIdx !== -1 && currentIdx + 1 < availableMonthsSorted.length ? availableMonthsSorted[currentIdx + 1] : null;
    
    let deltaHtml = '';
    if (prevMonth) {
        const prevCoverageStats = getOverallCoverageStatsUpToMonth(prevMonth);
        const pctDiff = frameworkCoverage - prevCoverageStats.pct;
        if (pctDiff > 0) {
            deltaHtml = `<span class="milestone-delta up"><i class="bi bi-caret-up-fill mr-1"></i> +${pctDiff.toFixed(1)}% vs last month</span>`;
        } else if (pctDiff < 0) {
            deltaHtml = `<span class="milestone-delta down"><i class="bi bi-caret-down-fill mr-1"></i> ${pctDiff.toFixed(1)}% vs last month</span>`;
        } else {
            deltaHtml = `<span class="milestone-delta flat"><i class="bi bi-dash"></i> 0.0% change</span>`;
        }
    } else {
        deltaHtml = `<span class="milestone-delta flat">Initial baseline</span>`;
    }

    const milestoneBoardHtml = `
        <div class="milestone-board">
            <div class="milestone-card">
                <div class="milestone-value">${queriesDeployed}</div>
                <div class="milestone-label">Queries Deployed</div>
            </div>
            <div class="milestone-card">
                <div class="milestone-value">${techniquesCovered}</div>
                <div class="milestone-label">Techniques Covered</div>
            </div>
            <div class="milestone-card">
                <div class="milestone-value">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                <div class="milestone-label">Framework Coverage</div>
                ${deltaHtml}
            </div>
            <div class="milestone-card">
                <div class="milestone-value">${threatsDisrupted}</div>
                <div class="milestone-label">Threats Disrupted</div>
            </div>
        </div>
    `;

    body.innerHTML = `
        <div class="report-viewer" id="report-export-area">
            ${monthSelectorHtml}
            <div class="report-viewer-header">
                ${logoHtml}
                <h2>${escapeHtml(report.companyName) || 'MITRE ATT&CK Coverage Report'}</h2>
                <div class="report-type">${report.type === 'initial' ? 'Initial Assessment' : 'Monthly Update'}</div>
                <div class="report-date">${escapeHtml(report.reportMonth) || escapeHtml(report.generatedDate)}</div>
                ${report.layerName ? `<div class="report-date"><i class="bi bi-layers mr-1"></i>Layer: ${escapeHtml(report.layerName)}</div>` : ''}
                ${report.author ? `<div class="report-date">Prepared by: ${escapeHtml(report.author)}</div>` : ''}
            </div>

            ${milestoneBoardHtml}

            <div class="report-section">
                <h4><i class="bi bi-journal-text"></i> Executive Summary</h4>
                <textarea rows="5" onchange="updateReportField('${report.id}', 'executiveSummary', this.value)" placeholder="Provide a high-level overview of the threat hunting activities, key findings, and overall coverage status...">${report.executiveSummary || generateDynamicExecutiveSummary(report)}</textarea>
            </div>

            <div class="report-section leadership-section">
                <h4><i class="bi bi-people"></i> Leadership Overview</h4>
                <div class="leadership-content">
                    <p>${report.leadershipOverview || generateLeadershipOverview(report)}</p>
                </div>
            </div>

            <div class="report-section">
                <h4><i class="bi bi-clipboard-check"></i> Methodology & Scope</h4>
                ${methodologyHtml}
            </div>

            ${tacticsGraphHtml}

            ${monthlyChangelogHtml}

            ${newQueriesHtml}

            <div class="report-section">
                <h4><i class="bi bi-shield-exclamation"></i> Top Associated Threats</h4>
                <p class="text-on-surface-secondary mb-3">Threat actors and tools associated with recently added or modified techniques.</p>
                ${threatsHtml}
            </div>

            ${techniquesAtRiskHtml}

            <div class="report-section">
                <h4><i class="bi bi-check2-circle"></i> Detection Results</h4>
                ${detectionResultsHtml}
            </div>

            <div class="report-section">
                <h4><i class="bi bi-bullseye"></i> Monthly Focus Areas</h4>
                <textarea rows="4" onchange="updateReportField('${report.id}', 'monthlyFocus', this.value)" placeholder="Describe the key focus areas and objectives for this reporting period...">${report.monthlyFocus || generateDynamicMonthlyFocus(report)}</textarea>
            </div>

            <div class="report-section">
                <h4><i class="bi bi-graph-up"></i> Gap Analysis & Prioritization</h4>
                <textarea rows="5" onchange="updateReportField('${report.id}', 'gapAnalysis', this.value)" placeholder="Identify coverage gaps, prioritize techniques based on threat relevance, and outline next steps for improving detection capabilities...">${report.gapAnalysis || generateDynamicGapAnalysis(report)}</textarea>
            </div>

            ${report.type === 'initial' ? `
            <div class="report-section">
                <h4><i class="bi bi-grid-3x3"></i> Coverage Breakdown</h4>
                <div class="row">
                    <div class="col-md-6">
                        <h6 class="text-on-surface-secondary mb-3">By Tactic</h6>
                        ${tacticTableHtml}
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-on-surface-secondary mb-3">By Query Language</h6>
                        ${langTableHtml}
                    </div>
                </div>
            </div>
            ` : `
            <div class="report-section">
                <h4><i class="bi bi-grid-3x3"></i> Coverage Changes</h4>
                ${buildCoverageChanges(report)}
            </div>
            `}

            <div class="report-section">
                <h4><i class="bi bi-link-45deg"></i> References</h4>
                ${referencesHtml}
            </div>

            <div class="report-section">
                <h4><i class="bi bi-paperclip"></i> Appendix</h4>
                ${appendixHtml}
            </div>

            <div class="report-export-options mb-3" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--report-bg-secondary); border-radius: var(--radius-pill); border: 1px solid var(--report-border);">
                <div class="form-check form-switch" style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                    <input class="form-check-input" type="checkbox" id="export-dark-mode-toggle" style="cursor: pointer; margin: 0;">
                    <label class="form-check-label text-sm font-semibold" for="export-dark-mode-toggle" style="cursor: pointer; color: var(--report-text); font-size: 0.8rem; user-select: none;">
                        <i class="bi bi-moon-stars text-primary mr-1"></i>Export in Space-Nebula Dark Mode
                    </label>
                </div>
            </div>

            <div class="report-actions">
                <button class="btn btn-success" onclick="saveAndValidateReport('${report.id}')">
                    <i class="bi bi-check-circle mr-2"></i>Save & Validate
                </button>
                <button class="btn btn-primary" onclick="exportReportPDF('${report.id}')">
                    <i class="bi bi-file-earmark-pdf mr-2"></i>Export PDF
                </button>
                <button class="btn btn-outline-primary" onclick="exportReportEmail('${report.id}')">
                    <i class="bi bi-file-earmark-html mr-2"></i>Export HTML
                </button>
                <button class="btn btn-outline-info" onclick="exportReportEML('${report.id}')">
                    <i class="bi bi-envelope mr-2"></i>Export EML
                </button>
                <button class="btn btn-outline-secondary" onclick="exportReportSVG('${report.id}')">
                    <i class="bi bi-filetype-svg mr-2"></i>Export SVG
                </button>
                <button class="btn btn-outline-secondary" onclick="printReport()">
                    <i class="bi bi-printer mr-2"></i>Print
                </button>
            </div>
        </div>
    `;

    const modalEl = new bootstrap.Modal(modal);
    modalEl.show();
}

window.filterTimeline = function(filterType, btn) {
    const container = btn.closest('.monthly-activity-section');
    const buttons = container.querySelectorAll('.timeline-filter-btn');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const events = container.querySelectorAll('.timeline-event');
    events.forEach(e => {
        if (filterType === 'all') {
            e.classList.remove('hidden');
        } else if (filterType === 'status' && e.classList.contains('event-status')) {
            e.classList.remove('hidden');
        } else if (filterType === 'new' && e.classList.contains('event-new')) {
            e.classList.remove('hidden');
        } else if (filterType === 'hunt' && e.classList.contains('event-hunt')) {
            e.classList.remove('hidden');
        } else {
            e.classList.add('hidden');
        }
    });
};function buildMonthlyChangelog(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    if (techniques.length === 0) return '';
    
    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);
    
    if (colorChanges.length === 0 && newTechniques.length === 0 && newHunts.length === 0) return '';
    
    const mainTechniques = newTechniques.filter(t => !isSubTechnique(t.techniqueID));
    const subTechniques = newTechniques.filter(t => isSubTechnique(t.techniqueID));
    
    let html = `
        <div class="report-section monthly-activity-section">
            <h4><i class="bi bi-calendar-check"></i> Monthly Activity Timeline</h4>
            <p class="text-on-surface-secondary mb-3">Chronological log of query deployments and technique status updates.</p>
            
            <div class="timeline-filters">
                <button class="timeline-filter-btn active" onclick="filterTimeline('all', this)">All Activity</button>
                <button class="timeline-filter-btn" onclick="filterTimeline('status', this)">Status Changes (${colorChanges.length})</button>
                <button class="timeline-filter-btn" onclick="filterTimeline('new', this)">New Detections (${newTechniques.length})</button>
            </div>
            
            <div class="activity-timeline">
    `;
    
    // 1. Process Status/Color changes (Minimal Single-line Layout)
    if (colorChanges.length > 0) {
        html += `
            <div class="timeline-event event-status" style="margin: 1rem 0 0.5rem 0.6rem; padding-left: 1.5rem; border-left: none;">
                <div style="font-size: 0.72rem; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; display: flex; flex-direction: column; gap: 0.2rem;">
                    <span style="display: flex; align-items: center; gap: 0.4rem;"><i class="bi bi-arrow-left-right"></i> Status & Coverage Changes (${colorChanges.length})</span>
                    <span style="font-size: 0.65rem; color: var(--report-text-muted); font-weight: 500; text-transform: none; letter-spacing: normal; margin-top: 2px; line-height: 1.3; font-style: italic;">
                        Tracks automatic updates to technique coverage status when live threat hunt queries or sub-technique coverage percentages change (e.g., transitioning from unassigned to a defined coverage level).
                    </span>
                </div>
            </div>
        `;
        colorChanges.forEach(change => {
            const techName = getTechniqueName(change.techniqueID);
            const isSub = isSubTechnique(change.techniqueID);
            const fromColor = change.from || 'transparent';
            const toColor = change.to || 'transparent';
            
            const fromLabel = change.fromLabel === 'None' ? 'Unassigned' : change.fromLabel;
            const toLabel = change.toLabel === 'None' ? 'Unassigned' : change.toLabel;
            
            html += `
                <div class="timeline-event event-status">
                    <div class="timeline-node status" title="Status Change"></div>
                    <div class="activity-card status-card" style="padding: 0.5rem 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;">
                            <span style="font-weight: 700; font-size: 0.8rem; color: #38bdf8;">${change.techniqueID}</span>
                            <span style="font-size: 0.8rem; font-weight: 600; color: var(--report-text);">${techName}</span>
                            <span class="activity-type-badge ${isSub ? 'sub' : 'main'}" style="margin: 0; padding: 0.08rem 0.35rem; font-size: 0.58rem;">${isSub ? 'Sub' : 'Main'}</span>
                            <span style="font-size: 0.72rem; color: var(--report-text-muted); margin-left: auto;">
                                Coverage Status: <span style="font-weight: 600; color: #fbbf24;">${fromLabel}</span> &rarr; <span style="font-weight: 600; color: #34d399;">${toLabel}</span>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    // 2. Process New Main Techniques
    if (mainTechniques.length > 0) {
        html += `
            <div class="timeline-event event-new" style="margin: 1.5rem 0 0.5rem 0.6rem; padding-left: 1.5rem; border-left: none;">
                <div style="font-size: 0.72rem; font-weight: 700; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px; display: flex; flex-direction: column; gap: 0.2rem;">
                    <span style="display: flex; align-items: center; gap: 0.4rem;"><i class="bi bi-shield-check"></i> New Main Techniques Deployed (${mainTechniques.length})</span>
                    <span style="font-size: 0.65rem; color: var(--report-text-muted); font-weight: 500; text-transform: none; letter-spacing: normal; margin-top: 2px; line-height: 1.3; font-style: italic;">
                        Displays parent-level ATT&CK techniques that received their very first hunt query implementation this month, expanding our defensive visibility footprint.
                    </span>
                </div>
            </div>
        `;
        mainTechniques.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID);
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = (ann.queries && ann.queries.length > 0) ? ann.queries.map(q => q.name).join(', ') : 'No queries (Check sub-techniques)';
            
            html += `
                <div class="timeline-event event-new">
                    <div class="timeline-node new" title="New Technique"></div>
                    <div class="activity-card new-card" style="padding: 0.6rem 0.75rem;">
                        <div class="activity-card-header" style="margin-bottom: 0.25rem;">
                            <strong>${ann.techniqueID}</strong> - ${techName}
                            <span class="activity-type-badge main">Technique</span>
                        </div>
                        ${techDesc ? `<div class="activity-card-body mb-1" style="font-size: 0.76rem; color: var(--report-text-muted);"><i class="bi bi-info-circle mr-1"></i> ${techDesc}</div>` : ''}
                        ${techTactics.length > 0 ? `<div class="activity-card-body mb-1" style="font-size: 0.76rem; color: var(--report-text-muted);"><i class="bi bi-diagram-3 mr-1"></i> Tactics: ${techTactics.join(', ')}</div>` : ''}
                        <div class="activity-card-footer" style="margin-top: 0.25rem; padding-top: 0.25rem;">
                            <i class="bi bi-code-slash"></i> Queries implemented: "${queryNames}"
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    // 3. Process New Sub-techniques
    if (subTechniques.length > 0) {
        html += `
            <div class="timeline-event event-new" style="margin: 1.5rem 0 0.5rem 0.6rem; padding-left: 1.5rem; border-left: none;">
                <div style="font-size: 0.72rem; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; display: flex; flex-direction: column; gap: 0.2rem;">
                    <span style="display: flex; align-items: center; gap: 0.4rem;"><i class="bi bi-grid-3x3-gap"></i> New Sub-techniques Deployed (${subTechniques.length})</span>
                    <span style="font-size: 0.65rem; color: var(--report-text-muted); font-weight: 500; text-transform: none; letter-spacing: normal; margin-top: 2px; line-height: 1.3; font-style: italic;">
                        Highlights granular, specific sub-techniques that have had threat hunt queries newly deployed, providing high-fidelity detection capability.
                    </span>
                </div>
            </div>
        `;
        subTechniques.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID);
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = (ann.queries && ann.queries.length > 0) ? ann.queries.map(q => q.name).join(', ') : 'No queries';
            
            html += `
                <div class="timeline-event event-new">
                    <div class="timeline-node new" title="New Sub-technique"></div>
                    <div class="activity-card new-card sub-card" style="padding: 0.6rem 0.75rem;">
                        <div class="activity-card-header" style="margin-bottom: 0.25rem;">
                            <strong>${ann.techniqueID}</strong> - ${techName}
                            <span class="activity-type-badge sub">Sub-technique</span>
                        </div>
                        ${techDesc ? `<div class="activity-card-body mb-1" style="font-size: 0.76rem; color: var(--report-text-muted);"><i class="bi bi-info-circle mr-1"></i> ${techDesc}</div>` : ''}
                        ${techTactics.length > 0 ? `<div class="activity-card-body mb-1" style="font-size: 0.76rem; color: var(--report-text-muted);"><i class="bi bi-diagram-3 mr-1"></i> Tactics: ${techTactics.join(', ')}</div>` : ''}
                        <div class="activity-card-footer" style="margin-top: 0.25rem; padding-top: 0.25rem;">
                            <i class="bi bi-code-slash"></i> Queries implemented: "${queryNames}"
                        </div>
                    </div>
                </div>
            `;
        });
    }
    html += `
            </div>
        </div>
    `;
    
    return html;
}

function buildMethodology(report) {
    const methodology = report.methodology || {};
    const scope = report.scope || {};
    
    const methodologyOptions = [
        { id: 'sig-based', label: 'Signature-Based Detection', desc: 'Rule-based matching against known patterns' },
        { id: 'behavioral', label: 'Behavioral Analysis', desc: 'Anomaly detection based on behavior patterns' },
        { id: 'threat-intel', label: 'Threat Intelligence Driven', desc: 'Hunting based on threat actor TTPs' },
        { id: 'hypothesis', label: 'Hypothesis-Driven', desc: 'Testing specific hypotheses about attacker behavior' },
        { id: 'data-driven', label: 'Data-Driven', desc: 'Exploratory analysis of telemetry data' },
        { id: 'compliance', label: 'Compliance-Driven', desc: 'Meeting regulatory or framework requirements' }
    ];
    
    const scopeOptions = [
        { id: 'endpoints', label: 'Endpoints', desc: 'Workstations, servers, mobile devices' },
        { id: 'network', label: 'Network', desc: 'Network traffic, firewall logs, DNS' },
        { id: 'cloud', label: 'Cloud Infrastructure', desc: 'AWS, Azure, GCP services' },
        { id: 'identity', label: 'Identity Systems', desc: 'Active Directory, Azure AD, Okta' },
        { id: 'email', label: 'Email Systems', desc: 'Exchange, O365, email gateways' },
        { id: 'applications', label: 'Applications', desc: 'Custom apps, SaaS platforms' }
    ];
    
    let html = '<div class="methodology-grid">';
    
    html += '<div class="methodology-section"><h6 class="text-on-surface-tertiary mb-2">Detection Methodologies</h6>';
    methodologyOptions.forEach(opt => {
        const checked = methodology[opt.id] ? 'checked' : '';
        html += `
            <div class="methodology-option">
                <input type="checkbox" id="meth-${opt.id}" ${checked} onchange="updateMethodologyField('${report.id}', 'methodology', '${opt.id}', this.checked)">
                <label for="meth-${opt.id}">
                    <strong>${opt.label}</strong>
                    <span>${opt.desc}</span>
                </label>
            </div>
        `;
    });
    html += '</div>';
    
    html += '<div class="methodology-section"><h6 class="text-on-surface-tertiary mb-2">Scope</h6>';
    scopeOptions.forEach(opt => {
        const checked = scope[opt.id] ? 'checked' : '';
        html += `
            <div class="methodology-option">
                <input type="checkbox" id="scope-${opt.id}" ${checked} onchange="updateMethodologyField('${report.id}', 'scope', '${opt.id}', this.checked)">
                <label for="scope-${opt.id}">
                    <strong>${opt.label}</strong>
                    <span>${opt.desc}</span>
                </label>
            </div>
        `;
    });
    html += '</div>';
    
    html += '</div>';
    
    html += `
        <div class="mt-3">
            <label class="form-label text-on-surface-tertiary text-sm">Additional Notes</label>
            <textarea class="form-control" rows="2" onchange="updateReportField('${report.id}', 'methodologyNotes', this.value)" placeholder="Any additional methodology notes...">${report.methodologyNotes || ''}</textarea>
        </div>
    `;
    
    return html;
}

function getThreatsDisruptedCount(month) {
    if (!month || !state.currentLayer?.techniques || !state.groups || !state.software || !state.relationships) return 0;
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const changedTechStixIds = new Set();
    
    techniques.forEach(ann => {
        const stixId = getTechniqueStixId(ann.techniqueID);
        if (stixId) changedTechStixIds.add(stixId);
    });
    
    if (changedTechStixIds.size === 0) return 0;
    
    const threatIds = new Set();
    
    state.relationships.forEach(rel => {
        if (rel.relationship_type !== 'uses') return;
        
        const targetId = rel.target_ref;
        if (!changedTechStixIds.has(targetId)) return;
        
        const sourceId = rel.source_ref;
        
        const isGroup = state.groups.some(g => g.id === sourceId);
        const isSoftware = state.software.some(s => s.id === sourceId);
        
        if (isGroup || isSoftware) {
            threatIds.add(sourceId);
        }
    });
    
    return threatIds.size;
}

function resolveQueryMonth(q, ann) {
    if (q.monthAdded) return q.monthAdded;
    if (q.created) return q.created.slice(0, 7);
    if (ann && ann.monthAdded) return ann.monthAdded;
    return new Date().toISOString().slice(0, 7);
}

function getMonthStats(month) {
    if (!month || !state.currentLayer?.techniques) {
        return { mainTechs: 0, subTechs: 0, queries: 0, techIds: new Set() };
    }
    
    const mainTechs = new Set();
    const subTechs = new Set();
    const uniqueQueryIds = new Set();
    
    state.currentLayer.techniques.forEach(ann => {
        if (!ann.queries || ann.queries.length === 0) return;
        
        ann.queries.forEach(q => {
            const qMonth = resolveQueryMonth(q, ann);
            if (qMonth === month) {
                uniqueQueryIds.add(q.id);
                if (isSubTechnique(ann.techniqueID)) {
                    subTechs.add(ann.techniqueID);
                } else {
                    mainTechs.add(ann.techniqueID);
                }
            }
        });
    });
    
    return {
        mainTechs: mainTechs.size,
        subTechs: subTechs.size,
        queries: uniqueQueryIds.size,
        techIds: new Set([...mainTechs, ...subTechs])
    };
}

function getOverallCoverageStatsUpToMonth(targetMonth) {
    if (!state.techniques) return { total: 0, covered: 0, pct: 0, parents: { total: 0, covered: 0, pct: 0 }, subs: { total: 0, covered: 0, pct: 0 }, all: { total: 0, covered: 0, pct: 0 } };
    
    const parentTechniques = state.techniques.filter(t => !t.x_mitre_is_subtechnique);
    const subTechniques = state.techniques.filter(t => t.x_mitre_is_subtechnique);
    const totalTechniques = parentTechniques.length;
    
    let coveredCount = 0;
    const coveredIds = new Set();
    
    if (state.currentLayer?.techniques) {
        state.currentLayer.techniques.forEach(lt => {
            const hasQueries = lt.queries?.some(q => {
                const qMonth = resolveQueryMonth(q, lt);
                return qMonth <= targetMonth;
            });
            if (hasQueries) {
                coveredIds.add(lt.techniqueID);
            }
        });
    }
    
    parentTechniques.forEach(parentTech => {
        const parentId = parentTech.external_references?.[0]?.external_id;
        if (!parentId) return;
        
        // 1. Check parent itself
        if (coveredIds.has(parentId)) {
            coveredCount++;
            return;
        }
        
        // 2. Check sub-techniques
        const hasCoveredSub = [...coveredIds].some(id => id.startsWith(parentId + '.'));
        if (hasCoveredSub) {
            coveredCount++;
        }
    });
    
    let coveredSubsCount = 0;
    subTechniques.forEach(subTech => {
        const subId = subTech.external_references?.[0]?.external_id;
        if (subId && coveredIds.has(subId)) {
            coveredSubsCount++;
        }
    });
    
    const totalParents = parentTechniques.length;
    const totalSubs = subTechniques.length;
    const totalAll = totalParents + totalSubs;
    
    // Count how many unique active IDs from coveredIds are in state.techniques
    const coveredAll = [...coveredIds].filter(id => {
        return state.techniques.some(t => t.external_references?.[0]?.external_id === id);
    }).length;
    
    return {
        total: totalTechniques, // parent techniques count (backward compatibility)
        covered: coveredCount,  // parent techniques covered (backward compatibility)
        pct: totalTechniques > 0 ? Math.round((coveredCount / totalTechniques) * 1000) / 10 : 0,
        parents: {
            total: totalParents,
            covered: coveredCount,
            pct: totalParents > 0 ? Math.round((coveredCount / totalParents) * 1000) / 10 : 0
        },
        subs: {
            total: totalSubs,
            covered: coveredSubsCount,
            pct: totalSubs > 0 ? Math.round((coveredSubsCount / totalSubs) * 1000) / 10 : 0
        },
        all: {
            total: totalAll,
            covered: coveredAll,
            pct: totalAll > 0 ? Math.round((coveredAll / totalAll) * 1000) / 10 : 0
        }
    };
}

function getTotalUniqueActiveQueriesUpToMonth(targetMonth) {
    if (!state.currentLayer?.techniques) return 0;
    const activeIds = new Set();
    state.currentLayer.techniques.forEach(t => {
        if (t.queries) {
            t.queries.forEach(q => {
                const qMonth = resolveQueryMonth(q, t);
                if (qMonth <= targetMonth) {
                    activeIds.add(q.id);
                }
            });
        }
    });
    return activeIds.size;
}

function getTotalActiveQueriesUpToMonth(targetMonth) {
    return getTotalUniqueActiveQueriesUpToMonth(targetMonth);
}

function generateLeadershipOverview(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const coveragePct = coverageStats.pct % 1 === 0 ? coverageStats.pct : coverageStats.pct.toFixed(1);
    const threatsDisrupted = getThreatsDisruptedCount(month);
    const periodLabel = report.reportMonth || (month ? getMonthLabel(month) : 'this period');
    
    let statsText = '';
    if (coverageStats.parents && coverageStats.parents.total) {
        const allPct = coverageStats.all.pct % 1 === 0 ? coverageStats.all.pct : coverageStats.all.pct.toFixed(1);
        statsText = `${coverageStats.parents.covered} of ${coverageStats.parents.total} known parent attack techniques (and ${coverageStats.subs.covered} sub-techniques), achieving ${coveragePct}% overall parent coverage (or ${allPct}% combined framework coverage)`;
    } else {
        statsText = `${coverageStats.covered} of ${coverageStats.total} known attack techniques, achieving ${coveragePct}% overall coverage`;
    }
    
    return `This report provides a comprehensive overview of our organization's detection capabilities against the MITRE ATT&CK framework for ${periodLabel}. Our security team has disrupted ${threatsDisrupted} active threat groups and tools by deploying targeted detection queries across ${statsText}. These queries represent our active detection logging efforts across the framework. Coverage percentages reflect techniques with logged queries, though individual techniques may have multiple attack vectors not yet covered. The remaining gaps highlight areas for future detection development.`;
}function getQueryAssociations(q, layerTechs) {
    const assoc = [];
    layerTechs.forEach(lt => {
        if (lt.queries?.some(lq => lq.id === q.id || (lq.name === q.name && lq.language === q.language))) {
            assoc.push({
                id: lt.techniqueID,
                name: getTechniqueName(lt.techniqueID) || lt.name || '',
                isSub: lt.techniqueID.includes('.')
            });
        }
    });
    const seen = new Set();
    const unique = [];
    assoc.forEach(item => {
        if (!seen.has(item.id)) {
            seen.add(item.id);
            unique.push(item);
        }
    });
    unique.sort((a, b) => {
        if (a.isSub && !b.isSub) return 1;
        if (!a.isSub && b.isSub) return -1;
        return a.id.localeCompare(b.id);
    });
    return unique;
}

function buildNewQueriesSection(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    const seenIds = new Set();
    const allQueries = [];
    techniques.forEach(ann => {
        if (ann.queries) {
            ann.queries.forEach(q => {
                if (!seenIds.has(q.id)) {
                    seenIds.add(q.id);
                    allQueries.push({
                        id: q.id,
                        name: q.name,
                        techniqueID: ann.techniqueID,
                        language: q.language,
                        created: q.created,
                        description: q.description
                    });
                }
            });
        }
    });
    
    if (allQueries.length === 0) return '';
    
    const layerTechs = report.snapshot?.techniques || state.currentLayer?.techniques || [];
    
    let html = '<div class="report-section"><h4><i class="bi bi-search"></i> New Threat Hunt Queries</h4>';
    html += `<p class="text-on-surface-secondary mb-3">${allQueries.length} queries for ${getMonthLabel(month)}:</p>`;
    html += '<ul class="query-list" style="padding-left: 0; margin: 0;">';
    
    allQueries.forEach(q => {
        const queryName = q.name || 'Unnamed Query';
        const assoc = getQueryAssociations(q, layerTechs);
        const parents = assoc.filter(x => !x.isSub);
        const subs = assoc.filter(x => x.isSub);
        
        let badgesHtml = '<div style="margin-top: 6px; font-size: 11px; line-height: 1.6; display: flex; flex-direction: column; gap: 4px;">';
        if (parents.length > 0) {
            badgesHtml += `<div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;"><span style="font-weight: 700; color: var(--on-surface-tertiary); text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Techniques:</span>`;
            badgesHtml += parents.map(p => {
                return `<span class="badge" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-family: monospace; font-size: 10px; margin-right: 4px;" title="${escapeHtml(p.name)}">${p.id}</span>`;
            }).join('');
            badgesHtml += `</div>`;
        }
        if (subs.length > 0) {
            badgesHtml += `<div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;"><span style="font-weight: 700; color: var(--on-surface-tertiary); text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Sub-techniques:</span>`;
            badgesHtml += subs.map(s => {
                return `<span class="badge" style="background: rgba(52, 211, 153, 0.1); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-family: monospace; font-size: 10px; margin-right: 4px;" title="${escapeHtml(s.name)}">${s.id}</span>`;
            }).join('');
            badgesHtml += `</div>`;
        }
        badgesHtml += '</div>';
        
        html += `
            <li class="mb-3" style="list-style-type: none; border-bottom: 1px solid var(--report-border); padding-bottom: 8px;">
                <strong class="text-on-surface" style="font-size: 14px;">${escapeHtml(queryName)}</strong> 
                <span class="badge bg-secondary text-xs" style="margin-left: 8px; vertical-align: middle;">${q.language}</span>
                ${q.description ? `<p class="text-on-surface-secondary text-sm mt-1 mb-2" style="font-style: italic; line-height: 1.4;">${escapeHtml(q.description)}</p>` : ''}
                ${badgesHtml}
            </li>
        `;
    });
    
    html += '</ul></div>';
    return html;
}

function buildTechniquesAtRisk(report) {
    if (!state.techniques || !state.relationships || !state.groups) return '';
    
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const monthTechniques = byMonth[month] || [];
    
    const monthTechStixIds = new Set();
    monthTechniques.forEach(ann => {
        const stixId = getTechniqueStixId(ann.techniqueID);
        if (stixId) monthTechStixIds.add(stixId);
    });
    
    const layerTechIds = new Set();
    const coverageMap = {};
    const layerTechs = state.currentLayer?.techniques || report.snapshot?.techniques || [];
    layerTechs.forEach(t => {
        layerTechIds.add(t.techniqueID);
        coverageMap[t.techniqueID] = t.queryCount > 0 || (t.queries && t.queries.length > 0);
    });
    
    const zeroCoverageTechs = new Set();
    state.techniques.forEach(t => {
        const techId = t.external_references?.[0]?.external_id;
        if (!techId || t.x_mitre_is_subtechnique) return;
        if (layerTechIds.has(techId) && coverageMap[techId]) return;
        zeroCoverageTechs.add(techId);
    });
    
    if (zeroCoverageTechs.size === 0) return '';
    
    const threatGroups = {};
    state.relationships.forEach(rel => {
        if (rel.relationship_type !== 'uses') return;
        if (!zeroCoverageTechs.has(rel.target_ref)) return;
        
        const group = state.groups.find(g => g.id === rel.source_ref);
        if (!group) return;
        
        const techId = getTechniqueIdFromStix(rel.target_ref);
        if (!techId) return;
        
        if (monthTechStixIds.size > 0 && monthTechStixIds.has(rel.target_ref)) {
            if (!threatGroups[group.name]) threatGroups[group.name] = new Set();
            threatGroups[group.name].add(techId);
        }
    });
    
    const atRisk = [];
    Object.entries(threatGroups).forEach(([groupName, techIds]) => {
        const techArray = [...techIds].slice(0, 5);
        atRisk.push({ group: groupName, techniques: techArray, count: techIds.size });
    });
    
    atRisk.sort((a, b) => b.count - a.count);
    if (atRisk.length === 0) return '';
    
    let html = '<div class="report-section techniques-at-risk"><h4><i class="bi bi-exclamation-triangle"></i> Techniques at Risk</h4>';
    html += '<p class="text-on-surface-secondary mb-3">Zero-coverage techniques used by known threat groups active this month, prioritized by group relevance.</p>';
    
    atRisk.slice(0, 10).forEach(item => {
        const techList = item.techniques.map(id => {
            const name = getTechniqueName(id);
            return `<span class="risk-tech-badge">${id}${name ? ' - ' + name : ''}</span>`;
        }).join('');
        const moreText = item.count > 5 ? ` +${item.count - 5} more` : '';
        
        html += `<div class="risk-item">
            <div class="risk-header">
                <strong>${item.group}</strong>
                <span class="risk-count">${item.count} technique${item.count > 1 ? 's' : ''}</span>
            </div>
            <div class="risk-tech-list">${techList}${moreText ? `<span class="risk-more">${moreText}</span>` : ''}</div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}

function buildTacticsGraph(report) {
    const tactics = report.coverageByTactic || getCoverageByTactic() || [];
    if (tactics.length === 0) return '';
    
    const criticalGaps = [];
    const moderateCoverage = [];
    const strongCoverage = [];
    
    tactics.forEach(t => {
        const pct = t.coverage;
        const name = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const item = { ...t, displayName: name };
        if (pct < 50) {
            criticalGaps.push(item);
        } else if (pct < 80) {
            moderateCoverage.push(item);
        } else {
            strongCoverage.push(item);
        }
    });
    
    const formatItems = (list) => {
        if (list.length === 0) return '<div class="triage-empty">No tactics in this category</div>';
        return list.map(item => `
            <div class="triage-item">
                <span class="triage-item-name" title="${item.displayName}">${item.displayName}</span>
                <span class="triage-item-pct">${item.coverage % 1 === 0 ? item.coverage : item.coverage.toFixed(1)}%</span>
            </div>
        `).join('');
    };

    let html = `
        <div class="report-section">
            <h4><i class="bi bi-shield-slash"></i> Tactic Gap Triage Radar</h4>
            <p class="text-on-surface-secondary mb-3">Gap ranking categorized by detection strength across ATT&CK tactics.</p>
            <div class="tactic-triage-grid">
                <div class="triage-column critical">
                    <div class="triage-header">
                        <span class="triage-header-title"><i class="bi bi-shield-fill-x"></i> Critical Gaps (<50%)</span>
                        <span class="triage-badge">${criticalGaps.length}</span>
                    </div>
                    <div class="triage-list">
                        ${formatItems(criticalGaps)}
                    </div>
                </div>
                <div class="triage-column moderate">
                    <div class="triage-header">
                        <span class="triage-header-title"><i class="bi bi-shield-fill-exclamation"></i> Moderate (50%-80%)</span>
                        <span class="triage-badge">${moderateCoverage.length}</span>
                    </div>
                    <div class="triage-list">
                        ${formatItems(moderateCoverage)}
                    </div>
                </div>
                <div class="triage-column strong">
                    <div class="triage-header">
                        <span class="triage-header-title"><i class="bi bi-shield-fill-check"></i> Strong Coverage (≥80%)</span>
                        <span class="triage-badge">${strongCoverage.length}</span>
                    </div>
                    <div class="triage-list">
                        ${formatItems(strongCoverage)}
                    </div>
                </div>
            </div>
        </div>
    `;
    return html;
}

function buildChangesSection(changes) {
    let html = '<ul class="changes-list">';
    
    changes.all.forEach(change => {
        let icon = 'bi-dot';
        let text = '';
        
        switch (change.type) {
            case 'new_technique':
                icon = 'bi-plus-circle';
                const techName = getTechniqueName(change.data.techniqueID);
                text = `<strong>New Technique:</strong> ${change.data.techniqueID} - ${techName}`;
                break;
            case 'new_query':
                icon = 'bi-plus-circle';
                text = `<strong>New Query:</strong> "${change.data.name}" (${change.data.language}) on ${change.data.techniqueID}`;
                break;
            case 'color_change':
                icon = 'bi-palette';
                const techType = isSubTechnique(change.data.techniqueID) ? 'sub' : 'main';
                const fromLabel = getColorName(change.data.from, techType);
                const toLabel = getColorName(change.data.to, techType);
                const readableFrom = fromLabel === 'None' ? 'Unassigned' : fromLabel;
                const readableTo = toLabel === 'None' ? 'Unassigned' : toLabel;
                text = `<strong>Coverage Status Changed:</strong> ${change.data.techniqueID} - <span style="font-weight: 600;">${readableFrom}</span> &rarr; <span style="font-weight: 600;">${readableTo}</span>`;
                break;
            case 'mitigation_change':
                icon = 'bi-shield-check';
                text = `<strong>Mitigation Update:</strong> ${change.data.mitigationID} changed from ${change.data.from} to ${change.data.to}`;
                break;
            default:
                text = change.data?.details || change.type;
        }
        
        html += `<li><i class="bi ${icon}"></i> ${text}</li>`;
    });
    
    html += '</ul>';
    return html;
}

function buildThreatsSection(report) {
    const month = report?.selectedMonth || report?.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const changedTechIds = new Set();
    const changedTechStixIds = new Set();
    
    // Get all techniques added this month - map to both short ID and STIX ID
    techniques.forEach(ann => {
        changedTechIds.add(ann.techniqueID);
        const stixId = getTechniqueStixId(ann.techniqueID);
        if (stixId) changedTechStixIds.add(stixId);
    });
    
    if (changedTechIds.size === 0) {
        return '<p class="text-on-surface-secondary">No techniques added this month.</p>';
    }
    
    if (!state.groups || state.groups.length === 0 || !state.software || state.software.length === 0) {
        return '<p class="text-on-surface-secondary">Threat intelligence data not loaded. Please ensure ATT&CK data is loaded.</p>';
    }
    
    if (!state.relationships || state.relationships.length === 0) {
        return '<p class="text-on-surface-secondary">No threat associations found in the loaded data.</p>';
    }
    
    const threatMap = { groups: [], software: [] };
    
    // Find all relationships where groups/software use techniques from this month
    state.relationships.forEach(rel => {
        if (rel.relationship_type !== 'uses') return;
        
        const targetId = rel.target_ref;
        if (!changedTechStixIds.has(targetId)) return;
        
        const sourceId = rel.source_ref;
        
        // Check if source is a group
        const group = state.groups.find(g => g.id === sourceId);
        if (group) {
            let existing = threatMap.groups.find(g => g.id === group.id);
            if (!existing) {
                existing = { id: group.id, name: group.name, techniques: [] };
                threatMap.groups.push(existing);
            }
            if (!existing.techniques.includes(targetId)) {
                existing.techniques.push(targetId);
            }
            return;
        }
        
        // Check if source is software
        const software = state.software.find(s => s.id === sourceId);
        if (software) {
            let existing = threatMap.software.find(s => s.id === software.id);
            if (!existing) {
                existing = { id: software.id, name: software.name, type: software.x_mitre_type || 'tool', techniques: [] };
                threatMap.software.push(existing);
            }
            if (!existing.techniques.includes(targetId)) {
                existing.techniques.push(targetId);
            }
        }
    });
    
    const allThreats = [];
    threatMap.groups.forEach(g => {
        allThreats.push({ type: 'group', name: g.name, techniques: g.techniques.length, techniqueIds: g.techniques });
    });
    threatMap.software.forEach(s => {
        allThreats.push({ type: s.type, name: s.name, techniques: s.techniques.length, techniqueIds: s.techniques });
    });
    
    if (allThreats.length === 0) {
        return '<p class="text-on-surface-secondary">No threat actors or tools associated with this month\'s techniques.</p>';
    }
    
    const sortedThreats = allThreats.sort((a, b) => b.techniques - a.techniques).slice(0, 8);
    
    let html = '<div class="threat-roi-grid">';
    
    sortedThreats.forEach(t => {
        const typeLabel = t.type === 'group' ? 'Threat Group' : t.type.toUpperCase();
        const icon = t.type === 'group' ? 'bi-people-fill' : 'bi-cpu-fill';
        
        // Determine exposure risk based on count of techniques used
        let exposureLevel = 'Medium';
        let exposureClass = 'medium';
        if (t.techniques >= 4) {
            exposureLevel = 'Critical';
            exposureClass = 'critical';
        } else if (t.techniques >= 2) {
            exposureLevel = 'High';
            exposureClass = 'high';
        }
        
        // Truncate techniques list to top 6 elements with a more badge
        const techListHtml = t.techniqueIds?.slice(0, 6).map(id => {
            const techId = getTechniqueIdFromStix(id);
            const name = getTechniqueName(techId || id);
            return techId ? `<span class="roi-tech-chip" title="${techId} - ${name}">${techId}</span>` : `<span class="roi-tech-chip">${id}</span>`;
        }).join('') || '';
        const moreCount = t.techniqueIds?.length > 6 ? t.techniqueIds.length - 6 : 0;
        const moreTechsHtml = moreCount > 0 ? `<span class="roi-tech-chip more">+${moreCount} more</span>` : '';
        
        html += `
            <div class="threat-roi-card ${t.type === 'group' ? 'group' : 'software'}">
                <div class="roi-card-left">
                    <span class="roi-card-type"><i class="bi ${icon} mr-1"></i>${typeLabel}</span>
                    <h5 class="roi-card-title" style="margin: 0.15rem 0;">${t.name}</h5>
                </div>
                <div class="roi-card-mid">
                    <div class="roi-card-metric" style="margin-bottom: 0.35rem;">
                        <i class="bi bi-shield-check"></i> Disruption Impact: <strong>${t.techniques} technique${t.techniques > 1 ? 's' : ''}</strong>
                    </div>
                    <div class="roi-tech-chips">
                        ${techListHtml}${moreTechsHtml}
                    </div>
                </div>
                <div class="roi-card-right">
                    <span class="roi-exposure-badge ${exposureClass}">${exposureLevel} Risk</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

function buildTacticTable(tactics, report) {
    if (!tactics || tactics.length === 0) return '<p class="text-on-surface-secondary">No tactic data available.</p>';
    const fmtCov = (v) => v % 1 === 0 ? v : v.toFixed(1);
    
    let html = '<table class="report-table"><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>';
    
    tactics.forEach(t => {
        const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        html += `<tr>
            <td>${tacticName}</td>
            <td>${t.withQueries}/${t.total} (${fmtCov(t.coverage)}%)</td>
            <td>
                <div class="progress" style="height: 8px;">
                    <div class="progress-bar" style="width: ${t.coverage}%"></div>
                </div>
            </td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

function buildLanguageTable(languages, report) {
    if (!languages || languages.length === 0) return '<p class="text-on-surface-secondary">No language data available.</p>';
    
    let html = '<table class="report-table"><thead><tr><th>Language</th><th>Query Count</th></tr></thead><tbody>';
    
    languages.forEach(l => {
        html += `<tr><td>${l.language}</td><td>${l.count}</td></tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

function getCoverageByTacticUpToMonth(targetMonth) {
    if (!state.currentLayer?.techniques || !state.techniques) return [];
    const tacticMap = {};
    state.techniques.forEach(stixTech => {
        const techId = stixTech.external_references?.[0]?.external_id;
        if (!techId) return;
        const tactics = stixTech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        const layerTech = state.currentLayer.techniques.find(t => t.techniqueID === techId);
        
        const hasQueries = layerTech?.queries?.some(q => {
            const qMonth = resolveQueryMonth(q, layerTech);
            return qMonth <= targetMonth;
        });
        
        tactics.forEach(tactic => {
            if (!tacticMap[tactic]) tacticMap[tactic] = { total: 0, withQueries: 0 };
            tacticMap[tactic].total++;
            if (hasQueries) tacticMap[tactic].withQueries++;
        });
    });
    return Object.entries(tacticMap).map(([tactic, data]) => ({
        tactic, coverage: data.total > 0 ? Math.round((data.withQueries / data.total) * 1000) / 10 : 0, withQueries: data.withQueries, total: data.total
    })).sort((a, b) => b.coverage - a.coverage);
}

function buildCoverageChanges(report) {
    const currentMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const availableMonths = getAvailableMonths().sort((a, b) => b.localeCompare(a));
    const currentIdx = availableMonths.indexOf(currentMonth);
    const prevMonth = currentIdx !== -1 && currentIdx + 1 < availableMonths.length ? availableMonths[currentIdx + 1] : null;
    
    if (!prevMonth) {
        return '<p class="text-on-surface-secondary">No previous month data to compare against.</p>';
    }
    
    const currentTactics = getCoverageByTacticUpToMonth(currentMonth);
    const lastTactics = getCoverageByTacticUpToMonth(prevMonth);
    const fmtCov = (v) => v % 1 === 0 ? v : v.toFixed(1);
    
    let html = '<table class="report-table"><thead><tr><th>Tactic</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>';
    
    const allTactics = new Set([...currentTactics.map(t => t.tactic), ...lastTactics.map(t => t.tactic)]);
    
    allTactics.forEach(tactic => {
        const current = currentTactics.find(t => t.tactic === tactic);
        const last = lastTactics.find(t => t.tactic === tactic);
        
        const currentPct = current?.coverage || 0;
        const lastPct = last?.coverage || 0;
        const change = currentPct - lastPct;
        
        const changeIcon = change > 0 ? '<i class="bi bi-arrow-up text-success"></i>' : change < 0 ? '<i class="bi bi-arrow-down text-danger"></i>' : '<i class="bi bi-dash text-on-surface-secondary"></i>';
        const changeText = change === 0 ? '0%' : (change > 0 ? '+' : '') + Number(change.toFixed(1)) + '%';
        
        const tacticName = tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        html += `<tr>
            <td>${tacticName}</td>
            <td>${fmtCov(lastPct)}%</td>
            <td>${fmtCov(currentPct)}%</td>
            <td>${changeIcon} ${changeText}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    html += '<p class="text-on-surface-tertiary text-xs mt-2" style="font-style: italic;"><i class="bi bi-info-circle"></i> Tactic-level coverage incorporates both parent techniques and sub-techniques mapped to each tactical phase.</p>';
    return html;
}

function buildDetectionResults(report) {
    const results = report.detectionResults || [];
    
    let html = '<div id="detection-results-container">';
    
    if (results.length === 0) {
        html += '<p class="text-on-surface-secondary mb-3">No tangible results for this update.</p>';
    }
    
    results.forEach((result, idx) => {
        html += `
            <div class="detection-result-item mb-3 p-3">
                <div class="d-flex justify-content-between align-iteml-center mb-2">
                    <input type="text" class="form-control form-control-sm mr-2" placeholder="Threat Hunt Name" value="${result.huntName || ''}" onchange="updateDetectionResult('${report.id}', ${idx}, 'huntName', this.value)">
                    <button class="btn btn-sm btn-outline-danger" onclick="removeDetectionResult('${report.id}', ${idx})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                <input type="text" class="form-control form-control-sm" placeholder="SIR Ticket (optional)" value="${result.sirTicket || ''}" onchange="updateDetectionResult('${report.id}', ${idx}, 'sirTicket', this.value)">
                <textarea class="form-control form-control-sm mt-2" rows="2" placeholder="Results notes..." onchange="updateDetectionResult('${report.id}', ${idx}, 'notes', this.value)">${result.notes || ''}</textarea>
            </div>
        `;
    });
    
    html += `
        <button class="btn btn-sm btn-outline-primary" onclick="addDetectionResult('${report.id}')">
            <i class="bi bi-plus mr-1"></i>Add Detection Result
        </button>
    </div>`;
    
    return html;
}

function buildReferences(report) {
    const references = report.references || [];
    
    let html = '<div id="references-container">';
    
    references.forEach((ref, idx) => {
        html += `
            <div class="reference-item mb-2 d-flex align-iteml-center gap-2">
                <input type="text" class="form-control form-control-sm" placeholder="Reference URL or description" value="${ref}" onchange="updateReference('${report.id}', ${idx}, this.value)">
                <button class="btn btn-sm btn-outline-danger" onclick="removeReference('${report.id}', ${idx})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    });
    
    html += `
        <button class="btn btn-sm btn-outline-primary" onclick="addReference('${report.id}')">
            <i class="bi bi-plus mr-1"></i>Add Reference
        </button>
    </div>`;
    
    return html;
}

function buildAppendix(report) {
    const appendix = report.appendix || {};
    const dynamicAppendix = generateDynamicAppendix(report);
    
    return `
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Methodology</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'methodology', this.value)" placeholder="Describe the methodology used for this assessment...">${appendix.methodology || dynamicAppendix.methodology}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Scope</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'scope', this.value)" placeholder="Define the scope of this assessment...">${appendix.scope || dynamicAppendix.scope}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Limitations</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'limitations', this.value)" placeholder="Document any limitations or constraints...">${appendix.limitations || dynamicAppendix.limitations}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Additional Notes</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'additionalNotes', this.value)" placeholder="Any additional notes or context...">${appendix.additionalNotes || dynamicAppendix.additionalNotes}</textarea>
        </div>
    `;
}

function generateDynamicAppendix(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    const totalQueries = techniques.reduce((sum, ann) => sum + (ann.queries?.length || 0), 0);
    const tactics = report.coverageByTactic || getCoverageByTactic();
    const overallCoverage = tactics.length > 0 ? Math.round(tactics.reduce((sum, t) => sum + t.coverage, 0) / tactics.length) : 0;
    
    return {
        methodology: `This assessment utilized a combination of signature-based detection, behavioral analysis, and threat intelligence-driven hunting. Detection queries were developed based on MITRE ATT&CK technique descriptions and validated against known threat actor TTPs. All hunts were tested in a controlled environment before deployment to production systems.`,
        scope: `Coverage assessment includes ${techniques.length} techniques with ${totalQueries} detection queries across all monitored environments. Assessment period: ${report.reportMonth || month}. Overall coverage: ${overallCoverage}%.`,
        limitations: `This assessment is limited to techniques with available detection queries. Some techniques may not have applicable detection methods in the current telemetry environment. Coverage percentages are based on logged techniques and may not reflect the full ATT&CK matrix. Threat associations are based on publicly available intelligence and may not represent all potential threat actors.`,
        additionalNotes: `Report generated on ${report.generatedDate || new Date().toLocaleDateString()}. Data sourced from MITRE ATT&CK framework. For questions or clarifications, contact the threat hunting team.`
    };
}

function updateReportField(reportId, field, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        report[field] = value;
        saveReport(report);
    }
}

function changeReportMonth(reportId, newMonth) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        report.selectedMonth = newMonth;
        saveReport(report).then(() => {
            viewReport(reportId);
        });
    }
}

function changeReportTheme(reportId, newTheme) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        report.bannerTheme = newTheme;
        saveReport(report).then(() => {
            viewReport(reportId);
        });
    }
}

function markdownToHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function validateReport(report) {
    const requiredFields = [
        { field: 'executiveSummary', label: 'Executive Summary', dynamic: true },
        { field: 'leadershipOverview', label: 'Leadership Overview', dynamic: true },
        { field: 'monthlyFocus', label: 'Monthly Focus Areas', dynamic: true },
        { field: 'gapAnalysis', label: 'Gap Analysis & Prioritization', dynamic: true }
    ];
    
    const missing = [];
    requiredFields.forEach(({ field, label, dynamic }) => {
        const value = report[field];
        const isEmpty = !value || value.trim() === '';
        const hasDynamic = dynamic && (
            (field === 'executiveSummary' && generateDynamicExecutiveSummary(report)) ||
            (field === 'leadershipOverview' && generateLeadershipOverview(report)) ||
            (field === 'monthlyFocus' && generateDynamicMonthlyFocus(report)) ||
            (field === 'gapAnalysis' && generateDynamicGapAnalysis(report))
        );
        
        if (isEmpty && !hasDynamic) {
            missing.push(label);
        }
    });
    
    if (missing.length > 0) {
        showToast(`Please complete: ${missing.join(', ')}`, 'error');
        return false;
    }
    
    return true;
}

function generateDynamicMonthlyFocus(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    if (techniques.length === 0) return '';
    
    const stats = getMonthStats(month);
    
    const tacticCounts = {};
    techniques.forEach(ann => {
        const tactics = getTechniqueTactics(ann.techniqueID);
        tactics.forEach(tactic => {
            tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
        });
    });
    
    const topTactics = Object.entries(tacticCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tactic]) => tactic);
    
    let focus = `This month's threat hunting activities focused on ${topTactics.length > 0 ? topTactics.join(', ') + ' tactics' : 'multiple tactics'}. `;
    focus += `Added ${stats.mainTechs} new technique${stats.mainTechs !== 1 ? 's' : ''} and ${stats.subTechs} sub-technique${stats.subTechs !== 1 ? 's' : ''} with ${stats.queries} detection queries. `;
    
    if (topTactics.length > 0) {
        focus += `Primary focus areas include ${topTactics[0]} (${tacticCounts[topTactics[0]]} techniques), `;
        if (topTactics.length > 1) {
            focus += `${topTactics[1]} (${tacticCounts[topTactics[1]]} techniques)`;
            if (topTactics.length > 2) {
                focus += `, and ${topTactics[2]} (${tacticCounts[topTactics[2]]} techniques)`;
            }
        }
        focus += '. ';
    }
    
    focus += 'Continue expanding coverage in high-priority tactics while maintaining detection quality across all implemented hunts.';
    
    return focus;
}

function generateDynamicGapAnalysis(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    if (tactics.length === 0) return '';
    
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80).sort((a, b) => a.coverage - b.coverage);
    const highCoverage = tactics.filter(t => t.coverage >= 80);
    
    let analysis = '**Coverage Gap Analysis:**\n\n';
    
    if (lowCoverage.length > 0) {
        analysis += '**Critical Gaps (<50% coverage):**\n';
        lowCoverage.forEach(t => {
            const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            analysis += `- ${tacticName}: ${t.coverage}% coverage (${t.withQueries}/${t.total} techniques)\n`;
        });
        analysis += '\n';
    }
    
    if (mediumCoverage.length > 0) {
        analysis += '**Moderate Coverage (50-80%):**\n';
        mediumCoverage.forEach(t => {
            const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            analysis += `- ${tacticName}: ${t.coverage}% coverage (${t.withQueries}/${t.total} techniques)\n`;
        });
        analysis += '\n';
    }
    
    if (highCoverage.length > 0) {
        analysis += '**Strong Coverage (≥80%):**\n';
        highCoverage.forEach(t => {
            const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            analysis += `- ${tacticName}: ${t.coverage}% coverage\n`;
        });
        analysis += '\n';
    }
    
    analysis += '**Prioritization Recommendations:**\n';
    if (lowCoverage.length > 0) {
        analysis += `1. **Immediate Priority:** Address critical gaps in ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')}.\n`;
    }
    if (mediumCoverage.length > 0) {
        analysis += `2. **Short-term Goal:** Improve coverage in ${mediumCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')} to reach 80%+.\n`;
    }
    analysis += '3. **Maintenance:** Continue monitoring and updating existing detections for high-coverage tactics.\n';
    analysis += '4. **Threat Intelligence:** Align new detections with current threat actor TTPs targeting low-coverage areas.';
    
    return analysis;
}

function generateDynamicExecutiveSummary(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const stats = getMonthStats(month);
    
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const tactics = getCoverageByTacticUpToMonth(month);
    const overallCoverage = coverageStats.pct % 1 === 0 ? coverageStats.pct : coverageStats.pct.toFixed(1);
    
    const tacticCounts = {};
    state.currentLayer?.techniques.forEach(ann => {
        if (!ann.queries) return;
        const hasMonthQuery = ann.queries.some(q => resolveQueryMonth(q, ann) === month);
        if (!hasMonthQuery) return;
        
        const tacs = getTechniqueTactics(ann.techniqueID);
        tacs.forEach(tactic => {
            tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
        });
    });
    
    const topTactics = Object.entries(tacticCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tactic]) => tactic);
    
    let summary = `This ${report.type === 'initial' ? 'initial assessment' : 'monthly update'} report covers threat hunting activities for ${report.reportMonth || month}. `;
    
    if (coverageStats.parents && coverageStats.parents.total) {
        const allPct = coverageStats.all.pct % 1 === 0 ? coverageStats.all.pct : coverageStats.all.pct.toFixed(1);
        summary += `Overall detection coverage stands at ${overallCoverage}% across ${coverageStats.parents.covered} of ${coverageStats.parents.total} parent techniques (or ${allPct}% across ${coverageStats.all.covered} of ${coverageStats.all.total} total techniques and sub-techniques). `;
    } else {
        summary += `Overall detection coverage stands at ${overallCoverage}% across ${coverageStats.covered} of ${coverageStats.total} techniques. `;
    }
    
    if (stats.mainTechs > 0 || stats.subTechs > 0) {
        summary += `During this period, ${stats.mainTechs} new technique${stats.mainTechs !== 1 ? 's' : ''} and ${stats.subTechs} sub-technique${stats.subTechs !== 1 ? 's' : ''} were added to the detection portfolio, `;
        summary += `resulting in ${stats.queries} new detection queries added this period. `;
    }
    
    if (topTactics.length > 0) {
        summary += `Primary hunting focus areas included ${topTactics.join(', ')}, `;
        summary += `reflecting current threat landscape priorities and organizational risk assessment. `;
    }
    
    const lowCoverage = tactics.filter(t => t.coverage < 50);
    if (lowCoverage.length > 0) {
        summary += `Critical coverage gaps remain in ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')}, `;
        summary += `requiring immediate attention to reduce detection blind spots. `;
    }
    
    summary += `Key recommendations include prioritizing high-impact techniques, aligning detections with emerging threat actor TTPs, and maintaining continuous monitoring of existing coverage areas.`;
    
    return summary;
}

function updateMethodologyField(reportId, category, field, checked) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report[category]) report[category] = {};
        report[category][field] = checked;
        saveReport(report);
    }
}

function updateAppendixField(reportId, field, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report.appendix) report.appendix = {};
        report.appendix[field] = value;
        saveReport(report);
    }
}

function addDetectionResult(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report.detectionResults) report.detectionResults = [];
        report.detectionResults.push({ huntName: '', sirTicket: '', notes: '' });
        saveReport(report).then(() => viewReport(reportId));
    }
}

function removeDetectionResult(reportId, idx) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.detectionResults) {
        report.detectionResults.splice(idx, 1);
        saveReport(report).then(() => viewReport(reportId));
    }
}

function updateDetectionResult(reportId, idx, field, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.detectionResults && report.detectionResults[idx]) {
        report.detectionResults[idx][field] = value;
        saveReport(report);
    }
}

function addReference(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report.references) report.references = [];
        report.references.push('');
        saveReport(report).then(() => viewReport(reportId));
    }
}

function removeReference(reportId, idx) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.references) {
        report.references.splice(idx, 1);
        saveReport(report).then(() => viewReport(reportId));
    }
}

function updateReference(reportId, idx, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.references) {
        report.references[idx] = value;
        saveReport(report);
    }
}

async function confirmDeleteReport(reportId) {
    if (confirm('Delete this report? This action cannot be undone.')) {
        await deleteReport(reportId);
        showToast('Report deleted', 'success');
        loadReportsList();
    }
}

function saveAndValidateReport(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }
    
    if (validateReport(report)) {
        saveReport(report).then(() => {
            showToast('Report saved and validated successfully', 'success');
        }).catch(err => {
            showToast('Failed to save: ' + err.message, 'error');
        });
    }
}

async function exportReportPDF(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    showToast('Generating PDF...', 'info');
    
    if (typeof window.html2pdf === 'undefined') {
        showToast('PDF library not loaded', 'error');
        return;
    }
    
    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;
    const htmlContent = buildEmailHTML(report, isDark);
    
    const container = document.createElement('div');
    container.style.cssText = isDark
        ? 'width:794px;background:#070814;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#cbd5e1;'
        : 'width:794px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1e293b;';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);
    
    try {
        const opt = {
            margin: 0,
            filename: `report_${reportId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        await window.html2pdf().set(opt).from(container).save();
        showToast('PDF exported', 'success');
    } catch (e) {
        console.error('PDF generation failed:', e);
        showToast('Failed to generate PDF: ' + e.message, 'error');
    } finally {
        document.body.removeChild(container);
    }
}

function exportReportEmail(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;
    const htmlContent = buildEmailHTML(report, isDark);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.download = `report_${reportId}.html`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Email HTML exported', 'success');
}

function exportReportEML(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;
    const htmlContent = buildEmailHTML(report, isDark);
    const subject = `MITRE ATT&CK Coverage Report - ${report.reportMonth || report.generatedDate}`;
    
    // Base64 encode the HTML to prevent line length issues in EML viewers
    const utf8Bytes = new TextEncoder().encode(htmlContent);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
        binaryString += String.fromCharCode.apply(null, utf8Bytes.subarray(i, i + chunkSize));
    }
    const base64Content = btoa(binaryString);
    // Split base64 into 76 character lines per RFC 2045
    const formattedBase64 = base64Content.match(/.{1,76}/g).join('\r\n');
    
    const emlContent = [
        'From: MITRE ATT&CK Coverage Tool <noreply@mitre-attack-explorer>',
        `To: recipient@example.com`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        formattedBase64
    ].join('\r\n');

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const link = document.createElement('a');
    link.download = `report_${reportId}.eml`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('EML file exported', 'success');
}

async function exportReportSVG(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    if (typeof window.htmlToImage === 'undefined') {
        showToast('SVG library not loaded', 'error');
        return;
    }

    showToast('Generating SVG...', 'info');

    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;
    const htmlContent = buildEmailHTML(report, isDark);
    const container = document.createElement('div');
    container.style.cssText = isDark
        ? 'width:794px;background:#070814;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#cbd5e1;position:absolute;top:-9999px;left:-9999px;'
        : 'width:794px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1e293b;position:absolute;top:-9999px;left:-9999px;';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    try {
        const svgDataUrl = await window.htmlToImage.toSvg(container, {
            filter: (node) => {
                // filter out hidden elements
                return node.tagName !== 'SCRIPT';
            }
        });
        const link = document.createElement('a');
        link.download = `report_${reportId}.svg`;
        link.href = svgDataUrl;
        link.click();
        showToast('SVG exported', 'success');
    } catch (e) {
        console.error('SVG generation failed:', e);
        showToast('Failed to generate SVG: ' + e.message, 'error');
    } finally {
        document.body.removeChild(container);
    }
}

function buildEmailMonthlyActivity(report, theme, isDark = false) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || report.reportMonth?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    if (techniques.length === 0) return '';
    
    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);
    
    if (colorChanges.length === 0 && newTechniques.length === 0 && newHunts.length === 0) return '';
    
    const mainTechniques = newTechniques.filter(t => !isSubTechnique(t.techniqueID));
    const subTechniques = newTechniques.filter(t => isSubTechnique(t.techniqueID));
    
    let html = `<div class="section"><h3>Monthly Activity Timeline</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">`;
    
    const renderTimelineRow = (color, typeLabel, title, details, footerText) => {
        const parts = title.split(' - ');
        const isStandardTech = parts.length > 1;
        const techId = isStandardTech ? parts[0] : '';
        const techName = isStandardTech ? parts.slice(1).join(' - ') : title;

        const titleHtml = isStandardTech
            ? `<span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: ${color}; background-color: ${isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9'}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'};">${techId}</span>
               <span style="font-size: 11.5px; font-weight: 600; color: ${isDark ? '#f3f4f6' : '#1e293b'}; margin-left: 6px;">${techName}</span>`
            : `<span style="font-size: 11.5px; font-weight: 600; color: ${isDark ? '#f3f4f6' : '#1e293b'};">${title}</span>`;

        return `
            <tr>
                <td style="width: 24px; vertical-align: top; padding-top: 12px; text-align: center; position: relative;">
                    <div style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 3px solid ${color}; background-color: ${isDark ? '#070814' : '#ffffff'}; box-shadow: ${isDark ? '0 0 10px ' + color + '40' : 'none'}; z-index: 2; position: relative;"></div>
                </td>
                <td style="padding: 0 0 16px 12px; vertical-align: top;">
                    <div style="background: ${isDark ? 'linear-gradient(145deg, rgba(20, 21, 38, 0.8) 0%, rgba(13, 14, 28, 0.5) 100%)' : '#ffffff'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0'}; border-left: 4px solid ${color}; border-radius: 10px; padding: 14px; box-shadow: ${isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 12px rgba(15, 23, 42, 0.03)'}; transition: all 0.3s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                                ${titleHtml}
                            </div>
                            <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 9999px; ${isDark ? 'background-color: rgba(255, 255, 255, 0.06); color: #a2a6cc;' : 'background-color: #f1f5f9; color: #475569;'}">${typeLabel}</span>
                        </div>
                        ${details ? `<div style="font-size: 11px; color: ${isDark ? '#a2a6cc' : '#475569'}; line-height: 1.5; margin-top: 6px;">${details}</div>` : ''}
                        ${footerText ? `
                            <div style="font-size: 10px; color: ${isDark ? '#f3f4f6' : '#1e293b'}; background-color: ${isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0'}; border-radius: 6px; padding: 8px 12px; margin-top: 10px; display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace;">
                                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${color}; flex-shrink: 0; box-shadow: 0 0 6px ${color};"></span>
                                ${footerText}
                            </div>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    };
    
    // Status/Color changes
    if (colorChanges.length > 0) {
        html += `
            <tr>
                <td colspan="2" style="padding: 12px 0 8px 0; border: none;">
                    <div style="font-size: 11px; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}; padding-bottom: 3px;">
                        🔄 Status & Coverage Changes (${colorChanges.length})
                    </div>
                    <div style="font-size: 9.5px; color: ${isDark ? '#a2a6cc' : '#64748b'}; margin-top: 4px; line-height: 1.4; font-style: italic;">
                        Tracks automatic updates to technique coverage status when live threat hunt queries or sub-technique coverage percentages change (e.g., transitioning from unassigned to a defined coverage level).
                    </div>
                </td>
            </tr>
        `;
        colorChanges.forEach(change => {
            const techName = getTechniqueName(change.techniqueID);
            const isSub = isSubTechnique(change.techniqueID);
            const techType = isSub ? 'Sub-technique' : 'Technique';
            const typeBadgeBg = isSub ? 'rgba(56, 189, 248, 0.1)' : 'rgba(168, 85, 247, 0.1)';
            const typeBadgeColor = isSub ? '#0284c7' : '#7e22ce';
            
            const fromLabel = change.fromLabel === 'None' ? 'Unassigned' : change.fromLabel;
            const toLabel = change.toLabel === 'None' ? 'Unassigned' : change.toLabel;
            
            html += `
                <tr>
                    <td style="width: 24px; vertical-align: top; padding-top: 10px; text-align: center;">
                        <div style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #fbbf24; box-shadow: 0 0 6px rgba(251, 191, 54, 0.4); z-index: 2; position: relative;"></div>
                    </td>
                    <td style="padding: 0 0 10px 12px; vertical-align: top;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; flex-wrap: wrap; gap: 8px; background: ${isDark ? 'linear-gradient(145deg, rgba(20, 21, 38, 0.7) 0%, rgba(13, 14, 28, 0.4) 100%)' : '#ffffff'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0'}; border-left: 3px solid #fbbf24; padding: 10px 14px; border-radius: 8px; box-shadow: ${isDark ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 6px rgba(15, 23, 42, 0.02)'};">
                            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: ${isDark ? '#f3f4f6' : '#1e293b'}; background-color: ${isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9'}; padding: 2px 5px; border-radius: 4px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'};">${change.techniqueID}</span>
                                <span style="font-weight: 600; color: ${isDark ? '#cbd5e1' : '#475569'}; margin-left: 6px;">${techName}</span>
                                <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; background-color: ${typeBadgeBg}; color: ${typeBadgeColor}; margin-left: 6px; display: inline-block; vertical-align: middle;">${techType}</span>
                            </div>
                            <div style="font-size: 10px; color: ${isDark ? '#a2a6cc' : '#64748b'}; font-weight: 500; margin-left: auto;">
                                Coverage Status: <span style="font-weight: 600; color: ${isDark ? '#fbbf24' : '#d97706'};">${fromLabel}</span> &rarr; <span style="font-weight: 600; color: ${isDark ? '#4ade80' : '#16a34a'};">${toLabel}</span>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
    
    // New Main Techniques
    if (mainTechniques.length > 0) {
        html += `
            <tr>
                <td colspan="2" style="padding: 16px 0 8px 0; border: none;">
                    <div style="font-size: 11px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}; padding-bottom: 3px;">
                        🛡️ New Main Techniques Deployed (${mainTechniques.length})
                    </div>
                    <div style="font-size: 9.5px; color: ${isDark ? '#a2a6cc' : '#64748b'}; margin-top: 4px; line-height: 1.4; font-style: italic;">
                        Displays parent-level ATT&CK techniques that received their very first hunt query implementation this month, expanding our defensive visibility footprint.
                    </div>
                </td>
            </tr>
        `;
        mainTechniques.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID) || '';
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = (ann.queries && ann.queries.length > 0) ? ann.queries.map(q => q.name).join(', ') : 'No queries (Check sub-techniques)';
            
            let details = techDesc ? `<div style="margin-bottom: 4px;">${techDesc}</div>` : '';
            if (techTactics.length > 0) details += `<div style="font-size: 10px; color: ${theme.accent};">Tactics: ${techTactics.join(', ')}</div>`;
            
            html += renderTimelineRow(
                '#34d399', 
                'Technique', 
                `${ann.techniqueID} - ${techName}`, 
                details,
                `Queries implemented: "${queryNames}"`
            );
        });
    }
    
    // New Sub-techniques
    if (subTechniques.length > 0) {
        html += `
            <tr>
                <td colspan="2" style="padding: 16px 0 8px 0; border: none;">
                    <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}; padding-bottom: 3px;">
                        🧩 New Sub-techniques Deployed (${subTechniques.length})
                    </div>
                    <div style="font-size: 9.5px; color: ${isDark ? '#a2a6cc' : '#64748b'}; margin-top: 4px; line-height: 1.4; font-style: italic;">
                        Highlights granular, specific sub-techniques that have had threat hunt queries newly deployed, providing high-fidelity detection capability.
                    </div>
                </td>
            </tr>
        `;
        subTechniques.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID) || '';
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = (ann.queries && ann.queries.length > 0) ? ann.queries.map(q => q.name).join(', ') : 'No queries';
            
            let details = techDesc ? `<div style="margin-bottom: 4px;">${techDesc}</div>` : '';
            if (techTactics.length > 0) details += `<div style="font-size: 10px; color: ${theme.accent};">Tactics: ${techTactics.join(', ')}</div>`;
            
            html += renderTimelineRow(
                '#38bdf8', 
                'Sub-technique', 
                `${ann.techniqueID} - ${techName}`, 
                details,
                `Queries implemented: "${queryNames}"`
            );
        });
    }
    
    html += `</table></div>`;
    return html;
}

function buildGapAnalysisVisual(report, theme, isDark = false) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    if (tactics.length === 0) return '';
    
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80).sort((a, b) => a.coverage - b.coverage);
    const highCoverage = tactics.filter(t => t.coverage >= 80).sort((a, b) => b.coverage - a.coverage);
    
    let html = `
        <div class="section" style="page-break-inside: avoid;">
            <h3>Gap Analysis & Prioritization</h3>
            <p style="margin-bottom: 12px; font-size: 13px; color: ${isDark ? '#cbd5e1' : '#475569'};">A granular assessment of coverage across all tactics, with recommended immediate action items to address visibility gaps.</p>
    `;
    
    // Critical Gaps Panel
    if (lowCoverage.length > 0) {
        const items = lowCoverage.map(t => {
            const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `
                <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; ${isDark ? 'background-color: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2);' : 'background-color: #ffffff; border: 1px solid #fee2e2;'} border-radius: 6px; padding: 8px 12px; font-size: 12px;">
                    <div>
                        <strong style="color: ${isDark ? '#fca5a5' : '#991b1b'};">${tacticName}</strong>
                        <span style="color: #64748b; margin-left: 6px;">(${t.withQueries}/${t.total} techniques)</span>
                    </div>
                    <span style="font-weight: 700; color: ${isDark ? '#f87171' : '#ef4444'}; background-color: ${isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'}; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${t.coverage.toFixed(1)}% Coverage</span>
                </div>
            `;
        }).join('');
        
        html += `
            <div style="${isDark ? 'background-color: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.2);' : 'background-color: #fffafb; border: 1px solid #fee2e2;'} border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    ⚠️ CRITICAL VISIBILITY GAPS (<50% COVERAGE)
                </div>
                ${items}
                <div style="font-size: 11px; color: ${isDark ? '#fca5a5' : '#7f1d1d'}; margin-top: 10px; font-style: italic;">
                    <strong>Recommendation:</strong> Prioritize immediate deployment of threat hunts in these sectors to minimize active blindspots.
                </div>
            </div>
        `;
    }
    
    // Moderate Coverage Panel
    if (mediumCoverage.length > 0) {
        const items = mediumCoverage.map(t => {
            const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `
                <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; ${isDark ? 'background-color: rgba(217, 119, 6, 0.05); border: 1px solid rgba(217, 119, 6, 0.2);' : 'background-color: #ffffff; border: 1px solid #fef3c7;'} border-radius: 6px; padding: 8px 12px; font-size: 12px;">
                    <div>
                        <strong style="color: ${isDark ? '#fcd34d' : '#92400e'};">${tacticName}</strong>
                        <span style="color: #64748b; margin-left: 6px;">(${t.withQueries}/${t.total} techniques)</span>
                    </div>
                    <span style="font-weight: 700; color: ${isDark ? '#fbbf24' : '#d97706'}; background-color: ${isDark ? 'rgba(217, 119, 6, 0.15)' : '#fef3c7'}; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${t.coverage.toFixed(1)}% Coverage</span>
                </div>
            `;
        }).join('');
        
        html += `
            <div style="${isDark ? 'background-color: rgba(217, 119, 6, 0.03); border: 1px solid rgba(217, 119, 6, 0.2);' : 'background-color: #fffdf5; border: 1px solid #fef3c7;'} border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    ⚡ MODERATE DEPLOYMENTS (50% - 80% COVERAGE)
                </div>
                ${items}
                <div style="font-size: 11px; color: ${isDark ? '#fcd34d' : '#78350f'}; margin-top: 10px; font-style: italic;">
                    <strong>Recommendation:</strong> Scale query variety and test behavioral triggers to push coverage beyond 80%.
                </div>
            </div>
        `;
    }
    
    // Action Plan Panel
    html += `
        <div style="${isDark ? 'background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08);' : 'background-color: #f8fafc; border: 1px solid #e2e8f0;'} border-radius: 8px; padding: 14px;">
            <div style="font-size: 12px; font-weight: 700; color: ${isDark ? '#ffffff' : '#475569'}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                🎯 PRIORITIZED STRATEGIC ROADMAP
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 11px; margin: 0;">
                <tr>
                    <td style="width: 30px; vertical-align: top; padding: 4px 0; border: none;">
                        <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; background-color: #ef4444; color: #ffffff; text-align: center; font-weight: 700;">1</span>
                    </td>
                    <td style="vertical-align: top; padding: 4px 0 8px 6px; border: none; color: ${isDark ? '#cbd5e1' : '#334155'};">
                        <strong>Immediate Defense:</strong> Target and close critical gaps in low-coverage tactics (${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(', ')}).
                    </td>
                </tr>
                <tr>
                    <td style="width: 30px; vertical-align: top; padding: 4px 0; border: none;">
                        <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; background-color: #fbbf24; color: #ffffff; text-align: center; font-weight: 700;">2</span>
                    </td>
                    <td style="vertical-align: top; padding: 4px 0 8px 6px; border: none; color: ${isDark ? '#cbd5e1' : '#334155'};">
                        <strong>Query Optimization:</strong> Refine detection query logic in Moderate sectors to raise them to Strong standards.
                    </td>
                </tr>
                <tr>
                    <td style="width: 30px; vertical-align: top; padding: 4px 0; border: none;">
                        <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; background-color: #3b82f6; color: #ffffff; text-align: center; font-weight: 700;">3</span>
                    </td>
                    <td style="vertical-align: top; padding: 4px 0 4px 6px; border: none; color: ${isDark ? '#cbd5e1' : '#334155'};">
                        <strong>Continuous Validation:</strong> Maintain systematic test-runs against established Strong tactics to prevent detection decay.
                    </td>
                </tr>
            </table>
        </div>
    `;
    
    html += `</div>`;
    return html;
}

function buildEmailHTML(report, isDark = false) {
    const fullStats = report.fullStats || getFullCoverageStats();
    const tactics = report.coverageByTactic || getCoverageByTactic();
    const theme = BANNER_THEMES[report.bannerTheme || 'blue'] || BANNER_THEMES.blue;
    const hexToRgb = (hex) => {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `${r}, ${g}, ${b}`;
    };
    const accentRgb = hexToRgb(theme.accent);
    
    // Month stats for stats bar
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    
    const execSummary = report.executiveSummary || generateDynamicExecutiveSummary(report);
    const monthlyFocus = report.monthlyFocus || generateDynamicMonthlyFocus(report);
    const gapAnalysis = report.gapAnalysis || generateDynamicGapAnalysis(report);
    const leadership = report.leadershipOverview || generateLeadershipOverview(report);
    
    let gapAnalysisHtml = '';
    if (gapAnalysis) {
        if (!report.gapAnalysis || report.gapAnalysis.trim() === '' || report.gapAnalysis === generateDynamicGapAnalysis(report)) {
            gapAnalysisHtml = buildGapAnalysisVisual(report, theme, isDark);
        } else {
            gapAnalysisHtml = `
                <div class="section" style="page-break-inside: avoid;">
                    <h3>Gap Analysis & Prioritization</h3>
                    <div style="${isDark ? 'background-color: #0f1123; border: 1px solid rgba(168,85,247,0.2); color: #cbd5e1;' : 'background-color: #f8fafc; border: 1px solid #e2e8f0; color: #334155;'} border-radius: 8px; padding: 16px; font-size: 13px; line-height: 1.6;">
                        ${markdownToHtml(gapAnalysis)}
                    </div>
                </div>
            `;
        }
    }
    
    // Methodology & Scope with descriptions
    let methodScopeHtml = '';
    const methodDescriptions = {
        'sig-based': 'Signature-based detection using rule matching against known patterns and indicators.',
        'behavioral': 'Behavioral analysis focusing on anomaly detection and deviation from normal baselines.',
        'threat-intel': 'Threat intelligence driven hunting based on known adversary TTPs and campaigns.',
        'hypothesis': 'Hypothesis-driven testing of specific assumptions about potential attacker behavior.',
        'data-driven': 'Data-driven exploratory analysis of telemetry to uncover hidden threats.',
        'compliance': 'Compliance-driven detection aligned with regulatory and framework requirements.'
    };
    const scopeDescriptions = {
        'endpoints': 'Workstations, servers, and mobile devices across the enterprise.',
        'network': 'Network traffic analysis including firewall logs, DNS, and flow data.',
        'cloud': 'Cloud infrastructure including AWS, Azure, and GCP environments.',
        'identity': 'Identity systems including Active Directory, SSO, and authentication logs.',
        'email': 'Email security including phishing detection and attachment analysis.',
        'applications': 'Application security including web apps, APIs, and database activity.'
    };
    
    const selectedMethods = report.methodology ? Object.entries(report.methodology).filter(([, v]) => v).map(([k]) => {
        const name = k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const desc = methodDescriptions[k] || '';
        return desc ? `<strong style="color: ${isDark ? '#e2e8f0' : '#1e293b'};">${name}:</strong> ${desc}` : name;
    }) : [];
    const selectedScopes = report.scope ? Object.entries(report.scope).filter(([, v]) => v).map(([k]) => {
        const name = k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const desc = scopeDescriptions[k] || '';
        return desc ? `<strong style="color: ${isDark ? '#e2e8f0' : '#1e293b'};">${name}:</strong> ${desc}` : name;
    }) : [];
    
    if (selectedMethods.length > 0 || selectedScopes.length > 0) {
        methodScopeHtml = `<div class="section" style="page-break-inside: avoid;">
            <h3>Methodology & Scope</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr>
                    <td valign="top" style="width: 48%; padding-right: 4%; vertical-align: top;">
                        <div style="background: ${isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; border-radius: 12px; padding: 16px; min-height: 220px; box-shadow: ${isDark ? '0 8px 32px 0 rgba(0, 0, 0, 0.37)' : '0 8px 20px 0 rgba(0, 0, 0, 0.03)'};">
                            <h4 style="margin-top: 0; margin-bottom: 12px; color: ${isDark ? '#a855f7' : '#7c3aed'}; font-size: 14px; font-weight: 700; border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding-bottom: 6px;">
                                🎯 Hunting Methodology
                            </h4>
                            ${selectedMethods.length ? selectedMethods.map(m => `
                                <div style="margin-bottom: 10px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; line-height: 1.5; display: table; width: 100%;">
                                    <div style="display: table-cell; width: 16px; vertical-align: top; color: #10b981; font-weight: bold; font-size: 13px;">✓</div>
                                    <div style="display: table-cell; padding-left: 6px; vertical-align: top;">
                                        ${m}
                                    </div>
                                </div>
                            `).join('') : `<p style="color: ${isDark ? '#6b709c' : '#94a3b8'}; font-size: 12px; font-style: italic; margin: 0;">No specific methodologies specified.</p>`}
                        </div>
                    </td>
                    <td valign="top" style="width: 48%; vertical-align: top;">
                        <div style="background: ${isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; border-radius: 12px; padding: 16px; min-height: 220px; box-shadow: ${isDark ? '0 8px 32px 0 rgba(0, 0, 0, 0.37)' : '0 8px 20px 0 rgba(0, 0, 0, 0.03)'};">
                            <h4 style="margin-top: 0; margin-bottom: 12px; color: ${isDark ? '#06b6d4' : '#0284c7'}; font-size: 14px; font-weight: 700; border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding-bottom: 6px;">
                                🛡️ Defensive Telemetry Scope
                            </h4>
                            ${selectedScopes.length ? selectedScopes.map(s => `
                                <div style="margin-bottom: 10px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; line-height: 1.5; display: table; width: 100%;">
                                    <div style="display: table-cell; width: 16px; vertical-align: top; color: #06b6d4; font-weight: bold; font-size: 13px;">•</div>
                                    <div style="display: table-cell; padding-left: 6px; vertical-align: top;">
                                        ${s}
                                    </div>
                                </div>
                            `).join('') : `<p style="color: ${isDark ? '#6b709c' : '#94a3b8'}; font-size: 12px; font-style: italic; margin: 0;">No specific data scopes specified.</p>`}
                        </div>
                    </td>
                </tr>
            </table>
        </div>`;
    }
    
    // New Threat Hunt Queries
    let newQueriesHtml = '';
    if (month) {
        const byMonth = getTechniquesByMonth();
        const techniques = byMonth[month] || [];
        const seenIds = new Set();
        const newQueries = [];
        techniques.forEach(ann => {
            if (ann.queries) {
                ann.queries.forEach(q => {
                    if (!seenIds.has(q.id)) {
                        seenIds.add(q.id);
                        newQueries.push({ 
                            id: q.id,
                            name: q.name, 
                            techniqueID: ann.techniqueID, 
                            language: q.language,
                            description: q.description
                        });
                    }
                });
            }
        });
        
        if (newQueries.length > 0) {
            const layerTechs = report.snapshot?.techniques || state.currentLayer?.techniques || [];
            const queryList = newQueries.map(q => {
                const queryName = q.name || 'Unnamed Query';
                const assoc = getQueryAssociations(q, layerTechs);
                const parents = assoc.filter(x => !x.isSub);
                const subs = assoc.filter(x => x.isSub);
                
                let badgesHtml = '<div style="margin-top: 6px; font-size: 10px; line-height: 1.6;">';
                if (parents.length > 0) {
                    badgesHtml += `<div style="margin-bottom: 2px;"><span style="font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Techniques:</span>`;
                    badgesHtml += parents.map(p => {
                        const bg = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(14, 165, 233, 0.08)';
                        const text = isDark ? '#38bdf8' : '#0369a1';
                        const border = isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(14, 165, 233, 0.2)';
                        return `<span style="background: ${bg}; color: ${text}; border: 1px solid ${border}; padding: 1px 4px; border-radius: 4px; font-weight: 600; font-family: monospace; font-size: 9px; margin-right: 4px; display: inline-block; white-space: nowrap;" title="${escapeHtml(p.name)}">${p.id}</span>`;
                    }).join(' ');
                    badgesHtml += `</div>`;
                }
                if (subs.length > 0) {
                    badgesHtml += `<div><span style="font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Sub-techniques:</span>`;
                    badgesHtml += subs.map(s => {
                        const bg = isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.08)';
                        const text = isDark ? '#34d399' : '#047857';
                        const border = isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(16, 185, 129, 0.2)';
                        return `<span style="background: ${bg}; color: ${text}; border: 1px solid ${border}; padding: 1px 4px; border-radius: 4px; font-weight: 600; font-family: monospace; font-size: 9px; margin-right: 4px; display: inline-block; white-space: nowrap;" title="${escapeHtml(s.name)}">${s.id}</span>`;
                    }).join(' ');
                    badgesHtml += `</div>`;
                }
                badgesHtml += '</div>';
                
                return `
                    <li style="margin-bottom: 12px; list-style-type: none; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}; padding-bottom: 8px;">
                        <strong style="font-size: 13px; color: ${isDark ? '#ffffff' : '#0f172a'};">${queryName}</strong>
                        <span style="background: ${isDark ? '#1e293b' : '#f1f5f9'}; color: ${isDark ? '#cbd5e1' : '#475569'}; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-left: 8px; vertical-align: middle;">${q.language}</span>
                        ${q.description ? `<div style="font-size: 12px; color: ${isDark ? '#a2a6cc' : '#475569'}; margin-top: 4px; line-height: 1.5; font-style: italic;">${q.description}</div>` : ''}
                        ${badgesHtml}
                    </li>
                `;
            }).join('');
            newQueriesHtml = `<div class="section"><h3>New Threat Hunt Queries</h3>
                <p style="margin-bottom: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; font-size: 13px;">${newQueries.length} queries for this period:</p>
                <ul style="padding-left: 0; margin: 0;">${queryList}</ul>
            </div>`;
        }
    }
    
    // Tactics Graph Revamp: Column Gap Triage
    let tacticsGraphHtml = '';
    if (tactics.length > 0) {
        const criticalGaps = [];
        const moderateCoverage = [];
        const strongCoverage = [];
        
        tactics.forEach(t => {
            const pct = t.coverage;
            const name = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const item = { ...t, displayName: name };
            if (pct < 50) {
                criticalGaps.push(item);
            } else if (pct < 80) {
                moderateCoverage.push(item);
            } else {
                strongCoverage.push(item);
            }
        });
        
        const renderListEmail = (list, color) => {
            if (list.length === 0) return '<div style="color: #94a3b8; font-size: 11px; font-style: italic; text-align: center; padding: 8px 0;">No tactics</div>';
            return list.map(item => `
                <div style="display: flex; justify-content: space-between; padding: 6px 8px; margin-bottom: 4px; background-color: #f8fafc; border-radius: 4px; font-size: 11px;">
                    <span style="font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${item.displayName}</span>
                    <span style="font-weight: 700; color: ${color};">${item.coverage % 1 === 0 ? item.coverage : item.coverage.toFixed(1)}%</span>
                </div>
            `).join('');
        };

        tacticsGraphHtml = `
            <div class="section">
                <h3>Tactic Gap Triage Radar</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <tr>
                        <td valign="top" style="width: 32%; padding-right: 2%; vertical-align: top;">
                            <div style="border: 1px solid #fee2e2; background-color: #fffafb; border-radius: 8px; padding: 12px; min-height: 180px;">
                                <div style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #fee2e2; padding-bottom: 4px;">
                                    ⚠️ Critical (<50%) [${criticalGaps.length}]
                                </div>
                                ${renderListEmail(criticalGaps, '#ef4444')}
                            </div>
                        </td>
                        <td valign="top" style="width: 32%; padding-right: 2%; vertical-align: top;">
                            <div style="border: 1px solid #fef3c7; background-color: #fffdf5; border-radius: 8px; padding: 12px; min-height: 180px;">
                                <div style="font-size: 11px; font-weight: 700; color: #d97706; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #fef3c7; padding-bottom: 4px;">
                                    ⚡ Moderate (50%-80%) [${moderateCoverage.length}]
                                </div>
                                ${renderListEmail(moderateCoverage, '#d97706')}
                            </div>
                        </td>
                        <td valign="top" style="width: 32%; vertical-align: top;">
                            <div style="border: 1px solid #dcfce7; background-color: #f5fdf8; border-radius: 8px; padding: 12px; min-height: 180px;">
                                <div style="font-size: 11px; font-weight: 700; color: #16a34a; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #dcfce7; padding-bottom: 4px;">
                                    ✅ Strong (&ge;80%) [${strongCoverage.length}]
                                </div>
                                ${renderListEmail(strongCoverage, '#16a34a')}
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }
    
    // Coverage Breakdown/Changes
    let coverageHtml = '';
    const liveTactics = getCoverageByTactic();
    const fmtCov = (v) => v % 1 === 0 ? v : v.toFixed(1);
    if (report.type === 'initial') {
        const rows = liveTactics.map(t => {
            const badgeClass = t.coverage >= 80 ? 'coverage-high' : t.coverage >= 50 ? 'coverage-mid' : 'coverage-low';
            return `<tr><td>${t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td>${t.withQueries}/${t.total}</td><td><span class="coverage-badge ${badgeClass}">${fmtCov(t.coverage)}%</span></td></tr>`;
        }).join('');
        coverageHtml = `<div class="section"><h3>Coverage Breakdown</h3>
            <table><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>
            <p style="margin-top: 8px; color: #64748b; font-size: 11px; font-style: italic; line-height: 1.4;">ℹ️ Tactic coverage percentages incorporate both parent techniques and sub-techniques mapped to each tactical phase.</p>
        </div>`;
    } else {
        const currentMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
        const availableMonths = getAvailableMonths().sort((a, b) => b.localeCompare(a));
        const currentIdx = availableMonths.indexOf(currentMonth);
        const prevMonth = currentIdx !== -1 && currentIdx + 1 < availableMonths.length ? availableMonths[currentIdx + 1] : null;
        
        if (prevMonth) {
            const currentTactics = getCoverageByTacticUpToMonth(currentMonth);
            const lastTactics = getCoverageByTacticUpToMonth(prevMonth);
            const allTactics = new Set([...currentTactics.map(t => t.tactic), ...lastTactics.map(t => t.tactic)]);
            let rows = '';
            allTactics.forEach(tactic => {
                const cur = currentTactics.find(t => t.tactic === tactic);
                const last = lastTactics.find(t => t.tactic === tactic);
                const curPct = cur?.coverage || 0;
                const lastPct = last?.coverage || 0;
                const change = curPct - lastPct;
                const icon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
                const color = change > 0 ? '#22c55e' : change < 0 ? '#ef4444' : '#64748b';
                const badgeClass = curPct >= 80 ? 'coverage-high' : curPct >= 50 ? 'coverage-mid' : 'coverage-low';
                const changeText = change === 0 ? '0%' : (change > 0 ? '+' : '') + Number(change.toFixed(1)) + '%';
                rows += `<tr><td>${tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td>${fmtCov(lastPct)}%</td><td><span class="coverage-badge ${badgeClass}">${fmtCov(curPct)}%</span></td><td style="color: ${color}; font-weight: 600;">${icon} ${changeText}</td></tr>`;
            });
            const lastMonthLabel = getMonthLabel(prevMonth);
            coverageHtml = `<div class="section"><h3>Coverage Changes <span style="font-size:12px;font-weight:400;color:#64748b;">(vs ${lastMonthLabel})</span></h3>
                <table><thead><tr><th>Tactic</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table>
                <p style="margin-top: 8px; color: #64748b; font-size: 11px; font-style: italic; line-height: 1.4;">ℹ️ Tactic coverage changes evaluate both parent and sub-techniques mapped to each tactical phase.</p>
            </div>`;
        } else {
            coverageHtml = `<div class="section"><h3>Coverage Changes</h3><p style="color:#64748b; font-size:13px; margin: 0;">No previous month data to compare against.</p></div>`;
        }
    }
    
    // Appendix
    let appendixHtml = '';
    if (report.appendix) {
        const app = report.appendix;
        const sections = [];
        if (app.methodology) sections.push(`<div class="subsection"><h4>Methodology</h4><p>${markdownToHtml(app.methodology)}</p></div>`);
        if (app.scope) sections.push(`<div class="subsection"><h4>Scope</h4><p>${markdownToHtml(app.scope)}</p></div>`);
        if (app.limitations) sections.push(`<div class="subsection"><h4>Limitations</h4><p>${markdownToHtml(app.limitations)}</p></div>`);
        if (app.additionalNotes) sections.push(`<div class="subsection"><h4>Additional Notes</h4><p>${markdownToHtml(app.additionalNotes)}</p></div>`);
        if (sections.length > 0) {
            appendixHtml = `<div class="section"><h3>Appendix</h3>${sections.join('')}</div>`;
        }
    }
    
    // Dynamic Milestone Board Metrics for Stats Bar Table
    const targetMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const stats = getMonthStats(targetMonth);
    const coverageStats = getOverallCoverageStatsUpToMonth(targetMonth);
    
    const frameworkCoverage = coverageStats.pct; 
    const techniquesCovered = stats.techIds.size; 
    const threatsDisrupted = getThreatsDisruptedCount(targetMonth); 

    const availableMonthsSorted = getAvailableMonths().sort((a, b) => b.localeCompare(a));
    const currentIdx = availableMonthsSorted.indexOf(targetMonth);
    const prevMonth = currentIdx !== -1 && currentIdx + 1 < availableMonthsSorted.length ? availableMonthsSorted[currentIdx + 1] : null;
    
    let deltaHtml = '';
    if (prevMonth) {
        const prevCoverageStats = getOverallCoverageStatsUpToMonth(prevMonth);
        const pctDiff = frameworkCoverage - prevCoverageStats.pct;
        const color = pctDiff > 0 ? '#22c55e' : pctDiff < 0 ? '#ef4444' : '#64748b';
        const sign = pctDiff > 0 ? '+' : '';
        deltaHtml = `<div style="font-size: 10px; color: ${color}; font-weight: 600; margin-top: 2px;">${pctDiff > 0 ? '↑' : pctDiff < 0 ? '↓' : '→'} ${sign}${pctDiff.toFixed(1)}% vs last month</div>`;
    } else {
        deltaHtml = `<div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">Initial baseline</div>`;
    }

    const totalQueries = getTotalUniqueActiveQueriesUpToMonth(targetMonth);

    const getMaturityGrade = (pct) => {
        if (pct >= 80) return 'A+ Excellent';
        if (pct >= 70) return 'A Strong';
        if (pct >= 60) return 'B+ Capable';
        if (pct >= 50) return 'B Good';
        if (pct >= 40) return 'C+ Developing';
        if (pct >= 30) return 'C Baseline';
        if (pct >= 20) return 'D Lacking';
        return 'F Critical Gaps';
    };

    const getGradeColor = (pct) => {
        if (pct >= 70) return '#22c55e'; // Green for A
        if (pct >= 50) return '#eab308'; // Golden yellow for B
        if (pct >= 30) return '#f97316'; // Orange for C
        return '#ef4444'; // Red for D/F
    };

    const maturityGrade = getMaturityGrade(frameworkCoverage);
    const gradeColor = getGradeColor(frameworkCoverage);

    const statsBarHtml = isDark ? `
        <div style="background-color: #0f1123; padding: 20px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td width="50%" style="padding: 0 10px 14px 0; border: none; vertical-align: top;">
                        <div style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.02) 100%); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Framework Coverage</div>
                            <div style="font-size: 26px; font-weight: 800; color: #ffffff; margin-top: 4px; line-height: 1;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                            ${deltaHtml}
                            <div style="font-size: 9px; color: #94a3b8; margin-top: 6px; font-weight: 500;">
                                Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}
                            </div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 0 0 14px 10px; border: none; vertical-align: top;">
                        <div style="background: linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(56, 189, 248, 0.02) 100%); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Active Detections</div>
                            <div style="font-size: 26px; font-weight: 800; color: #38bdf8; margin-top: 4px; line-height: 1;">${totalQueries}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px;">threat hunt queries deployed</div>
                            <div style="font-size: 9px; color: ${stats.queries > 0 ? '#34d399' : '#94a3b8'}; margin-top: 4px; font-weight: 500;">
                                ${stats.queries > 0 ? `↑ +${stats.queries} deployed this period` : 'No new queries this period'}
                            </div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td width="50%" style="padding: 10px 10px 0 0; border: none; vertical-align: top;">
                        <div style="background: linear-gradient(135deg, rgba(52, 211, 153, 0.08) 0%, rgba(52, 211, 153, 0.02) 100%); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Tactical Gaps Filled</div>
                            <div style="font-size: 26px; font-weight: 800; color: #34d399; margin-top: 4px; line-height: 1;">${techniquesCovered}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px;">techniques covered this period</div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 10px 0 0 10px; border: none; vertical-align: top;">
                        <div style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(251, 191, 36, 0.02) 100%); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: none; width: 100%;">
                                <tr>
                                    <td style="vertical-align: middle; border: none; padding: 0;">
                                        <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Security Posture Grade</div>
                                        <div style="font-size: 18px; font-weight: 800; color: ${gradeColor}; margin-top: 6px; line-height: 1.2;">${maturityGrade}</div>
                                        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 4px;">standard framework grade</div>
                                    </td>
                                    <td width="55" style="vertical-align: middle; text-align: right; border: none; padding: 0 0 0 5px;">
                                        <svg width="50" height="50" viewBox="0 0 120 120" style="display: inline-block;">
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="12" />
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="${gradeColor}" stroke-width="12"
                                                    stroke-dasharray="314.15" stroke-dashoffset="${314.15 - (314.15 * Math.min(frameworkCoverage, 100)) / 100}"
                                                    stroke-linecap="round" transform="rotate(-90 60 60)" />
                                            <text x="60" y="68" text-anchor="middle" font-family="-apple-system, sans-serif" font-weight="900" font-size="28" fill="#ffffff">${maturityGrade.split(' ')[0]}</text>
                                        </svg>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>
            <div style="margin-top: 14px; padding: 10px 14px; background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; font-size: 11px; color: #a2a6cc; text-align: center; line-height: 1.4;">
                ℹ️ <strong>Maturity Grading:</strong> Grade is calculated based on framework technique coverage (A: &ge;70%, B: 50%-70%, C: 30%-50%, D/F: &lt;30%).
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${report.author || 'the Security Operations Team'}</strong>.
            </div>
        </div>
    ` : `
        <div style="background-color: #f8fafc; padding: 20px 24px; border-bottom: 2px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td width="50%" style="padding: 0 10px 14px 0; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Framework Coverage</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 4px; line-height: 1;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                            ${deltaHtml}
                            <div style="font-size: 9px; color: #64748b; margin-top: 6px; font-weight: 500;">
                                Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}
                            </div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 0 0 14px 10px; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Active Detections</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0284c7; margin-top: 4px; line-height: 1;">${totalQueries}</div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">threat hunt queries deployed</div>
                            <div style="font-size: 9px; color: ${stats.queries > 0 ? '#16a34a' : '#64748b'}; margin-top: 4px; font-weight: 500;">
                                ${stats.queries > 0 ? `↑ +${stats.queries} deployed this period` : 'No new queries this period'}
                            </div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td width="50%" style="padding: 10px 10px 0 0; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Tactical Gaps Filled</div>
                            <div style="font-size: 26px; font-weight: 800; color: #16a34a; margin-top: 4px; line-height: 1;">${techniquesCovered}</div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">techniques covered this period</div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 10px 0 0 10px; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; min-height: 90px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: none; width: 100%;">
                                <tr>
                                    <td style="vertical-align: middle; border: none; padding: 0;">
                                        <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Security Posture Grade</div>
                                        <div style="font-size: 18px; font-weight: 800; color: ${gradeColor}; margin-top: 6px; line-height: 1.2;">${maturityGrade}</div>
                                        <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 4px;">standard framework grade</div>
                                    </td>
                                    <td width="55" style="vertical-align: middle; text-align: right; border: none; padding: 0 0 0 5px;">
                                        <svg width="50" height="50" viewBox="0 0 120 120" style="display: inline-block;">
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" stroke-width="12" />
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="${gradeColor}" stroke-width="12"
                                                    stroke-dasharray="314.15" stroke-dashoffset="${314.15 - (314.15 * Math.min(frameworkCoverage, 100)) / 100}"
                                                    stroke-linecap="round" transform="rotate(-90 60 60)" />
                                            <text x="60" y="68" text-anchor="middle" font-family="-apple-system, sans-serif" font-weight="900" font-size="28" fill="#0f172a">${maturityGrade.split(' ')[0]}</text>
                                        </svg>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>
            <div style="margin-top: 14px; padding: 10px 14px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 11px; color: #64748b; text-align: center; line-height: 1.4;">
                ℹ️ <strong>Maturity Grading:</strong> Grade is calculated based on framework technique coverage (A: &ge;70%, B: 50%-70%, C: 30%-50%, D/F: &lt;30%).
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${report.author || 'the Security Operations Team'}</strong>.
            </div>
        </div>
    `;

    const stylesHtml = isDark ? `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #cbd5e1; background-color: #070814; }
        * { box-sizing: border-box; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #0f1123; border: 1px solid rgba(${accentRgb}, 0.2); border-radius: 12px; overflow: hidden; box-shadow: 0 0 30px rgba(${accentRgb}, 0.1); }
        .header { background: linear-gradient(135deg, #070814 0%, #0d0f1f 60%, ${theme.accent}1a 100%); color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; border-bottom: 2px solid ${theme.accent}; }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: brightness(0) invert(1); }
        .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
        .header .subtitle { font-size: 13px; font-weight: 400; color: #94a3b8; margin: 0 0 12px 0; }
        .header .report-type { display: inline-block; background: rgba(${accentRgb}, 0.15); border: 1px solid rgba(${accentRgb}, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffffcc; margin-bottom: 10px; }
        .header .report-date { font-size: 13px; color: #cbd5e1; margin: 0; }
        .header .attck-version { font-size: 11px; color: #64748b; margin: 3px 0 0; }
        .header .author { font-size: 12px; color: #94a3b8; margin-top: 4px; }
        .content { padding: 24px 28px; }
        .section { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .section:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
        .section h3 { font-size: 15px; font-weight: 700; color: #ffffff; margin: 0 0 10px 0; padding-left: 10px; border-left: 3px solid ${theme.accent}; text-shadow: 0 0 10px rgba(${accentRgb}, 0.25); }
        .section p { margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.65; }
        .subsection { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.05); }
        .subsection h4 { font-size: 13px; font-weight: 600; color: ${theme.accent}; margin: 0 0 6px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
        th { background-color: rgba(255, 255, 255, 0.03); padding: 8px 10px; text-align: left; font-weight: 600; color: #94a3b8; border-bottom: 2px solid rgba(255, 255, 255, 0.1); font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
        td { padding: 8px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #cbd5e1; }
        tr:last-child td { border-bottom: none; }
        .coverage-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .coverage-high { background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
        .coverage-mid { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
        .coverage-low { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .footer { background-color: #070814; padding: 16px 28px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05); }
        .footer p { margin: 0; font-size: 11px; color: #64748b; }
        .footer .tool-info { font-size: 10px; color: #475569; margin-top: 3px; }
        .footer .confidential { font-size: 10px; color: #7f1d1d; margin-top: 2px; }
        strong { font-weight: 600; color: #ffffff; }
        em { font-style: italic; color: #cbd5e1; }
        .section { page-break-inside: avoid; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 8px; }
            .header { padding: 24px 16px; }
            .content { padding: 16px; }
        }
    ` : `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
        * { box-sizing: border-box; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04); }
        .header { background: ${theme.bg}; color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; }
        .header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: ${theme.accent}; }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: brightness(0) invert(1); }
        .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
        .header .subtitle { font-size: 13px; font-weight: 400; color: #94a3b8; margin: 0 0 12px 0; }
        .header .report-type { display: inline-block; background: ${theme.accent}33; border: 1px solid ${theme.accent}55; padding: 4px 12px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffffcc; margin-bottom: 10px; }
        .header .report-date { font-size: 13px; color: #cbd5e1; margin: 0; }
        .header .attck-version { font-size: 11px; color: #64748b; margin: 3px 0 0; }
        .header .author { font-size: 12px; color: #94a3b8; margin-top: 4px; }
        .content { padding: 24px 28px; }
        .section { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; }
        .section:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
        .section h3 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; padding-left: 10px; border-left: 3px solid ${theme.accent}; }
        .section p { margin: 0; color: #475569; font-size: 13px; line-height: 1.65; }
        .subsection { margin-top: 14px; padding-top: 14px; border-top: 1px solid #f8fafc; }
        .subsection h4 { font-size: 13px; font-weight: 600; color: ${theme.accent}; margin: 0 0 6px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
        th { background-color: #f8fafc; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
        td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        tr:last-child td { border-bottom: none; }
        .coverage-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .coverage-high { background: #dcfce7; color: #15803d; }
        .coverage-mid { background: #fef3c7; color: #a16207; }
        .coverage-low { background: #fee2e2; color: #b91c1c; }
        .footer { background-color: #f8fafc; padding: 16px 28px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { margin: 0; font-size: 11px; color: #94a3b8; }
        .footer .tool-info { font-size: 10px; color: #cbd5e1; margin-top: 3px; }
        .footer .confidential { font-size: 10px; color: #e2e8f0; margin-top: 2px; }
        strong { font-weight: 600; color: #0f172a; }
        em { font-style: italic; color: #475569; }
        .section { page-break-inside: avoid; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 8px; }
            .header { padding: 24px 16px; }
            .content { padding: 16px; }
        }
    `;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${stylesHtml}
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="container">
            <div class="header">
                ${report.companyLogo ? `<img src="${report.companyLogo}" class="logo" alt="Logo">` : ''}
                <h1>THREAT HUNTING MITRE MONTHLY UPDATE</h1>
                <p class="subtitle">${escapeHtml(report.companyName) || 'MITRE ATT&CK Coverage Report'}</p>
                <div class="report-type">${report.type === 'initial' ? 'Initial Assessment' : 'Monthly Update'}</div>
                <p class="report-date">${escapeHtml(report.reportMonth) || escapeHtml(report.generatedDate)}</p>
                ${report.attckVersion ? `<p class="attck-version">ATT&CK Framework v${escapeHtml(report.attckVersion)}</p>` : ''}
                ${report.author ? `<p class="author">Prepared by: ${escapeHtml(report.author)}</p>` : ''}
            </div>

            ${statsBarHtml}

            <div class="content">
                ${execSummary ? `<div class="section"><h3>Executive Summary</h3><p>${markdownToHtml(execSummary)}</p></div>` : ''}
 
                ${leadership ? `<div class="section"><h3>Leadership Overview</h3><p>${markdownToHtml(leadership)}</p></div>` : ''}
 
                ${methodScopeHtml}
 
                ${tacticsGraphHtml}
 
                ${buildEmailMonthlyActivity(report, theme, isDark)}
 
                ${newQueriesHtml}
 
                ${buildThreatsSectionEmail(report, isDark)}
 
                ${buildTechniquesAtRiskEmail(report, isDark)}
 
                ${report.detectionResults?.length > 0 ? `<div class="section"><h3>Detection Results</h3>${report.detectionResults.map(r => `<div class="detection-item"><strong>${r.huntName || 'Untitled'}</strong>${r.sirTicket ? ` <span class="badge badge-yellow">SIR: ${r.sirTicket}</span>` : ''}${r.notes ? `<div class="notes">${r.notes}</div>` : ''}</div>`).join('')}</div>` : ''}
 
                ${monthlyFocus ? `<div class="section"><h3>Monthly Focus Areas</h3><p>${markdownToHtml(monthlyFocus)}</p></div>` : ''}
 
                ${gapAnalysisHtml}
 
                ${coverageHtml}
 
                ${report.references?.length > 0 ? `<div class="section"><h3>References</h3><ul style="padding-left: 20px; margin: 0;">${report.references.map(r => `<li style="margin-bottom: 6px; font-size: 12px; color: #475569;">${r}</li>`).join('')}</ul></div>` : ''}
 
                ${appendixHtml}
 
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 20px; padding: 14px 18px; overflow: hidden; text-align: left;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: none; background: transparent;">
                        <tr>
                            <td style="padding: 0; border: none; width: 40px; vertical-align: middle; font-size: 24px; line-height: 1; text-align: left;">
                                📊
                            </td>
                            <td style="padding: 0; border: none; vertical-align: middle; text-align: left;">
                                <h4 style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: #0f172a;">Full MITRE ATT&CK Matrix SVG Attached</h4>
                                <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.4;">A complete visual representation of the MITRE ATT&CK matrix with coverage highlights is attached to this email.</p>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
 
            <div class="footer">
                <p>Generated by MITRE ATT&CK Coverage Tool | ${report.generatedDate || new Date().toLocaleDateString()}</p>
                <p class="tool-info">ATT&CK v${report.attckVersion || '19.1'} | Data sourced from MITRE ATT&CK Framework</p>
                <p class="confidential">Confidential - For authorized recipients only</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

function buildThreatsSectionEmail(report, isDark = false) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const changedTechStixIds = new Set();
    
    techniques.forEach(ann => {
        const stixId = getTechniqueStixId(ann.techniqueID);
        if (stixId) changedTechStixIds.add(stixId);
    });
    
    if (changedTechStixIds.size === 0 || !state.groups || state.groups.length === 0 || !state.software || state.software.length === 0 || !state.relationships || state.relationships.length === 0) {
        return '';
    }
    
    const threatMap = { groups: [], software: [] };
    
    // Find all relationships where groups/software use techniques from this month
    state.relationships.forEach(rel => {
        if (rel.relationship_type !== 'uses') return;
        
        const targetId = rel.target_ref;
        if (!changedTechStixIds.has(targetId)) return;
        
        const sourceId = rel.source_ref;
        
        // Check if source is a group
        const group = state.groups.find(g => g.id === sourceId);
        if (group) {
            let existing = threatMap.groups.find(g => g.id === group.id);
            if (!existing) {
                existing = { id: group.id, name: group.name, techniques: [] };
                threatMap.groups.push(existing);
            }
            if (!existing.techniques.includes(targetId)) {
                existing.techniques.push(targetId);
            }
            return;
        }
        
        // Check if source is software
        const software = state.software.find(s => s.id === sourceId);
        if (software) {
            let existing = threatMap.software.find(s => s.id === software.id);
            if (!existing) {
                existing = { id: software.id, name: software.name, type: software.x_mitre_type || 'tool', techniques: [] };
                threatMap.software.push(existing);
            }
            if (!existing.techniques.includes(targetId)) {
                existing.techniques.push(targetId);
            }
        }
    });
    
    const allThreats = [];
    threatMap.groups.forEach(g => {
        allThreats.push({ type: 'group', name: g.name, techniques: g.techniques.length, techniqueIds: g.techniques });
    });
    threatMap.software.forEach(s => {
        allThreats.push({ type: s.type, name: s.name, techniques: s.techniques.length, techniqueIds: s.techniques });
    });
    
    if (allThreats.length === 0) {
        return '';
    }
    
    const sortedThreats = allThreats.sort((a, b) => b.techniques - a.techniques).slice(0, 6);
    
    let cardsHtml = '';
    sortedThreats.forEach(t => {
        const typeLabel = t.type === 'group' ? 'Threat Group' : t.type.toUpperCase();
        const sideColor = t.type === 'group' ? '#38bdf8' : '#a855f7';
        
        let exposureLevel = 'Medium';
        let expColor = '#38bdf8';
        let expBg = 'rgba(56, 189, 248, 0.1)';
        if (t.techniques >= 4) {
            exposureLevel = 'Critical';
            expColor = '#ef4444';
            expBg = 'rgba(239, 68, 68, 0.1)';
        } else if (t.techniques >= 2) {
            exposureLevel = 'High';
            expColor = '#fbbf24';
            expBg = 'rgba(245, 158, 11, 0.1)';
        }
        
        const techIds = t.techniqueIds?.map(id => getTechniqueIdFromStix(id) || id) || [];
        const truncatedTechIds = techIds.slice(0, 6);
        const extraCount = techIds.length - truncatedTechIds.length;
        const techList = truncatedTechIds.join(', ') + (extraCount > 0 ? `, +${extraCount} more` : '');
        
        cardsHtml += `
            <div style="${isDark ? 'border: 1px solid rgba(255,255,255,0.08); background-color: rgba(255,255,255,0.03);' : 'border: 1px solid #e2e8f0; background-color: #ffffff;'} border-left: 4px solid ${sideColor}; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 0; font-size: 13px;">
                    <tr>
                        <td style="padding: 0; border: none; vertical-align: middle;">
                            <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; display: inline-block; margin-bottom: 2px;">${typeLabel}</span>
                            <h4 style="font-size: 14px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'}; margin: 0 0 4px 0;">${t.name}</h4>
                            <div style="font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'};">Disruption: <strong style="color: ${isDark ? '#ffffff' : '#0f172a'};">${t.techniques} technique${t.techniques > 1 ? 's' : ''}</strong></div>
                        </td>
                        <td align="right" style="padding: 0; border: none; vertical-align: top; text-align: right;">
                            <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background-color: ${expBg}; color: ${expColor}; display: inline-block;">${exposureLevel} Risk</span>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" style="padding: 8px 0 0 0; border: none; font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; line-height: 1.4;">
                            <strong style="color: ${isDark ? '#cbd5e1' : '#475569'};">TTPs:</strong> <span style="font-family: monospace; background-color: ${isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc'}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}; color: ${isDark ? '#ffffff' : '#334155'};">${techList}</span>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    });
    
    return `<div class="section"><h3>Top Associated Threats</h3>${cardsHtml}</div>`;
}

function buildTechniquesAtRiskEmail(report, isDark = false) {
    if (!state.techniques || !state.relationships || !state.groups) return '';
    
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const monthTechniques = byMonth[month] || [];
    
    const monthTechStixIds = new Set();
    monthTechniques.forEach(ann => {
        const stixId = getTechniqueStixId(ann.techniqueID);
        if (stixId) monthTechStixIds.add(stixId);
    });
    
    const layerTechIds = new Set();
    const coverageMap = {};
    const layerTechs = state.currentLayer?.techniques || report.snapshot?.techniques || [];
    layerTechs.forEach(t => {
        layerTechIds.add(t.techniqueID);
        coverageMap[t.techniqueID] = t.queryCount > 0 || (t.queries && t.queries.length > 0);
    });
    
    const zeroCoverageTechs = new Set();
    state.techniques.forEach(t => {
        const techId = t.external_references?.[0]?.external_id;
        if (!techId || t.x_mitre_is_subtechnique) return;
        if (layerTechIds.has(techId) && coverageMap[techId]) return;
        zeroCoverageTechs.add(techId);
    });
    
    if (zeroCoverageTechs.size === 0) return '';
    
    const threatGroups = {};
    state.relationships.forEach(rel => {
        if (rel.relationship_type !== 'uses') return;
        if (!zeroCoverageTechs.has(rel.target_ref)) return;
        
        if (monthTechStixIds.size > 0 && monthTechStixIds.has(rel.target_ref)) {
            const group = state.groups.find(g => g.id === rel.source_ref);
            if (!group) return;
            const tid = getTechniqueIdFromStix(rel.target_ref);
            if (!tid) return;
            if (!threatGroups[group.name]) threatGroups[group.name] = new Set();
            threatGroups[group.name].add(tid);
        }
    });
    
    const atRisk = [];
    Object.entries(threatGroups).forEach(([groupName, techIds]) => {
        atRisk.push({ group: groupName, techniques: [...techIds].slice(0, 3), count: techIds.size });
    });
    atRisk.sort((a, b) => b.count - a.count);
    if (atRisk.length === 0) return '';
    
    let html = `<div class="section"><h3>Techniques at Risk</h3>
        <p style="margin-bottom: 8px; color: ${isDark ? '#94a3b8' : '#64748b'}; font-size: 13px;">Zero-coverage techniques used by known threat groups active this month:</p>`;
    
    atRisk.slice(0, 8).forEach(item => {
        const techList = item.techniques.map(id => {
            const name = getTechniqueName(id);
            return `<span style="display: inline-block; padding: 2px 6px; margin: 2px; ${isDark ? 'background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;' : 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;'} border-radius: 4px; font-size: 11px;">${id}${name ? ' - ' + name : ''}</span>`;
        }).join('');
        const moreText = item.count > 3 ? ` <span style="color: #64748b; font-size: 11px;">+${item.count - 3} more</span>` : '';
        
        html += `<div style="padding: 8px 10px; margin-bottom: 6px; ${isDark ? 'background: rgba(239, 68, 68, 0.04); border-left: 3px solid #ef4444;' : 'background: #fef2f2; border-left: 3px solid #ef4444;'} border-radius: 6px;">
            <strong style="font-size: 13px; color: ${isDark ? '#fca5a5' : '#991b1b'};">${item.group}</strong>
            <span style="font-size: 11px; color: ${isDark ? '#cbd5e1' : '#64748b'}; margin-left: 8px;">${item.count} techniques</span>
            <div style="margin-top: 4px;">${techList}${moreText}</div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}

function printReport() {
    window.print();
}
