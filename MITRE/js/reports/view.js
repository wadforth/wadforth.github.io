export const BANNER_THEMES = {
    blue: { bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', accent: '#3b82f6', label: 'Blue' },
    orange: { bg: 'linear-gradient(135deg, #1a0f00 0%, #4a2800 100%)', accent: '#f97316', label: 'Orange' },
    green: { bg: 'linear-gradient(135deg, #052e16 0%, #0f4a2e 100%)', accent: '#22c55e', label: 'Green' },
    purple: { bg: 'linear-gradient(135deg, #1a0a2e 0%, #3b1d6e 100%)', accent: '#a855f7', label: 'Purple' },
    red: { bg: 'linear-gradient(135deg, #2a0a0a 0%, #5f1e1e 100%)', accent: '#ef4444', label: 'Red' },
    teal: { bg: 'linear-gradient(135deg, #042f2e 0%, #0e4a47 100%)', accent: '#14b8a6', label: 'Teal' },
    slate: { bg: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', accent: '#94a3b8', label: 'Slate' },
};

function getSafeReportLanguage(language) {
    const raw = String(language || 'Unknown').slice(0, 32);
    const className = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const known = new Set(['splunk', 'kql', 'sigma', 'elastic', 'custom', 'unknown']);
    return {
        raw,
        label: escapeHtml(raw),
        className: known.has(className) ? className : 'custom'
    };
}

function getInlineCallArg(value) {
    return `decodeURIComponent('${encodeURIComponent(String(value || ''))}')`;
}

export async function loadReportsList() {
    if (!state.currentLayer) {
        const container = document.getElementById('reports-list');
        if (container) container.innerHTML = '<p class="text-on-surface-secondary">No active layer loaded.</p>';
        return;
    }

    try {
        const fetchFn = window.getReportsForLayer || window.getReports;
        const reports = fetchFn ? await fetchFn(window.state?.currentLayer?.id || 'default') : [];
        if (window.state) window.state._cachedReports = reports;
        if (window.renderReportsList && window.renderReportsList !== renderReportsList) {
            window.renderReportsList(reports);
        } else {
            renderReportsList(reports);
        }
    } catch (err) {
        const container = document.getElementById('reports-list');
        if (container) container.innerHTML = `<p class="text-danger">Failed to load reports: ${escapeHtml(err.message)}</p>`;
    }
}

window.loadReportsList = loadReportsList;

export function getTechniquesByMonth() {
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
        
        // Strict filtering:
        // A technique (whether main or sub) is only active if:
        // 1. It has logged queries: ann.queries.length > 0
        // 2. OR it has a custom color annotation: ann.color
        // 3. OR (if it's a parent) at least one of its sub-techniques in this layer has queries or color
        const hasActiveQueriesOrColor = (ann.queries && ann.queries.length > 0) || ann.color;
        
        let hasActiveSubInLayer = false;
        if (hasSubs) {
            hasActiveSubInLayer = state.currentLayer.techniques.some(subAnn => {
                return subAnn.techniqueID.startsWith(techId + '.') && 
                       ((subAnn.queries && subAnn.queries.length > 0) || subAnn.color);
            });
        }
        
        if (!hasActiveQueriesOrColor && !hasActiveSubInLayer) return;
        
        if (ann.queries && ann.queries.length > 0) {
            ann.queries.forEach(q => {
                const months = new Set();
                months.add(q.monthAdded || baseMonth);
                if (q.archived && q.archivedAt) months.add(q.archivedAt.slice(0, 7));
                if (q.unarchivedAt) months.add(q.unarchivedAt.slice(0, 7));
                
                months.forEach(qMonth => {
                    if (!byMonth[qMonth]) byMonth[qMonth] = [];
                    const existing = byMonth[qMonth].find(t => t.techniqueID === ann.techniqueID);
                    if (!existing) {
                        byMonth[qMonth].push({ ...ann, queries: [q] });
                    } else {
                        if (!existing.queries) existing.queries = [];
                        if (!existing.queries.some(eq => eq.id === q.id)) {
                            existing.queries.push(q);
                        }
                    }
                });
            });
        } else {
            // According to user requirements: sub-techniques and standalone techniques 
            // should only show up in the report if they have logged queries.
            // Parent techniques (which have sub-techniques) can be included under baseMonth if annotated and active.
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

export function getAvailableMonths() {
    const byMonth = getTechniquesByMonth();
    const months = Object.keys(byMonth);
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!months.includes(currentMonth)) {
        months.unshift(currentMonth);
    }
    
    return months;
}

export function getMonthLabel(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getPreviousMonths(selectedMonth) {
    const allMonths = getAvailableMonths();
    const idx = allMonths.indexOf(selectedMonth);
    return allMonths.slice(idx + 1);
}

export function getExistingTechniqueIds(selectedMonth) {
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

export function isSubTechnique(techId) {
    return techId.includes('.');
}

export function getColorName(color, techType, ruleType = null) {
    if (!color) return 'None';
    
    const rules = state.autoColorRules || [];
    const typeFilter = ruleType || (techType === 'sub' ? 'query-count' : 'sub-coverage');
    
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

function getMatchingReportAutoColorRule(ruleType, value) {
    const rules = (state.autoColorRules || []).filter(r => r.type === ruleType);
    for (const rule of rules) {
        let match = false;
        switch (rule.operator) {
            case '>=': match = value >= rule.value; break;
            case '>': match = value > rule.value; break;
            case '<=': match = value <= rule.value; break;
            case '<': match = value < rule.value; break;
            case '=': match = value === rule.value; break;
        }
        if (match) return rule;
    }
    return null;
}

function colorFromReportRule(rule) {
    return rule ? rule.color + '80' : null;
}

export function renderReportsList(reports) {
    const container = document.getElementById('reports-list');
    const emptyState = document.getElementById('reports-empty');
    if (!container) return;

    if (emptyState) emptyState.classList.add('hidden');

    const stats = getFullCoverageStats();
    const availableMonths = getAvailableMonths();
    const selectedMonth = availableMonths[0];
    const version = state.currentVersion || state.currentLayer?.versions?.attack || state.currentLayer?.attackVersion || 'N/A';

    let html = `
        <div class="reports-container">
            <div class="reports-header">
                <div>
                    <h2>${escapeHtml(state.currentLayer.name || 'Coverage Reports')}</h2>
                    <p>Track and analyze your MITRE ATT&CK detection coverage over time</p>
                </div>
                <div class="reports-actions">
                    <button class="btn btn-outline-success" data-report-action="open-threat-hunt">
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
                    <div class="stat-value">${escapeHtml(version)}</div>
                    <div class="stat-label">ATT&CK Version</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${reports.length > 0 ? new Date(reports[0].generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
                    <div class="stat-label">Last Report</div>
                </div>
            </div>

            <div class="month-selector-bar mb-4">
                <label class="text-on-surface-tertiary text-sm mr-2">View by Month:</label>
                <select class="form-select form-select-sm" style="width: auto; min-width: 200px;" data-report-action="month-changelog">
                    ${availableMonths.map(m => `<option value="${escapeHtml(m)}" ${m === selectedMonth ? 'selected' : ''}>${escapeHtml(getMonthLabel(m))}</option>`).join('')}
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
            const safeReportId = escapeHtml(report.id || '');
            const reportVersion = formatAttackVersion(getReportAttackVersion(report));
            html += `
                <div class="report-card" data-report-action="view-report" data-report-id="${safeReportId}" role="button" tabindex="0">
                    <span class="report-type-badge ${typeClass}">${escapeHtml(report.type || 'update')}</span>
                    <div class="report-info">
                        <div class="report-title">${escapeHtml(report.reportMonth || report.generatedDate || 'Untitled Report')}</div>
                        <p class="report-summary">${escapeHtml((report.executiveSummary || '').substring(0, 150))}...</p>
                    </div>
                    <div class="report-meta">
                        <span class="report-version"><i class="bi bi-diagram-3"></i> ATT&amp;CK v${escapeHtml(reportVersion)}</span>
                        ${changeCount > 0 ? `<span class="report-changes">${changeCount} change${changeCount > 1 ? 's' : ''}</span>` : ''}
                        <button class="report-delete" data-report-action="delete-report" data-report-id="${safeReportId}" title="Delete report" aria-label="Delete report">
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

export function renderMonthChangelogHTML(month) {
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
                
                const relatedSubs = newSubs.filter(s => s.techniqueID.startsWith(ann.techniqueID + '.'));
                let subsHtml = '';
                if (relatedSubs.length > 0) {
                    subsHtml = `
                        <div class="changelog-item-subtechniques mt-2 pl-3" style="border-left: 2px solid rgba(56, 189, 248, 0.3); font-size: 0.76rem; margin-top: 0.5rem;">
                            <div style="font-weight: 700; color: #38bdf8; font-size: 0.72rem; text-transform: uppercase; margin-bottom: 0.25rem;">
                                Related Sub-techniques Deployed:
                            </div>
                            <ul style="list-style: none; padding-left: 0; margin-bottom: 0; display: flex; flex-direction: column; gap: 0.25rem;">
                                ${relatedSubs.map(s => {
                                    const sName = getTechniqueName(s.techniqueID);
                                    const sQueries = (s.queries && s.queries.length > 0) ? s.queries.map(q => `<span class="query-chip" style="font-size: 0.65rem; padding: 1px 4px; margin-right: 2px; margin-top: 1px;">${escapeHtml(q.name)}</span>`).join('') : '<span style="color: var(--report-text-muted);">No queries</span>';
                                    return `<li>
                                        <strong>${s.techniqueID}</strong> - ${sName}
                                        <div style="margin-top: 2px; display: flex; flex-wrap: wrap; gap: 2px; align-items: center;">
                                            ${sQueries}
                                        </div>
                                    </li>`;
                                }).join('')}
                            </ul>
                        </div>
                    `;
                }
                
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
                            ${subsHtml}
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

export function getColorChangesForMonth(month) {
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
        const currentQueryCount = ann.queries.filter(q => !q.archived).length;
        
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
            const currentRule = rules.find(r => r.type === 'query-count' && ((r.color + '80') === currentColor || r.color === currentColor));
            currentLabel = currentRule?.label || 'NO COLOR';
            
            if (queriesBeforeThisMonth > 0) {
                const prevRule = getMatchingReportAutoColorRule('query-count', queriesBeforeThisMonth);
                previousColor = colorFromReportRule(prevRule);
                previousLabel = prevRule?.label || 'NO COLOR';
            }
        } else {
            const allSubs = state.techniques.filter(t => {
                const ref = t.external_references?.[0]?.external_id;
                return ref && ref.startsWith(techId + '.');
            });

            if (currentQueryCount > 0) {
                const currentRule = getMatchingReportAutoColorRule('query-count', currentQueryCount);
                currentColor = colorFromReportRule(currentRule);
                currentLabel = currentRule?.label || 'NO COLOR';

                if (queriesBeforeThisMonth > 0) {
                    const previousRule = getMatchingReportAutoColorRule('query-count', queriesBeforeThisMonth);
                    previousColor = colorFromReportRule(previousRule);
                    previousLabel = previousRule?.label || 'NO COLOR';
                }
            } else {
                let currentCoveredCount = 0;
                let prevCoveredCount = 0;

                allSubs.forEach(sub => {
                    const subId = sub.external_references?.[0]?.external_id;
                    const subAnn = state.currentLayer.techniques.find(a => a.techniqueID === subId);
                    if (subAnn?.queries?.some(q => !q.archived)) {
                        currentCoveredCount++;
                    }

                    let subQueriesBeforeThisMonth = 0;
                    prevMonths.forEach(prevMonth => {
                        const prevTechniques = byMonth[prevMonth] || [];
                        const prevSubAnn = prevTechniques.find(t => t.techniqueID === subId);
                        if (prevSubAnn?.queries) {
                            subQueriesBeforeThisMonth += prevSubAnn.queries.filter(q => !q.archived).length;
                        }
                    });
                    if (subQueriesBeforeThisMonth > 0) {
                        prevCoveredCount++;
                    }
                });

                const currentPct = allSubs.length > 0 ? (currentCoveredCount / allSubs.length) * 100 : 0;
                const prevPct = allSubs.length > 0 ? (prevCoveredCount / allSubs.length) * 100 : 0;

                if (currentCoveredCount > 0) {
                    const currentRule = getMatchingReportAutoColorRule('sub-coverage', currentPct);
                    currentColor = colorFromReportRule(currentRule);
                    currentLabel = currentRule?.label || 'NO COLOR';
                }

                if (prevCoveredCount > 0) {
                    const previousRule = getMatchingReportAutoColorRule('sub-coverage', prevPct);
                    previousColor = colorFromReportRule(previousRule);
                    previousLabel = previousRule?.label || 'NO COLOR';
                }
            }
        }
        
        if (previousColor !== currentColor) {
            const techType = isSub ? 'sub' : 'main';
            changes.push({
                techniqueID: ann.techniqueID,
                from: previousColor,
                fromLabel: previousLabel === 'NO COLOR' ? getColorName(previousColor, techType) : previousLabel,
                to: currentColor,
                toLabel: currentLabel === 'NO COLOR' ? getColorName(currentColor, techType) : currentLabel,
                queryName: ann.queries[ann.queries.length - 1]?.name
            });
        }
    });
    
    return changes;
}

export function getNewHuntsForExistingTechniques(month, existingIds) {
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

export function getThreatHuntsForTechnique(techniqueId) {
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

export function getTechniqueName(techId) {
    if (!state.techniques) return '';
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    return tech?.name || '';
}

export function getTechniqueStixId(techId) {
    if (!state.techniques) return null;
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    return tech?.id || null;
}

export function getTechniqueIdFromStix(stixId) {
    if (!state.techniques) return null;
    const tech = state.techniques.find(t => t.id === stixId);
    return tech?.external_references?.[0]?.external_id || null;
}

export function getTechniqueDescription(techId) {
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

export function getTechniqueTactics(techId) {
    if (!state.techniques) return [];
    const tech = state.techniques.find(t => {
        const ref = t.external_references?.[0]?.external_id;
        return ref === techId;
    });
    if (!tech || !tech.kill_chain_phases) return [];
    return tech.kill_chain_phases.map(kp => kp.phase_name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
}

export function renderMonthChangelog(month) {
    const container = document.getElementById('month-changelog-container');
    if (container) {
        container.innerHTML = renderMonthChangelogHTML(month);
    }
}

export function openThreatHuntReportModal(selectedMonth = null) {
    if (!selectedMonth) {
        selectedMonth = document.querySelector('.month-selector-bar select')?.value || new Date().toISOString().slice(0, 7);
    }
    const now = new Date();
    const monthLabel = getMonthLabel(selectedMonth);
    const layerName = state.currentLayer.name || 'Default';
    const attackVersion = getLoadedAttackVersion();
    
    const report = {
        id: `report_${Date.now()}`,
        title: `${layerName} - ${monthLabel} Coverage Update`,
        tags: [layerName.toLowerCase().replace(/\s+/g, '_'), selectedMonth, 'coverage_update'],
        type: 'update',
        layerId: state.currentLayer.id || 'default',
        layerName: layerName,
        generatedAt: now.toISOString(),
        generatedDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        reportMonth: monthLabel,
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
        attckVersion: attackVersion,
        includeAttackVersionAppendix: shouldIncludeAttackVersionAppendix(attackVersion),
        author: state.author || '',
        companyName: state.companyName,
        companyLogo: state.companyLogo,
        executiveSummary: '',
        monthlyFocus: '',
        detectionResults: [],
        gapAnalysis: '',
        prioritization: '',
        recommendations: '',
        teamAssignments: [],
        teamRecommendations: {},
        queryRepositoryUrl: '',
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
        if (window.renderReportsList && window.renderReportsList !== renderReportsList) {
            window.renderReportsList(state._cachedReports);
        } else {
            renderReportsList(state._cachedReports);
        }
        viewReport(report.id);
    }).catch(err => {
        showToast('Failed to create report: ' + err.message, 'error');
    });
}

export function snapshotDynamicContent(report) {
    if (!report.attckVersion) {
        report.attckVersion = (state.currentVersion || 'master').toString().replace(/^v/i, '');
    }
    if (!report.reportMonth && report.selectedMonth) report.reportMonth = getMonthLabel(report.selectedMonth);
    if (!report.selectedMonth && report.generatedAt) report.selectedMonth = report.generatedAt.slice(0, 7);

    const dynamic = getReportDynamicContent(report);
    if (!report.executiveSummary) report.executiveSummary = dynamic.executiveSummary;
    if (!report.leadershipOverview) report.leadershipOverview = dynamic.leadershipOverview;
    if (!report.monthlyFocus) report.monthlyFocus = dynamic.monthlyFocus;
    if (!report.gapAnalysis) report.gapAnalysis = dynamic.gapAnalysis;
    if (!report.recommendations) report.recommendations = dynamic.recommendations;
    report.appendix = mergeAppendixDefaults(dynamic.appendix, report.appendix, { customOnly: true });
}

export function getReportMonth(report) {
    return report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
}

export function getReportMonthLabel(report) {
    const month = getReportMonth(report);
    return month ? getMonthLabel(month) : (report.reportMonth || report.generatedDate || 'Current Period');
}

export function getReportTitle(report) {
    const layer = report.layerName || state.currentLayer?.name || 'MITRE ATT&CK';
    return report.type === 'initial'
        ? `${layer} - Initial Coverage Assessment`
        : `${layer} - ${getReportMonthLabel(report)} Coverage Update`;
}

export function getReportDynamicContent(report) {
    return {
        executiveSummary: report.executiveSummary || generateDynamicExecutiveSummary(report),
        leadershipOverview: report.leadershipOverview || generateLeadershipOverview(report),
        monthlyFocus: report.monthlyFocus || generateDynamicMonthlyFocus(report),
        gapAnalysis: report.gapAnalysis || generateDynamicGapAnalysis(report),
        recommendations: report.recommendations || generateDynamicRecommendations(report),
        appendix: generateDynamicAppendix(report)
    };
}

export function getReportMetricLabel() {
    return 'Mapped Threat Entities';
}

export function getReportMetricDetail() {
    return 'threat groups & tools mapped';
}

function getReportBasisText(report) {
    return `This report reflects active queries, selected report month (${getReportMonthLabel(report)}), current layer annotations, archived query state, and ATT&CK v${formatAttackVersion(getReportAttackVersion(report) || getLoadedAttackVersion())} dataset version at export time.`;
}

function buildReportBasisNote(report) {
    return `
        <div class="report-basis-note">
            <strong><i class="bi bi-info-circle mr-1"></i>Report Basis:</strong>
            <span>${escapeHtml(getReportBasisText(report))}</span>
        </div>
    `;
}

function getTopNextActions(report) {
    const month = getReportMonth(report);
    const tactics = getCoverageByTacticUpToMonth(month).sort((a, b) => a.coverage - b.coverage);
    const lowCoverage = tactics.filter(t => t.coverage < 50);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80);
    const sentinelCandidates = getSentinelCandidatesForReport(report);
    const assignedTeams = report.teamAssignments || [];
    const actions = [];
    const formatTactic = tactic => String(tactic || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (reportShowsAttackVersionAppendix(report)) {
        actions.push({
            priority: 'Framework',
            title: 'Review ATT&CK version-impact changes',
            detail: 'Confirm moved, modified, retired, or newly added ATT&CK content does not change report conclusions or migration priorities.'
        });
    }

    if (lowCoverage.length > 0) {
        const target = lowCoverage[0];
        actions.push({
            priority: 'High',
            title: `Close critical ${formatTactic(target.tactic)} coverage gap`,
            detail: `${target.withQueries}/${target.total} mapped techniques currently have active queries (${target.coverage}% coverage). Prioritize detections for this tactic first.`
        });
    } else if (mediumCoverage.length > 0) {
        const target = mediumCoverage[0];
        actions.push({
            priority: 'Medium',
            title: `Raise ${formatTactic(target.tactic)} above 80% coverage`,
            detail: `${target.withQueries}/${target.total} mapped techniques currently have active queries (${target.coverage}% coverage). Add targeted queries to move this tactic into strong coverage.`
        });
    }

    if (sentinelCandidates.length > 0) {
        actions.push({
            priority: 'Engineering',
            title: `Review ${sentinelCandidates.length} Microsoft Sentinel candidate${sentinelCandidates.length === 1 ? '' : 's'}`,
            detail: 'Promote validated candidates into production analytics or document why they should remain as backlog items.'
        });
    }

    if (assignedTeams.length === 0) {
        actions.push({
            priority: 'Ownership',
            title: 'Assign accountable teams to report actions',
            detail: 'No team assignments are recorded. Assign owners so coverage gaps and query candidates move into delivery queues.'
        });
    } else {
        const labels = assignedTeams
            .map(teamId => TEAM_OPTIONS.find(team => team.id === teamId)?.label)
            .filter(Boolean)
            .slice(0, 3);
        actions.push({
            priority: 'Ownership',
            title: 'Convert team recommendations into tracked work',
            detail: `Use the assigned ${labels.join(', ') || 'teams'} focus areas to create sprint tasks, validation owners, and review dates.`
        });
    }

    if (actions.length < 3) {
        actions.push({
            priority: 'Validation',
            title: 'Validate active detections against telemetry reality',
            detail: 'Confirm active queries still return expected data, archived query state is accurate, and reporting coverage matches available telemetry.'
        });
    }

    if (actions.length < 3) {
        actions.push({
            priority: 'Maintenance',
            title: 'Maintain high-coverage tactics',
            detail: 'Review high-coverage tactics for query quality, false positives, and ATT&CK mapping drift before the next reporting cycle.'
        });
    }

    return actions.slice(0, 3);
}

function buildTopNextActionsSection(report) {
    const actions = getTopNextActions(report);
    return `
        <div class="report-section top-actions-section">
            <h4><i class="bi bi-list-check"></i> Top 3 Next Actions</h4>
            <div class="top-actions-grid">
                ${actions.map((action, index) => `
                    <div class="top-action-card">
                        <div class="top-action-index">${index + 1}</div>
                        <div>
                            <div class="top-action-priority">${escapeHtml(action.priority)}</div>
                            <strong>${escapeHtml(action.title)}</strong>
                            <p>${escapeHtml(action.detail)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function normalizeAttackVersion(value) {
    return String(value || '')
        .trim()
        .replace(/^v/i, '')
        .replace(/[^0-9a-z.\-]/gi, '')
        .toLowerCase();
}

function formatAttackVersion(value) {
    const text = String(value || '').trim();
    if (!text) return 'unknown';
    return text.replace(/^v/i, '');
}

function getLoadedAttackVersion() {
    return state.currentLayer?.versions?.attack || state.currentLayer?.attackVersion || state.currentVersion || 'unknown';
}

function getReportAttackVersion(report) {
    return report?.attckVersion || report?.attackVersion || 'unknown';
}

function shouldIncludeAttackVersionAppendix(version = getLoadedAttackVersion(), reports = state._cachedReports || []) {
    const normalizedVersion = normalizeAttackVersion(version);
    if (!normalizedVersion) return false;
    return !(reports || []).some(report =>
        report?.includeAttackVersionAppendix === true
        && normalizeAttackVersion(getReportAttackVersion(report)) === normalizedVersion
    );
}

function reportShowsAttackVersionAppendix(report) {
    return report?.includeAttackVersionAppendix === true;
}

async function ensureAttackVersionAppendixDiff(report, force = false) {
    if ((!force && !reportShowsAttackVersionAppendix(report)) || state.changelogDiff) return;
    if (state.changelogDiffPromise) {
        await state.changelogDiffPromise;
        return;
    }
    if (typeof window.generateChangelog !== 'function') return;
    state.changelogDiffPromise = window.generateChangelog()
        .catch(err => console.warn('Changelog error:', err))
        .finally(() => { state.changelogDiffPromise = null; });
    await state.changelogDiffPromise;
}

function getExternalTechniqueId(obj) {
    return obj?.external_references?.find(ref => ref.source_name === 'mitre-attack')?.external_id
        || obj?.external_references?.[0]?.external_id
        || '';
}

function getTechniqueSuccessor(techniqueId) {
    if (!techniqueId || !state.revokedTechniques || !state.relationships || !state.techniques) return null;
    const revoked = state.revokedTechniques.find(tech => getExternalTechniqueId(tech) === techniqueId);
    if (!revoked) return null;
    const rel = state.relationships.find(r => r.relationship_type === 'revoked-by' && r.source_ref === revoked.id);
    if (!rel) return null;
    const successor = state.techniques.find(tech => tech.id === rel.target_ref);
    if (!successor) return null;
    return {
        id: getExternalTechniqueId(successor),
        name: successor.name || ''
    };
}

function formatAttackVersionChangeDate(value) {
    if (!value || value === 'unknown') return 'unknown';
    return String(value).slice(0, 10);
}

function buildAttackVersionImpactDetail({ moved, modified, retired, successor }) {
    const details = [];
    if (moved) {
        details.push(`Tactic mapping changed: ${moved.from || 'Unmapped'} -> ${moved.to || 'Unmapped'}`);
    }
    if (modified) {
        details.push(`Modified metadata/content: ${formatAttackVersionChangeDate(modified.from)} -> ${formatAttackVersionChangeDate(modified.to)}`);
    }
    if (retired) {
        if (successor?.id) {
            details.push(`Migration successor: ${successor.id}${successor.name ? ` - ${successor.name}` : ''}`);
        } else {
            details.push(`${retired.status || 'Retired'} in current ATT&CK release; no revoked-by successor relationship found`);
        }
    }
    return details.join('; ') || 'Changed in current ATT&CK release';
}

function getAttackVersionAppendixData(report) {
    const reportVersion = formatAttackVersion(report.attckVersion || report.attackVersion || 'unknown');
    const loadedVersion = formatAttackVersion(getLoadedAttackVersion());
    const reportNorm = normalizeAttackVersion(reportVersion);
    const loadedNorm = normalizeAttackVersion(loadedVersion);
    const versionChanged = !!reportNorm && !!loadedNorm && reportNorm !== loadedNorm;
    const diff = state.changelogDiff || null;
    const diffCurrent = formatAttackVersion(diff?.currentVersion || loadedVersion);
    const diffPrevious = formatAttackVersion(diff?.previousVersion || 'unknown');
    const diffMatchesReportBaseline = !!diff && normalizeAttackVersion(diff.previousVersion) === reportNorm;
    const snapshotTechniques = report.snapshot?.techniques || [];
    const snapshotIds = new Set(snapshotTechniques.map(t => t.techniqueID).filter(Boolean));

    const list = (items = []) => [...items].sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true }));
    const addedTechniques = list(diff?.details?.techniques || []);
    const addedTactics = list(diff?.details?.tactics || []);
    const movedTechniques = list(diff?.movedDetails?.techniques || []);
    const modifiedTechniques = list(diff?.modifiedDetails?.techniques || []);
    const retiredTechniques = list(diff?.retiredDetails?.techniques || []);
    const impactedIds = new Set();

    [...movedTechniques, ...modifiedTechniques, ...retiredTechniques].forEach(item => {
        if (snapshotIds.has(item.id)) impactedIds.add(item.id);
    });

    const impactedReportTechniques = [...impactedIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(id => {
        const ann = snapshotTechniques.find(t => t.techniqueID === id);
        const moved = movedTechniques.find(t => t.id === id);
        const modified = modifiedTechniques.find(t => t.id === id);
        const retired = retiredTechniques.find(t => t.id === id);
        const successor = retired ? getTechniqueSuccessor(id) : null;
        const changeDetail = buildAttackVersionImpactDetail({ moved, modified, retired, successor });
        return {
            id,
            name: moved?.name || modified?.name || retired?.name || getTechniqueName(id) || '',
            queryCount: ann?.queryCount ?? ann?.queries?.length ?? 0,
            statuses: [moved ? 'Moved tactic' : '', modified ? 'Modified' : '', retired ? (retired.status || 'Retired') : ''].filter(Boolean),
            successor,
            changeDetail
        };
    });

    const impactedQueryCount = impactedReportTechniques.reduce((sum, item) => sum + item.queryCount, 0);

    return {
        reportVersion,
        loadedVersion,
        versionChanged,
        diff,
        diffCurrent,
        diffPrevious,
        diffMatchesReportBaseline,
        addedTechniques,
        addedTactics,
        movedTechniques,
        modifiedTechniques,
        retiredTechniques,
        impactedReportTechniques,
        impactedQueryCount
    };
}

function buildAttackVersionAppendix(report) {
    if (!reportShowsAttackVersionAppendix(report)) return '';
    const data = getAttackVersionAppendixData(report);
    const statusClass = data.versionChanged ? 'text-warning' : 'text-success';
    const statusText = data.versionChanged ? 'ATT&CK dataset changed since this report was generated.' : 'Report version matches the loaded ATT&CK dataset.';
    const hasDiff = !!data.diff;
    const impactedHtml = data.impactedReportTechniques.length ? `
        <div class="report-version-impact-list">
            ${data.impactedReportTechniques.slice(0, 12).map(item => `
                <div class="report-version-impact-row">
                    <div>
                        <strong>${escapeHtml(item.id)}</strong>${item.name ? ` - ${escapeHtml(item.name)}` : ''}
                        <div class="text-on-surface-tertiary text-xs">${escapeHtml(item.statuses.join(', '))}${item.changeDetail ? `; ${escapeHtml(item.changeDetail)}` : ''}</div>
                    </div>
                    <span class="badge bg-secondary text-xxs">${item.queryCount} quer${item.queryCount === 1 ? 'y' : 'ies'}</span>
                </div>
            `).join('')}
            ${data.impactedReportTechniques.length > 12 ? `<div class="text-on-surface-tertiary text-xs mt-2">+${data.impactedReportTechniques.length - 12} more impacted report techniques.</div>` : ''}
        </div>
    ` : '<p class="text-on-surface-secondary text-sm mb-0">No report snapshot techniques overlap with moved, modified, retired, or deprecated techniques in the available ATT&CK changelog.</p>';

    return `
        <div class="report-version-appendix mb-4">
            <h6 class="font-semibold mb-2"><i class="bi bi-diagram-3 mr-1"></i>ATT&amp;CK Version Impact</h6>
            <div class="report-version-summary-grid mb-3">
                <div><span>Report ATT&amp;CK</span><strong>v${escapeHtml(data.reportVersion)}</strong></div>
                <div><span>Loaded ATT&amp;CK</span><strong>v${escapeHtml(data.loadedVersion)}</strong></div>
                <div><span>Status</span><strong class="${statusClass}">${escapeHtml(data.versionChanged ? 'Review recommended' : 'Current')}</strong></div>
            </div>
            <p class="text-on-surface-secondary text-sm mb-3">${escapeHtml(statusText)} Reports retain the ATT&amp;CK version captured at generation time; reopening or re-exporting can show current dataset context without rewriting the original report metadata.</p>
            ${hasDiff ? `
                <div class="report-version-counts mb-3">
                    <span>${data.addedTechniques.length} new techniques</span>
                    <span>${data.addedTactics.length} new tactics</span>
                    <span>${data.movedTechniques.length} moved techniques</span>
                    <span>${data.modifiedTechniques.length} modified techniques</span>
                    <span>${data.retiredTechniques.length} retired/deprecated techniques</span>
                </div>
                <p class="text-on-surface-tertiary text-xs mb-3">Available changelog comparison: v${escapeHtml(data.diffCurrent)} vs v${escapeHtml(data.diffPrevious)}${data.diffMatchesReportBaseline ? '.' : '; this is the loaded changelog baseline and may not span every version between the report and loaded dataset.'}</p>
                <h6 class="text-on-surface-secondary text-sm mb-2">Report Snapshot Impact (${data.impactedReportTechniques.length} techniques, ${data.impactedQueryCount} linked queries)</h6>
                ${impactedHtml}
            ` : '<p class="text-on-surface-tertiary text-xs mb-0">No ATT&amp;CK changelog comparison is currently loaded, so only report and loaded dataset versions can be shown.</p>'}
        </div>
    `;
}

function buildAttackVersionAppendixExport(report, isDark = false) {
    if (!reportShowsAttackVersionAppendix(report) && !state.changelogDiff) return '';
    const data = getAttackVersionAppendixData(report);
    const border = isDark ? '#25263b' : '#e2e8f0';
    const panel = isDark ? '#121324' : '#f8fafc';
    const text = isDark ? '#cbd5e1' : '#475569';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const heading = isDark ? '#ffffff' : '#0f172a';
    const accent = data.versionChanged ? '#f59e0b' : '#10b981';
    const buildImpactRow = item => `
        <tr>
            <td style="font-family: monospace; font-weight: 700; color: ${heading};">${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.name || 'Unknown')}</td>
            <td>${escapeHtml(item.statuses.join(', ') || 'Changed')}</td>
            <td>${escapeHtml(item.changeDetail || 'Changed in current ATT&CK release')}</td>
            <td style="text-align: right;">${item.queryCount}</td>
        </tr>
    `;
    const impactedRows = data.impactedReportTechniques.map(buildImpactRow).join('');
    const impactedTable = data.impactedReportTechniques.length ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead><tr><th>Technique</th><th>Name</th><th>Status</th><th>Change Detail</th><th>Queries</th></tr></thead>
            <tbody>${impactedRows}</tbody>
        </table>
    ` : `<p style="margin-top: 10px; font-size: 12px; color: ${muted};">No report snapshot techniques overlap with moved, modified, retired, or deprecated techniques in the available ATT&amp;CK changelog.</p>`;

    return `
        <div class="section" id="attack-version-impact" style="page-break-inside: avoid;"><a name="attack-version-impact"></a>
            <h3>ATT&amp;CK Version Impact Appendix</h3>
            <div style="background-color: ${panel}; border: 1px solid ${border}; padding: 14px 16px; margin-bottom: 12px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 0;">
                    <tr>
                        <td style="border: none; padding: 0 10px 0 0; color: ${muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;">Report ATT&amp;CK<br><strong style="font-size: 16px; color: ${heading}; text-transform: none; letter-spacing: 0;">v${escapeHtml(data.reportVersion)}</strong></td>
                        <td style="border: none; padding: 0 10px; color: ${muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;">Loaded ATT&amp;CK<br><strong style="font-size: 16px; color: ${heading}; text-transform: none; letter-spacing: 0;">v${escapeHtml(data.loadedVersion)}</strong></td>
                        <td style="border: none; padding: 0 0 0 10px; color: ${muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;">Status<br><strong style="font-size: 16px; color: ${accent}; text-transform: none; letter-spacing: 0;">${data.versionChanged ? 'Review recommended' : 'Current'}</strong></td>
                    </tr>
                </table>
            </div>
            <p style="font-size: 12.5px; color: ${text}; margin-bottom: 10px;">Reports retain the ATT&amp;CK version captured at generation time. Re-exported copies include the loaded dataset context so reviewers can see whether framework changes may affect conclusions.</p>
            ${data.diff ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                    <tr>
                        <td style="background-color: ${panel}; border: 1px solid ${border}; text-align: center;"><strong>${data.addedTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">New techniques</span></td>
                        <td style="background-color: ${panel}; border: 1px solid ${border}; text-align: center;"><strong>${data.addedTactics.length}</strong><br><span style="font-size: 10px; color: ${muted};">New tactics</span></td>
                        <td style="background-color: ${panel}; border: 1px solid ${border}; text-align: center;"><strong>${data.movedTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">Moved</span></td>
                        <td style="background-color: ${panel}; border: 1px solid ${border}; text-align: center;"><strong>${data.modifiedTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">Modified</span></td>
                        <td style="background-color: ${panel}; border: 1px solid ${border}; text-align: center;"><strong>${data.retiredTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">Retired</span></td>
                    </tr>
                </table>
                <p style="font-size: 11px; color: ${muted}; margin-bottom: 8px;">Available changelog comparison: v${escapeHtml(data.diffCurrent)} vs v${escapeHtml(data.diffPrevious)}${data.diffMatchesReportBaseline ? '.' : '; this is the loaded changelog baseline and may not span every version between the report and loaded dataset.'}</p>
                <h4 style="margin: 12px 0 6px; font-size: 13px; color: ${heading};">Report Snapshot Impact (${data.impactedReportTechniques.length} techniques, ${data.impactedQueryCount} linked queries)</h4>
                ${impactedTable}
            ` : `<p style="font-size: 12px; color: ${muted};">No ATT&amp;CK changelog comparison is currently loaded, so only report and loaded dataset versions can be shown.</p>`}
        </div>
    `;
}

export async function viewReport(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    await ensureAttackVersionAppendixDiff(report);
    snapshotDynamicContent(report);

    const modal = document.getElementById('report-view-modal');
    const body = document.getElementById('report-view-body');
    
    const logoHtml = report.companyLogo 
        ? `<img src="${safeImageSrc(report.companyLogo)}" alt="Company Logo" class="company-logo">` 
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
    const currentMonth = getReportMonth(report);
    const reportMonthLabel = getReportMonthLabel(report);
    const currentTheme = report.bannerTheme || 'blue';
    const safeReportId = escapeHtml(report.id || '');
    const themeOptionsHtml = Object.entries(BANNER_THEMES).map(([key, t]) =>
        `<option value="${key}" ${key === currentTheme ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    const monthSelectorHtml = `
        <div class="report-month-selector">
            <label class="text-on-surface-tertiary text-sm mr-2">Report Month:</label>
            <select class="form-select form-select-sm" style="width: auto; min-width: 180px;" data-report-action="change-month" data-report-id="${safeReportId}">
                ${availableMonths.map(m => `<option value="${escapeHtml(m)}" ${m === currentMonth ? 'selected' : ''}>${escapeHtml(getMonthLabel(m))}</option>`).join('')}
            </select>
            <label class="text-on-surface-tertiary text-sm ml-3 mr-2">Banner Theme:</label>
            <select class="form-select form-select-sm" style="width: auto; min-width: 140px;" data-report-action="change-theme" data-report-id="${safeReportId}">
                ${themeOptionsHtml}
            </select>
        </div>
    `;

    // Dynamic Milestone Board Metrics calculated perfectly for the selected month
    const stats = getMonthStats(currentMonth);
    const coverageStats = getOverallCoverageStatsUpToMonth(currentMonth);
    
    const totalQueries = getTotalUniqueActiveQueriesUpToMonth(currentMonth);
    const techniquesCovered = stats.techIds.size;
    const frameworkCoverage = coverageStats.pct;
    const threatsDisrupted = getThreatsDisruptedCount(currentMonth);
    const techniquesWithGaps = coverageStats.total - coverageStats.covered;

    const sigmaRulesDeployed = (() => {
        const sigmaIds = new Set();
        const repMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || currentMonth;
        if (repMonth && typeof getTechniquesByMonth === 'function') {
            const byMonth = getTechniquesByMonth();
            const techniques = byMonth[repMonth] || [];
            techniques.forEach(ann => {
                if (ann.queries) {
                    ann.queries.forEach(q => {
                        if (q.sigmaRuleId) {
                            q.sigmaRuleId.split('|').filter(Boolean).forEach(id => sigmaIds.add(id));
                        }
                    });
                }
            });
        }
        return sigmaIds.size;
    })();

    const availableMonthsSorted = getAvailableMonths().sort((a, b) => b.localeCompare(a));
    const currentIdx = availableMonthsSorted.indexOf(currentMonth);
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
        if (pct >= 70) return '#22c55e';
        if (pct >= 50) return '#eab308';
        if (pct >= 30) return '#f97316';
        return '#ef4444';
    };

    const maturityGrade = getMaturityGrade(frameworkCoverage);
    const gradeColor = getGradeColor(frameworkCoverage);

    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

    const statsBarHtml = `
        <div class="posture-dashboard" id="posture-dashboard">
            <div class="posture-dashboard-grid">
                <div class="posture-card posture-card-coverage">
                    <div class="posture-card-label">Framework Coverage</div>
                    <div class="posture-card-value">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                    ${deltaHtml}
                    <div class="posture-card-detail">Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}</div>
                </div>
                <div class="posture-card posture-card-detections">
                    <div class="posture-card-label">Active Detections</div>
                    <div class="posture-card-value">${totalQueries}</div>
                    <div class="posture-card-detail">threat hunt queries deployed</div>
                    <div class="posture-card-change" style="color: ${stats.queries > 0 ? '#34d399' : '#94a3b8'};">${stats.queries > 0 ? '↑ +' + stats.queries + ' deployed this period' : 'No new queries this period'}</div>
                </div>
                <div class="posture-card posture-card-techniques">
                    <div class="posture-card-label">Tactical Gaps Filled</div>
                    <div class="posture-card-value">${techniquesCovered}</div>
                    <div class="posture-card-detail">techniques covered this period</div>
                </div>
                <div class="posture-card posture-card-threats">
                    <div class="posture-card-label">${getReportMetricLabel()}</div>
                    <div class="posture-card-value">${threatsDisrupted}</div>
                    <div class="posture-card-detail">${getReportMetricDetail()}</div>
                </div>
            </div>
            <div class="posture-grade-card">
                <div class="posture-grade-info">
                    <div class="posture-grade-label">Security Posture Grade</div>
                    <div class="posture-grade-value" style="color: ${gradeColor};">${maturityGrade}</div>
                    <div class="posture-grade-detail">standard framework grade</div>
                </div>
                <div class="posture-grade-circle" style="color: ${gradeColor};">
                    <span>${maturityGrade.split(' ')[0]}</span>
                </div>
            </div>
            <div class="posture-note">
                Note: <strong>Maturity Grading:</strong> Grade is calculated based on framework technique coverage (A: ≥70%, B: 50%-70%, C: 30%-50%, D/F: <30%).
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${escapeHtml(report.author || state.author || 'the Security Operations Team')}</strong>.
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
                <div class="report-date">${escapeHtml(reportMonthLabel)}</div>
                ${report.layerName ? `<div class="report-date"><i class="bi bi-layers mr-1"></i>Layer: ${escapeHtml(report.layerName)}</div>` : ''}
                <div class="report-date" style="display: inline-flex; align-items: center; gap: 4px;">
                    <i class="bi bi-person mr-1"></i>Prepared by: 
                    <input type="text" class="report-author-input border-0 bg-transparent text-white fw-semibold px-1 py-0" style="outline: none; border-bottom: 1px dashed rgba(255, 255, 255, 0.3) !important; color: rgba(255, 255, 255, 0.85) !important; font-size: inherit; width: 180px;" value="${escapeHtml(report.author || state.author || '')}" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="author" placeholder="Enter author name...">
                </div>
            </div>

            ${buildReportBasisNote(report)}

            ${statsBarHtml}

            ${buildTopNextActionsSection(report)}

            <div class="report-tier" id="tier-1">
                <div class="report-tier-header">
                    <i class="bi bi-shield-check"></i>
                    <span>Tier 1: Executive Security Posture</span>
                </div>
                <div class="report-tier-content">
                    <div class="report-section">
                        <h4><i class="bi bi-journal-text"></i> Executive Summary</h4>
                        <textarea rows="5" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="executiveSummary" placeholder="Provide a high-level overview of the threat hunting activities, key findings, and overall coverage status...">${escapeHtml(report.executiveSummary || generateDynamicExecutiveSummary(report))}</textarea>
                    </div>
                    <div class="report-section">
                        <h4><i class="bi bi-bar-chart-line"></i> Key Metrics at a Glance</h4>
                        <div class="key-metrics-grid">
                            <div class="key-metric-card">
                                <div class="key-metric-value" style="color: #22c55e;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                                <div class="key-metric-label">Overall Coverage</div>
                                <div class="key-metric-detail">Framework technique coverage</div>
                            </div>
                            <div class="key-metric-card">
                                <div class="key-metric-value" style="color: #38bdf8;">${totalQueries}</div>
                                <div class="key-metric-label">Active Queries</div>
                                <div class="key-metric-detail">Detection rules deployed</div>
                            </div>
                            <div class="key-metric-card">
                                <div class="key-metric-value" style="color: #fbbf24;">${threatsDisrupted}</div>
                                <div class="key-metric-label">${getReportMetricLabel()}</div>
                                <div class="key-metric-detail">${getReportMetricDetail()}</div>
                            </div>
                            <div class="key-metric-card">
                                <div class="key-metric-value" style="color: #ef4444;">${techniquesWithGaps}</div>
                                <div class="key-metric-label">Critical Gaps</div>
                                <div class="key-metric-detail">Techniques needing coverage</div>
                            </div>
                        </div>
                    </div>
                    <div class="report-section leadership-section">
                        <h4><i class="bi bi-people"></i> Leadership Overview</h4>
                        <div class="leadership-content">
                            <p>${markdownToHtml(report.leadershipOverview || generateLeadershipOverview(report))}</p>
                        </div>
                    </div>
                    <div class="report-section">
                        <h4><i class="bi bi-bullseye"></i> Monthly Focus Areas</h4>
                        <textarea rows="4" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="monthlyFocus" placeholder="Describe the key focus areas and objectives for this reporting period...">${escapeHtml(report.monthlyFocus || generateDynamicMonthlyFocus(report))}</textarea>
                    </div>
                </div>
            </div>

            <div class="report-tier" id="tier-2">
                <div class="report-tier-header">
                    <i class="bi bi-shield-slash"></i>
                    <span>Tier 2: Threat Landscape & Strategic Gaps</span>
                </div>
                <div class="report-tier-content">
                    <div class="report-section">
                        <h4><i class="bi bi-lightbulb"></i> Strategic Recommendations</h4>
                        <p class="text-on-surface-secondary mb-3">Prioritized action items based on coverage gaps, threat relevance, and resource allocation. These recommendations are designed to maximize defensive impact with available resources.</p>
                        <textarea rows="5" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="recommendations" placeholder="Outline strategic recommendations for improving detection coverage, prioritizing high-impact techniques, and allocating resources effectively...">${escapeHtml(report.recommendations || generateDynamicRecommendations(report))}</textarea>
                    </div>
                    <div class="report-section">
                        <h4><i class="bi bi-people-fill"></i> Team Assignments & Focus Areas</h4>
                        <p class="text-on-surface-secondary mb-3">Assign specific teams to focus areas based on their expertise and the current threat landscape. Dynamic recommendations are generated based on selected teams and their relevance to active gaps.</p>
                        <div id="team-assignments-container" data-report-id="${safeReportId}">
                            ${buildTeamAssignmentsSection(report)}
                        </div>
                    </div>
                    <div class="report-section">
                        <h4><i class="bi bi-shield-slash"></i> Adversary Group Defensive Gap Mapper</h4>
                        <p class="text-on-surface-secondary mb-3">This section ranks the top threat actor groups by their relevance to your environment, based on the number of ATT&amp;CK techniques they employ that overlap with your coverage map. Groups are selected by cross-referencing known adversary TTPs against your deployed detection queries, highlighting where your defensive posture is strongest and where critical blind spots exist. Each scorecard shows the percentage of that group's known techniques you can currently detect, along with the specific gaps that remain uncovered.</p>
                        ${threatsHtml}
                    </div>
                    ${techniquesAtRiskHtml}
                    <div class="report-section">
                        <h4><i class="bi bi-graph-up"></i> Gap Analysis & Prioritization</h4>
                        <textarea rows="5" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="gapAnalysis" placeholder="Identify coverage gaps, prioritize techniques based on threat relevance, and outline next steps for improving detection capabilities...">${escapeHtml(report.gapAnalysis || generateDynamicGapAnalysis(report))}</textarea>
                    </div>
                    <div class="report-section">
                        <h4><i class="bi bi-grid-3x2"></i> Risk Heat Map</h4>
                        <p class="text-on-surface-secondary mb-3">Visual representation of risk exposure across threat groups, plotting likelihood of attack against potential impact. Red zones indicate high-priority areas requiring immediate attention.</p>
                        ${buildRiskHeatMap(report)}
                    </div>
                </div>
            </div>

            <div class="report-tier" id="tier-3">
                <div class="report-tier-header">
                    <i class="bi bi-clipboard-check"></i>
                    <span>Tier 3: Operational Hunt Progress</span>
                </div>
                <div class="report-tier-content">
                    ${monthlyChangelogHtml}
                    <div class="report-section">
                        <h4><i class="bi bi-check2-circle"></i> Detection Results</h4>
                        ${detectionResultsHtml}
                    </div>
                    ${tacticsGraphHtml}
                </div>
            </div>

            <div class="report-tier" id="tier-4">
                <div class="report-tier-header">
                    <i class="bi bi-file-text"></i>
                    <span>Tier 4: Telemetry Proof & Appendix</span>
                </div>
                <div class="report-tier-content">
                    <div class="report-section">
                        <h4><i class="bi bi-git"></i> Query Repository</h4>
                        <p class="text-on-surface-secondary mb-2">Link to the canonical repository for full query text, review history, and deployment context.</p>
                        <input type="url" class="form-control" value="${escapeHtml(report.queryRepositoryUrl || '')}" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="queryRepositoryUrl" placeholder="https://github.com/org/query-repository">
                    </div>
                    ${newQueriesHtml}
                    <div class="report-section">
                        <h4><i class="bi bi-clipboard-check"></i> Methodology & Scope</h4>
                        ${methodologyHtml}
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
                </div>
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
                <button class="btn btn-success" data-report-action="save-validate" data-report-id="${safeReportId}">
                    <i class="bi bi-check-circle mr-2"></i>Save & Validate
                </button>
                <button class="btn btn-outline-primary" data-report-action="export-html" data-report-id="${safeReportId}">
                    <i class="bi bi-file-earmark-html mr-2"></i>Export HTML
                </button>
                <button class="btn btn-primary" data-report-action="export-html-pdf" data-report-id="${safeReportId}">
                    <i class="bi bi-file-earmark-pdf mr-2"></i>HTML to PDF
                </button>
                <button class="btn btn-outline-secondary" data-report-action="export-svg" data-report-id="${safeReportId}">
                    <i class="bi bi-filetype-svg mr-2"></i>Export SVG
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
    
    const rows = container.querySelectorAll('.timeline-item, .timeline-header');
    rows.forEach(row => {
        if (filterType === 'all') {
            row.style.display = '';
        } else if (filterType === 'status' && (row.classList.contains('event-status') || row.classList.contains('timeline-header'))) {
            row.style.display = '';
        } else if (filterType === 'new' && (row.classList.contains('event-new') || row.classList.contains('timeline-header'))) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
};

export function generateUnifiedChangelog(report, isEmail = false, theme = null, isDarkParam = null) {
    if (typeof window.buildUnifiedActivityFeed === 'function') {
        const isDark = isDarkParam !== null ? isDarkParam : (document.documentElement.getAttribute('data-theme') === 'dark');
        return window.buildUnifiedActivityFeed(report, isDark, isEmail);
    }
    return '<p>Loading activity feed...</p>';
}

export function buildMonthlyChangelog(report) {
    return generateUnifiedChangelog(report, false);
}


export function buildMethodology(report) {
    const methodology = report.methodology || {};
    const scope = report.scope || {};
    const safeReportId = escapeHtml(report.id || '');
    
    const methodologyOptions = [
        { id: 'sig-based', label: 'Signature-Based Detection', desc: 'Rule-based matching against known patterns' },
        { id: 'behavioral', label: 'Behavioral Analysis', desc: 'Anomaly detection based on behavior patterns' },
        { id: 'threat-intel', label: 'Threat Intelligence Driven', desc: 'Hunting based on threat actor TTPs' },
        { id: 'lolbins', label: 'LOLBINs/Living off the Land', desc: 'Detecting abuse of trusted system binaries and administrative tools' },
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
                <input type="checkbox" id="meth-${opt.id}" ${checked} data-report-action="update-methodology" data-report-id="${safeReportId}" data-report-section="methodology" data-report-option="${escapeHtml(opt.id)}">
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
                <input type="checkbox" id="scope-${opt.id}" ${checked} data-report-action="update-methodology" data-report-id="${safeReportId}" data-report-section="scope" data-report-option="${escapeHtml(opt.id)}">
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
            <textarea class="form-control" rows="2" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="methodologyNotes" placeholder="Any additional methodology notes...">${escapeHtml(report.methodologyNotes || '')}</textarea>
        </div>
    `;
    
    return html;
}

export function getThreatsDisruptedCount(month) {
    if (!state.relationships || !state.groups || !state.software) return 0;
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    if (techniques.length === 0) return 0;
    
    const changedTechStixIds = new Set();
    techniques.forEach(t => {
        const stixTech = state.techniques?.find(st => st.external_references?.[0]?.external_id === t.techniqueID);
        if (stixTech) changedTechStixIds.add(stixTech.id);
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

export function resolveQueryMonth(q, ann) {
    if (q.monthAdded) return q.monthAdded;
    if (q.created) return q.created.slice(0, 7);
    if (ann && ann.monthAdded) return ann.monthAdded;
    return new Date().toISOString().slice(0, 7);
}

export function isQueryActiveInMonth(q, targetMonth, ann) {
    const qMonth = resolveQueryMonth(q, ann);
    if (qMonth > targetMonth) return false;
    
    if (q.archived && q.archivedAt) {
        const archMonth = q.archivedAt.slice(0, 7);
        if (archMonth <= targetMonth) return false;
    }
    return true;
}

export function getMonthStats(month) {
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

export function getOverallCoverageStatsUpToMonth(targetMonth) {
    if (!state.techniques) return { total: 0, covered: 0, pct: 0, parents: { total: 0, covered: 0, pct: 0 }, subs: { total: 0, covered: 0, pct: 0 }, all: { total: 0, covered: 0, pct: 0 } };
    
    const parentTechniques = state.techniques.filter(t => !t.x_mitre_is_subtechnique);
    const subTechniques = state.techniques.filter(t => t.x_mitre_is_subtechnique);
    const totalTechniques = parentTechniques.length;
    
    let coveredCount = 0;
    const coveredIds = new Set();
    
    if (state.currentLayer?.techniques) {
        state.currentLayer.techniques.forEach(lt => {
            const hasQueries = lt.queries?.some(q => isQueryActiveInMonth(q, targetMonth, lt));
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

export function getTotalUniqueActiveQueriesUpToMonth(targetMonth) {
    if (!state.currentLayer?.techniques) return 0;
    const activeIds = new Set();
    state.currentLayer.techniques.forEach(t => {
        if (t.queries) {
            t.queries.forEach(q => {
                if (isQueryActiveInMonth(q, targetMonth, t)) {
                    activeIds.add(q.id);
                }
            });
        }
    });
    return activeIds.size;
}

export function getTotalActiveQueriesUpToMonth(targetMonth) {
    return getTotalUniqueActiveQueriesUpToMonth(targetMonth);
}

export function generateLeadershipOverview(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const periodLabel = report.reportMonth || (month ? getMonthLabel(month) : 'this period');
    
    return `The data presented in this report highlights our strategic alignment with the MITRE ATT&CK framework for ${periodLabel}. While our operational coverage provides robust visibility into known adversary behaviors, it is critical to recognize that coverage percentages reflect techniques where at least one telemetry source is actively queried. Individual techniques may encompass multiple distinct attack vectors, some of which may remain unmonitored. Strategic focus should be directed towards addressing identified zero-coverage gaps in high-risk areas, maturing our detection engineering lifecycle, and ensuring that our telemetry sources continuously adapt to emerging adversary tradecraft.`;
}

export function getQueryAssociations(q, layerTechs) {
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

export function buildNewQueriesSection(report) {
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
                        description: q.description,
                        sentinelCandidate: q.sentinelCandidate
                    });
                }
            });
        }
    });
    
    if (allQueries.length === 0) return '';
    
    const layerTechs = report.snapshot?.techniques || state.currentLayer?.techniques || [];
    
    // Group queries by language
    const byLanguage = {};
    allQueries.forEach(q => {
        if (!byLanguage[q.language]) byLanguage[q.language] = [];
        byLanguage[q.language].push(q);
    });
    
    let html = '<div class="report-section new-queries-section"><h4><i class="bi bi-search"></i> New Threat Hunt Queries</h4>';
    html += `<p class="text-on-surface-secondary mb-3">${allQueries.length} queries deployed for ${getMonthLabel(month)} across ${Object.keys(byLanguage).length} language${Object.keys(byLanguage).length > 1 ? 's' : ''}:</p>`;
    
    // Language summary bar
    html += '<div class="query-lang-summary mb-3">';
    Object.entries(byLanguage).forEach(([lang, queries]) => {
        const langColors = { 'KQL': '#0078d4', 'Splunk': '#01adef', 'Sigma': '#4caf50', 'Elastic': '#f04e23', 'Carbon Black': '#ff6b35' };
        const color = langColors[lang] || '#64748b';
        html += `<span class="query-lang-chip" style="background: ${color}15; color: ${color}; border: 1px solid ${color}30;">${lang}: ${queries.length}</span>`;
    });
    html += '</div>';
    
    html += '<div class="new-queries-grid">';
    
    allQueries.forEach(q => {
        const queryName = q.name || 'Unnamed Query';
        const assoc = getQueryAssociations(q, layerTechs);
        const parents = assoc.filter(x => !x.isSub);
        const subs = assoc.filter(x => x.isSub);
        
        const language = getSafeReportLanguage(q.language);
        const langColors = { 'KQL': '#0078d4', 'Splunk': '#01adef', 'Sigma': '#4caf50', 'Elastic': '#f04e23', 'Carbon Black': '#ff6b35' };
        const langColor = langColors[language.raw] || '#64748b';
        
        html += `
            <div class="new-query-card">
                <div class="new-query-header">
                    <div class="new-query-header-badges">
                        <span class="new-query-lang" style="background: ${langColor}20; color: ${langColor}; border-color: ${langColor}40;">${language.label}</span>
                        ${q.sentinelCandidate ? '<span style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.15rem 0.45rem;font-size:0.65rem;font-weight:600;background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25);border-radius:0.35rem;text-transform:uppercase;letter-spacing:0.02em;" title="Candidate for Sentinel analytic"><i class="bi bi-robot"></i> Sentinel Candidate</span>' : ''}
                    </div>
                    <span class="new-query-date">${formatTimestamp(q.created)}</span>
                </div>
                <h6 class="new-query-title">${escapeHtml(queryName)}</h6>
                ${q.description ? `<p class="new-query-desc">${escapeHtml(truncateDescription(q.description, 120))}</p>` : ''}
                <div class="new-query-techs">
                    ${parents.length > 0 ? `<div class="new-query-tech-row"><span class="new-query-tech-label">Techniques:</span>${parents.map(p => `<span class="new-query-tech-badge" title="${escapeHtml(p.name)}">${p.id}</span>`).join('')}</div>` : ''}
                    ${subs.length > 0 ? `<div class="new-query-tech-row"><span class="new-query-tech-label">Sub-techniques:</span>${subs.map(s => `<span class="new-query-tech-badge sub" title="${escapeHtml(s.name)}">${s.id}</span>`).join('')}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div></div>';
    return html;
}

export function buildTechniquesAtRisk(report) {
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
        const techId = getTechniqueIdFromStix(rel.target_ref);
        if (!techId || !zeroCoverageTechs.has(techId)) return;
        
        const group = state.groups.find(g => g.id === rel.source_ref);
        if (!group) return;
        
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

export function buildTacticsGraph(report) {
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

export function buildChangesSection(changes) {
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

export function buildThreatsSection(report) {
    if (!state.groups || state.groups.length === 0) {
        return '<p class="text-on-surface-secondary">Threat intelligence data not loaded. Please ensure ATT&CK data is loaded.</p>';
    }
    
    // Sort all groups by total techniques used in ATT&CK to find the top threats overall
    const allGroups = state.groups.map(group => {
        const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
        const relatedTechs = techRels.map(r => state.techniques.find(tech => tech.id === r.target_ref)).filter(Boolean);
        
        const coveredCount = relatedTechs.filter(tech => {
            const tid = tech.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid) || report?.snapshot?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        
        const techCount = relatedTechs.length;
        const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
        const gaps = techCount - coveredCount;
        
        return {
            id: group.id,
            name: group.name,
            techCount: techCount,
            coveredCount: coveredCount,
            coveragePct: coveragePct,
            gaps: gaps,
            techniqueIds: techRels.map(r => r.target_ref)
        };
    }).sort((a, b) => b.techCount - a.techCount).slice(0, 5); // Take top 5 overall threat groups
    
    let html = '<div class="threat-roi-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">';
    
    allGroups.forEach(t => {
        const typeLabel = 'Threat Group';
        const icon = 'bi-people-fill';
        
        // Determine exposure risk based on count of techniques used
        let exposureLevel = 'Medium';
        let exposureClass = 'medium';
        if (t.techCount >= 40) {
            exposureLevel = 'Critical';
            exposureClass = 'critical';
        } else if (t.techCount >= 20) {
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
        
        const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
        
        const readinessHtml = `
            <div class="roi-card-readiness mt-2" style="border-top: 1px solid ${isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; padding-top: 8px; font-size: 0.72rem; width: 100%;">
                <div class="d-flex justify-content-between mb-1" style="color: var(--on-surface-secondary); font-size: 11px;">
                    <span>${reportIcon('shield', '#38bdf8', 12)}Defensive Readiness against <strong>${escapeHtml(t.name)}</strong>:</span>
                    <span style="font-weight: 700; color: ${t.coveragePct >= 70 ? 'var(--accent-green)' : t.coveragePct >= 40 ? 'var(--accent-tan)' : 'var(--accent-red)'};">${t.coveragePct}%</span>
                </div>
                <div class="progress" style="height: 5px; background: ${isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}; border-radius: 3px; overflow: hidden; margin-bottom: 4px;">
                    <div class="progress-bar" style="width: ${t.coveragePct}%; height: 100%; background: ${t.coveragePct >= 70 ? 'var(--accent-green)' : t.coveragePct >= 40 ? 'var(--accent-tan)' : 'var(--accent-red)'}; border-radius: 3px;"></div>
                </div>
                <div class="d-flex justify-content-between text-xs" style="color: var(--on-surface-tertiary); font-size: 10px;">
                    <span>${reportIcon('check', '#10b981', 11)}${t.coveredCount} / ${t.techCount} Covered Techniques</span>
                    <span style="color: ${t.gaps > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}; font-weight: 600;">
                        ${t.gaps > 0 ? `${reportIcon('warning', '#ef4444', 11)}${t.gaps} Gaps` : `${reportIcon('check', '#10b981', 11)}100% Covered`}
                    </span>
                </div>
            </div>
        `;
        
        html += `
            <div class="threat-roi-card group" style="display: flex; flex-direction: column; gap: 8px;">
                <div class="d-flex align-items-start justify-content-between w-100">
                    <div class="roi-card-left">
                        <span class="roi-card-type"><i class="bi ${icon} mr-1"></i>${typeLabel}</span>
                        <h5 class="roi-card-title" style="margin: 0.15rem 0;">${t.name}</h5>
                    </div>
                    <div class="roi-card-right">
                        <span class="roi-exposure-badge ${exposureClass}">${exposureLevel} Risk</span>
                    </div>
                </div>
                <div class="roi-card-mid" style="width: 100%;">
                    <div class="roi-tech-chips">
                        ${techListHtml}${moreTechsHtml}
                    </div>
                </div>
                ${readinessHtml}
            </div>
        `;
    });
        
    html += '</div>';
    return html;
}

export function buildTacticTable(tactics, report) {
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

export function buildLanguageTable(languages, report) {
    if (!languages || languages.length === 0) return '<p class="text-on-surface-secondary">No language data available.</p>';
    
    let html = '<table class="report-table"><thead><tr><th>Language</th><th>Query Count</th></tr></thead><tbody>';
    
    languages.forEach(l => {
        html += `<tr><td>${l.language}</td><td>${l.count}</td></tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

export function getCoverageByTacticUpToMonth(targetMonth) {
    if (!state.currentLayer?.techniques || !state.techniques) return [];
    const tacticMap = {};
    state.techniques.forEach(stixTech => {
        const techId = stixTech.external_references?.[0]?.external_id;
        if (!techId) return;
        const tactics = stixTech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        const layerTech = state.currentLayer.techniques.find(t => t.techniqueID === techId);
        
        const hasQueries = layerTech?.queries?.some(q => isQueryActiveInMonth(q, targetMonth, layerTech));
        
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

export function buildCoverageChanges(report) {
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

export function buildDetectionResults(report) {
    const results = report.detectionResults || [];
    const safeReportId = escapeHtml(report.id || '');
    
    let html = '<div id="detection-results-container" class="detection-results-grid">';
    
    if (results.length === 0) {
        html += '<p class="text-on-surface-secondary mb-3">No tangible results for this update.</p>';
    }
    
    results.forEach((result, idx) => {
        html += `
            <div class="detection-result-card mb-3">
                <div class="detection-result-card-header d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-2 flex-grow-1 mr-3">
                        <i class="bi bi-crosshair text-primary fs-5"></i>
                        <input type="text" class="form-control form-control-sm border-0 bg-transparent text-white fw-bold px-0 focus-ring-none" placeholder="Enter Hunt Name..." value="${escapeHtml(result.huntName || '')}" data-report-action="update-detection" data-report-id="${safeReportId}" data-report-index="${idx}" data-report-field="huntName" style="box-shadow: none; font-size: 0.95rem;">
                    </div>
                    <button class="btn btn-sm btn-link text-danger p-0" data-report-action="remove-detection" data-report-id="${safeReportId}" data-report-index="${idx}" title="Remove Result">
                        <i class="bi bi-trash3 fs-6"></i>
                    </button>
                </div>
                <div class="detection-result-card-body p-3">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-transparent border-end-0 text-muted"><i class="bi bi-ticket-perforated"></i></span>
                                <input type="text" class="form-control border-start-0" placeholder="SIR Ticket (optional)" value="${escapeHtml(result.sirTicket || '')}" data-report-action="update-detection" data-report-id="${safeReportId}" data-report-index="${idx}" data-report-field="sirTicket">
                            </div>
                        </div>
                        <div class="col-12 mt-2">
                            <label class="text-xs text-on-surface-tertiary font-semibold mb-1 d-block"><i class="bi bi-card-text mr-1"></i>Hunt Notes & Key Findings</label>
                            <textarea class="form-control form-control-sm" rows="3" placeholder="Describe the outcome, detections triggered, log sources verified, or key observations..." data-report-action="update-detection" data-report-id="${safeReportId}" data-report-index="${idx}" data-report-field="notes">${escapeHtml(result.notes || '')}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        <button class="btn btn-sm btn-outline-primary w-100 py-2 border-dashed mt-2" data-report-action="add-detection" data-report-id="${safeReportId}">
            <i class="bi bi-plus-lg mr-1"></i>Add Detection Result Card
        </button>
    </div>`;
    
    return html;
}

export function buildReferences(report) {
    const references = report.references || [];
    const safeReportId = escapeHtml(report.id || '');
    
    // Build dynamic sigma references
    const sigmaRefs = [];
    const seenUrls = new Set();
    const repMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (repMonth && typeof getTechniquesByMonth === 'function') {
        const byMonth = getTechniquesByMonth();
        const techniques = byMonth[repMonth] || [];
        techniques.forEach(ann => {
            if (ann.queries) {
                ann.queries.forEach(q => {
                    if (q.sigmaRuleUrl) {
                        const urls = q.sigmaRuleUrl.split('|').filter(Boolean);
                        const titles = q.sigmaRuleTitle ? q.sigmaRuleTitle.split('|').filter(Boolean) : [];
                        urls.forEach((url, i) => {
                            if (!seenUrls.has(url)) {
                                seenUrls.add(url);
                                sigmaRefs.push({
                                    title: titles[i] || q.sigmaRuleTitle?.split('|')[0] || 'SigmaHQ Rule',
                                    url: url
                                });
                            }
                        });
                    }
                });
            }
        });
    }
    
    let html = '<div id="references-container">';
    
    // Show sigma references first
    if (sigmaRefs.length > 0) {
        html += `<div class="sigma-references-section mb-3">
            <h6 class="text-on-surface-secondary mb-2"><i class="bi bi-shield-check mr-1"></i>Sigma Rule References (${sigmaRefs.length})</h6>
            <ul class="sigma-ref-list">
                ${sigmaRefs.map(sr => `
                    <li class="sigma-ref-item">
                        <span class="sigma-ref-title">${escapeHtml(sr.title)}</span>
                        <a href="${safeLinkHref(sr.url)}" target="_blank" rel="noopener noreferrer" class="sigma-ref-link"><i class="bi bi-link-45deg"></i> View Rule</a>
                    </li>
                `).join('')}
            </ul>
        </div>`;
    }
    
    // User-added references
    if (references.length > 0 || sigmaRefs.length === 0) {
        html += `<h6 class="text-on-surface-secondary mb-2"><i class="bi bi-link-45deg mr-1"></i>Custom References</h6>`;
        references.forEach((ref, idx) => {
            html += `
                <div class="reference-item mb-2 d-flex align-iteml-center gap-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Reference URL or description" value="${escapeHtml(ref)}" data-report-action="update-reference" data-report-id="${safeReportId}" data-report-index="${idx}">
                    <button class="btn btn-sm btn-outline-danger" data-report-action="remove-reference" data-report-id="${safeReportId}" data-report-index="${idx}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
        });
    }
    
    html += `
        <button class="btn btn-sm btn-outline-primary mt-2" data-report-action="add-reference" data-report-id="${safeReportId}">
            <i class="bi bi-plus mr-1"></i>Add Custom Reference
        </button>
    </div>`;
    
    return html;
}

export function buildAppendix(report) {
    const appendix = mergeAppendixDefaults(generateDynamicAppendix(report), report.appendix);
    const safeReportId = escapeHtml(report.id || '');
    const versionAppendixHtml = buildAttackVersionAppendix(report);
    
    return `
        ${versionAppendixHtml}
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Methodology</label>
            <textarea class="form-control" rows="3" data-report-action="update-appendix" data-report-id="${safeReportId}" data-report-field="methodology" placeholder="Describe the methodology used for this assessment...">${escapeHtml(appendix.methodology)}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Scope</label>
            <textarea class="form-control" rows="3" data-report-action="update-appendix" data-report-id="${safeReportId}" data-report-field="scope" placeholder="Define the scope of this assessment...">${escapeHtml(appendix.scope)}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Limitations</label>
            <textarea class="form-control" rows="3" data-report-action="update-appendix" data-report-id="${safeReportId}" data-report-field="limitations" placeholder="Document any limitations or constraints...">${escapeHtml(appendix.limitations)}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-on-surface-tertiary text-sm">Additional Notes</label>
            <textarea class="form-control" rows="3" data-report-action="update-appendix" data-report-id="${safeReportId}" data-report-field="additionalNotes" placeholder="Any additional notes or context...">${escapeHtml(appendix.additionalNotes)}</textarea>
        </div>
    `;
}

export function generateDynamicAppendix(report) {
    const month = getReportMonth(report);
    const monthLabel = getReportMonthLabel(report);
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const totalQueries = getTotalUniqueActiveQueriesUpToMonth(month);
    const newQueries = getMonthStats(month).queries;
    const layerName = report.layerName || state.currentLayer?.name || 'the selected ATT&CK layer';
    const assignedTeams = (report.teamAssignments || [])
        .map(teamId => TEAM_OPTIONS.find(team => team.id === teamId)?.label)
        .filter(Boolean);
    const teamText = assignedTeams.length ? assignedTeams.join(', ') : 'No dedicated teams assigned in this report';
    
    return {
        methodology: `This report evaluates ${layerName} coverage against MITRE ATT&CK using the selected report month (${monthLabel}), active threat hunt queries, technique annotations, tactic coverage, and current ATT&CK relationship data loaded in the explorer. Metrics count active, non-archived detections up to the report month and distinguish parent techniques from sub-techniques where possible.`,
        scope: `Assessment period: ${monthLabel}. Current coverage is ${coverageStats.pct.toFixed(1)}% across ${coverageStats.covered}/${coverageStats.total} mapped techniques (${coverageStats.parents.covered}/${coverageStats.parents.total} parent techniques and ${coverageStats.subs.covered}/${coverageStats.subs.total} sub-techniques). This period includes ${techniques.length} technique entries, ${newQueries} newly recorded queries, and ${totalQueries} active unique detection queries up to the report month. Assigned teams: ${teamText}.`,
        limitations: `Coverage percentages reflect techniques represented in the loaded ATT&CK dataset and the active layer/query annotations available at export time. Archived queries are excluded from active coverage counts. Threat group and software mappings are based on public ATT&CK relationships and should be interpreted as defensive coverage overlap, not proof that an adversary has been disrupted. Telemetry availability, data quality, and environment-specific logging gaps can affect validation confidence.`,
        additionalNotes: `Report generated on ${report.generatedDate || new Date().toLocaleDateString()} for ATT&CK v${report.attckVersion || state.currentVersion || 'unknown'}. Re-export the report after changing the report month, layer, team assignments, archived query state, or ATT&CK dataset to refresh dynamic metrics.`
    };
}

export function mergeAppendixDefaults(defaults = {}, appendix = {}, options = {}) {
    const merged = options.customOnly ? {} : { ...defaults };
    ['methodology', 'scope', 'limitations', 'additionalNotes'].forEach(field => {
        const value = appendix?.[field];
        if (typeof value === 'string' && value.trim() && !isGeneratedAppendixValue(field, value)) {
            merged[field] = value;
        }
    });
    return merged;
}

function isGeneratedAppendixValue(field, value) {
    const text = String(value || '').trim();
    const generatedPrefixes = {
        methodology: ['This assessment utilized ', 'This report evaluates '],
        scope: ['Coverage assessment includes ', 'Assessment period: '],
        limitations: ['This assessment is limited ', 'Coverage percentages reflect '],
        additionalNotes: ['Report generated on ']
    };
    return (generatedPrefixes[field] || []).some(prefix => text.startsWith(prefix));
}

export function updateReportField(reportId, field, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        report[field] = value;
        saveReport(report);
    }
}

export function changeReportMonth(reportId, newMonth) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        report.selectedMonth = newMonth;
        report.reportMonth = getMonthLabel(newMonth);
        report.title = getReportTitle(report);
        report.periodStart = `${newMonth}-01T00:00:00.000Z`;
        const end = new Date(`${newMonth}-01T00:00:00.000Z`);
        end.setMonth(end.getMonth() + 1);
        end.setMilliseconds(end.getMilliseconds() - 1);
        report.periodEnd = end.toISOString();
        saveReport(report).then(() => {
            viewReport(reportId);
        });
    }
}

export function changeReportTheme(reportId, newTheme) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        report.bannerTheme = newTheme;
        saveReport(report).then(() => {
            viewReport(reportId);
        });
    }
}

export function markdownToHtml(text) {
    if (!text) return '';
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

export function safeImageSrc(value) {
    const src = String(value || '').trim();
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(src)) return escapeHtml(src);
    return '';
}

export function safeEmailImageSrc(value) {
    const src = String(value || '').trim();
    if (/^https?:\/\//i.test(src)) return escapeHtml(src);
    return '';
}

function safeLinkHref(value) {
    const href = String(value || '').trim();
    if (/^https?:\/\//i.test(href)) return escapeHtml(href);
    return '#';
}

function reportIcon(name, color = '#3b82f6', size = 14) {
    const paths = {
        robot: '<path d="M7 2h2v2h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm-3 4v5h8V6H4Zm1.5 2.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 14h6v1H5v-1Z"/>',
        shield: '<path d="M8 1.3 2.5 3.4v4.2c0 3.4 2.3 6.5 5.5 7.3 3.2-.8 5.5-3.9 5.5-7.3V3.4L8 1.3Zm2.8 5.2L7.4 10 5.7 8.3l.8-.8.9.9 2.6-2.7.8.8Z"/>',
        check: '<path d="M6.3 11.2 2.9 7.8l1.1-1.1 2.3 2.3L12 3.3l1.1 1.1-6.8 6.8Z"/>',
        warning: '<path d="M8 1.6 15 14H1L8 1.6Zm0 3.5c-.4 0-.7.3-.7.7v3.4c0 .4.3.7.7.7s.7-.3.7-.7V5.8c0-.4-.3-.7-.7-.7Zm0 7.2a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"/>',
        archive: '<path d="M2 3h12v3H2V3Zm1 4h10v6.5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5V7Zm3 2v1.2h4V9H6Z"/>',
        restore: '<path d="M8 3a5 5 0 1 1-4.4 7.4l1.3-.7A3.5 3.5 0 1 0 4.8 6H7v1.5H2.3V2.8h1.5v2A5 5 0 0 1 8 3Z"/>',
        search: '<path d="M6.8 2a4.8 4.8 0 0 1 3.8 7.7l3 3-1.1 1.1-3-3A4.8 4.8 0 1 1 6.8 2Zm0 1.5a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z"/>',
        image: '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm1.5 0v6.8l2.2-2.1 2 1.9 3-3.3 1.8 2V3.5h-9Zm9 8.9-1.8-2-3 3.3-2-1.9-2.2 2.1v.1h9v-1.6ZM5.4 6.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"/>'
    };
    const path = paths[name] || paths.check;
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:4px;fill:${escapeHtml(color)};">${path}</svg>`;
}

export function validateReport(report) {
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

export function generateDynamicMonthlyFocus(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    if (techniques.length === 0) return 'No new techniques were added to the detection portfolio this month. Engineering efforts were focused on maintaining and tuning existing analytics.';
    
    const groupHits = {};
    if (state.groups) {
        techniques.forEach(ann => {
            const hasNewQueries = ann.queries?.some(q => {
                const qMonth = window.resolveQueryMonth ? window.resolveQueryMonth(q, ann) : (q.monthAdded || q.created?.slice(0, 7));
                return qMonth === month;
            });
            if (!hasNewQueries) return;
            state.groups.forEach(group => {
                if (group.techniques?.includes(ann.techniqueID)) {
                    groupHits[group.name] = (groupHits[group.name] || 0) + 1;
                }
            });
        });
    }
    
    const topGroups = Object.entries(groupHits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name]) => name);
    
    let focus = `Engineering efforts this month prioritized contextual threat modeling and targeted visibility gaps. `;
    
    if (topGroups.length > 0) {
        focus += `Specifically, our recent deployments directly counter known behaviors associated with advanced persistent threats such as ${topGroups.join(' and ')}. `;
    } else {
        focus += `Specifically, our recent deployments target novel evasion techniques and emerging adversary playbooks. `;
    }
    
    focus += `By aligning our detection engineering cycle against verified threat intelligence, we ensure that our defenses evolve dynamically in response to the changing landscape.`;
    
    return focus;
}

export function generateDynamicGapAnalysis(report) {
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

export function generateDynamicRecommendations(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80);
    
    let recs = '**Strategic Recommendations:**\n\n';
    
    if (lowCoverage.length > 0) {
        recs += '**1. Close Critical Gaps:**\n';
        recs += `   Focus immediate resources on ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')} tactics.\n`;
        recs += `   These represent the highest risk blind spots in our detection coverage.\n\n`;
    }
    
    if (mediumCoverage.length > 0) {
        recs += '**2. Strengthen Moderate Coverage:**\n';
        recs += `   Develop additional detection queries for ${mediumCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')}.\n`;
        recs += `   Target 80%+ coverage across all tactics within the next quarter.\n\n`;
    }
    
    recs += '**3. Threat-Aligned Detection:**\n';
    recs += '   Prioritize detections based on active threat actor TTPs targeting our industry.\n';
    recs += '   Focus on techniques used by APT groups with known interest in our sector.\n\n';
    
    recs += '**4. Detection Quality:**\n';
    recs += '   Review existing queries for false positive rates and tuning opportunities.\n';
    recs += '   Implement automated testing for detection validation.\n\n';
    
    recs += '**5. Team Coordination:**\n';
    recs += '   Assign specific tactics to dedicated teams for ownership and accountability.\n';
    recs += '   Establish regular review cadence for coverage progress.';
    
    return recs;
}

export const TEAM_OPTIONS = [
    { id: 'cti', label: 'Cyber Threat Intelligence (CTI)', icon: 'bi-binoculars', color: '#38bdf8' },
    { id: 'engineering', label: 'Detection Engineering', icon: 'bi-gear', color: '#22c55e' },
    { id: 'soc', label: 'Security Operations Center (SOC)', icon: 'bi-shield-check', color: '#fbbf24' },
    { id: 'ir', label: 'Incident Response (IR)', icon: 'bi-exclamation-triangle', color: '#ef4444' },
    { id: 'vuln', label: 'Vulnerability Management', icon: 'bi-bug', color: '#a855f7' },
    { id: 'network', label: 'Network Security', icon: 'bi-hdd-network', color: '#06b6d4' },
    { id: 'endpoint', label: 'Endpoint Security', icon: 'bi-laptop', color: '#f97316' },
    { id: 'cloud', label: 'Cloud Security', icon: 'bi-cloud', color: '#8b5cf6' }
];

export function getTeamRecommendations(teamId, report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    
    // Get top threat groups with actual data
    const topThreatGroups = [];
    if (state.groups && state.groups.length > 0) {
        const allGroups = state.groups.map(group => {
            const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
            const relatedTechs = techRels.map(r => state.techniques.find(tech => tech.id === r.target_ref)).filter(Boolean);
            const coveredCount = relatedTechs.filter(tech => {
                const tid = tech.external_references?.[0]?.external_id || '';
                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
                return ann?.queries && ann.queries.length > 0;
            }).length;
            const techCount = relatedTechs.length;
            const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
            return {
                name: group.name,
                aliases: group.aliases || [],
                techCount: techCount,
                coveragePct: coveragePct,
                gaps: techCount - coveredCount,
                topTechniques: relatedTechs.slice(0, 5).map(t => t.external_references?.[0]?.external_id || '').filter(Boolean)
            };
        }).sort((a, b) => b.techCount - a.techCount).slice(0, 5);
        
        allGroups.forEach(g => {
            if (g.gaps > 0) topThreatGroups.push(g);
        });
    }
    
    const topGroup = topThreatGroups[0];
    const topGroupTTPs = topGroup ? topGroup.topTechniques.slice(0, 3).join(', ') : 'T1059, T1003, T1078';
    const topGroupName = topGroup ? topGroup.name : 'APT29 (Cozy Bear)';
    const topGroupAliases = topGroup && topGroup.aliases && topGroup.aliases.length > 0 ? topGroup.aliases.slice(0, 2).join(', ') : 'Cozy Bear, The Dukes';
    
    const recommendations = {
        cti: {
            focus: `Threat Actor Intelligence: ${topGroupName}`,
            actions: [
                `Profile ${topGroupName} (${topGroupAliases}) - ${topGroup ? topGroup.techCount + ' known TTPs' : 'High-volume threat actor'}`,
                `Map ${topGroupTTPs} to current detection gaps`,
                `Monitor for ${topGroupName} tooling updates targeting ${lowCoverage[0]?.tactic.replace(/-/g, ' ') || 'initial access'} tactics`,
                `Track emerging TTPs from groups exploiting ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ')).join(' and ')} gaps`,
                `Provide weekly intelligence briefings on APT activity relevant to uncovered techniques`
            ],
            priority: `Critical - ${topGroupName} actively exploits ${topGroup ? topGroup.gaps + ' uncovered techniques' : 'multiple detection gaps'}`
        },
        engineering: {
            focus: `Detection Development: Counter ${topGroupName} TTPs`,
            actions: [
                `Develop queries for ${topGroupTTPs} (${topGroupName} primary TTPs)`,
                `Create Sigma rules for ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ')).join(' and ')} tactics`,
                `Tune existing rules to reduce false positives on ${topGroup ? topGroup.topTechniques[0] || 'T1059' : 'command execution'} detections`,
                `Implement behavioral detections for ${topGroupAliases} tooling variants`,
                `Validate detections against ${topGroupName} known infrastructure patterns`
            ],
            priority: `Critical - ${topGroup ? topGroup.gaps + ' technique gaps' : 'Multiple gaps'} exploitable by ${topGroupName}`
        },
        soc: {
            focus: `Operational Readiness: ${topGroupName} Response`,
            actions: [
                `Update playbooks for ${topGroupName} TTPs: ${topGroupTTPs}`,
                `Conduct tabletop exercises simulating ${topGroupName} intrusion patterns`,
                `Review alert fatigue from detections targeting ${topGroup ? topGroup.topTechniques[0] || 'T1059' : 'common'} techniques`,
                `Document response procedures for ${topGroupAliases} indicators of compromise`,
                `Train analysts on ${topGroupName} operational patterns and infrastructure`
            ],
            priority: `High - ${topGroupName} activity requires immediate SOC readiness`
        },
        ir: {
            focus: `Incident Response: ${topGroupName} Containment`,
            actions: [
                `Prepare IR playbooks for ${topGroupName} intrusion scenarios`,
                `Develop forensic procedures for ${topGroupTTPs} artifacts`,
                `Review containment strategies for ${topGroupName} persistence mechanisms`,
                `Update threat hunting playbooks targeting ${topGroupAliases} infrastructure`,
                `Conduct purple team exercises simulating ${topGroupName} TTPs`
            ],
            priority: `High - ${topGroupName} requires dedicated IR preparedness`
        },
        vuln: {
            focus: 'Vulnerability-Driven Detection',
            actions: [
                `Map critical vulnerabilities to ${topGroupName} exploitation patterns`,
                `Prioritize detections for actively exploited vulnerabilities in ${lowCoverage[0]?.tactic.replace(/-/g, ' ') || 'execution'} tactics`,
                `Coordinate with patching teams on vulnerability timelines exploited by ${topGroupAliases}`,
                `Develop detections for vulnerability exploitation patterns used by ${topGroupName}`
            ],
            priority: 'Medium - Vulnerability-exploitation detection overlap'
        },
        network: {
            focus: `Network Detection: ${topGroupName} C2 Infrastructure`,
            actions: [
                `Deploy network-based detections for ${topGroupName} C2 communication patterns`,
                `Monitor for lateral movement techniques: ${topGroup ? topGroup.topTechniques.slice(1, 3).join(', ') : 'T1021, T1078'}`,
                `Implement DNS-based detections for data exfiltration patterns`,
                `Review network segmentation for ${topGroupName} lateral movement mitigation`,
                `Deploy TLS inspection for ${topGroupAliases} encrypted C2 channels`
            ],
            priority: `High - ${topGroupName} relies heavily on network-based operations`
        },
        endpoint: {
            focus: `Endpoint Hardening: Counter ${topGroupName}`,
            actions: [
                `Deploy EDR rules for ${topGroupName} execution techniques: ${topGroupTTPs}`,
                `Enhance process monitoring for ${topGroupAliases} privilege escalation patterns`,
                `Implement file integrity monitoring for ${topGroupName} persistence mechanisms`,
                `Review endpoint telemetry coverage for ${topGroupName} blind spots`,
                `Deploy application whitelisting for ${topGroup ? topGroup.topTechniques[0] || 'T1059' : 'script execution'} mitigation`
            ],
            priority: `Critical - Primary defense against ${topGroupName} endpoint operations`
        },
        cloud: {
            focus: 'Cloud Environment Security',
            actions: [
                `Deploy cloud-native detections for IAM-related techniques exploited by ${topGroupName}`,
                `Monitor for cloud storage exfiltration patterns targeting ${topGroupAliases} objectives`,
                `Implement detections for cloud infrastructure enumeration`,
                `Review cloud logging coverage for ${topGroupName} cloud operation gaps`
            ],
            priority: 'Medium - Growing attack surface in cloud environments'
        }
    };
    
    return recommendations[teamId] || { focus: 'General Security Operations', actions: ['Review coverage gaps', 'Develop detections', 'Monitor threats'], priority: 'Standard' };
}

export function getEditableTeamRecommendation(teamId, report) {
    const generated = getTeamRecommendations(teamId, report);
    const saved = report.teamRecommendations?.[teamId] || {};
    const savedActions = Array.isArray(saved.actions)
        ? saved.actions
        : String(saved.actions || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);

    return {
        focus: typeof saved.focus === 'string' && saved.focus.trim() ? saved.focus : generated.focus,
        priority: typeof saved.priority === 'string' && saved.priority.trim() ? saved.priority : generated.priority,
        actions: savedActions.length ? savedActions : generated.actions,
        generated
    };
}

export function getSentinelCandidatesForReport(report) {
    const candidates = [];
    const seenIds = new Set();
    const targetMonth = getReportMonth(report);
    const techniques = report.snapshot?.techniques || state.currentLayer?.techniques || [];

    techniques.forEach(ann => {
        (ann.queries || []).forEach(q => {
            const qMonth = typeof resolveQueryMonth === 'function'
                ? resolveQueryMonth(q, ann)
                : (q.monthAdded || (q.created ? q.created.slice(0, 7) : targetMonth));
            if (qMonth !== targetMonth) return;

            let isSentinel = q.sentinelCandidate;
            const activeTech = state.currentLayer?.techniques?.find(t => t.techniqueID === ann.techniqueID);
            const activeQuery = activeTech?.queries?.find(lq => lq.id === q.id || (lq.name === q.name && lq.language === q.language));
            if (activeQuery && isSentinel === undefined) isSentinel = activeQuery.sentinelCandidate;

            const candidateKey = q.id || `${ann.techniqueID}:${q.name || ''}:${q.language || ''}`;
            if (isSentinel && !seenIds.has(candidateKey)) {
                seenIds.add(candidateKey);
                candidates.push({
                    id: q.id || candidateKey,
                    name: q.name || 'Unnamed Query',
                    techniqueID: ann.techniqueID,
                    techniqueName: getTechniqueName(ann.techniqueID) || ann.techniqueID,
                    language: q.language || 'Unknown'
                });
            }
        });
    });

    return candidates;
}

function buildSentinelCandidatesExport(report, isDark = false) {
    const candidates = getSentinelCandidatesForReport(report);
    if (!candidates.length) return '';

    return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-top: 10px; background-color: ${isDark ? '#0c1424' : '#eff6ff'}; border: 1px solid ${isDark ? '#1e3a8a' : '#bfdbfe'};">
            <tr>
                <td style="padding: 10px 12px; border: none;">
                    <div style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;">${reportIcon('robot', '#3b82f6', 14)}Microsoft Sentinel Candidate Queue (${candidates.length})</div>
                    ${candidates.map(c => `
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; border-top: 1px solid ${isDark ? '#1e3a8a' : '#bfdbfe'};">
                            <tr>
                                <td style="padding: 6px 0; border: none; vertical-align: top;">
                                    <div style="font-size: 12px; font-weight: 600; color: ${isDark ? '#e2e8f0' : '#0f172a'};">${escapeHtml(c.name)}</div>
                                    <div style="font-size: 10px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-top: 2px; font-style: italic;">Please see Tier 4: New Threat Hunt Queries for full details.</div>
                                </td>
                                <td align="right" style="padding: 6px 0 6px 8px; border: none; vertical-align: top; width: 90px;">
                                    <span style="font-size: 9px; font-weight: 700; color: ${isDark ? '#bfdbfe' : '#1d4ed8'}; background-color: ${isDark ? '#172554' : '#dbeafe'}; padding: 2px 6px; display: inline-block;">${escapeHtml(c.language)}</span>
                                </td>
                            </tr>
                        </table>
                    `).join('')}
                </td>
            </tr>
        </table>
    `;
}

function buildReportBasisNoteExport(report, isDark = false) {
    return `
        <div class="section" id="report-basis" style="page-break-inside: avoid; background-color: ${isDark ? '#121324' : '#f8fafc'}; border: 1px solid ${isDark ? '#25263b' : '#e2e8f0'}; padding: 14px 16px; margin-bottom: 18px;">
            <h3 style="margin-bottom: 8px;">Report Basis</h3>
            <p style="font-size: 12.5px; color: ${isDark ? '#cbd5e1' : '#475569'}; line-height: 1.55; margin: 0;">${escapeHtml(getReportBasisText(report))}</p>
        </div>
    `;
}

function buildTopNextActionsExport(report, isDark = false) {
    const actions = getTopNextActions(report);
    const border = isDark ? '#25263b' : '#e2e8f0';
    const panel = isDark ? '#121324' : '#f8fafc';
    const text = isDark ? '#cbd5e1' : '#475569';
    const heading = isDark ? '#ffffff' : '#0f172a';
    return `
        <div class="section" id="top-next-actions" style="page-break-inside: avoid;"><a name="top-next-actions"></a>
            <h3>Top 3 Next Actions</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                ${actions.map((action, index) => `
                    <tr>
                        <td style="width: 34px; border: 1px solid ${border}; background-color: ${panel}; color: ${heading}; font-weight: 800; text-align: center; vertical-align: top;">${index + 1}</td>
                        <td style="border: 1px solid ${border}; background-color: ${panel}; vertical-align: top;">
                            <div style="font-size: 9px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0284c7'}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">${escapeHtml(action.priority)}</div>
                            <div style="font-size: 13px; font-weight: 700; color: ${heading}; margin-bottom: 4px;">${escapeHtml(action.title)}</div>
                            <div style="font-size: 12px; color: ${text}; line-height: 1.5;">${escapeHtml(action.detail)}</div>
                        </td>
                    </tr>
                `).join('')}
            </table>
        </div>
    `;
}

function buildTeamAssignmentsExport(report, isDark = false) {
    const assignedTeams = report.teamAssignments || [];
    const border = isDark ? '#25263b' : '#e2e8f0';
    const panel = isDark ? '#121324' : '#fafafa';
    const text = isDark ? '#cbd5e1' : '#475569';
    let teamHtml = `<div class="section" id="team-assignments" style="page-break-inside: avoid;"><a name="team-assignments"></a><h3>Team Assignments &amp; Focus Areas</h3>`;

    if (assignedTeams.length === 0) {
        return teamHtml + `<p style="font-size: 12.5px; color: ${text}; margin: 0;">No teams assigned for this report.</p></div>`;
    }

    teamHtml += `<table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">`;
    assignedTeams.forEach(teamId => {
        const team = TEAM_OPTIONS.find(t => t.id === teamId);
        if (!team) return;
        const rec = getEditableTeamRecommendation(teamId, report);
        const sentinelHtml = teamId === 'engineering' ? buildSentinelCandidatesExport(report, isDark) : '';
        teamHtml += `
            <tr>
                <td style="padding: 12px; border: 1px solid ${border}; vertical-align: top; background-color: ${panel};">
                    <div style="font-size: 12px; font-weight: 700; color: ${team.color}; margin-bottom: 6px;">${escapeHtml(team.label)}</div>
                    <div style="font-size: 11px; color: ${text}; margin-bottom: 4px;"><strong>Focus:</strong> ${escapeHtml(rec.focus)}</div>
                    <div style="font-size: 11px; color: ${text}; margin-bottom: 4px;"><strong>Priority:</strong> ${escapeHtml(rec.priority)}</div>
                    <div style="font-size: 11px; color: ${text};"><strong>Actions:</strong>
                        <ul style="margin: 4px 0 0 0; padding-left: 16px;">
                            ${rec.actions.map(a => `<li style="margin-bottom: 2px;">${escapeHtml(a)}</li>`).join('')}
                        </ul>
                    </div>
                    ${sentinelHtml}
                </td>
            </tr>`;
    });
    teamHtml += '</table></div>';
    return teamHtml;
}

function buildDetectionResultsExport(report, isDark = false) {
    const results = report.detectionResults || [];
    if (results.length === 0) {
        return `<div class="section" id="detection-results" style="page-break-inside: avoid;"><a name="detection-results"></a><h3>Active Hunt Detections</h3><p style="font-size: 12.5px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin: 0;">No detection results recorded for this period.</p></div>`;
    }
    return `
        <div class="section" id="detection-results" style="page-break-inside: avoid;"><a name="detection-results"></a>
            <h3>Active Hunt Detections</h3>
            <p style="margin-bottom: 12px; font-size: 13px; color: ${isDark ? '#cbd5e1' : '#475569'};">Live alerts and indicators detected during this period's hunts:</p>
            ${results.map(r => `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin-bottom:12px;" class="detection-item">
                    <tr>
                        <td style="padding:14px 18px; border:none; vertical-align:middle; text-align:left;">
                            <strong>${escapeHtml(r.huntName || 'Untitled')}</strong>
                            ${r.sirTicket ? `<span class="badge-yellow">SIR: ${escapeHtml(r.sirTicket)}</span>` : ''}
                            ${r.notes ? `<div class="notes" style="margin-top:8px;">${markdownToHtml(r.notes)}</div>` : ''}
                        </td>
                    </tr>
                </table>
            `).join('')}
        </div>
    `;
}

function buildStatusChangesExport(report, isDark = false) {
    const month = getReportMonth(report);
    const savedChanges = report.changes?.colorChanges || report.changes?.all?.filter(change => change.type === 'color_change').map(change => change.data) || [];
    const changes = getColorChangesForMonth(month);
    const effectiveChanges = changes.length ? changes : savedChanges;
    if (!effectiveChanges.length) return '';

    const border = isDark ? '#25263b' : '#e2e8f0';
    const panel = isDark ? '#121324' : '#f8fafc';
    const text = isDark ? '#cbd5e1' : '#475569';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const heading = isDark ? '#ffffff' : '#0f172a';

    return `
        <div class="section" id="status-coverage-changes" style="page-break-inside: avoid;"><a name="status-coverage-changes"></a>
            <h3>${reportIcon('warning', isDark ? '#fbbf24' : '#d97706', 14)}Status &amp; Coverage Changes</h3>
            <p style="font-size: 12px; color: ${muted}; margin-bottom: 10px;">Colour/status changes detected for ${escapeHtml(getReportMonthLabel(report))}. Labels reflect the rule that actually drove the colour change.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <thead><tr><th>Technique</th><th>Name</th><th>Previous</th><th>Current</th><th>Query</th></tr></thead>
                <tbody>
                    ${effectiveChanges.map(change => `
                        <tr>
                            <td style="font-family: monospace; font-weight: 700; color: ${heading};">${escapeHtml(change.techniqueID)}</td>
                            <td style="color: ${text};">${escapeHtml(getTechniqueName(change.techniqueID) || 'Unknown')}</td>
                            <td><span style="display:inline-block;width:10px;height:10px;background:${change.from || 'transparent'};border:1px solid ${change.from || border};vertical-align:-1px;margin-right:4px;"></span>${escapeHtml(change.fromLabel === 'None' ? 'Unassigned' : change.fromLabel)}</td>
                            <td><span style="display:inline-block;width:10px;height:10px;background:${change.to || 'transparent'};border:1px solid ${change.to || border};vertical-align:-1px;margin-right:4px;"></span>${escapeHtml(change.toLabel === 'None' ? 'Unassigned' : change.toLabel)}</td>
                            <td style="color: ${muted};">${escapeHtml(change.queryName || '')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function buildTeamAssignmentsSection(report) {
    const assignedTeams = report.teamAssignments || [];
    const safeReportId = escapeHtml(report.id || '');
    
    let html = `
        <div class="team-assignments-wrapper">
            <div class="team-assignments-header">
                <div class="team-select-wrapper">
                    <label class="team-select-label">Assign Teams:</label>
                    <select class="team-select" id="team-assignment-select" data-report-action="add-team" data-report-id="${safeReportId}">
                        <option value="">Select a team to assign...</option>
                        ${TEAM_OPTIONS.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div id="team-assignments-list" class="team-assignments-list">
    `;
    
    if (assignedTeams.length === 0) {
        html += `
            <div class="team-assignments-empty">
                <i class="bi bi-people"></i>
                <p>No teams assigned yet. Select teams above to generate dynamic recommendations.</p>
            </div>
        `;
    } else {
        assignedTeams.forEach(teamId => {
            const team = TEAM_OPTIONS.find(t => t.id === teamId);
            if (!team) return;
            const rec = getEditableTeamRecommendation(teamId, report);
            
            let sentinelHtml = '';
            if (teamId === 'engineering') {
                const candidates = getSentinelCandidatesForReport(report);
                
                if (candidates.length > 0) {
                    sentinelHtml = `
                        <div class="sentinel-candidates-section" style="margin-top: 15px; padding: 12px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 6px;">
                            <h6 style="color: #3b82f6; font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                                <i class="bi bi-robot"></i> Microsoft Sentinel Candidate Queue (${candidates.length})
                            </h6>
                            <div class="candidates-list" style="max-height: 200px; overflow-y: auto;">
                                ${candidates.map(c => {
                                    const language = getSafeReportLanguage(c.language);
                                    return `
                                    <div class="candidate-item" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                        <div>
                                            <div style="font-size: 12px; font-weight: 500; color: var(--on-surface);">${escapeHtml(c.name)}</div>
                                            <div style="font-size: 10px; color: var(--on-surface-muted); margin-top: 2px;"><i>(View full details in Tier 4: New Queries)</i></div>
                                        </div>
                                        <span class="query-lang-badge ${language.className}" style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: var(--surface-subtle);">${language.label}</span>
                                    </div>
                                `}).join('')}
                            </div>
                        </div>
                    `;
                }
            }
            
            html += `
                <div class="team-assignment-card" data-team="${escapeHtml(teamId)}">
                    <div class="team-assignment-header">
                        <div class="team-assignment-title">
                            <i class="bi ${team.icon}" style="color: ${team.color};"></i>
                            <span>${team.label}</span>
                        </div>
                        <button class="team-remove-btn" data-report-action="remove-team" data-report-id="${safeReportId}" data-team-id="${escapeHtml(teamId)}" title="Remove team">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                    <div class="team-assignment-focus">
                        <label><strong>Focus Area</strong></label>
                        <input type="text" class="form-control form-control-sm" value="${escapeHtml(rec.focus)}" data-report-action="update-team-recommendation" data-report-id="${safeReportId}" data-team-id="${escapeHtml(teamId)}" data-team-field="focus">
                    </div>
                    <div class="team-assignment-priority" style="border-left-color: ${team.color};">
                        <label><strong>Priority</strong></label>
                        <input type="text" class="form-control form-control-sm" value="${escapeHtml(rec.priority)}" data-report-action="update-team-recommendation" data-report-id="${safeReportId}" data-team-id="${escapeHtml(teamId)}" data-team-field="priority">
                    </div>
                    <div class="team-assignment-actions">
                        <label><strong>Recommended Actions</strong></label>
                        <textarea class="form-control form-control-sm" rows="5" data-report-action="update-team-recommendation" data-report-id="${safeReportId}" data-team-id="${escapeHtml(teamId)}" data-team-field="actions">${escapeHtml(rec.actions.join('\n'))}</textarea>
                        <div class="team-rec-hint">Generated from current coverage/threat data. Edits are saved with this report.</div>
                    </div>
                    ${sentinelHtml}
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

window.addTeamAssignment = function(reportId, teamId) {
    if (!teamId) return;
    const reports = state._cachedReports || [];
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    
    if (!report.teamAssignments) report.teamAssignments = [];
    if (report.teamAssignments.includes(teamId)) return;
    
    report.teamAssignments.push(teamId);
    saveReport(report);
    
    const container = document.getElementById('team-assignments-container');
    if (container) {
        container.innerHTML = buildTeamAssignmentsSection(report);
    }
};

window.removeTeamAssignment = function(reportId, teamId) {
    const reports = state._cachedReports || [];
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    
    report.teamAssignments = (report.teamAssignments || []).filter(t => t !== teamId);
    saveReport(report);
    
    const container = document.getElementById('team-assignments-container');
    if (container) {
        container.innerHTML = buildTeamAssignmentsSection(report);
    }
};

export function updateTeamRecommendation(reportId, teamId, field, value) {
    const reports = state._cachedReports || [];
    const report = reports.find(r => r.id === reportId);
    if (!report || !teamId || !field) return;

    report.teamRecommendations = report.teamRecommendations || {};
    report.teamRecommendations[teamId] = report.teamRecommendations[teamId] || {};
    if (field === 'actions') {
        report.teamRecommendations[teamId].actions = String(value || '')
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean);
    } else if (field === 'focus' || field === 'priority') {
        report.teamRecommendations[teamId][field] = String(value || '').trim();
    }

    saveReport(report);
}

export function buildRiskHeatMap(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    
    // Get top threat groups
    if (!state.groups || state.groups.length === 0) {
        return '<p class="text-on-surface-tertiary">No threat group data available.</p>';
    }
    
    const allGroups = state.groups.map(group => {
        const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
        const relatedTechs = techRels.map(r => state.techniques.find(tech => tech.id === r.target_ref)).filter(Boolean);
        
        const coveredCount = relatedTechs.filter(tech => {
            const tid = tech.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        
        const techCount = relatedTechs.length;
        const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
        const gaps = techCount - coveredCount;
        
        // Calculate likelihood based on threat actor activity level
        // High: 150+ techniques (major APTs), Medium: 50-149, Low: <50
        const likelihood = techCount >= 150 ? 'High' : techCount >= 50 ? 'Medium' : 'Low';
        
        // Calculate impact based on coverage gap - aligns with Gap Mapper risk levels
        // Critical: <30% coverage (major blind spot), High: 30-50%, Medium: 50-70%, Low: >70%
        const impact = coveragePct < 30 ? 'Critical' : coveragePct < 50 ? 'High' : coveragePct < 70 ? 'Medium' : 'Low';
        
        return {
            name: group.name,
            techCount: techCount,
            coveragePct: coveragePct,
            gaps: gaps,
            likelihood: likelihood,
            impact: impact
        };
    }).sort((a, b) => {
        // Sort by risk: Critical-High first, then by gaps
        const riskOrder = { 'Critical-High': 0, 'Critical-Medium': 1, 'Critical-Low': 2, 'High-High': 3, 'High-Medium': 4, 'High-Low': 5, 'Medium-High': 6, 'Medium-Medium': 7, 'Medium-Low': 8, 'Low-High': 9, 'Low-Medium': 10, 'Low-Low': 11 };
        const riskA = riskOrder[`${a.impact}-${a.likelihood}`] || 12;
        const riskB = riskOrder[`${b.impact}-${b.likelihood}`] || 12;
        return riskA - riskB || b.gaps - a.gaps;
    }).slice(0, 12);
    
    // Define heat map quadrants - aligned with Gap Mapper risk levels
    const quadrants = {
        'Critical-High': { color: '#ef4444', label: 'Critical Risk', desc: 'Immediate action required' },
        'Critical-Medium': { color: '#ef4444', label: 'Critical Risk', desc: 'Immediate action required' },
        'Critical-Low': { color: '#f97316', label: 'High Risk', desc: 'Priority attention needed' },
        'High-High': { color: '#f97316', label: 'High Risk', desc: 'Priority attention needed' },
        'High-Medium': { color: '#f97316', label: 'High Risk', desc: 'Priority attention needed' },
        'High-Low': { color: '#eab308', label: 'Moderate Risk', desc: 'Monitor and plan' },
        'Medium-High': { color: '#eab308', label: 'Moderate Risk', desc: 'Monitor and plan' },
        'Medium-Medium': { color: '#22c55e', label: 'Low Risk', desc: 'Maintain current posture' },
        'Medium-Low': { color: '#22c55e', label: 'Low Risk', desc: 'Maintain current posture' },
        'Low-High': { color: '#22c55e', label: 'Low Risk', desc: 'Maintain current posture' },
        'Low-Medium': { color: '#22c55e', label: 'Low Risk', desc: 'Maintain current posture' },
        'Low-Low': { color: '#22c55e', label: 'Low Risk', desc: 'Maintain current posture' }
    };
    
    // Group threats by quadrant
    const quadrantMap = {};
    allGroups.forEach(g => {
        const key = `${g.impact}-${g.likelihood}`;
        if (!quadrantMap[key]) quadrantMap[key] = [];
        quadrantMap[key].push(g);
    });
    
    let html = '<div class="risk-heatmap-container">';
    
    // Heat map grid (Impact on Y-axis, Likelihood on X-axis)
    html += '<div class="risk-heatmap-grid">';
    
    // Header row
    html += '<div class="risk-heatmap-cell risk-heatmap-header"></div>';
    html += '<div class="risk-heatmap-cell risk-heatmap-header">Low Likelihood</div>';
    html += '<div class="risk-heatmap-cell risk-heatmap-header">Medium Likelihood</div>';
    html += '<div class="risk-heatmap-cell risk-heatmap-header">High Likelihood</div>';
    
    // Critical Impact row
    html += '<div class="risk-heatmap-cell risk-heatmap-label">Critical Impact</div>';
    ['Critical-Low', 'Critical-Medium', 'Critical-High'].forEach(key => {
        const q = quadrants[key];
        const groups = quadrantMap[key] || [];
        html += `<div class="risk-heatmap-cell risk-heatmap-quadrant" style="background-color: ${q.color}15; border-color: ${q.color}50;">
            ${groups.length > 0 ? `<div class="risk-heatmap-count" style="color: ${q.color};">${groups.length}</div>
            <div class="risk-heatmap-groups">${groups.map(g => `<span class="risk-heatmap-group" title="${g.name}: ${g.coveragePct}% coverage, ${g.gaps} gaps">${g.name.split(' ')[0]}</span>`).join('')}</div>` : '<div class="risk-heatmap-empty">-</div>'}
        </div>`;
    });
    
    // High Impact row
    html += '<div class="risk-heatmap-cell risk-heatmap-label">High Impact</div>';
    ['High-Low', 'High-Medium', 'High-High'].forEach(key => {
        const q = quadrants[key];
        const groups = quadrantMap[key] || [];
        html += `<div class="risk-heatmap-cell risk-heatmap-quadrant" style="background-color: ${q.color}15; border-color: ${q.color}50;">
            ${groups.length > 0 ? `<div class="risk-heatmap-count" style="color: ${q.color};">${groups.length}</div>
            <div class="risk-heatmap-groups">${groups.map(g => `<span class="risk-heatmap-group" title="${g.name}: ${g.coveragePct}% coverage, ${g.gaps} gaps">${g.name.split(' ')[0]}</span>`).join('')}</div>` : '<div class="risk-heatmap-empty">-</div>'}
        </div>`;
    });
    
    // Medium Impact row
    html += '<div class="risk-heatmap-cell risk-heatmap-label">Medium Impact</div>';
    ['Medium-Low', 'Medium-Medium', 'Medium-High'].forEach(key => {
        const q = quadrants[key];
        const groups = quadrantMap[key] || [];
        html += `<div class="risk-heatmap-cell risk-heatmap-quadrant" style="background-color: ${q.color}15; border-color: ${q.color}50;">
            ${groups.length > 0 ? `<div class="risk-heatmap-count" style="color: ${q.color};">${groups.length}</div>
            <div class="risk-heatmap-groups">${groups.map(g => `<span class="risk-heatmap-group" title="${g.name}: ${g.coveragePct}% coverage, ${g.gaps} gaps">${g.name.split(' ')[0]}</span>`).join('')}</div>` : '<div class="risk-heatmap-empty">-</div>'}
        </div>`;
    });
    
    // Low Impact row
    html += '<div class="risk-heatmap-cell risk-heatmap-label">Low Impact</div>';
    ['Low-Low', 'Low-Medium', 'Low-High'].forEach(key => {
        const q = quadrants[key];
        const groups = quadrantMap[key] || [];
        html += `<div class="risk-heatmap-cell risk-heatmap-quadrant" style="background-color: ${q.color}15; border-color: ${q.color}50;">
            ${groups.length > 0 ? `<div class="risk-heatmap-count" style="color: ${q.color};">${groups.length}</div>
            <div class="risk-heatmap-groups">${groups.map(g => `<span class="risk-heatmap-group" title="${g.name}: ${g.coveragePct}% coverage, ${g.gaps} gaps">${g.name.split(' ')[0]}</span>`).join('')}</div>` : '<div class="risk-heatmap-empty">-</div>'}
        </div>`;
    });
    
    html += '</div>';
    
    // Legend
    html += '<div class="risk-heatmap-legend">';
    html += '<div class="risk-legend-item"><span class="risk-legend-color" style="background-color: #ef4444;"></span> Critical Risk (&lt;30% coverage) - Immediate action required</div>';
    html += '<div class="risk-legend-item"><span class="risk-legend-color" style="background-color: #f97316;"></span> High Risk (30-50% coverage) - Priority attention needed</div>';
    html += '<div class="risk-legend-item"><span class="risk-legend-color" style="background-color: #eab308;"></span> Moderate Risk (50-70% coverage) - Monitor and plan</div>';
    html += '<div class="risk-legend-item"><span class="risk-legend-color" style="background-color: #22c55e;"></span> Low Risk (&gt;70% coverage) - Maintain current posture</div>';
    html += '</div>';
    
    html += '</div>';
    
    return html;
}

export function generateDynamicExecutiveSummary(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const stats = getMonthStats(month);
    
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const overallCoverage = coverageStats.pct % 1 === 0 ? coverageStats.pct : coverageStats.pct.toFixed(1);
    
    const mappedThreatEntities = getThreatsDisruptedCount(month);
    
    let summary = `This ${report.type === 'initial' ? 'initial assessment' : 'monthly update'} report covers threat hunting activities for ${report.reportMonth || month}. `;
    
    if (coverageStats.parents && coverageStats.parents.total) {
        const allPct = coverageStats.all.pct % 1 === 0 ? coverageStats.all.pct : coverageStats.all.pct.toFixed(1);
        summary += `Overall detection coverage stands at ${overallCoverage}% across ${coverageStats.parents.covered} of ${coverageStats.parents.total} parent techniques (or ${allPct}% across ${coverageStats.all.covered} of ${coverageStats.all.total} total techniques and sub-techniques). `;
    } else {
        summary += `Overall detection coverage stands at ${overallCoverage}% across ${coverageStats.covered} of ${coverageStats.total} techniques. `;
    }
    
    if (stats.mainTechs > 0 || stats.subTechs > 0) {
        summary += `During this period, ${stats.mainTechs} new technique${stats.mainTechs !== 1 ? 's' : ''} and ${stats.subTechs} sub-technique${stats.subTechs !== 1 ? 's' : ''} were added to the detection portfolio, `;
        summary += `resulting in ${stats.queries} new detection quer${stats.queries !== 1 ? 'ies' : 'y'} added. `;
    }
    
    if (mappedThreatEntities > 0) {
        summary += `Current coverage maps to ${mappedThreatEntities} threat groups and tools through ATT&CK relationships, indicating where deployed detections overlap known adversary behavior. `;
    }
    
    summary += `These queries represent our active detection logging efforts across the enterprise, providing visibility into adversary behaviors aligned with the MITRE ATT&CK framework.`;
    
    return summary;
}

export function updateMethodologyField(reportId, category, field, checked) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report[category]) report[category] = {};
        report[category][field] = checked;
        saveReport(report);
    }
}

export function updateAppendixField(reportId, field, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report.appendix) report.appendix = {};
        report.appendix[field] = value;
        saveReport(report);
    }
}

export function addDetectionResult(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report.detectionResults) report.detectionResults = [];
        report.detectionResults.push({ huntName: '', sirTicket: '', notes: '' });
        saveReport(report).then(() => viewReport(reportId));
    }
}

export function removeDetectionResult(reportId, idx) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.detectionResults) {
        report.detectionResults.splice(idx, 1);
        saveReport(report).then(() => viewReport(reportId));
    }
}

export function updateDetectionResult(reportId, idx, field, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.detectionResults && report.detectionResults[idx]) {
        report.detectionResults[idx][field] = value;
        saveReport(report);
    }
}

export function addReference(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report) {
        if (!report.references) report.references = [];
        report.references.push('');
        saveReport(report).then(() => viewReport(reportId));
    }
}

export function removeReference(reportId, idx) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.references) {
        report.references.splice(idx, 1);
        saveReport(report).then(() => viewReport(reportId));
    }
}

export function updateReference(reportId, idx, value) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (report && report.references) {
        report.references[idx] = value;
        saveReport(report);
    }
}

export async function confirmDeleteReport(reportId) {
    if (confirm('Delete this report? This action cannot be undone.')) {
        await deleteReport(reportId);
        showToast('Report deleted', 'success');
        loadReportsList();
    }
}

export function saveAndValidateReport(reportId) {
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

export async function exportReportHTMLPDF(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    await ensureAttackVersionAppendixDiff(report, true);
    showToast('Opening print-ready HTML PDF view...', 'info');
    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;
    const htmlContent = buildEmailHTML(report, isDark, { isPrint: true, isStandaloneHtml: true }).replace('<body>', '<body class="is-pdf">');
    const printBodyBg = isDark ? '#070814' : '#ffffff';
    const printWindow = window.open('', '_blank', 'width=900,height=1100');

    if (!printWindow) {
        showToast('Pop-up blocked. Allow pop-ups to export PDF.', 'warning');
        return;
    }

    try {
        printWindow.document.open();
        printWindow.document.write(htmlContent.replace('</style>', `
            @page { size: A4; margin: 14mm; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            @media print {
                body { background: ${printBodyBg} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .email-wrapper { max-width: none !important; width: 100% !important; padding: 0 !important; }
                .container { box-shadow: none !important; border-radius: 0 !important; background-color: ${isDark ? '#0f1123' : '#ffffff'} !important; }
                .content { background-color: ${isDark ? '#0f1123' : '#ffffff'} !important; }
                .pdf-page-break { break-before: page; page-break-before: always; }
                a { color: inherit; text-decoration: none; }
            }
        </style>`));
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
        showToast('Print dialog opened. Choose Save as PDF.', 'success');
    } catch (e) {
        console.error('HTML to PDF print export failed:', e);
        showToast('Failed to open PDF print view: ' + e.message, 'error');
    }
}

export async function exportReportHTML(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    await ensureAttackVersionAppendixDiff(report, true);
    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;
    const htmlContent = buildEmailHTML(report, isDark, {
        isStandaloneHtml: true
    });
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.download = `report_${reportId}.html`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('HTML exported', 'success');
}

async function buildReportSvgDataUrl(report, isDark = false) {
    await window.ensureHtmlToImage?.();
    if (typeof window.htmlToImage === 'undefined') {
        throw new Error('SVG library could not be loaded');
    }

    const htmlContent = buildEmailHTML(report, isDark, { isStandaloneHtml: true });
    const container = document.createElement('div');
    container.style.cssText = isDark
        ? 'width:900px;background:#070814;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#cbd5e1;position:absolute;top:-9999px;left:-9999px;'
        : 'width:900px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1e293b;position:absolute;top:-9999px;left:-9999px;';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    try {
        return await window.htmlToImage.toSvg(container, {
            filter: (node) => node.tagName !== 'SCRIPT'
        });
    } finally {
        document.body.removeChild(container);
    }
}

export async function exportReportSVG(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    await ensureAttackVersionAppendixDiff(report, true);

    showToast('Generating SVG...', 'info');

    const isDark = document.getElementById('export-dark-mode-toggle')?.checked || false;

    try {
        const svgDataUrl = await buildReportSvgDataUrl(report, isDark);
        const link = document.createElement('a');
        link.download = `report_${reportId}.svg`;
        link.href = svgDataUrl;
        link.click();
        showToast('SVG exported', 'success');
    } catch (e) {
        console.error('SVG generation failed:', e);
        showToast('Failed to generate SVG: ' + e.message, 'error');
    }
}

export function buildEmailMonthlyActivity(report, theme, isDark = false) {
    return generateUnifiedChangelog(report, true, theme, isDark);
}


export function buildGapAnalysisVisual(report, theme, isDark = false) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    if (tactics.length === 0) return '';
    
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80).sort((a, b) => a.coverage - b.coverage);
    const highCoverage = tactics.filter(t => t.coverage >= 80).sort((a, b) => b.coverage - a.coverage);
    
    let html = `
        <div class="section" id="gap-analysis" style="page-break-inside: avoid;"><a name="gap-analysis"></a>
            <h3>Gap Analysis & Prioritization</h3>
            <p style="margin-bottom: 12px; font-size: 13px; color: ${isDark ? '#cbd5e1' : '#475569'};">A granular assessment of coverage across all tactics, with recommended immediate action items to address visibility gaps.</p>
    `;
    
    // Critical Gaps Panel
    if (lowCoverage.length > 0) {
        const items = lowCoverage.map(t => {
            const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 6px; background-color: ${isDark ? '#1a0b0b' : '#ffffff'}; border: 1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'}; border-radius: 6px;">
                    <tr>
                        <td style="padding: 8px 12px; font-size: 12px; text-align: left; vertical-align: middle; border: none;">
                            <strong style="color: ${isDark ? '#fca5a5' : '#991b1b'};">${tacticName}</strong>
                            <span style="color: #64748b; margin-left: 6px;">(${t.withQueries}/${t.total} techniques)</span>
                        </td>
                        <td align="right" style="padding: 8px 12px; font-size: 12px; text-align: right; vertical-align: middle; border: none; width: 120px;">
                            <span style="font-weight: 700; color: ${isDark ? '#f87171' : '#ef4444'}; background-color: ${isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'}; padding: 2px 8px; border-radius: 4px; font-size: 10px; display: inline-block;">${t.coverage.toFixed(1)}% Coverage</span>
                        </td>
                    </tr>
                </table>
            `;
        }).join('');
        
        html += `
            <div style="background-color: ${isDark ? '#140c0c' : '#fffafb'}; border: 1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'}; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    ${reportIcon('warning', '#ef4444', 13)}CRITICAL VISIBILITY GAPS (&lt;50% COVERAGE)
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
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 6px; background-color: ${isDark ? '#1c150c' : '#ffffff'}; border: 1px solid ${isDark ? 'rgba(217, 119, 6, 0.2)' : '#fef3c7'}; border-radius: 6px;">
                    <tr>
                        <td style="padding: 8px 12px; font-size: 12px; text-align: left; vertical-align: middle; border: none;">
                            <strong style="color: ${isDark ? '#fcd34d' : '#92400e'};">${tacticName}</strong>
                            <span style="color: #64748b; margin-left: 6px;">(${t.withQueries}/${t.total} techniques)</span>
                        </td>
                        <td align="right" style="padding: 8px 12px; font-size: 12px; text-align: right; vertical-align: middle; border: none; width: 120px;">
                            <span style="font-weight: 700; color: ${isDark ? '#fbbf24' : '#d97706'}; background-color: ${isDark ? 'rgba(217, 119, 6, 0.15)' : '#fef3c7'}; padding: 2px 8px; border-radius: 4px; font-size: 10px; display: inline-block;">${t.coverage.toFixed(1)}% Coverage</span>
                        </td>
                    </tr>
                </table>
            `;
        }).join('');
        
        html += `
            <div style="background-color: ${isDark ? '#16120d' : '#fffdf5'}; border: 1px solid ${isDark ? 'rgba(217, 119, 6, 0.2)' : '#fef3c7'}; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    [&gt;] MODERATE DEPLOYMENTS (50% - 80% COVERAGE)
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
        <div style="background-color: ${isDark ? '#121324' : '#f8fafc'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}; border-radius: 8px; padding: 14px;">
            <div style="font-size: 12px; font-weight: 700; color: ${isDark ? '#ffffff' : '#475569'}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                [&gt;&gt;] PRIORITIZED STRATEGIC ROADMAP
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

export function buildEmailHTML(report, isDark = false, options = {}) {
    const isPrint = !!options.isPrint;
    const isEmail = !!options.isEmail;
    const isStandaloneHtml = !!options.isStandaloneHtml;
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
    
    // Theme solid color fallbacks for Outlook background rendering
    const THEME_SOLID_FALLBACKS = {
        blue: '#0f172a',
        orange: '#1a0f00',
        green: '#052e16',
        purple: '#1a0a2e',
        red: '#2a0a0a',
        teal: '#042f2e',
        slate: '#1e293b'
    };
    const fallbackBg = THEME_SOLID_FALLBACKS[report.bannerTheme || 'blue'] || THEME_SOLID_FALLBACKS.blue;
    
    // Month stats for stats bar
    const month = getReportMonth(report);
    const reportMonthLabel = getReportMonthLabel(report);
    const reportTitle = getReportTitle(report);
    const logoSrc = safeImageSrc(report.companyLogo);
    
    const execSummary = report.executiveSummary || generateDynamicExecutiveSummary(report);
    const monthlyFocus = report.monthlyFocus || generateDynamicMonthlyFocus(report);
    const gapAnalysis = report.gapAnalysis || generateDynamicGapAnalysis(report);
    const leadership = report.leadershipOverview || generateLeadershipOverview(report);
    const recommendations = report.recommendations || generateDynamicRecommendations(report);
    const bodyInline = isEmail
        ? isDark
            ? ' style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#cbd5e1;background-color:#070814;"'
            : ' style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;"'
        : isDark
            ? ' style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;line-height:1.6;color:#cbd5e1;background-color:#070814;"'
            : ' style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;"';
    const wrapperInline = isEmail
        ? isDark
            ? ' style="width:680px;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#cbd5e1;background-color:#070814;"'
            : ' style="width:680px;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;"'
        : isDark
            ? ` style="max-width:${isStandaloneHtml ? '900px' : '680px'};margin:0 auto;padding:24px 16px;color:#cbd5e1;background-color:#070814;"`
            : ` style="max-width:${isStandaloneHtml ? '900px' : '680px'};margin:0 auto;padding:24px 16px;color:#1e293b;background-color:#f8fafc;"`;
    const containerInline = isEmail
        ? isDark
            ? ' style="width:680px;background-color:#0f1123;border:1px solid #25263b;color:#cbd5e1;"'
            : ' style="width:680px;background-color:#ffffff;border:1px solid #e2e8f0;color:#1e293b;"'
        : isDark
            ? ` style="background-color:#0f1123;border:1px solid rgba(${accentRgb},0.2);border-radius:12px;overflow:hidden;color:#cbd5e1;"`
            : ' style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;color:#1e293b;"';
    const headerInline = isEmail
        ? ` style="background-color:${fallbackBg};color:#ffffff;padding:28px;text-align:center;border-bottom:3px solid ${theme.accent};font-family:Arial,Helvetica,sans-serif;"`
        : ` style="background-color:${fallbackBg};color:#ffffff;padding:32px 28px 28px;text-align:center;border-bottom:3px solid ${theme.accent};"`;
    const contentInline = isEmail
        ? isDark
            ? ' style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;background-color:#0f1123;color:#cbd5e1;"'
            : ' style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;background-color:#ffffff;color:#1e293b;"'
        : isDark
            ? ' style="padding:24px 28px;background-color:#0f1123;color:#cbd5e1;"'
            : ' style="padding:24px 28px;background-color:#ffffff;color:#1e293b;"';
    const footerInline = isEmail
        ? isDark
            ? ' style="background-color:#070814;padding:16px 28px;text-align:center;border-top:1px solid #25263b;font-family:Arial,Helvetica,sans-serif;color:#64748b;"'
            : ' style="background-color:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#94a3b8;"'
        : isDark
            ? ' style="background-color:#070814;padding:16px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);color:#64748b;"'
            : ' style="background-color:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;color:#94a3b8;"';
    const standaloneToolbarHtml = isStandaloneHtml ? `
        <div class="html-export-toolbar" role="navigation" aria-label="Export navigation">
            <strong>${escapeHtml(reportTitle)}</strong>
            <span>Generated ${escapeHtml(report.generatedDate || new Date().toLocaleDateString())}</span>
            <a href="#tier-1">Executive</a>
            <a href="#tier-2">Threats</a>
            <a href="#tier-3">Operations</a>
            <a href="#tier-4">Appendix</a>
            <span>Print-ready</span>
        </div>
    ` : '';
    
    let gapAnalysisHtml = '';
    if (gapAnalysis) {
        if (!report.gapAnalysis || report.gapAnalysis.trim() === '' || report.gapAnalysis === generateDynamicGapAnalysis(report)) {
            gapAnalysisHtml = buildGapAnalysisVisual(report, theme, isDark);
        } else {
            gapAnalysisHtml = `
                <div class="section" id="gap-analysis" style="page-break-inside: avoid;"><a name="gap-analysis"></a>
                    <h3>Gap Analysis &amp; Prioritization</h3>
                    <div style="background-color: ${isDark ? '#0f1123' : '#f8fafc'}; border: 1px solid ${isDark ? 'rgba(168,85,247,0.2)' : '#e2e8f0'}; color: ${isDark ? '#cbd5e1' : '#334155'}; padding: 16px; font-size: 13px; line-height: 1.6;">
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
        'lolbins': 'Detecting abuse of trusted system binaries and administrative tools (Living Off the Land).',
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
    
    {
        let notesHtml = '';
        if (report.methodologyNotes) {
            notesHtml = `
                <div style="margin-top: 14px; padding: 12px; background-color: ${isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; line-height: 1.5; width: 100%;">
                    <strong style="color: ${isDark ? '#ffffff' : '#0f172a'}; display: block; margin-bottom: 4px;">Note: Additional Methodology &amp; Scope Notes:</strong>
                    ${markdownToHtml(report.methodologyNotes)}
                </div>
            `;
        }
        methodScopeHtml = `<div class="section" id="methodology-scope" style="page-break-inside: avoid;"><a name="methodology-scope"></a>
            <h3>Methodology &amp; Scope</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr>
                    <td valign="top" style="width: 48%; padding-right: 4%; vertical-align: top; border: none;">
                        <div style="background-color: ${isDark ? '#121324' : '#fafafa'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding: 16px; min-height: 220px;">
                            <h4 style="margin-top: 0; margin-bottom: 12px; color: ${isDark ? '#a855f7' : '#7c3aed'}; font-size: 14px; font-weight: 700; border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding-bottom: 6px;">HUNTING METHODOLOGY</h4>
                            ${selectedMethods.length ? selectedMethods.map(m => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; border-collapse: collapse;">
                                    <tr><td valign="top" style="width: 16px; color: #10b981; font-weight: bold; font-size: 13px; border: none; padding: 0;">✓</td><td valign="top" style="padding-left: 6px; border: none; color: ${isDark ? '#cbd5e1' : '#475569'};">${m}</td></tr>
                                </table>
                            `).join('') : `<p style="color: ${isDark ? '#6b709c' : '#94a3b8'}; font-size: 12px; font-style: italic; margin: 0;">No specific methodologies specified.</p>`}
                        </div>
                    </td>
                    <td valign="top" style="width: 48%; vertical-align: top; border: none;">
                        <div style="background-color: ${isDark ? '#121324' : '#fafafa'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding: 16px; min-height: 220px;">
                            <h4 style="margin-top: 0; margin-bottom: 12px; color: ${isDark ? '#06b6d4' : '#0284c7'}; font-size: 14px; font-weight: 700; border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding-bottom: 6px;">DEFENSIVE TELEMETRY SCOPE</h4>
                            ${selectedScopes.length ? selectedScopes.map(s => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; border-collapse: collapse;">
                                    <tr><td valign="top" style="width: 16px; color: #06b6d4; font-weight: bold; font-size: 13px; border: none; padding: 0;">•</td><td valign="top" style="padding-left: 6px; border: none; color: ${isDark ? '#cbd5e1' : '#475569'};">${s}</td></tr>
                                </table>
                            `).join('') : `<p style="color: ${isDark ? '#6b709c' : '#94a3b8'}; font-size: 12px; font-style: italic; margin: 0;">No specific data scopes specified.</p>`}
                        </div>
                    </td>
                </tr>
            </table>
            ${notesHtml}
        </div>`;
    }
    
    // New Threat Hunt Queries
    let newQueriesHtml = '';
    const queryRepositoryUrl = String(report.queryRepositoryUrl || '').trim();
    const queryRepositoryHtml = queryRepositoryUrl ? `
        <div style="margin: 0 0 12px; padding: 12px 14px; background-color: ${isDark ? '#0c1424' : '#f0f9ff'}; border: 1px solid ${isDark ? 'rgba(56,189,248,0.2)' : '#bae6fd'};">
            <strong style="display: block; margin-bottom: 4px; color: ${isDark ? '#38bdf8' : '#0369a1'}; font-size: 12px;">${reportIcon('search', isDark ? '#38bdf8' : '#0369a1', 13)}Query Repository</strong>
            <a href="${safeLinkHref(queryRepositoryUrl)}" target="_blank" rel="noopener noreferrer" style="color: ${isDark ? '#7dd3fc' : '#0284c7'}; font-size: 12px; text-decoration: underline; word-break: break-all;">${escapeHtml(queryRepositoryUrl)}</a>
        </div>
    ` : '';
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
                            created: q.created,
                            description: q.description,
                            source: q.source,
                            sigmaRuleId: q.sigmaRuleId,
                            sigmaRuleTitle: q.sigmaRuleTitle,
                            sigmaRuleUrl: q.sigmaRuleUrl,
                            sentinelCandidate: q.sentinelCandidate
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
                const sigmaUrls = q.sigmaRuleUrl ? q.sigmaRuleUrl.split('|').filter(Boolean) : [];
                const sigmaTitles = q.sigmaRuleTitle ? q.sigmaRuleTitle.split('|').filter(Boolean) : [];
                const sigmaLinksHtml = sigmaUrls.length ? `
                    <div style="margin-top: 6px; font-size: 10px; line-height: 1.5; color: ${isDark ? '#94a3b8' : '#64748b'};">
                        <strong style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 8px; margin-right: 6px;">Sigma:</strong>
                        ${sigmaUrls.map((url, i) => `<a href="${safeLinkHref(url)}" target="_blank" rel="noopener noreferrer" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: underline; margin-right: 8px;">${escapeHtml(sigmaTitles[i] || q.sigmaRuleId?.split('|')?.[i] || 'Linked rule')}</a>`).join('')}
                    </div>
                ` : '';
                
                let badgesHtml = '<div style="margin-top: 6px; font-size: 10px; line-height: 1.6;">';
                if (parents.length > 0) {
                    badgesHtml += `<div style="margin-bottom: 2px;"><span style="font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Techniques:</span>`;
                    badgesHtml += parents.map(p => {
                        const bg = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(14, 165, 233, 0.08)';
                        const text = isDark ? '#38bdf8' : '#0369a1';
                        const border = isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(14, 165, 233, 0.2)';
                        return `<span style="background-color: ${bg}; color: ${text}; border: 1px solid ${border}; padding: 1px 4px; font-weight: 600; font-family: monospace; font-size: 9px; margin-right: 4px; display: inline-block; white-space: nowrap;" title="${escapeHtml(p.name)}">${escapeHtml(p.id)}</span>`;
                    }).join(' ');
                    badgesHtml += `</div>`;
                }
                if (subs.length > 0) {
                    badgesHtml += `<div><span style="font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Sub-techniques:</span>`;
                    badgesHtml += subs.map(s => {
                        const bg = isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.08)';
                        const text = isDark ? '#34d399' : '#047857';
                        const border = isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(16, 185, 129, 0.2)';
                        return `<span style="background-color: ${bg}; color: ${text}; border: 1px solid ${border}; padding: 1px 4px; font-weight: 600; font-family: monospace; font-size: 9px; margin-right: 4px; display: inline-block; white-space: nowrap;" title="${escapeHtml(s.name)}">${escapeHtml(s.id)}</span>`;
                    }).join(' ');
                    badgesHtml += `</div>`;
                }
                badgesHtml += '</div>';
                
                return `
                    <li style="margin-bottom: 12px; list-style-type: none; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}; padding-bottom: 8px;">
                        <strong style="font-size: 13px; color: ${isDark ? '#ffffff' : '#0f172a'};">${escapeHtml(queryName)}</strong>
                        <span style="background-color: ${isDark ? '#1e293b' : '#f1f5f9'}; color: ${isDark ? '#cbd5e1' : '#475569'}; padding: 2px 6px; font-size: 9px; font-weight: bold; margin-left: 8px; vertical-align: middle; display: inline-block;">${escapeHtml(q.language || '')}</span>
                        ${q.source ? `<span style="background-color: ${isDark ? '#121324' : '#f8fafc'}; color: ${isDark ? '#94a3b8' : '#64748b'}; border: 1px solid ${isDark ? '#25263b' : '#e2e8f0'}; padding: 2px 6px; font-size: 9px; font-weight: bold; margin-left: 6px; vertical-align: middle; display: inline-block;">${escapeHtml(q.source)}</span>` : ''}
                        ${q.sentinelCandidate ? `<span style="background-color: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; padding: 2px 6px; font-size: 9px; font-weight: bold; margin-left: 6px; vertical-align: middle; display: inline-block;">${reportIcon('robot', '#3b82f6', 11)}Sentinel Candidate</span>` : ''}
                        ${q.created ? `<div style="font-size: 10px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-top: 3px;">Created ${escapeHtml(formatTimestamp(q.created))}</div>` : ''}
                        ${q.description ? `<div style="font-size: 12px; color: ${isDark ? '#a2a6cc' : '#475569'}; margin-top: 4px; line-height: 1.5; font-style: italic;">${escapeHtml(q.description)}</div>` : ''}
                        ${badgesHtml}
                        ${sigmaLinksHtml}
                    </li>
                `;
            }).join('');
            newQueriesHtml = `<div class="section" id="query-library"><a name="query-library"></a><h3>${reportIcon('search', isDark ? '#38bdf8' : '#0284c7', 14)}New Threat Hunt Queries</h3>
                ${queryRepositoryHtml}
                <p style="margin-bottom: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; font-size: 13px;">${newQueries.length} queries for this period:</p>
                <ul style="padding-left: 0; margin: 0;">${queryList}</ul>
            </div>`;
        }
    }

    if (!newQueriesHtml) {
        newQueriesHtml = `<div class="section" id="query-library"><a name="query-library"></a><h3>${reportIcon('search', isDark ? '#38bdf8' : '#0284c7', 14)}New Threat Hunt Queries</h3>${queryRepositoryHtml}<p style="color:${isDark ? '#94a3b8' : '#64748b'}; font-size:13px; margin:0;">No new threat hunt queries were recorded for this period.</p></div>`;
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
            if (list.length === 0) return `<div style="color: #94a3b8; font-size: 11px; font-style: italic; text-align: center; padding: 8px 0;">No tactics</div>`;
            return list.map(item => `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 4px; background-color: ${isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc'};">
                    <tr>
                        <td style="padding: 6px 8px; font-size: 11px; font-weight: 600; color: ${isDark ? '#e2e8f0' : '#1e293b'}; text-align: left; vertical-align: middle; border: none;">
                            ${item.displayName}
                        </td>
                        <td align="right" style="padding: 6px 8px; font-size: 11px; font-weight: 700; color: ${color}; text-align: right; vertical-align: middle; width: 60px; border: none;">
                            ${item.coverage % 1 === 0 ? item.coverage : item.coverage.toFixed(1)}%
                        </td>
                    </tr>
                </table>
            `).join('');
        };

        tacticsGraphHtml = `
            <div class="section">
                <h3>Tactic Gap Triage Radar</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <tr>
                        <td valign="top" style="width: 32%; padding-right: 2%; vertical-align: top; border: none;">
                            <div style="border: 1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'}; background-color: ${isDark ? 'rgba(239, 68, 68, 0.05)' : '#fffafb'}; padding: 12px; min-height: 180px;">
                                <div style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid ${isDark ? 'rgba(239, 68, 68, 0.1)' : '#fee2e2'}; padding-bottom: 4px;">
                                    ${reportIcon('warning', '#ef4444', 13)}Critical (&lt;50%) [${criticalGaps.length}]
                                </div>
                                ${renderListEmail(criticalGaps, '#ef4444')}
                            </div>
                        </td>
                        <td valign="top" style="width: 32%; padding-right: 2%; vertical-align: top; border: none;">
                            <div style="border: 1px solid ${isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7'}; background-color: ${isDark ? 'rgba(245, 158, 11, 0.05)' : '#fffdf5'}; padding: 12px; min-height: 180px;">
                                <div style="font-size: 11px; font-weight: 700; color: ${isDark ? '#fbbf24' : '#d97706'}; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid ${isDark ? 'rgba(245, 158, 11, 0.1)' : '#fef3c7'}; padding-bottom: 4px;">
                                    Moderate (50%-80%) [${moderateCoverage.length}]
                                </div>
                                ${renderListEmail(moderateCoverage, isDark ? '#fbbf24' : '#d97706')}
                            </div>
                        </td>
                        <td valign="top" style="width: 32%; vertical-align: top; border: none;">
                            <div style="border: 1px solid ${isDark ? 'rgba(16, 185, 129, 0.2)' : '#dcfce7'}; background-color: ${isDark ? 'rgba(16, 185, 129, 0.05)' : '#f5fdf8'}; padding: 12px; min-height: 180px;">
                                <div style="font-size: 11px; font-weight: 700; color: ${isDark ? '#34d399' : '#16a34a'}; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid ${isDark ? 'rgba(16, 185, 129, 0.1)' : '#dcfce7'}; padding-bottom: 4px;">
                                    ${reportIcon('check', isDark ? '#34d399' : '#16a34a', 13)}Strong (&ge;80%) [${strongCoverage.length}]
                                </div>
                                ${renderListEmail(strongCoverage, isDark ? '#34d399' : '#16a34a')}
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }
    
    // Coverage Breakdown/Changes
    let coverageHtml = '';
    const statusChangesExportHtml = buildStatusChangesExport(report, isDark);
    const liveTactics = getCoverageByTactic();
    const fmtCov = (v) => v % 1 === 0 ? v : v.toFixed(1);
    if (report.type === 'initial') {
        const rows = liveTactics.map(t => {
            const badgeClass = t.coverage >= 80 ? 'coverage-high' : t.coverage >= 50 ? 'coverage-mid' : 'coverage-low';
            return `<tr><td>${t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td>${t.withQueries}/${t.total}</td><td><span class="coverage-badge ${badgeClass}">${fmtCov(t.coverage)}%</span></td></tr>`;
        }).join('');
        const languageRows = (report.coverageByLanguage || window.getCoverageByLanguage?.() || []).map(item => `
            <tr><td>${escapeHtml(item.language || 'Unknown')}</td><td style="text-align:right;">${item.count || 0}</td></tr>
        `).join('');
        coverageHtml = `<div class="section"><h3>Coverage Breakdown</h3>
            <table><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>
            <h4 style="margin: 16px 0 8px; font-size: 13px; color: ${isDark ? '#ffffff' : '#0f172a'};">By Query Language</h4>
            ${languageRows ? `<table><thead><tr><th>Language</th><th style="text-align:right;">Query Count</th></tr></thead><tbody>${languageRows}</tbody></table>` : `<p style="color: ${isDark ? '#94a3b8' : '#64748b'}; font-size: 12px; margin: 0;">No query language data available.</p>`}
            <p style="margin-top: 8px; color: #64748b; font-size: 11px; font-style: italic; line-height: 1.4;">Note: Tactic coverage percentages incorporate both parent techniques and sub-techniques mapped to each tactical phase.</p>
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
            coverageHtml = `<div class="section"><h3>${reportIcon('shield', isDark ? '#38bdf8' : '#0284c7', 14)}Coverage Changes <span style="font-size:12px;font-weight:400;color:#64748b;">(vs ${lastMonthLabel})</span></h3>
                <table><thead><tr><th>Tactic</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table>
                <p style="margin-top: 8px; color: #64748b; font-size: 11px; font-style: italic; line-height: 1.4;">Note: Tactic coverage changes evaluate both parent and sub-techniques mapped to each tactical phase.</p>
            </div>`;
        } else {
            const currentRows = getCoverageByTacticUpToMonth(currentMonth).map(t => {
                const badgeClass = t.coverage >= 80 ? 'coverage-high' : t.coverage >= 50 ? 'coverage-mid' : 'coverage-low';
                return `<tr><td>${escapeHtml(t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}</td><td>${t.withQueries}/${t.total}</td><td><span class="coverage-badge ${badgeClass}">${fmtCov(t.coverage)}%</span></td></tr>`;
            }).join('');
            coverageHtml = `<div class="section"><h3>${reportIcon('shield', isDark ? '#38bdf8' : '#0284c7', 14)}Current Coverage Snapshot</h3>
                <p style="color:${isDark ? '#94a3b8' : '#64748b'}; font-size:13px; margin: 0 0 10px;">No earlier reporting month is available for a month-over-month comparison, so this export includes the current tactic coverage snapshot instead.</p>
                ${currentRows ? `<table><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>${currentRows}</tbody></table>` : `<p style="color:${isDark ? '#94a3b8' : '#64748b'}; font-size:13px; margin: 0;">No tactic coverage data available.</p>`}
            </div>`;
        }
    }
    
    const versionAppendixHtml = buildAttackVersionAppendixExport(report, isDark);

    // Appendix
    let appendixHtml = '';
    {
        const app = mergeAppendixDefaults(generateDynamicAppendix(report), report.appendix);
        const sections = [];
        if (app.methodology) sections.push(`<div class="subsection"><h4>Methodology</h4><p>${markdownToHtml(app.methodology)}</p></div>`);
        if (app.scope) sections.push(`<div class="subsection"><h4>Scope</h4><p>${markdownToHtml(app.scope)}</p></div>`);
        if (app.limitations) sections.push(`<div class="subsection"><h4>Limitations</h4><p>${markdownToHtml(app.limitations)}</p></div>`);
        if (app.additionalNotes) sections.push(`<div class="subsection"><h4>Additional Notes</h4><p>${markdownToHtml(app.additionalNotes)}</p></div>`);
        appendixHtml = `<div class="section" id="mitre-appendix" style="page-break-inside: avoid;"><a name="mitre-appendix"></a>
            <h3>${reportIcon('search', isDark ? '#38bdf8' : '#0284c7', 14)}MITRE ATT&amp;CK Appendix</h3>
            <p style="font-size: 12px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-bottom: 10px;">Methodology, scope, limitations, and export context retained from the interactive report.</p>
            ${sections.join('')}
        </div>`;
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
    const reportBasisHtml = buildReportBasisNoteExport(report, isDark);
    const topNextActionsHtml = buildTopNextActionsExport(report, isDark);
    const teamAssignmentsHtml = buildTeamAssignmentsExport(report, isDark);
    const detectionResultsExportHtml = buildDetectionResultsExport(report, isDark);

    // Clickable Table of Contents Index using anchors.
    const tocIndexHtml = `
        <div style="margin-bottom: 24px; padding: 16px; background-color: ${isDark ? '#121324' : '#fafafa'}; border: 1px solid ${isDark ? '#25263b' : '#e2e8f0'};">
            <h4 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0284c7'}; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">Table of Contents</h4>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; font-size: 12px; font-family: sans-serif;">
                <tr>
                    <td width="50%" style="padding: 4px 0; border: none; vertical-align: top; text-align: left;">
                        <a href="#tier-1" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: none; font-weight: 600;">1. Tier 1: Executive Security Posture</a>
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Dashboard, Maturity Grade &amp; Unified Leadership Brief</div>
                        <div class="pdf-page-ref" style="display:none; font-size: 9px; color: #94a3b8; margin-top: 1px;">Page 2</div>
                    </td>
                    <td width="50%" style="padding: 4px 0; border: none; vertical-align: top; text-align: left;">
                        <a href="#tier-3" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: none; font-weight: 600;">3. Tier 3: Operational Hunt Progress</a>
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Activity Timeline Feed, Active Detections &amp; Monthly Trends</div>
                        <div class="pdf-page-ref" style="display:none; font-size: 9px; color: #94a3b8; margin-top: 1px;">Page 4</div>
                    </td>
                </tr>
                <tr>
                    <td width="50%" style="padding: 8px 0 0 0; border: none; vertical-align: top; text-align: left;">
                        <a href="#tier-2" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: none; font-weight: 600;">2. Tier 2: Threat Landscape &amp; Strategic Gaps</a>
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Adversary Mapper, High-risk Zero-coverage &amp; Priorities Roadmap</div>
                        <div class="pdf-page-ref" style="display:none; font-size: 9px; color: #94a3b8; margin-top: 1px;">Page 3</div>
                    </td>
                    <td width="50%" style="padding: 8px 0 0 0; border: none; vertical-align: top; text-align: left;">
                        <a href="#tier-4" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: none; font-weight: 600;">4. Tier 4: Telemetry Proof &amp; Appendix</a>
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">KQL/Sigma Queries Library, Data Scopes &amp; Methodology</div>
                        <div class="pdf-page-ref" style="display:none; font-size: 9px; color: #94a3b8; margin-top: 1px;">Page 5</div>
                    </td>
                </tr>
            </table>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 8px; font-style: italic; border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}; padding-top: 6px;">
                Page references shown in PDF exports. Click section titles to navigate in digital formats.
            </div>
        </div>
    `;

    // Redesigned Stats Bar - Nested tables to replace flexbox entirely for Outlook support
    const statsBarHtml = isDark ? `
        <div style="background-color: #0f1123; padding: 20px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);" id="posture-dashboard"><a name="posture-dashboard"></a>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td width="50%" style="padding: 0 10px 14px 0; border: none; vertical-align: top;">
                        <div style="background-color: #141324; border: 1px solid rgba(168, 85, 247, 0.2); padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Framework Coverage</div>
                            <div style="font-size: 26px; font-weight: 800; color: #ffffff; margin-top: 4px; line-height: 1;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                            ${deltaHtml}
                            <div style="font-size: 9px; color: #94a3b8; margin-top: 6px; font-weight: 500;">
                                Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}
                            </div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 0 0 14px 10px; border: none; vertical-align: top;">
                        <div style="background-color: #0c1424; border: 1px solid rgba(56, 189, 248, 0.2); padding: 14px; min-height: 90px;">
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
                        <div style="background-color: #0c1c14; border: 1px solid rgba(52, 211, 153, 0.2); padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Tactical Gaps Filled</div>
                            <div style="font-size: 26px; font-weight: 800; color: #34d399; margin-top: 4px; line-height: 1;">${techniquesCovered}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px;">techniques covered this period</div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 10px 0 0 10px; border: none; vertical-align: top;">
                        <div style="background-color: #1a150c; border: 1px solid rgba(251, 191, 36, 0.2); padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">${getReportMetricLabel()}</div>
                            <div style="font-size: 26px; font-weight: 800; color: #fbbf24; margin-top: 4px; line-height: 1;">${threatsDisrupted}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px;">${getReportMetricDetail()}</div>
                        </div>
                    </td>
                </tr>
            </table>
            <!-- Full Width Score Posture Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 14px;">
                <tr>
                    <td style="border: none;">
                        <div style="background-color: #121324; border: 1px solid rgba(255,255,255,0.06); padding: 16px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: none; width: 100%;">
                                <tr>
                                    <td style="vertical-align: middle; border: none; padding: 0;">
                                        <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Security Posture Grade</div>
                                        <div style="font-size: 18px; font-weight: 800; color: ${gradeColor}; margin-top: 6px; line-height: 1.2;">${maturityGrade}</div>
                                        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 4px;">standard framework grade &bull; ${coverageStats.total - coverageStats.covered} critical gaps</div>
                                    </td>
                                    <td width="55" style="vertical-align: middle; text-align: right; border: none; padding: 0 0 0 5px;">
                                        <!--[if !mso]><!-->
                                        <svg width="50" height="50" viewBox="0 0 120 120" style="display: inline-block;">
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="12" />
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="${gradeColor}" stroke-width="12"
                                                    stroke-dasharray="314.15" stroke-dashoffset="${314.15 - (314.15 * Math.min(frameworkCoverage, 100)) / 100}"
                                                    stroke-linecap="round" transform="rotate(-90 60 60)" />
                                            <text x="60" y="68" text-anchor="middle" font-family="-apple-system, sans-serif" font-weight="900" font-size="28" fill="#ffffff">${maturityGrade.split(' ')[0]}</text>
                                        </svg>
                                        <!--<![endif]-->
                                        <!--[if mso]>
                                        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; border: none; background-color: ${gradeColor}; border-radius: 4px; display: inline-block;">
                                            <tr>
                                                <td style="padding: 6px 14px; color: ${frameworkCoverage >= 50 ? '#0f172a' : '#ffffff'}; font-weight: 800; font-family: Arial, sans-serif; font-size: 18px; line-height: 1; text-align: center; border: none;">
                                                    ${maturityGrade.split(' ')[0]}
                                                </td>
                                            </tr>
                                        </table>
                                        <![endif]-->
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>
            <div style="margin-top: 14px; padding: 10px 14px; background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: #a2a6cc; text-align: center; line-height: 1.4; font-family: sans-serif;">
                Note: <strong>Maturity Grading:</strong> Grade is calculated based on framework technique coverage (A: &ge;70%, B: 50%-70%, C: 30%-50%, D/F: &lt;30%).
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${escapeHtml(report.author || state.author || 'the Security Operations Team')}</strong>.
            </div>
        </div>
    ` : `
        <div style="background-color: #f8fafc; padding: 20px 24px; border-bottom: 2px solid #e2e8f0;" id="posture-dashboard"><a name="posture-dashboard"></a>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td width="50%" style="padding: 0 10px 14px 0; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Framework Coverage</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 4px; line-height: 1;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                            ${deltaHtml}
                            <div style="font-size: 9px; color: #64748b; margin-top: 6px; font-weight: 500;">
                                Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}
                            </div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 0 0 14px 10px; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 14px; min-height: 90px;">
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
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Tactical Gaps Filled</div>
                            <div style="font-size: 26px; font-weight: 800; color: #16a34a; margin-top: 4px; line-height: 1;">${techniquesCovered}</div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">techniques covered this period</div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 10px 0 0 10px; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${getReportMetricLabel()}</div>
                            <div style="font-size: 26px; font-weight: 800; color: #b45309; margin-top: 4px; line-height: 1;">${threatsDisrupted}</div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">${getReportMetricDetail()}</div>
                        </div>
                    </td>
                </tr>
            </table>
            <!-- Full Width Score Posture Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 14px;">
                <tr>
                    <td style="border: none;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 16px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: none; width: 100%;">
                                <tr>
                                    <td style="vertical-align: middle; border: none; padding: 0;">
                                        <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Security Posture Grade</div>
                                        <div style="font-size: 18px; font-weight: 800; color: ${gradeColor}; margin-top: 6px; line-height: 1.2;">${maturityGrade}</div>
                                        <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 4px;">standard framework grade &bull; ${coverageStats.total - coverageStats.covered} critical gaps</div>
                                    </td>
                                    <td width="55" style="vertical-align: middle; text-align: right; border: none; padding: 0 0 0 5px;">
                                        <!--[if !mso]><!-->
                                        <svg width="50" height="50" viewBox="0 0 120 120" style="display: inline-block;">
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" stroke-width="12" />
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="${gradeColor}" stroke-width="12"
                                                    stroke-dasharray="314.15" stroke-dashoffset="${314.15 - (314.15 * Math.min(frameworkCoverage, 100)) / 100}"
                                                    stroke-linecap="round" transform="rotate(-90 60 60)" />
                                            <text x="60" y="68" text-anchor="middle" font-family="-apple-system, sans-serif" font-weight="900" font-size="28" fill="#0f172a">${maturityGrade.split(' ')[0]}</text>
                                        </svg>
                                        <!--<![endif]-->
                                        <!--[if mso]>
                                        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; border: none; background-color: ${gradeColor}; border-radius: 4px; display: inline-block;">
                                            <tr>
                                                <td style="padding: 6px 14px; color: ${frameworkCoverage >= 50 ? '#0f172a' : '#ffffff'}; font-weight: 800; font-family: Arial, sans-serif; font-size: 18px; line-height: 1; text-align: center; border: none;">
                                                    ${maturityGrade.split(' ')[0]}
                                                </td>
                                            </tr>
                                        </table>
                                        <![endif]-->
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>
            <div style="margin-top: 14px; padding: 10px 14px; background-color: #ffffff; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; line-height: 1.4; font-family: sans-serif;">
                Note: <strong>Maturity Grading:</strong> Grade is calculated based on framework technique coverage (A: &ge;70%, B: 50%-70%, C: 30%-50%, D/F: &lt;30%).
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${escapeHtml(report.author || state.author || 'the Security Operations Team')}</strong>.
            </div>
        </div>
    `;

    // Redesigned modern CSS styles
    const stylesHtml = isDark ? `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #cbd5e1; background-color: #070814; }
        * { box-sizing: border-box; }
        .html-export-toolbar { position: sticky; top: 0; z-index: 20; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 10px 14px; background: rgba(7, 8, 20, 0.96); border-bottom: 1px solid rgba(255,255,255,0.08); color: #94a3b8; font-size: 11px; }
        .html-export-toolbar strong { color: #ffffff; }
        .html-export-toolbar a { color: #38bdf8; text-decoration: none; font-weight: 700; }
        .html-export-toolbar a:hover { text-decoration: underline; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #0f1123; border: 1px solid rgba(${accentRgb}, 0.2); border-radius: 12px; overflow: hidden; box-shadow: 0 0 30px rgba(${accentRgb}, 0.1); }
        .header { background-color: ${fallbackBg}; color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; border-bottom: 2px solid ${theme.accent}; }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: brightness(0) invert(1); }
        .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
        .header .subtitle { font-size: 13px; font-weight: 400; color: #94a3b8; margin: 0 0 12px 0; }
        .header .report-type { display: inline-block; background: rgba(${accentRgb}, 0.15); border: 1px solid rgba(${accentRgb}, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffffcc; margin-bottom: 10px; }
        .header .report-date { font-size: 13px; color: #cbd5e1; margin: 0; }
        .header .attck-version { font-size: 11px; color: #64748b; margin: 3px 0 0; }
        .header .author { font-size: 12px; color: #94a3b8; margin-top: 4px; }
        .content { padding: 24px 28px; }
        .section { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); page-break-inside: avoid; }
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
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 8px; }
            .header { padding: 24px 16px; }
            .content { padding: 16px; }
        }
        .detection-item {
            background-color: rgba(255, 255, 255, 0.02) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-left: 4px solid #7c3aed !important;
            border-radius: 8px !important;
            padding: 14px 18px !important;
            margin-bottom: 12px !important;
        }
        .detection-item strong {
            font-size: 14px !important;
            color: #ffffff !important;
            font-weight: 700 !important;
        }
        .detection-item .badge-yellow {
            background-color: rgba(251, 191, 36, 0.15) !important;
            color: #fbbf24 !important;
            border: 1px solid rgba(251, 191, 36, 0.3) !important;
            font-size: 9px !important;
            font-weight: 700 !important;
            padding: 2px 8px !important;
            border-radius: 9999px !important;
            margin-left: 8px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            display: inline-block !important;
            vertical-align: middle !important;
        }
        .detection-item .notes {
            margin-top: 8px !important;
            font-size: 12.5px !important;
            color: #a2a6cc !important;
            line-height: 1.6 !important;
        }
        
        /* PDF specific overrides for vector-sharp multi-page layouts */
        .is-pdf .email-wrapper { max-width: 100%; width: 100%; padding: 40px; }
        .is-pdf .pdf-page-break { page-break-before: always !important; height: 0; margin: 0; border: none; }
        .is-pdf .section { page-break-inside: avoid !important; margin-bottom: 30px; }
        .is-pdf tr { page-break-inside: avoid !important; }
        .is-pdf .advisory-bar { display: none !important; }
        .is-pdf .pdf-advisory-bar { display: block !important; }
        @media print { .html-export-toolbar { display: none !important; } }
    ` : `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
        * { box-sizing: border-box; }
        .html-export-toolbar { position: sticky; top: 0; z-index: 20; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 10px 14px; background: rgba(248, 250, 252, 0.96); border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; }
        .html-export-toolbar strong { color: #0f172a; }
        .html-export-toolbar a { color: #0284c7; text-decoration: none; font-weight: 700; }
        .html-export-toolbar a:hover { text-decoration: underline; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04); border: 1px solid #e2e8f0; }
        .header { background-color: ${fallbackBg}; color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; }
        .header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: ${theme.accent}; }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: brightness(0) invert(1); }
        .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
        .header .subtitle { font-size: 13px; font-weight: 400; color: #cbd5e1; margin: 0 0 12px 0; }
        .header .report-type { display: inline-block; background: ${theme.accent}33; border: 1px solid ${theme.accent}55; padding: 4px 12px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffffcc; margin-bottom: 10px; }
        .header .report-date { font-size: 13px; color: #cbd5e1; margin: 0; }
        .header .attck-version { font-size: 11px; color: #64748b; margin: 3px 0 0; }
        .header .author { font-size: 12px; color: #cbd5e1; margin-top: 4px; }
        .content { padding: 24px 28px; }
        .section { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; page-break-inside: avoid; }
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
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 8px; }
            .header { padding: 24px 16px; }
            .content { padding: 16px; }
        }
        .detection-item {
            background-color: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            border-left: 4px solid #7c3aed !important;
            border-radius: 8px !important;
            padding: 14px 18px !important;
            margin-bottom: 12px !important;
        }
        .detection-item strong {
            font-size: 14px !important;
            color: #0f172a !important;
            font-weight: 700 !important;
        }
        .detection-item .badge-yellow {
            background-color: #fef3c7 !important;
            color: #b45309 !important;
            border: 1px solid #fde68a !important;
            font-size: 9px !important;
            font-weight: 700 !important;
            padding: 2px 8px !important;
            border-radius: 9999px !important;
            margin-left: 8px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            display: inline-block !important;
            vertical-align: middle !important;
        }
        .detection-item .notes {
            margin-top: 8px !important;
            font-size: 12.5px !important;
            color: #475569 !important;
            line-height: 1.6 !important;
        }
        
        /* PDF specific overrides for vector-sharp multi-page layouts */
        .is-pdf .email-wrapper { max-width: 100%; width: 100%; padding: 40px; }
        .is-pdf .pdf-page-break { page-break-before: always !important; height: 0; margin: 0; border: none; }
        .is-pdf .section { page-break-inside: avoid !important; margin-bottom: 30px; }
        .is-pdf tr { page-break-inside: avoid !important; }
        .is-pdf .advisory-bar { display: none !important; }
        .is-pdf .pdf-advisory-bar { display: block !important; }
        @media print { .html-export-toolbar { display: none !important; } }
        .is-pdf .pdf-page-ref { display: inline !important; }
        
        /* Page numbers for PDF - shown in footer */
        .is-pdf .page-number-footer {
            display: block !important;
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            padding: 10px 0 5px 0;
            border-top: 1px solid #e2e8f0;
            margin-top: 15px;
            font-family: sans-serif;
        }
    `;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(reportTitle)}</title>
    <style>
        ${stylesHtml}
    </style>
</head>
<body${bodyInline}>
    ${standaloneToolbarHtml}
    <div class="email-wrapper"${wrapperInline}>
        <div class="container"${containerInline}>
            ${isEmail ? `<div class="advisory-bar" style="background-color: #fffbeb; border-bottom: 1.5px solid #fde68a; padding: 10px 16px; font-size: 11px; color: #b45309; text-align: center; font-family: Arial, Helvetica, sans-serif; font-weight: 600; line-height: 1.4;">
                Outlook-safe summary generated from the interactive MITRE ATT&amp;CK report. Some live dashboard controls are intentionally omitted.
            </div>` : ''}
            <!-- Disclaimer for PDF formats (Pristine layout advisory) -->
            <div class="pdf-advisory-bar" style="display: none; background-color: ${isDark ? '#16101d' : '#fcfaff'}; border-bottom: 1.5px solid ${isDark ? 'rgba(168,85,247,0.15)' : '#f5f3ff'}; padding: 10px 16px; font-size: 11px; color: ${isDark ? '#c084fc' : '#6d28d9'}; text-align: center; font-family: sans-serif; font-weight: 600; line-height: 1.4;">
                Print Export: This PDF is generated by the browser print engine for selectable text and cleaner pagination.
            </div>
            <div class="header"${headerInline}>
                ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Logo">` : ''}
                <h1>${escapeHtml(reportTitle)}</h1>
                <p class="subtitle">${escapeHtml(report.companyName) || 'MITRE ATT&amp;CK Coverage Report'}</p>
                <div class="report-type">${report.type === 'initial' ? 'Initial Assessment' : 'Monthly Update'}</div>
                <p class="report-date">${escapeHtml(reportMonthLabel)}</p>
                ${report.attckVersion ? `<p class="attck-version">ATT&amp;CK Framework v${escapeHtml(report.attckVersion)}</p>` : ''}
                ${report.author || state.author ? `<p class="author">Prepared by: ${escapeHtml(report.author || state.author)}</p>` : ''}
            </div>

            ${statsBarHtml}

            ${reportBasisHtml}

            <div class="content"${contentInline}>
                ${tocIndexHtml}

                ${topNextActionsHtml}

                <!-- Tier 1: Executive Security Posture Briefing -->
                <div class="tier-container" id="tier-1" style="margin-top: 24px; margin-bottom: 30px;">
                    <a name="tier-1"></a>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${isDark ? '#a855f7' : '#7c3aed'}; margin-bottom: 10px;">
                        Tier 1: Executive Security Posture
                    </div>
                    
                    <div style="background-color: ${isDark ? '#121324' : '#ffffff'}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}; padding: 20px;">
                        <h3 style="margin-top: 0; margin-bottom: 14px; font-size: 14px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'}; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}; padding-bottom: 8px; font-family: sans-serif;">
                            Note: Unified Leadership Briefing
                        </h3>
                        
                        <!-- Top Row: Executive Summary + Monthly Focus Areas -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: none; width: 100%; margin-bottom: 16px;">
                            <tr>
                                <td valign="top" width="48%" style="width: 48%; vertical-align: top; border: none; font-size: 12.5px; line-height: 1.6; color: ${isDark ? '#cbd5e1' : '#475569'};">
                                    <strong style="color: ${isDark ? '#ffffff' : '#0f172a'}; display: block; margin-bottom: 6px; font-size: 12.5px;">Executive Summary &amp; Context</strong>
                                    ${execSummary ? markdownToHtml(execSummary) : '<p style="font-style:italic; color:#64748b;">No executive summary provided for this period.</p>'}
                                </td>
                                <td width="4%" style="width: 4%; border: none; padding: 0;"></td>
                                <td valign="top" width="48%" style="width: 48%; vertical-align: top; border: none; font-size: 12.5px; line-height: 1.6; color: ${isDark ? '#cbd5e1' : '#475569'};">
                                    <div style="background-color: ${isDark ? 'rgba(56,189,248,0.05)' : '#f0f9ff'}; border: 1px solid ${isDark ? 'rgba(56,189,248,0.15)' : '#bae6fd'}; padding: 14px; min-height: 180px;">
                                        <strong style="color: ${isDark ? '#38bdf8' : '#0284c7'}; display: block; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">Monthly Strategic Focus Areas</strong>
                                        ${monthlyFocus ? markdownToHtml(monthlyFocus) : '<p style="font-style:italic; color:#64748b;">No active monthly focus areas specified.</p>'}
                                    </div>
                                </td>
                            </tr>
                        </table>
                        
                        <!-- Bottom Row: Strategic Leadership Guidance (Full Width) -->
                        ${leadership ? `
                        <div style="background-color: ${isDark ? 'rgba(168,85,247,0.05)' : '#faf5ff'}; border: 1px solid ${isDark ? 'rgba(168,85,247,0.15)' : '#e9d5ff'}; padding: 14px;">
                            <strong style="color: ${isDark ? '#a855f7' : '#7c3aed'}; display: block; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">Strategic Leadership Guidance</strong>
                            <div style="font-size: 12.5px; line-height: 1.6; color: ${isDark ? '#cbd5e1' : '#475569'};">
                                ${markdownToHtml(leadership)}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 2 of 5</div>

                <div class="pdf-page-break"></div>

                <!-- Tier 2: Threat Landscape & Strategic Gaps -->
                <div class="tier-container" id="tier-2" style="margin-bottom: 30px;">
                    <a name="tier-2"></a>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${isDark ? '#fbbf24' : '#d97706'}; margin-bottom: 10px;">
                        Tier 2: Threat Landscape &amp; Strategic Gaps
                    </div>
                    
                    ${buildThreatsSectionEmail(report, isDark) ? `<div id="adversary-mapper"><a name="adversary-mapper"></a>${buildThreatsSectionEmail(report, isDark)}</div>` : ''}
                    
                    ${buildTechniquesAtRiskEmail(report, isDark) ? `<div id="techniques-at-risk"><a name="techniques-at-risk"></a>${buildTechniquesAtRiskEmail(report, isDark)}</div>` : ''}

                    ${recommendations ? `<div class="section" id="recommendations" style="page-break-inside: avoid;"><a name="recommendations"></a><h3>Strategic Recommendations</h3><div style="background-color: ${isDark ? '#121324' : '#f8fafc'}; border: 1px solid ${isDark ? '#25263b' : '#e2e8f0'}; color: ${isDark ? '#cbd5e1' : '#334155'}; padding: 16px; font-size: 13px; line-height: 1.6;">${markdownToHtml(recommendations)}</div></div>` : ''}
                    
                    ${gapAnalysisHtml}
                    
                    ${teamAssignmentsHtml}
                    
                    ${(() => {
                        if (!state.groups || state.groups.length === 0) return `<div class="section" id="risk-heatmap" style="page-break-inside: avoid;"><a name="risk-heatmap"></a><h3>Risk Heat Map</h3><p style="font-size: 12.5px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin: 0;">No threat group data available for risk heat map generation.</p></div>`;
                        const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
                        const allGroups = state.groups.map(group => {
                            const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
                            const relatedTechs = techRels.map(r => state.techniques.find(tech => tech.id === r.target_ref)).filter(Boolean);
                            const coveredCount = relatedTechs.filter(tech => {
                                const tid = tech.external_references?.[0]?.external_id || '';
                                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
                                return ann?.queries && ann.queries.length > 0;
                            }).length;
                            const techCount = relatedTechs.length;
                            const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
                            const gaps = techCount - coveredCount;
                            const likelihood = techCount >= 150 ? 'High' : techCount >= 50 ? 'Medium' : 'Low';
                            const impact = coveragePct < 30 ? 'Critical' : coveragePct < 50 ? 'High' : coveragePct < 70 ? 'Medium' : 'Low';
                            return { name: group.name, techCount, coveragePct, gaps, likelihood, impact };
                        }).sort((a, b) => {
                            const riskOrder = { 'Critical-High': 0, 'Critical-Medium': 1, 'Critical-Low': 2, 'High-High': 3, 'High-Medium': 4, 'High-Low': 5, 'Medium-High': 6, 'Medium-Medium': 7, 'Medium-Low': 8, 'Low-High': 9, 'Low-Medium': 10, 'Low-Low': 11 };
                            return (riskOrder[`${a.impact}-${a.likelihood}`] || 12) - (riskOrder[`${b.impact}-${b.likelihood}`] || 12) || b.gaps - a.gaps;
                        }).slice(0, 8);
                        
                        if (allGroups.length === 0) return `<div class="section" id="risk-heatmap" style="page-break-inside: avoid;"><a name="risk-heatmap"></a><h3>Risk Heat Map</h3><p style="font-size: 12.5px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin: 0;">No threat group mappings available for risk heat map generation.</p></div>`;
                        
                        const riskColor = (impact, likelihood) => {
                            if (impact === 'Critical') return '#ef4444';
                            if (impact === 'High' && likelihood === 'High') return '#f97316';
                            if (impact === 'High') return '#eab308';
                            return '#22c55e';
                        };
                        
                        let heatHtml = `<div class="section" id="risk-heatmap" style="page-break-inside: avoid;"><a name="risk-heatmap"></a><h3>Risk Heat Map</h3>
                            <p style="margin-bottom: 12px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'};">Threat groups plotted by impact (coverage gap) vs likelihood (technique count):</p>
                            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="width: 100px; border: none;"></td>
                                    <td style="text-align: center; font-size: 10px; font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; padding: 4px; border: none;">Low Likelihood</td>
                                    <td style="text-align: center; font-size: 10px; font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; padding: 4px; border: none;">Medium Likelihood</td>
                                    <td style="text-align: center; font-size: 10px; font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; padding: 4px; border: none;">High Likelihood</td>
                                </tr>`;
                        
                        ['Critical', 'High', 'Medium', 'Low'].forEach(impact => {
                            heatHtml += `<tr>
                                <td style="font-size: 10px; font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; padding: 4px; text-align: right; vertical-align: middle; border: none;">${impact} Impact</td>`;
                            ['Low', 'Medium', 'High'].forEach(likelihood => {
                                const groups = allGroups.filter(g => g.impact === impact && g.likelihood === likelihood);
                                const color = riskColor(impact, likelihood);
                                heatHtml += `<td style="padding: 8px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}; background-color: ${color}10; vertical-align: top; min-height: 60px;">
                                    ${groups.length > 0 ? groups.map(g => `
                                        <div style="font-size: 10px; font-weight: 600; color: ${color}; margin-bottom: 2px;">${escapeHtml(g.name.split(' ')[0])}</div>
                                        <div style="font-size: 9px; color: ${isDark ? '#94a3b8' : '#64748b'};">${g.coveragePct}% cov, ${g.gaps} gaps</div>
                                    `).join('') : '<span style="font-size: 10px; color: #94a3b8;">-</span>'}
                                </td>`;
                            });
                            heatHtml += '</tr>';
                        });
                        
                        heatHtml += '</table></div>';
                        return heatHtml;
                    })()}
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 3 of 5</div>

                <div class="pdf-page-break"></div>

                <!-- Tier 3: Operational Hunt Progress -->
                <div class="tier-container" id="tier-3" style="margin-bottom: 30px;">
                    <a name="tier-3"></a>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${isDark ? '#34d399' : '#16a34a'}; margin-bottom: 10px;">
                        Tier 3: Operational Hunt Progress
                    </div>
                    
                    ${statusChangesExportHtml}

                    ${buildEmailMonthlyActivity(report, theme, isDark)}
                    ${tacticsGraphHtml}
                    
                    ${detectionResultsExportHtml}
                    
                    ${coverageHtml}
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 4 of 5</div>

                <div class="pdf-page-break"></div>

                <!-- Tier 4: Telemetry Proof & Appendix -->
                <div class="tier-container" id="tier-4" style="margin-bottom: 0;">
                    <a name="tier-4"></a>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${isDark ? '#38bdf8' : '#0284c7'}; margin-bottom: 10px;">
                        Tier 4: Telemetry Proof &amp; Appendix
                    </div>
                    
                    ${newQueriesHtml}
                    
                    ${methodScopeHtml}

                    ${versionAppendixHtml}
                    
                    ${(() => {
                        const activeSigmaReferences = [];
                        const seenUrls = new Set();
                        const repMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
                        if (repMonth && typeof getTechniquesByMonth === 'function') {
                            const byMonth = getTechniquesByMonth();
                            const techniques = byMonth[repMonth] || [];
                            techniques.forEach(ann => {
                                if (ann.queries) {
                                    ann.queries.forEach(q => {
                                        // Handle multiple Sigma rules (pipe-delimited)
                                        if (q.sigmaRuleUrl) {
                                            const urls = q.sigmaRuleUrl.split('|').filter(Boolean);
                                            const titles = q.sigmaRuleTitle ? q.sigmaRuleTitle.split('|').filter(Boolean) : [];
                                            urls.forEach((url, i) => {
                                                if (!seenUrls.has(url)) {
                                                    seenUrls.add(url);
                                                    activeSigmaReferences.push({
                                                        title: titles[i] || q.sigmaRuleTitle?.split('|')[0] || 'SigmaHQ Rule',
                                                        url: url
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }

                        const mergedReferences = [
                            ...(report.references || []),
                            ...activeSigmaReferences.map(sr => `[SigmaHQ] ${sr.title}: ${sr.url}`)
                        ];

                        if (mergedReferences.length === 0) return '';

                        return `
                            <div class="section" style="page-break-inside: avoid;">
                                <h3>References &amp; Telemetry Mappings</h3>
                                <ul style="padding-left: 20px; margin: 0;">
                                    ${mergedReferences.map(r => {
                                        const isUrl = r.startsWith('http://') || r.startsWith('https://');
                                        let displayHtml = '';
                                        if (isUrl) {
                                            displayHtml = `<a href="${escapeHtml(r)}" target="_blank" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: underline;">${escapeHtml(r)}</a>`;
                                        } else if (r.includes(': http')) {
                                            const parts = r.split(': http');
                                            const url = 'http' + parts[1];
                                            displayHtml = `${escapeHtml(parts[0])}: <a href="${escapeHtml(url)}" target="_blank" style="color: ${isDark ? '#38bdf8' : '#0284c7'}; text-decoration: underline;">${escapeHtml(url)}</a>`;
                                        } else {
                                            displayHtml = escapeHtml(r);
                                        }
                                        return `<li style="margin-bottom: 6px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'};">${displayHtml}</li>`;
                                    }).join('')}
                                </ul>
                            </div>
                        `;
                    })()}
                    
                    ${appendixHtml}
                    
                    <div style="background-color: ${isDark ? '#121324' : '#f8fafc'}; border: 1px solid ${isDark ? '#25263b' : '#e2e8f0'}; margin-top: 20px; padding: 14px 18px; overflow: hidden; text-align: left;">
                        <h4 style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'};">${reportIcon('image', isDark ? '#38bdf8' : '#0284c7', 14)}Export Note</h4>
                        <p style="margin: 0; font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; line-height: 1.4;">View the attached SVG snapshot for the full formatted report image.</p>
                    </div>
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 5 of 5</div>
            </div>
 
            <div class="footer"${footerInline}>
                <p>Generated by MITRE ATT&amp;CK Coverage Tool | ${report.generatedDate || new Date().toLocaleDateString()}</p>
                <p class="tool-info">ATT&amp;CK v${report.attckVersion || '19.1'} | Data sourced from MITRE ATT&amp;CK Framework</p>
                <p class="confidential">Confidential - For authorized recipients only</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

export function buildThreatsSectionEmail(report, isDark = false) {
    if (!state.groups || state.groups.length === 0) {
        return `<div class="section"><h3>Adversary Group Defensive Gap Mapper</h3><p style="margin:0;font-size:12.5px;color:${isDark ? '#94a3b8' : '#64748b'};">Threat intelligence data is not loaded, so adversary group coverage mapping is unavailable for this export.</p></div>`;
    }
    
    // Sort all groups by total techniques used in ATT&CK to find the top threats overall (same as buildThreatsSection)
    const allGroups = state.groups.map(group => {
        const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
        const relatedTechs = techRels.map(r => state.techniques.find(tech => tech.id === r.target_ref)).filter(Boolean);
        
        const coveredCount = relatedTechs.filter(tech => {
            const tid = tech.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid) || report?.snapshot?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        
        const techCount = relatedTechs.length;
        const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
        const gaps = techCount - coveredCount;
        
        return {
            id: group.id,
            name: group.name,
            techCount: techCount,
            coveredCount: coveredCount,
            coveragePct: coveragePct,
            gaps: gaps,
            techniqueIds: techRels.map(r => r.target_ref)
        };
    }).sort((a, b) => b.techCount - a.techCount).slice(0, 5); // Take top 5 overall threat groups
    
    let cardsHtml = '';
    allGroups.forEach(t => {
        const typeLabel = 'Threat Group';
        
        // Determine exposure risk based on count of techniques used
        let exposureLevel = 'Medium';
        let expColor = '#38bdf8';
        let expBg = isDark ? '#0c1424' : '#eff6ff';
        if (t.techCount >= 40) {
            exposureLevel = 'Critical';
            expColor = '#ef4444';
            expBg = isDark ? '#1a0b0b' : '#fef2f2';
        } else if (t.techCount >= 20) {
            exposureLevel = 'High';
            expColor = '#fbbf24';
            expBg = isDark ? '#1c150c' : '#fffbeb';
        }
        
        // Truncate techniques list to top 6 elements
        const techIds = t.techniqueIds?.map(id => getTechniqueIdFromStix(id) || id) || [];
        const truncatedTechIds = techIds.slice(0, 6);
        const extraCount = techIds.length - truncatedTechIds.length;
        const techList = truncatedTechIds.join(', ') + (extraCount > 0 ? `, +${extraCount} more` : '');
        
        const progressColor = t.coveragePct >= 70 ? '#10b981' : t.coveragePct >= 40 ? '#f59e0b' : '#ef4444';
        const progressBg = isDark ? '#25263b' : '#e2e8f0';
        
        cardsHtml += `
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; background-color: ${isDark ? '#121324' : '#fafafa'}; border: 1px solid ${isDark ? '#25263b' : '#e2e8f0'};">
                <tr>
                    <td style="padding: 10px 14px; border: none; vertical-align: middle; width: 60%;">
                        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin: 0 0 4px 0; width: auto;">
                            <tr>
                                <td style="border: none; padding: 0 8px 0 0;"><span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">${typeLabel}</span></td>
                                <td style="border: none; padding: 0;"><span style="font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; background-color: ${expBg}; color: ${expColor}; letter-spacing: 0.5px;">${exposureLevel} Risk</span></td>
                            </tr>
                        </table>
                        <div style="font-size: 14px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'}; margin-bottom: 2px;">${escapeHtml(t.name)}</div>
                        <div style="font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; font-family: monospace; background-color: ${isDark ? '#0f1123' : '#f1f5f9'}; padding: 3px 8px; display: inline-block;">
                            TTPs: ${escapeHtml(techList)}
                        </div>
                    </td>
                    <td style="padding: 10px 14px; border: none; vertical-align: middle; width: 40%; text-align: right;">
                        <div style="font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-bottom: 6px;">Defensive Readiness</div>
                        <div style="font-size: 22px; font-weight: 800; color: ${progressColor}; line-height: 1;">${t.coveragePct}%</div>
                        <div style="height: 6px; background-color: ${progressBg}; margin: 8px 0 6px 0; overflow: hidden;">
                            <div style="width: ${t.coveragePct}%; height: 100%; background-color: ${progressColor};"></div>
                        </div>
                        <div style="font-size: 10px; color: ${isDark ? '#94a3b8' : '#64748b'};">
                            ✓ ${t.coveredCount}/${t.techCount} covered
                            <span style="margin-left: 8px; font-weight: 600; color: ${t.gaps > 0 ? '#ef4444' : '#10b981'};">${t.gaps > 0 ? `${reportIcon('warning', '#ef4444', 11)}${t.gaps} gaps` : `${reportIcon('check', '#10b981', 11)}Complete`}</span>
                        </div>
                    </td>
                </tr>
            </table>
        `;
    });
    
    return `<div class="section"><h3>Adversary Group Defensive Gap Mapper</h3><p style="margin-bottom:12px;font-size:12px;color:${isDark?'#94a3b8':'#64748b'};">This section ranks the top threat actor groups by their relevance to your environment, based on the number of ATT&amp;CK techniques they employ that overlap with your coverage map. Groups are selected by cross-referencing known adversary TTPs against your deployed detection queries, highlighting where your defensive posture is strongest and where critical blind spots exist.</p>${cardsHtml}</div>`;
}

export function buildTechniquesAtRiskEmail(report, isDark = false) {
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
        const tid = getTechniqueIdFromStix(rel.target_ref);
        if (!tid || !zeroCoverageTechs.has(tid)) return;
        
        if (monthTechStixIds.size > 0 && monthTechStixIds.has(rel.target_ref)) {
            const group = state.groups.find(g => g.id === rel.source_ref);
            if (!group) return;
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
            return `<span style="display: inline-block; padding: 2px 6px; margin: 2px; ${isDark ? 'background: #1a0b0b; border: 1px solid #7f1d1d; color: #fca5a5;' : 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;'} font-size: 11px;">${escapeHtml(id)}${name ? ' - ' + escapeHtml(name) : ''}</span>`;
        }).join('');
        const moreText = item.count > 3 ? ` <span style="color: #64748b; font-size: 11px;">+${item.count - 3} more</span>` : '';
        
        html += `<div style="padding: 8px 10px; margin-bottom: 6px; ${isDark ? 'background: #140c0c; border-left: 3px solid #ef4444;' : 'background: #fef2f2; border-left: 3px solid #ef4444;'}">
            <strong style="font-size: 13px; color: ${isDark ? '#fca5a5' : '#991b1b'};">${escapeHtml(item.group)}</strong>
            <span style="font-size: 11px; color: ${isDark ? '#cbd5e1' : '#64748b'}; margin-left: 8px;">${item.count} techniques</span>
            <div style="margin-top: 4px;">${techList}${moreText}</div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}

// Legacy Window Bindings
window.openThreatHuntReportModal = openThreatHuntReportModal;

// Legacy Window Bindings
window.BANNER_THEMES = BANNER_THEMES;
window.loadReportsList = loadReportsList;
window.getTechniquesByMonth = getTechniquesByMonth;
window.getAvailableMonths = getAvailableMonths;
window.getMonthLabel = getMonthLabel;
window.getPreviousMonths = getPreviousMonths;
window.getExistingTechniqueIds = getExistingTechniqueIds;
window.isSubTechnique = isSubTechnique;
window.getColorName = getColorName;
window.renderReportsList = renderReportsList;
window.renderMonthChangelogHTML = renderMonthChangelogHTML;
window.getColorChangesForMonth = getColorChangesForMonth;
window.getNewHuntsForExistingTechniques = getNewHuntsForExistingTechniques;
window.getThreatHuntsForTechnique = getThreatHuntsForTechnique;
window.getTechniqueName = getTechniqueName;
window.getTechniqueStixId = getTechniqueStixId;
window.getTechniqueIdFromStix = getTechniqueIdFromStix;
window.getTechniqueDescription = getTechniqueDescription;
window.getTechniqueTactics = getTechniqueTactics;
window.renderMonthChangelog = renderMonthChangelog;
window.snapshotDynamicContent = snapshotDynamicContent;
window.viewReport = viewReport;
window.buildMethodology = buildMethodology;
window.getThreatsDisruptedCount = getThreatsDisruptedCount;
window.resolveQueryMonth = resolveQueryMonth;
window.getMonthStats = getMonthStats;
window.getOverallCoverageStatsUpToMonth = getOverallCoverageStatsUpToMonth;
window.getTotalUniqueActiveQueriesUpToMonth = getTotalUniqueActiveQueriesUpToMonth;
window.getTotalActiveQueriesUpToMonth = getTotalActiveQueriesUpToMonth;
window.generateLeadershipOverview = generateLeadershipOverview;
window.buildNewQueriesSection = buildNewQueriesSection;
window.buildTechniquesAtRisk = buildTechniquesAtRisk;
window.buildTacticsGraph = buildTacticsGraph;
window.buildChangesSection = buildChangesSection;
window.buildThreatsSection = buildThreatsSection;
window.buildTacticTable = buildTacticTable;
window.buildLanguageTable = buildLanguageTable;
window.getCoverageByTacticUpToMonth = getCoverageByTacticUpToMonth;
window.buildCoverageChanges = buildCoverageChanges;
window.buildDetectionResults = buildDetectionResults;
window.buildReferences = buildReferences;
window.buildAppendix = buildAppendix;
window.generateDynamicAppendix = generateDynamicAppendix;
window.updateReportField = updateReportField;
window.changeReportMonth = changeReportMonth;
window.changeReportTheme = changeReportTheme;
window.markdownToHtml = markdownToHtml;
window.validateReport = validateReport;
window.generateDynamicMonthlyFocus = generateDynamicMonthlyFocus;
window.generateDynamicGapAnalysis = generateDynamicGapAnalysis;
window.generateDynamicRecommendations = generateDynamicRecommendations;
window.TEAM_OPTIONS = TEAM_OPTIONS;
window.getTeamRecommendations = getTeamRecommendations;
window.getEditableTeamRecommendation = getEditableTeamRecommendation;
window.getSentinelCandidatesForReport = getSentinelCandidatesForReport;
window.buildTeamAssignmentsSection = buildTeamAssignmentsSection;
window.updateTeamRecommendation = updateTeamRecommendation;
window.buildRiskHeatMap = buildRiskHeatMap;
window.generateDynamicExecutiveSummary = generateDynamicExecutiveSummary;
window.updateMethodologyField = updateMethodologyField;
window.updateAppendixField = updateAppendixField;
window.addDetectionResult = addDetectionResult;
window.removeDetectionResult = removeDetectionResult;
window.updateDetectionResult = updateDetectionResult;
window.addReference = addReference;
window.removeReference = removeReference;
window.updateReference = updateReference;
window.confirmDeleteReport = confirmDeleteReport;
window.saveAndValidateReport = saveAndValidateReport;
window.exportReportHTMLPDF = exportReportHTMLPDF;
window.exportReportHTML = exportReportHTML;
window.exportReportSVG = exportReportSVG;
window.buildEmailMonthlyActivity = buildEmailMonthlyActivity;
window.buildGapAnalysisVisual = buildGapAnalysisVisual;
window.buildEmailHTML = buildEmailHTML;
window.buildThreatsSectionEmail = buildThreatsSectionEmail;
window.buildTechniquesAtRiskEmail = buildTechniquesAtRiskEmail;

window.buildMonthlyChangelog = buildMonthlyChangelog;
window.getQueryAssociations = getQueryAssociations;
window.shouldIncludeAttackVersionAppendix = shouldIncludeAttackVersionAppendix;

function handleReportAction(action, el, event) {
    const reportId = el.dataset.reportId;
    const index = Number(el.dataset.reportIndex);
    switch (action) {
        case 'open-threat-hunt':
            openThreatHuntReportModal();
            break;
        case 'month-changelog':
            renderMonthChangelog(el.value);
            break;
        case 'view-report':
            viewReport(reportId);
            break;
        case 'delete-report':
            event?.stopPropagation();
            confirmDeleteReport(reportId);
            break;
        case 'change-month':
            changeReportMonth(reportId, el.value);
            break;
        case 'change-theme':
            changeReportTheme(reportId, el.value);
            break;
        case 'update-field':
            updateReportField(reportId, el.dataset.reportField, el.value);
            break;
        case 'save-validate':
            saveAndValidateReport(reportId);
            break;
        case 'export-html-pdf':
            exportReportHTMLPDF(reportId);
            break;
        case 'export-html':
            exportReportHTML(reportId);
            break;
        case 'export-svg':
            exportReportSVG(reportId);
            break;
        case 'update-methodology':
            updateMethodologyField(reportId, el.dataset.reportSection, el.dataset.reportOption, el.checked);
            break;
        case 'update-detection':
            updateDetectionResult(reportId, index, el.dataset.reportField, el.value);
            break;
        case 'remove-detection':
            removeDetectionResult(reportId, index);
            break;
        case 'add-detection':
            addDetectionResult(reportId);
            break;
        case 'update-reference':
            updateReference(reportId, index, el.value);
            break;
        case 'remove-reference':
            removeReference(reportId, index);
            break;
        case 'add-reference':
            addReference(reportId);
            break;
        case 'update-appendix':
            updateAppendixField(reportId, el.dataset.reportField, el.value);
            break;
        case 'add-team':
            addTeamAssignment(reportId, el.value);
            el.value = '';
            break;
        case 'remove-team':
            removeTeamAssignment(reportId, el.dataset.teamId);
            break;
        case 'update-team-recommendation':
            updateTeamRecommendation(reportId, el.dataset.teamId, el.dataset.teamField, el.value);
            break;
        case 'set-view-mode':
            window.setReportsViewMode?.(el.dataset.reportMode || 'cards');
            break;
        case 'delete-all-reports':
            window.confirmDeleteAllReports?.();
            break;
        case 'create-report':
            window.createNewReport?.();
            break;
        case 'generate-report-wizard':
            window.generateReportFromWizard?.();
            break;
    }
}

document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-report-action]');
    if (!el) return;
    const action = el.dataset.reportAction;
    if (['update-field', 'month-changelog', 'change-month', 'change-theme', 'update-methodology', 'update-detection', 'update-reference', 'update-appendix', 'add-team', 'update-team-recommendation'].includes(action)) return;
    handleReportAction(action, el, event);
});

document.addEventListener('change', (event) => {
    const el = event.target.closest('[data-report-action]');
    if (!el) return;
    handleReportAction(el.dataset.reportAction, el, event);
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = event.target.closest('[data-report-action="view-report"]');
    if (!el) return;
    event.preventDefault();
    handleReportAction('view-report', el, event);
});
