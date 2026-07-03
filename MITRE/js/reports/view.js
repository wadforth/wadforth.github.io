export const BANNER_THEMES = {
    blue: { bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', accent: '#3b82f6', label: 'Blue' },
    orange: { bg: 'linear-gradient(135deg, #1a0f00 0%, #4a2800 100%)', accent: '#f97316', label: 'Orange' },
    green: { bg: 'linear-gradient(135deg, #052e16 0%, #0f4a2e 100%)', accent: '#22c55e', label: 'Green' },
    purple: { bg: 'linear-gradient(135deg, #101820 0%, #17232c 100%)', accent: '#7ba8d8', label: 'Graphite' },
    red: { bg: 'linear-gradient(135deg, #2a0a0a 0%, #5f1e1e 100%)', accent: '#ef4444', label: 'Red' },
    teal: { bg: 'linear-gradient(135deg, #042f2e 0%, #0e4a47 100%)', accent: '#14b8a6', label: 'Teal' },
    slate: { bg: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', accent: '#94a3b8', label: 'Slate' },
};

function hexToRgbString(hex) {
    const value = String(hex || '#3b82f6').replace('#', '');
    const bigint = parseInt(value, 16);
    if (Number.isNaN(bigint)) return '59, 130, 246';
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}

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
            hasSubs = state.techniques.some(t => String(t.external_references?.[0]?.external_id || '').startsWith(techId + '.'));
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

function isRawAttackObjectId(value) {
    return /\b(?:malware|tool|intrusion-set|relationship|attack-pattern|campaign|course-of-action)--[0-9a-f-]{8,}\b/i.test(String(value || ''));
}

function resolveAttackObjectName(value) {
    const id = String(value || '').trim();
    if (!id) return '';
    if (!isRawAttackObjectId(id)) return id;
    const collections = [state.groups, state.software, state.techniques, state.mitigations, state.dataSources].filter(Array.isArray);
    for (const collection of collections) {
        const found = collection.find(item => item?.id === id);
        if (found?.name) return found.name;
    }
    return 'Unresolved ATT&CK object. Review ATT&CK relationship import.';
}

function formatAttackRelationshipTarget(value) {
    const id = String(value || '').trim();
    if (!id) return '';
    const techniqueId = getTechniqueIdFromStix(id);
    if (techniqueId) return techniqueId;
    if (!isRawAttackObjectId(id)) return id;
    const resolved = resolveAttackObjectName(id);
    return resolved.startsWith('Unresolved ATT&CK object') ? 'ATT&CK object not loaded' : resolved;
}

function formatReportDate(value, options = {}) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const formatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!options.includeRelative) return formatted;
    const ageDays = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (ageDays < 0 || ageDays > 90) return formatted;
    const age = ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`;
    return `${formatted} (${age})`;
}

function getCoverageWording(coveragePct) {
    if (coveragePct < 30) {
        return {
            posture: 'critical mapped coverage gap',
            descriptor: 'limited mapped coverage',
            interpretation: 'coverage remains immature and significant gaps remain',
            action: 'confirm telemetry, alerting and response readiness before treating mapped queries as operational detection readiness'
        };
    }
    if (coveragePct < 50) {
        return {
            posture: 'developing mapped coverage',
            descriptor: 'initial mapped visibility',
            interpretation: 'mapped visibility exists but remains incomplete',
            action: 'prioritize validation, telemetry health and higher-risk technique gaps'
        };
    }
    if (coveragePct < 70) {
        return {
            posture: 'partial mapped coverage',
            descriptor: 'partial mapped visibility',
            interpretation: 'useful mapped coverage exists but should not be treated as validated detection readiness',
            action: 'validate production deployment, alert quality and response ownership'
        };
    }
    return {
        posture: 'broad mapped coverage',
        descriptor: 'broad mapped visibility',
        interpretation: 'mapped visibility is broad, but validation and response readiness must still be confirmed',
        action: 'continue tuning, validation and ATT&CK drift review'
    };
}

function sanitizeMaturityCopy(text, coveragePct) {
    if (!text) return '';
    if (coveragePct >= 50) return text;
    return String(text)
        .replace(/robust visibility/gi, 'limited mapped coverage')
        .replace(/strong coverage/gi, 'mapped coverage that still requires validation')
        .replace(/comprehensive detection/gi, 'mapped query coverage')
        .replace(/broad detection readiness/gi, 'limited mapped visibility')
        .replace(/mature coverage/gi, 'immature mapped coverage')
        .replace(/well covered/gi, 'partially mapped')
        .replace(/effective protection/gi, 'mapped visibility requiring validation')
        .replace(/minimi[sz]es blind spots/gi, 'identifies remaining blind spots')
        .replace(/prevents attacker behaviour/gi, 'maps to attacker behaviour for validation')
        .replace(/guarantees visibility/gi, 'does not guarantee visibility');
}

function getReportGuardrailText() {
    return 'Mapped coverage indicates that at least one query or detection is associated with a technique. It does not by itself confirm telemetry health, alert quality, false positive tuning, production deployment, analyst response readiness or control effectiveness.';
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
            detail: `${target.withQueries}/${target.total} mapped techniques currently have active queries (${target.coverage}% coverage). Add targeted queries and validate telemetry/alert quality before treating this as detection readiness.`
        });
    }

    if (sentinelCandidates.length > 0) {
        actions.push({
            priority: 'Engineering',
            title: `Review ${sentinelCandidates.length} candidate${sentinelCandidates.length === 1 ? '' : 's'} to convert to Sentinel analytics`,
            detail: 'Promote validated candidates into production Microsoft Sentinel analytics or document why they should remain as backlog items.'
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
            title: 'Validate active queries against telemetry reality',
            detail: 'Confirm active hunt queries still return expected data, archived query state is accurate, and reporting coverage matches available telemetry.'
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

function getSecurityPostureGuidance(coveragePct) {
    return [
        { range: 'A / A+', label: '70-100%', detail: 'Broad mapped visibility. Continue validation, tuning and ATT&CK drift review.', active: coveragePct >= 70 },
        { range: 'B', label: '50-69%', detail: 'Useful coverage with visible gaps. Prioritize tactics below 50% and Sentinel-ready candidates.', active: coveragePct >= 50 && coveragePct < 70 },
        { range: 'C', label: '30-49%', detail: 'Baseline mapping exists, but many attacker behaviours remain unobserved.', active: coveragePct >= 30 && coveragePct < 50 },
        { range: 'D / F', label: '0-29%', detail: 'Critical visibility gap. Focus on core telemetry and high-frequency ATT&CK tactics first.', active: coveragePct < 30 }
    ];
}

function buildSecurityPostureGuidanceSection(coveragePct) {
    const guidance = getSecurityPostureGuidance(coveragePct);
    return `
        <div class="posture-guidance-inline">
            <div class="posture-guidance-title"><i class="bi bi-compass"></i> Security Posture Grading Guidance</div>
            <p>Grades are mapped-visibility indicators. Read them alongside telemetry health, detection quality and response maturity.</p>
            <div class="posture-guidance-grid">
                ${guidance.map(item => `
                    <div class="posture-guidance-band ${item.active ? 'active' : ''}">
                        <strong>${escapeHtml(item.range)}</strong>
                        <span>${escapeHtml(item.label)}</span>
                        <p>${escapeHtml(item.detail)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function buildSecurityPostureGuidanceExport(coveragePct, isDark = false) {
    const guidance = getSecurityPostureGuidance(coveragePct);
    const border = isDark ? '#27303a' : '#dfe7ee';
    const panel = isDark ? '#111820' : '#f8fafc';
    const text = isDark ? '#cbd5e1' : '#475569';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const heading = isDark ? '#ffffff' : '#0f172a';
    return `
        <div id="posture-guidance" style="page-break-inside: avoid; margin-top: 12px; padding: 12px; border: 1px solid ${border}; border-radius: 12px; background-color: ${isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'};"><a name="posture-guidance"></a>
            <div style="font-size: 10px; font-weight: 800; color: ${isDark ? '#9ccfd8' : '#0369a1'}; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">${reportIcon('shield', isDark ? '#9ccfd8' : '#0369a1', 12)}Security Posture Grading Guidance</div>
            <p style="font-size: 11.5px; color: ${text}; margin-bottom: 10px;">Grades summarize mapped ATT&amp;CK visibility only. Use them as a directional signal, not as proof that detections are validated, tuned, monitored or response-ready.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 0;">
                <tr>
                    ${guidance.map(item => `
                        <td style="width:25%; vertical-align: top; padding: 10px; border: 1px solid ${item.active ? (isDark ? '#9ccfd8' : '#0369a1') : border}; background-color: ${item.active ? (isDark ? 'rgba(156,207,216,0.08)' : '#eef7f8') : panel};">
                            <div style="font-size: 16px; font-weight: 800; color: ${item.active ? (isDark ? '#9ccfd8' : '#0369a1') : heading};">${escapeHtml(item.range)}</div>
                            <div style="font-size: 10px; font-weight: 800; color: ${muted}; text-transform: uppercase; letter-spacing: 0.06em; margin: 2px 0 8px;">${escapeHtml(item.label)}</div>
                            <div style="font-size: 11px; line-height: 1.45; color: ${text};">${escapeHtml(item.detail)}</div>
                        </td>
                    `).join('')}
                </tr>
            </table>
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
    const visuals = getExportVisuals(isDark);
    const border = visuals.border;
    const panel = visuals.panel;
    const panelAlt = visuals.panelAlt;
    const text = visuals.text;
    const muted = visuals.muted;
    const heading = visuals.heading;
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
            ${buildExportSectionTitle('ATT&CK Version Impact Appendix', 'Loaded dataset context for framework drift, moved techniques, modified content and retired entries.', isDark, visuals.accent)}
            <div style="background-color: ${panel}; border: 1px solid ${border}; border-radius: 16px; padding: 14px 16px; margin-bottom: 12px;">
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
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: separate; border-spacing: 8px 0; margin: 0 -8px 10px; border: 0;">
                    <tr>
                        <td style="background-color: ${panelAlt}; border: 1px solid ${border}; border-radius: 14px; text-align: center;"><strong>${data.addedTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">New techniques</span></td>
                        <td style="background-color: ${panelAlt}; border: 1px solid ${border}; border-radius: 14px; text-align: center;"><strong>${data.addedTactics.length}</strong><br><span style="font-size: 10px; color: ${muted};">New tactics</span></td>
                        <td style="background-color: ${panelAlt}; border: 1px solid ${border}; border-radius: 14px; text-align: center;"><strong>${data.movedTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">Moved</span></td>
                        <td style="background-color: ${panelAlt}; border: 1px solid ${border}; border-radius: 14px; text-align: center;"><strong>${data.modifiedTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">Modified</span></td>
                        <td style="background-color: ${panelAlt}; border: 1px solid ${border}; border-radius: 14px; text-align: center;"><strong>${data.retiredTechniques.length}</strong><br><span style="font-size: 10px; color: ${muted};">Retired</span></td>
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
    const theme = BANNER_THEMES[currentTheme] || BANNER_THEMES.blue;
    const themeRgb = hexToRgbString(theme.accent);
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
                    <div class="posture-card-label">Active Detection Queries</div>
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
                    <div class="posture-grade-label">Coverage Maturity Grade</div>
                    <div class="posture-grade-value" style="color: ${gradeColor};">${maturityGrade}</div>
                    <div class="posture-grade-detail">mapped visibility grade</div>
                </div>
                <div class="posture-grade-circle" style="color: ${gradeColor};">
                    <span>${maturityGrade.split(' ')[0]}</span>
                </div>
            </div>
            ${buildSecurityPostureGuidanceSection(frameworkCoverage)}
            <div class="posture-note">
                Note: <strong>Maturity Grading:</strong> Grade is calculated from mapped framework technique coverage and does not prove prevention, alert quality, or response readiness.
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${escapeHtml(report.author || state.author || 'the Security Operations Team')}</strong>.
            </div>
        </div>
    `;

    body.innerHTML = `
        <div class="report-editor-workbench" id="report-export-area">
            <header class="report-editor-hero" style="--report-theme-accent: ${escapeHtml(theme.accent)}; --report-theme-rgb: ${escapeHtml(themeRgb)};">
                <div>
                    <span class="report-editor-kicker">Editable report setup</span>
                    <h2>${escapeHtml(report.title || 'MITRE ATT&CK Coverage Report')}</h2>
                    <p>Only editable report inputs are shown here. Dynamic posture, threat mapping, coverage tables, and export-only narrative sections still render in HTML/PDF export.</p>
                </div>
                <div class="report-editor-status">
                    <strong>${escapeHtml(reportMonthLabel)}</strong>
                    <span>${report.type === 'initial' ? 'Initial assessment' : 'Monthly update'}</span>
                </div>
            </header>

            <section class="report-editor-card report-editor-controls">
                <div class="report-editor-card-head"><strong>Report identity & theme</strong><span>editable</span></div>
                <div class="report-editor-control-grid">
                    ${monthSelectorHtml}
                    <label><span>Company name</span><input class="form-control" value="${escapeHtml(report.companyName || state.companyName || '')}" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="companyName" placeholder="Organisation name"></label>
                    <label><span>Prepared by</span><input class="form-control" value="${escapeHtml(report.author || state.author || '')}" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="author" placeholder="Report author"></label>
                    <label><span>Query repository</span><input type="url" class="form-control" value="${escapeHtml(report.queryRepositoryUrl || '')}" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="queryRepositoryUrl" placeholder="https://github.com/org/query-repository"></label>
                    <div class="report-export-options">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="export-dark-mode-toggle" checked>
                            <label class="form-check-label" for="export-dark-mode-toggle">Export in graphite dark mode</label>
                        </div>
                    </div>
                </div>
            </section>

            <div class="report-editor-grid">
                <section class="report-editor-card report-editor-span-2">
                    <div class="report-editor-card-head"><strong>Executive narrative</strong><span>export text</span></div>
                    <div class="report-editor-field-stack">
                        <label><span>Executive summary</span><textarea rows="5" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="executiveSummary" placeholder="High-level report summary...">${escapeHtml(report.executiveSummary || generateDynamicExecutiveSummary(report))}</textarea></label>
                        <label><span>Leadership overview</span><textarea rows="5" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="leadershipOverview" placeholder="Leadership-level context...">${escapeHtml(report.leadershipOverview || generateLeadershipOverview(report))}</textarea></label>
                        <label><span>Monthly focus</span><textarea rows="4" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="monthlyFocus" placeholder="Reporting-period priorities...">${escapeHtml(report.monthlyFocus || generateDynamicMonthlyFocus(report))}</textarea></label>
                    </div>
                </section>

                <section class="report-editor-card">
                    <div class="report-editor-card-head"><strong>Recommendations & gaps</strong><span>export text</span></div>
                    <div class="report-editor-field-stack">
                        <label><span>Strategic recommendations</span><textarea rows="6" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="recommendations" placeholder="Prioritized recommendations...">${escapeHtml(report.recommendations || generateDynamicRecommendations(report))}</textarea></label>
                        <label><span>Gap analysis</span><textarea rows="6" data-report-action="update-field" data-report-id="${safeReportId}" data-report-field="gapAnalysis" placeholder="Coverage gaps and prioritization...">${escapeHtml(report.gapAnalysis || generateDynamicGapAnalysis(report))}</textarea></label>
                    </div>
                </section>

                <section class="report-editor-card report-editor-span-2">
                    <div class="report-editor-card-head"><strong>Team assignments</strong><span>owners</span></div>
                    <div id="team-assignments-container" data-report-id="${safeReportId}">
                        ${buildTeamAssignmentsSection(report)}
                    </div>
                </section>

                <section class="report-editor-card">
                    <div class="report-editor-card-head"><strong>Triggered detection results</strong><span>evidence</span></div>
                    ${detectionResultsHtml}
                </section>

                <section class="report-editor-card report-editor-span-2">
                    <div class="report-editor-card-head"><strong>Methodology & scope</strong><span>controls</span></div>
                    ${methodologyHtml}
                </section>

                <section class="report-editor-card">
                    <div class="report-editor-card-head"><strong>References</strong><span>sources</span></div>
                    ${referencesHtml}
                </section>

                <section class="report-editor-card report-editor-span-2">
                    <div class="report-editor-card-head"><strong>Appendix notes</strong><span>export appendix</span></div>
                    ${appendixHtml}
                </section>
            </div>

            <div class="report-actions report-editor-actions">
                <button class="btn btn-success" data-report-action="save-validate" data-report-id="${safeReportId}"><i class="bi bi-check-circle mr-2"></i>Save & Validate</button>
                <button class="btn btn-outline-primary" data-report-action="export-html" data-report-id="${safeReportId}"><i class="bi bi-file-earmark-html mr-2"></i>Export HTML</button>
                <button class="btn btn-primary" data-report-action="export-html-pdf" data-report-id="${safeReportId}"><i class="bi bi-file-earmark-pdf mr-2"></i>HTML to PDF</button>
                <button class="btn btn-outline-secondary" data-report-action="export-svg" data-report-id="${safeReportId}"><i class="bi bi-filetype-svg mr-2"></i>Export SVG</button>
            </div>
        </div>
    `;

    const modalEl = new bootstrap.Modal(modal);
    modalEl.show();
}

export function generateUnifiedChangelog(report, isEmail = false, theme = null, isDarkParam = null, options = {}) {
    if (typeof window.buildUnifiedActivityFeed === 'function') {
        const isDark = isDarkParam !== null ? isDarkParam : (document.documentElement.getAttribute('data-theme') === 'dark');
        return window.buildUnifiedActivityFeed(report, isDark, isEmail, options);
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
    const coveragePct = getOverallCoverageStatsUpToMonth(month).pct || 0;
    const wording = getCoverageWording(coveragePct);
    
    return `The data presented in this report highlights mapped alignment with the MITRE ATT&CK framework for ${periodLabel}. Current posture reflects ${wording.descriptor}; ${wording.interpretation}. Coverage percentages mean at least one query or detection is associated with a technique, not that telemetry, production alerting, analyst handling or control effectiveness has been validated. Strategic focus should be directed toward zero-coverage gaps, validation quality, telemetry health and response ownership.`;
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
    
    let html = '<div class="report-section new-queries-section activity-feed-like"><h4><i class="bi bi-search"></i> New Threat Hunt Queries</h4>';
    html += `<p class="text-on-surface-secondary mb-3">${allQueries.length} queries deployed for ${getMonthLabel(month)} across ${Object.keys(byLanguage).length} language${Object.keys(byLanguage).length > 1 ? 's' : ''}.</p>`;
    
    // Language summary bar
    html += '<div class="query-lang-summary mb-3">';
    Object.entries(byLanguage).forEach(([lang, queries]) => {
        const langColors = { 'KQL': '#0078d4', 'Splunk': '#01adef', 'Sigma': '#4caf50', 'Elastic': '#f04e23', 'Carbon Black': '#ff6b35' };
        const color = langColors[lang] || '#64748b';
        html += `<span class="query-lang-chip" style="background: ${color}15; color: ${color}; border: 1px solid ${color}30;">${lang}: ${queries.length}</span>`;
    });
    html += '</div>';
    
    html += '<div class="activity-feed-compact"><section class="activity-feed-group status"><header><span></span><strong>New Threat Hunt Queries</strong><em>' + allQueries.length + ' queries</em></header><div class="activity-feed-rows">';
    
    allQueries.forEach(q => {
        const queryName = q.name || 'Unnamed Query';
        const assoc = getQueryAssociations(q, layerTechs);
        const parents = assoc.filter(x => !x.isSub);
        const subs = assoc.filter(x => x.isSub);
        
        const language = getSafeReportLanguage(q.language);
        const langColors = { 'KQL': '#0078d4', 'Splunk': '#01adef', 'Sigma': '#4caf50', 'Elastic': '#f04e23', 'Carbon Black': '#ff6b35' };
        const langColor = langColors[language.raw] || '#64748b';
        
        const mappedIds = [...parents, ...subs].map(t => t.id).join(', ');
        html += `
            <div class="activity-feed-row hunt">
                <code>${escapeHtml(language.raw || 'Query')}</code>
                <div class="activity-feed-main">
                    <div class="activity-feed-titleline">
                        <strong>${escapeHtml(queryName)}</strong>
                        <small>${escapeHtml(formatReportDate(q.created, { includeRelative: true }))}</small>
                    </div>
                    ${q.description ? `<div class="activity-feed-query">${escapeHtml(truncateDescription(q.description, 140))}</div>` : ''}
                    <div class="activity-feed-meta">
                        ${mappedIds ? `<span>${escapeHtml(mappedIds)}</span>` : ''}
                        <span style="border-color:${langColor}40;color:${langColor};">${language.label}</span>
                        ${q.sentinelCandidate ? '<span><i class="bi bi-robot"></i> Candidate to convert to Sentinel analytic</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div></section></div></div>';
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
            const label = formatAttackRelationshipTarget(id);
            const name = getTechniqueName(label) || label;
            return `<span class="roi-tech-chip" title="${escapeHtml(name)}">${escapeHtml(label)}</span>`;
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
        html += '<p class="text-on-surface-secondary mb-3">No triggered detection results were imported for this reporting period. This does not prove active queries produced no alerts unless result ingestion is enabled and complete.</p>';
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
            <i class="bi bi-plus-lg mr-1"></i>Add Triggered Result
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
    const sourceRefs = getQuerySourceReferencesForReport(report, seenUrls);

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

    if (sourceRefs.length > 0) {
        html += `<div class="query-source-references-section mb-3">
            <h6 class="text-on-surface-secondary mb-2"><i class="bi bi-link-45deg mr-1"></i>Query Source References (${sourceRefs.length})</h6>
            <ul class="sigma-ref-list">
                ${sourceRefs.map(sr => `
                    <li class="sigma-ref-item">
                        <span class="sigma-ref-title">${escapeHtml(sr.title)}</span>
                        <a href="${safeLinkHref(sr.url)}" target="_blank" rel="noopener noreferrer" class="sigma-ref-link"><i class="bi bi-link-45deg"></i> ${escapeHtml(sr.url)}</a>
                    </li>
                `).join('')}
            </ul>
        </div>`;
    }

    // User-added references
    if (references.length > 0 || (sigmaRefs.length === 0 && sourceRefs.length === 0)) {
        html += `<h6 class="text-on-surface-secondary mb-2"><i class="bi bi-link-45deg mr-1"></i>Custom References</h6>`;
        references.forEach((ref, idx) => {
            html += `
                <div class="reference-item mb-2 d-flex align-items-center gap-2">
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
        additionalNotes: `Report generated on ${report.generatedDate || new Date().toLocaleDateString()} for ATT&CK v${formatAttackVersion(report.attckVersion || state.currentVersion || 'unknown')}. Re-export the report after changing the report month, layer, team assignments, archived query state, or ATT&CK dataset to refresh dynamic metrics.`
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

function splitReportSourceValues(value) {
    return String(value || '')
        .split(/[\n,]+/)
        .map(v => v.trim())
        .filter(Boolean);
}

function isReportUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
}

function getQuerySigmaUrls(query) {
    return new Set(String(query?.sigmaRuleUrl || '').split('|').map(url => url.trim()).filter(Boolean));
}

function normalizeReportSourceToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/sigmahq\.io\/.*\/(rules\/)?/i, '')
        .replace(/^https?:\/\/github\.com\/sigmahq\/sigma\/blob\/master\/rules\//i, '')
        .replace(/\.(ya?ml)$/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getQuerySigmaSourceTokens(query) {
    return new Set([
        ...String(query?.sigmaRuleUrl || '').split('|'),
        ...String(query?.sigmaRuleTitle || '').split('|'),
        ...String(query?.sigmaRuleId || '').split('|')
    ].map(normalizeReportSourceToken).filter(Boolean));
}

function isDuplicateSigmaSource(query, source) {
    const raw = String(source || '').trim();
    if (!raw) return false;
    if (getQuerySigmaUrls(query).has(raw)) return true;
    const normalizedSource = normalizeReportSourceToken(raw);
    return normalizedSource && getQuerySigmaSourceTokens(query).has(normalizedSource);
}

function renderQuerySourceLinksExport(query, isDark = false) {
    const sources = splitReportSourceValues(query?.source).filter(source => !isDuplicateSigmaSource(query, source));
    if (!sources.length) return '';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const linkColor = isDark ? '#7dd3fc' : '#0284c7';
    const chipBg = isDark ? '#101820' : '#f8fafc';
    const chipBorder = isDark ? '#27303a' : '#e2e8f0';
    return `
        <div style="margin-top: 6px; font-size: 10px; line-height: 1.6; color: ${muted};">
            <strong style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 8px; margin-right: 6px; color: ${muted};">Sources:</strong>
            ${sources.map(source => isReportUrl(source)
                ? `<a href="${safeLinkHref(source)}" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; text-decoration: underline; margin-right: 8px; word-break: break-all;">${escapeHtml(source)}</a>`
                : `<span style="background-color: ${chipBg}; color: ${muted}; border: 1px solid ${chipBorder}; padding: 2px 6px; font-size: 9px; font-weight: bold; margin-right: 6px; vertical-align: middle; display: inline-block;">${escapeHtml(source)}</span>`
            ).join('')}
        </div>
    `;
}

function getQuerySourceReferencesForReport(report, excludedUrls = new Set()) {
    const sourceRefs = [];
    const seen = new Set();
    const repMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (!repMonth || typeof getTechniquesByMonth !== 'function') return sourceRefs;
    const byMonth = getTechniquesByMonth();
    (byMonth[repMonth] || []).forEach(ann => {
        (ann.queries || []).forEach(q => {
            splitReportSourceValues(q.source).forEach(source => {
                if (!isReportUrl(source) || seen.has(source) || isDuplicateSigmaSource(q, source) || excludedUrls.has(source)) return;
                seen.add(source);
                sourceRefs.push({ title: q.name || 'Query source', url: source });
            });
        });
    });
    return sourceRefs;
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
        focus += `Specifically, recent query mappings align to known behaviors associated with advanced persistent threats such as ${topGroups.join(' and ')} and require validation before they are treated as production-ready detections. `;
    } else {
        focus += `Specifically, our recent deployments target novel evasion techniques and emerging adversary playbooks. `;
    }
    
    focus += `By aligning detection engineering against verified threat intelligence, the SOC can prioritize validation, telemetry checks and response readiness against the changing landscape.`;
    
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
    const recommendations = [];
    if (lowCoverage.length > 0) {
        recommendations.push(`**Immediate Priority:** Address critical mapped gaps in ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')}.`);
    }
    if (mediumCoverage.length > 0) {
        recommendations.push(`**Short-term Goal:** Improve mapped query coverage in ${mediumCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')} and validate telemetry/alert quality.`);
    }
    recommendations.push('**Maintenance:** Continue reviewing existing query mappings, scheduled analytics and validation evidence for higher-coverage tactics.');
    recommendations.push('**Threat Intelligence:** Align new queries with current threat actor TTPs targeting low-coverage areas.');
    analysis += recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n');
    
    return analysis;
}

export function generateDynamicRecommendations(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80);
    const items = [];

    if (lowCoverage.length > 0) {
        items.push(`**Close Critical Gaps:** Focus immediate resources on ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')} tactics. These represent high-risk mapped visibility gaps, not confirmed absence of attacker activity.`);
    }

    if (mediumCoverage.length > 0) {
        items.push(`**Strengthen Moderate Coverage:** Develop additional active hunt queries for ${mediumCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')} and validate telemetry health, alert quality and false positive handling.`);
    }

    items.push('**Threat-Aligned Detection:** Prioritize active hunt queries and Sentinel analytic candidates based on threat actor TTPs relevant to the organisation and validate before production promotion.');
    items.push('**Detection Quality:** Review and tune existing queries to reduce false positives, confirm data availability and document response ownership.');
    items.push('**Team Coordination:** Assign specific tactics to accountable teams and establish a regular review cadence for mapped coverage, validation evidence and delivery progress.');

    return `**Strategic Recommendations:**\n\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

export const TEAM_OPTIONS = [
    { id: 'cti', label: 'Cyber Threat Intelligence (CTI)', icon: 'bi-binoculars', color: '#38bdf8' },
    { id: 'engineering', label: 'Detection Engineering', icon: 'bi-gear', color: '#22c55e' },
    { id: 'soc', label: 'Security Operations Center (SOC)', icon: 'bi-shield-check', color: '#fbbf24' },
    { id: 'ir', label: 'Incident Response (IR)', icon: 'bi-exclamation-triangle', color: '#ef4444' },
    { id: 'vuln', label: 'Vulnerability Management', icon: 'bi-bug', color: '#9ccfd8' },
    { id: 'network', label: 'Network Security', icon: 'bi-hdd-network', color: '#06b6d4' },
    { id: 'endpoint', label: 'Endpoint Security', icon: 'bi-laptop', color: '#f97316' },
    { id: 'cloud', label: 'Cloud Security', icon: 'bi-cloud', color: '#7ba8d8' }
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
                    <div style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;">${reportIcon('robot', '#3b82f6', 14)}Candidates to Convert to Microsoft Sentinel Analytics (${candidates.length})</div>
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
    const border = isDark ? '#27303a' : '#d8e0e7';
    const panel = isDark ? '#101820' : '#f8fafc';
    const text = isDark ? '#cbd5e1' : '#475569';
    const heading = isDark ? '#ffffff' : '#0f172a';
    return `
        <div class="section report-basis-export" id="report-basis" style="page-break-inside: avoid; background-color: ${panel}; border: 1px solid ${border}; border-radius: 16px; padding: 14px 16px; margin-bottom: 18px;">
            <div style="display: table; width: 100%; table-layout: fixed;">
                <div style="display: table-cell; width: 140px; vertical-align: top; padding-right: 14px; color: ${isDark ? '#9ccfd8' : '#0369a1'}; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.09em;">Report Basis</div>
                <div style="display: table-cell; vertical-align: top; color: ${text}; font-size: 12.5px; line-height: 1.55;">
                    <strong style="display:block;color:${heading};font-size:13px;margin-bottom:3px;">Export-time data boundary</strong>
                    ${escapeHtml(getReportBasisText(report))}
                </div>
            </div>
        </div>
    `;
}

function buildExportPostureDashboard(metrics, isDark = false) {
    const border = isDark ? '#27303a' : '#d8e0e7';
    const panel = isDark ? '#101820' : '#f8fafc';
    const card = isDark ? '#0c0f12' : '#ffffff';
    const text = isDark ? '#cbd5e1' : '#475569';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const heading = isDark ? '#ffffff' : '#0f172a';
    const accent = isDark ? '#9ccfd8' : '#0369a1';
    const coverageValue = metrics.frameworkCoverage % 1 === 0 ? metrics.frameworkCoverage : metrics.frameworkCoverage.toFixed(1);
    const rows = [
        { label: 'Framework coverage', value: `${coverageValue}%`, detail: `Parent: ${metrics.coverageStats.parents.covered}/${metrics.coverageStats.parents.total} | Sub: ${metrics.coverageStats.subs.covered}/${metrics.coverageStats.subs.total}`, note: metrics.deltaHtml },
        { label: 'Active detection queries', value: metrics.totalQueries, detail: 'active hunt queries recorded', note: metrics.queryDelta > 0 ? `+${metrics.queryDelta} deployed this period` : 'No new queries this period' },
        { label: 'Tactical gaps filled', value: metrics.techniquesCovered, detail: 'techniques covered this period', note: '' },
        { label: getReportMetricLabel(), value: metrics.threatsDisrupted, detail: getReportMetricDetail(), note: '' }
    ];

    return `
        <div id="posture-dashboard" style="page-break-inside: avoid; background-color: ${panel}; border-bottom: 1px solid ${border}; padding: 20px 24px;"><a name="posture-dashboard"></a>
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0;border:0;">
                <tr>
                    <td style="border:0;padding:0 0 12px;vertical-align:top;">
                        <div style="font-size:10px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Posture Snapshot</div>
                        <div style="font-size:13px;color:${text};line-height:1.5;">Compact export summary for mapped ATT&amp;CK visibility, active hunt queries, period progress, and defensive overlap.</div>
                    </td>
                    <td style="border:0;padding:0 0 12px;text-align:right;vertical-align:top;width:210px;">
                        <div style="display:inline-block;text-align:left;background-color:${card};border:1px solid ${border};border-radius:14px;padding:12px 14px;min-width:190px;">
                            <div style="font-size:9px;font-weight:800;color:${muted};text-transform:uppercase;letter-spacing:0.08em;">Security posture grade</div>
                            <div style="font-size:23px;font-weight:900;color:${metrics.gradeColor};line-height:1.1;margin-top:4px;">${escapeHtml(metrics.maturityGrade)}</div>
                            <div style="font-size:10.5px;color:${muted};margin-top:3px;">${metrics.coverageStats.total - metrics.coverageStats.covered} mapped gaps remaining</div>
                        </div>
                    </td>
                </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px;border:0;">
                <tr>
                    ${rows.map(row => `
                        <td width="25%" style="width:25%;vertical-align:top;border:1px solid ${border};background-color:${card};border-radius:14px;padding:13px;">
                            <div style="font-size:9px;font-weight:800;color:${muted};text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(row.label)}</div>
                            <div style="font-size:24px;font-weight:900;color:${heading};line-height:1.05;margin-top:5px;">${escapeHtml(String(row.value))}</div>
                            <div style="font-size:10.5px;color:${text};line-height:1.4;margin-top:5px;">${escapeHtml(row.detail)}</div>
                            ${row.note ? `<div style="font-size:10px;color:${muted};line-height:1.35;margin-top:5px;">${row.note}</div>` : ''}
                        </td>
                    `).join('')}
                </tr>
            </table>
            ${metrics.postureGuidanceHtml}
            <div style="margin-top: 12px; padding: 9px 12px; background-color: ${card}; border: 1px solid ${border}; font-size: 11px; color: ${muted}; line-height: 1.45; text-align: center;">
                Grade is calculated from mapped framework technique coverage and does not prove prevention, alert quality, or response readiness.
            </div>
        </div>
    `;
}

function getExportVisuals(isDark = false) {
    return {
        border: isDark ? '#27303a' : '#d8e0e7',
        borderSoft: isDark ? 'rgba(255,255,255,0.07)' : '#e5edf2',
        panel: isDark ? '#101820' : '#f8fafc',
        panelAlt: isDark ? '#0c0f12' : '#ffffff',
        text: isDark ? '#cbd5e1' : '#334155',
        muted: isDark ? '#94a3b8' : '#64748b',
        heading: isDark ? '#ffffff' : '#0f172a',
        accent: isDark ? '#9ccfd8' : '#0369a1',
        accentSoft: isDark ? 'rgba(156,207,216,0.09)' : '#eef7f8',
        semantic: {
            critical: '#ef4444',
            review: '#f59e0b',
            healthy: '#16a34a',
            info: isDark ? '#7ba8d8' : '#0369a1',
            muted: isDark ? '#94a3b8' : '#64748b'
        }
    };
}

function buildExportSectionTitle(title, subtitle = '', isDark = false, accent = null) {
    const v = getExportVisuals(isDark);
    const color = accent || v.accent;
    return `
        <div class="export-section-title" style="margin-bottom:14px;">
            <div style="font-size:10px;font-weight:900;color:${color};text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px;">${escapeHtml(title)}</div>
            ${subtitle ? `<div style="font-size:12.5px;color:${v.muted};line-height:1.5;max-width:780px;">${escapeHtml(subtitle)}</div>` : ''}
        </div>
    `;
}

function buildExportTierHeading(number, title, subtitle, isDark = false, accent = null) {
    const v = getExportVisuals(isDark);
    const color = accent || v.accent;
    const chapterNumber = String(number).padStart(2, '0');
    return `
        <div class="export-chapter-heading" style="margin:0 0 26px;padding:30px 0 18px;border-top:4px solid ${color};border-bottom:1px solid ${v.border};background:transparent;">
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:0;margin:0;">
                <tr>
                    <td style="width:86px;border:0;padding:0 22px 0 0;vertical-align:top;">
                        <div class="export-chapter-number" style="color:${color};font-size:42px;font-weight:950;line-height:0.95;letter-spacing:-0.08em;">${chapterNumber}</div>
                    </td>
                    <td style="border:0;padding:0;vertical-align:top;">
                        <div style="font-size:10px;font-weight:900;color:${color};text-transform:uppercase;letter-spacing:0.16em;margin-bottom:7px;">Report Section</div>
                        <h2 style="margin:0;color:${v.heading};font-size:34px;font-weight:950;line-height:0.98;letter-spacing:-0.065em;">${escapeHtml(title)}</h2>
                        <p style="margin:9px 0 0;color:${v.muted};font-size:13px;line-height:1.55;max-width:760px;">${escapeHtml(subtitle)}</p>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

function buildStrategicRecommendationsExport(recommendations, isDark = false) {
    if (!recommendations) return '';
    const v = getExportVisuals(isDark);
    return `
        <div class="section" id="recommendations" style="page-break-inside: avoid;"><a name="recommendations"></a>
            ${buildExportSectionTitle('Strategic Recommendations', 'Decision guidance and operating priorities for the next reporting cycle.', isDark, '#7ba8d8')}
            <div style="border:1px solid ${v.border};border-radius:16px;background:${v.panel};padding:16px 18px;color:${v.text};font-size:13px;line-height:1.65;">
                ${markdownToHtml(recommendations)}
            </div>
        </div>
    `;
}

function buildExecutiveSecurityExport({ execSummary, monthlyFocus, leadership }, isDark = false) {
    const v = getExportVisuals(isDark);
    return `
        <div class="section executive-security-export" style="page-break-inside: avoid;">
            ${buildExportSectionTitle('Executive Security Brief', 'Leadership-ready context, current focus areas and strategic guidance.', isDark)}
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:12px 0;margin:0 -12px;border:0;">
                <tr>
                    <td width="58%" style="width:58%;vertical-align:top;border:1px solid ${v.border};border-radius:16px;background:${v.panelAlt};padding:16px;">
                        <div style="font-size:10px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Executive Summary &amp; Context</div>
                        <div style="font-size:13px;line-height:1.65;color:${v.text};">${execSummary ? markdownToHtml(execSummary) : '<p style="font-style:italic;color:#64748b;margin:0;">No executive summary provided for this period.</p>'}</div>
                    </td>
                    <td width="42%" style="width:42%;vertical-align:top;border:1px solid ${isDark ? 'rgba(56,189,248,0.22)' : '#bae6fd'};border-radius:16px;background:${isDark ? 'rgba(56,189,248,0.06)' : '#f0f9ff'};padding:16px;">
                        <div style="font-size:10px;font-weight:900;color:${isDark ? '#38bdf8' : '#0284c7'};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Monthly Strategic Focus Areas</div>
                        <div style="font-size:13px;line-height:1.65;color:${v.text};">${monthlyFocus ? markdownToHtml(monthlyFocus) : '<p style="font-style:italic;color:#64748b;margin:0;">No active monthly focus areas specified.</p>'}</div>
                    </td>
                </tr>
            </table>
            ${leadership ? `<div style="margin-top:14px;border:1px solid ${v.border};border-left:4px solid ${v.accent};border-radius:16px;background:${v.accentSoft};padding:16px;"><div style="font-size:10px;font-weight:900;color:${v.accent};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Strategic Leadership Guidance</div><div style="font-size:13px;line-height:1.65;color:${v.text};">${markdownToHtml(leadership)}</div></div>` : ''}
        </div>
    `;
}

function runReportQaValidation(report) {
    const warnings = [];
    const month = getReportMonth(report);
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const coveragePct = Number(coverageStats?.pct || 0);
    const dynamic = getReportDynamicContent(report);
    const generatedSections = [
        ['Executive summary', report.executiveSummary || dynamic.executiveSummary],
        ['Leadership overview', report.leadershipOverview || dynamic.leadershipOverview],
        ['Gap analysis', report.gapAnalysis || dynamic.gapAnalysis],
        ['Recommendations', report.recommendations || dynamic.recommendations]
    ];
    const lowCoverageBadTerms = /\b(robust visibility|strong coverage|comprehensive detection|broad detection readiness|mature coverage|well covered|effective protection|minimi[sz]es blind spots|prevents attacker behaviour|guarantees visibility)\b/i;

    generatedSections.forEach(([label, text]) => {
        if (coveragePct < 50 && lowCoverageBadTerms.test(String(text || ''))) {
            warnings.push(`${label} contains maturity wording that conflicts with low mapped coverage.`);
        }
        if (isRawAttackObjectId(text)) {
            warnings.push(`${label} contains a raw ATT&CK/STIX object ID.`);
        }
    });

    const recommendationText = String(report.recommendations || dynamic.recommendations || '');
    const numbers = [...recommendationText.matchAll(/^\s*(\d+)\.\s+/gm)].map(match => Number(match[1]));
    if (numbers.length > 1 && numbers.some((number, index) => number !== index + 1)) {
        warnings.push('Recommendation numbering is not sequential. Regenerate recommendations or use automatic ordered lists.');
    }

    if (!report.generatedAt && !report.generatedDate) warnings.push('Report generated date is missing.');
    if (!getReportAttackVersion(report) || getReportAttackVersion(report) === 'unknown') warnings.push('ATT&CK version is missing or unknown.');
    if ((report.detectionResults || []).length === 0) warnings.push('No triggered detection results were imported for this reporting period; this must not be described as no alerts.');

    const allQueries = [];
    (state.currentLayer?.techniques || report.snapshot?.techniques || []).forEach(ann => {
        (ann.queries || []).forEach(q => allQueries.push(q));
    });
    if (allQueries.some(q => q.archived && !q.archiveReason && !q.archivedAt)) warnings.push('Archived queries exist without archive date/reason metadata.');

    ['companyName', 'author'].forEach(field => {
        const value = String(report[field] || state[field] || '').trim();
        if (/^(test|todo|tbd|placeholder|not set)$/i.test(value)) warnings.push(`${field} contains placeholder text.`);
    });

    return [...new Set(warnings)];
}

function buildReportQaWarningsSection(warnings, isDark = false) {
    if (!warnings.length) return '';
    const v = getExportVisuals(isDark);
    return `
        <div class="section report-qa-warnings" id="report-qa-warnings" style="page-break-inside: avoid; border-color: ${isDark ? 'rgba(245,158,11,0.42)' : '#fcd34d'} !important; background: ${isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb'} !important;">
            ${buildExportSectionTitle('Report QA Warnings', 'Generator validation found issues that should be reviewed before production distribution.', isDark, '#f59e0b')}
            <ul style="margin:0;padding-left:18px;color:${v.text};font-size:12.5px;line-height:1.6;">
                ${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}
            </ul>
        </div>
    `;
}

function buildTopNextActionsExport(report, isDark = false) {
    const actions = getTopNextActions(report);
    const v = getExportVisuals(isDark);
    const accents = ['#ef4444', '#f59e0b', '#7ba8d8'];
    return `
        <div class="section" id="top-next-actions" style="page-break-inside: avoid;"><a name="top-next-actions"></a>
            ${buildExportSectionTitle('Top 3 Next Actions', 'The three highest-value follow-ups generated from current coverage, ownership and Sentinel candidate state.', isDark)}
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: separate; border-spacing: 10px 0; margin: 0 -10px; border: 0;">
                <tr>
                ${actions.map((action, index) => `
                    <td width="33.33%" style="width:33.33%;vertical-align:top;border:1px solid ${v.border};border-top:4px solid ${accents[index]};border-radius:16px;background:${v.panel};padding:14px;">
                        <div style="font-size:30px;font-weight:900;color:${accents[index]};line-height:1;margin-bottom:10px;">0${index + 1}</div>
                        <div style="font-size:9px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(action.priority)}</div>
                        <div style="font-size:14px;font-weight:800;color:${v.heading};line-height:1.25;margin-bottom:8px;">${escapeHtml(action.title)}</div>
                        <div style="font-size:12px;color:${v.text};line-height:1.55;">${escapeHtml(action.detail)}</div>
                    </td>
                `).join('')}
                </tr>
            </table>
        </div>
    `;
}

function buildTeamAssignmentsExport(report, isDark = false) {
    const assignedTeams = (report.teamAssignments || []).filter(teamId => TEAM_OPTIONS.some(t => t.id === teamId));
    const v = getExportVisuals(isDark);
    let teamHtml = `<div class="section" id="team-assignments" style="page-break-inside: avoid;"><a name="team-assignments"></a>${buildExportSectionTitle('Team Assignments & Focus Areas', 'Ownership routing for delivery, validation, governance and engineering follow-up.', isDark, '#34d399')}`;

    if (assignedTeams.length === 0) {
        return teamHtml + `<div style="border:1px solid ${v.border};border-radius:16px;background:${v.panel};padding:16px;font-size:12.5px;color:${v.muted};">No teams assigned for this report.</div></div>`;
    }

    teamHtml += `<table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: separate; border-spacing: 10px; margin: 0 -10px; border: 0;">`;
    assignedTeams.forEach((teamId, index) => {
        const team = TEAM_OPTIONS.find(t => t.id === teamId);
        if (!team) return;
        const rec = getEditableTeamRecommendation(teamId, report);
        const sentinelHtml = teamId === 'engineering' ? buildSentinelCandidatesExport(report, isDark) : '';
        if (index % 2 === 0) teamHtml += '<tr>';
        teamHtml += `
                <td width="50%" style="width: 50%; padding: 0; border: 1px solid ${v.border}; vertical-align: top; background-color: ${v.panel}; border-radius: 16px; overflow:hidden;">
                    <div style="padding:12px 14px;border-bottom:1px solid ${v.border};background:${isDark ? 'rgba(255,255,255,0.025)' : '#ffffff'};">
                        <div style="font-size:10px;font-weight:900;color:${team.color};text-transform:uppercase;letter-spacing:0.1em;">Assigned Owner</div>
                        <div style="font-size:15px;font-weight:850;color:${v.heading};margin-top:4px;">${escapeHtml(team.label)}</div>
                    </div>
                    <div style="padding:14px;">
                        <div style="font-size:10px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Focus</div>
                        <div style="font-size:12.5px;color:${v.text};line-height:1.5;margin-bottom:10px;">${escapeHtml(rec.focus)}</div>
                        <div style="font-size:10px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Priority</div>
                        <div style="font-size:12.5px;color:${v.text};line-height:1.5;margin-bottom:10px;">${escapeHtml(rec.priority)}</div>
                        <div style="font-size:10px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Recommended Actions</div>
                        <ul style="margin: 0; padding-left: 16px; color:${v.text}; font-size:12px; line-height:1.55;">
                            ${rec.actions.map(a => `<li style="margin-bottom: 4px;">${escapeHtml(a)}</li>`).join('')}
                        </ul>
                        ${sentinelHtml}
                    </div>
                </td>`;
        if (index % 2 === 1) teamHtml += '</tr>';
    });
    if (assignedTeams.length % 2 === 1) teamHtml += `<td width="50%" style="width: 50%; border: 0; padding: 0;"></td></tr>`;
    teamHtml += '</table></div>';
    return teamHtml;
}

function buildDetectionResultsExport(report, isDark = false) {
    const results = report.detectionResults || [];
    if (results.length === 0) {
        return `<div class="section" id="detection-results" style="page-break-inside: avoid;"><a name="detection-results"></a>${buildExportSectionTitle('Imported Detection Results', 'Alert or hunt execution outcomes imported for this reporting period.', isDark, '#34d399')}<p style="font-size: 12.5px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin: 0;">No detection results were imported for this reporting period. This does not prove active queries produced no alerts unless result ingestion is enabled and complete.</p></div>`;
    }
    return `
        <div class="section" id="detection-results" style="page-break-inside: avoid;"><a name="detection-results"></a>
            ${buildExportSectionTitle('Imported Detection Results', 'Alert or hunt execution outcomes imported for this reporting period.', isDark, '#34d399')}
            <p style="margin-bottom: 12px; font-size: 13px; color: ${isDark ? '#cbd5e1' : '#475569'};">Imported results from executed hunts or alert pipelines. Treat absence of records as an ingestion state, not proof of no alerts.</p>
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

function getThreatGroupRiskRows(report) {
    if (!state.groups || state.groups.length === 0 || !state.relationships || !state.techniques) return [];
    return state.groups.map(group => {
        const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === group.id);
        const relatedTechs = techRels.map(r => state.techniques.find(tech => tech.id === r.target_ref)).filter(Boolean);
        const coveredCount = relatedTechs.filter(tech => {
            const tid = tech.external_references?.[0]?.external_id || '';
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid) || report?.snapshot?.techniques?.find(a => a.techniqueID === tid);
            return ann?.queries && ann.queries.some(q => !q.archived);
        }).length;
        const techCount = relatedTechs.length;
        const coveragePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
        const gaps = techCount - coveredCount;
        const likelihood = techCount >= 150 ? 'Critical' : techCount >= 80 ? 'High' : techCount >= 30 ? 'Medium' : 'Low';
        const impact = coveragePct < 30 ? 'Critical' : coveragePct < 50 ? 'High' : coveragePct < 70 ? 'Medium' : 'Low';
        return { name: resolveAttackObjectName(group.name || group.id), techCount, coveragePct, gaps, likelihood, impact };
    }).filter(row => row.techCount > 0);
}

function buildRiskHeatMapExport(report, isDark = false) {
    const rows = getThreatGroupRiskRows(report);
    const v = getExportVisuals(isDark);
    if (!state.groups || state.groups.length === 0) {
        return `<div class="section" id="risk-heatmap" style="page-break-inside: avoid;"><a name="risk-heatmap"></a>${buildExportSectionTitle('Mapped Risk Distribution', 'Threat group data was not imported, so mapped risk distribution cannot be calculated.', isDark, '#f59e0b')}</div>`;
    }
    if (rows.length === 0) {
        return `<div class="section" id="risk-heatmap" style="page-break-inside: avoid;"><a name="risk-heatmap"></a>${buildExportSectionTitle('Mapped Risk Distribution', 'Threat group relationships are unavailable or did not match mapped techniques for this period.', isDark, '#f59e0b')}</div>`;
    }

    const impacts = ['Critical', 'High', 'Medium', 'Low'];
    const likelihoods = ['Low', 'Medium', 'High', 'Critical'];
    const riskScore = (impact, likelihood) => impacts.indexOf(impact) <= 1 && likelihoods.indexOf(likelihood) >= 2 ? 'critical' : impacts.indexOf(impact) <= 1 ? 'high' : impacts.indexOf(impact) === 2 ? 'medium' : 'low';
    const cellStyle = (count, score) => {
        if (!count) return `background:${isDark ? '#0c0f12' : '#f8fafc'};color:${v.muted};`;
        if (score === 'critical') return `background:${isDark ? 'rgba(239,68,68,0.16)' : '#fef2f2'};color:#ef4444;font-weight:900;`;
        if (score === 'high') return `background:${isDark ? 'rgba(245,158,11,0.14)' : '#fffbeb'};color:#f59e0b;font-weight:900;`;
        if (score === 'medium') return `background:${isDark ? 'rgba(245,158,11,0.08)' : '#fff7ed'};color:#d97706;font-weight:800;`;
        return `background:${isDark ? 'rgba(52,211,153,0.08)' : '#f0fdf4'};color:#16a34a;font-weight:800;`;
    };
    const topRows = [...rows].sort((a, b) => {
        const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        return (order[a.impact] - order[b.impact]) || (order[a.likelihood] - order[b.likelihood]) || b.gaps - a.gaps;
    }).slice(0, 6);

    return `
        <div class="section" id="risk-heatmap" style="page-break-inside: avoid;"><a name="risk-heatmap"></a>
            ${buildExportSectionTitle('Mapped Risk Distribution', 'Compact distribution of threat groups by mapped coverage gap impact and ATT&CK technique-count likelihood.', isDark, '#f59e0b')}
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:11px;line-height:1.4;margin-bottom:10px;">
                <thead><tr><th>Impact / Likelihood</th>${likelihoods.map(label => `<th style="text-align:center;">${label}</th>`).join('')}</tr></thead>
                <tbody>
                    ${impacts.map(impact => `<tr>
                        <td style="border:1px solid ${v.border};font-weight:800;color:${v.heading};">${impact}</td>
                        ${likelihoods.map(likelihood => {
                            const count = rows.filter(row => row.impact === impact && row.likelihood === likelihood).length;
                            return `<td style="border:1px solid ${v.border};text-align:center;${cellStyle(count, riskScore(impact, likelihood))}">${count}</td>`;
                        }).join('')}
                    </tr>`).join('')}
                </tbody>
            </table>
            <div style="font-size:11px;color:${v.muted};line-height:1.45;margin-bottom:10px;">Legend: red = urgent mapped gap risk, amber = needs review, green = lower mapped gap risk, grey = no groups in cell.</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:11px;line-height:1.45;">
                <thead><tr><th>Priority group</th><th>Impact</th><th>Likelihood</th><th>Readiness</th><th>Mapped gaps</th></tr></thead>
                <tbody>${topRows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.impact)}</td><td>${escapeHtml(row.likelihood)}</td><td>${row.coveragePct}%</td><td>${row.gaps}</td></tr>`).join('')}</tbody>
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
                                <i class="bi bi-robot"></i> Candidates to convert to Microsoft Sentinel analytics (${candidates.length})
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
    if (!state.groups || state.groups.length === 0) {
        return '<p class="text-on-surface-tertiary">Threat group data was not imported, so risk distribution cannot be calculated.</p>';
    }
    const rows = getThreatGroupRiskRows(report);
    if (!rows.length) return '<p class="text-on-surface-tertiary">Threat group relationships are unavailable or did not match mapped techniques for this period.</p>';

    const impacts = ['Critical', 'High', 'Medium', 'Low'];
    const likelihoods = ['Low', 'Medium', 'High', 'Critical'];
    const topRows = [...rows].sort((a, b) => b.gaps - a.gaps).slice(0, 6);
    let html = '<div class="risk-heatmap-container"><table class="report-table risk-heatmap-matrix"><thead><tr><th>Impact / Likelihood</th>';
    likelihoods.forEach(label => { html += `<th>${label}</th>`; });
    html += '</tr></thead><tbody>';
    impacts.forEach(impact => {
        html += `<tr><td><strong>${impact}</strong></td>`;
        likelihoods.forEach(likelihood => {
            const count = rows.filter(row => row.impact === impact && row.likelihood === likelihood).length;
            const tone = count === 0 ? 'empty' : (impact === 'Critical' && ['High', 'Critical'].includes(likelihood) ? 'critical' : impact === 'High' ? 'high' : impact === 'Medium' ? 'medium' : 'low');
            html += `<td class="risk-cell ${tone}" aria-label="${count} ${impact} impact, ${likelihood} likelihood group${count === 1 ? '' : 's'}">${count}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<p class="text-on-surface-tertiary text-xs mt-2">Legend: red = urgent mapped gap risk, amber = needs review, green = lower mapped gap risk, grey = no groups in cell.</p>';
    html += '<div class="risk-heatmap-priority-list">';
    topRows.forEach(row => {
        html += `<div><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.impact)} impact / ${escapeHtml(row.likelihood)} likelihood / ${row.coveragePct}% readiness / ${row.gaps} mapped gaps</span></div>`;
    });
    html += '</div></div>';
    return html;
}

export function generateDynamicExecutiveSummary(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const stats = getMonthStats(month);
    
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const overallCoverage = coverageStats.pct % 1 === 0 ? coverageStats.pct : coverageStats.pct.toFixed(1);
    const wording = getCoverageWording(coverageStats.pct || 0);
    
    const mappedThreatEntities = getThreatsDisruptedCount(month);
    
    let summary = `This ${report.type === 'initial' ? 'initial assessment' : 'monthly update'} report covers threat hunting activities for ${report.reportMonth || month}. `;
    
    if (coverageStats.parents && coverageStats.parents.total) {
        const allPct = coverageStats.all.pct % 1 === 0 ? coverageStats.all.pct : coverageStats.all.pct.toFixed(1);
        summary += `Mapped coverage stands at ${overallCoverage}% across ${coverageStats.parents.covered} of ${coverageStats.parents.total} parent techniques (or ${allPct}% across ${coverageStats.all.covered} of ${coverageStats.all.total} total techniques and sub-techniques), indicating ${wording.posture}. `;
    } else {
        summary += `Mapped coverage stands at ${overallCoverage}% across ${coverageStats.covered} of ${coverageStats.total} techniques, indicating ${wording.posture}. `;
    }
    
    if (stats.mainTechs > 0 || stats.subTechs > 0) {
        summary += `During this period, ${stats.mainTechs} new technique${stats.mainTechs !== 1 ? 's' : ''} and ${stats.subTechs} sub-technique${stats.subTechs !== 1 ? 's' : ''} were added to the mapped query portfolio, `;
        summary += `resulting in ${stats.queries} new active hunt quer${stats.queries !== 1 ? 'ies' : 'y'} recorded. `;
    }
    
    if (mappedThreatEntities > 0) {
        summary += `Current mappings overlap ${mappedThreatEntities} threat groups and tools through ATT&CK relationships, indicating where active queries should be validated against known adversary behavior. `;
    }
    
    summary += `${getReportGuardrailText()} Further validation is required before mapped coverage is treated as production detection readiness.`;
    
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
    const qaWarnings = runReportQaValidation(report);
    if (qaWarnings.length) showToast(`Report QA warnings: ${qaWarnings.length} issue${qaWarnings.length === 1 ? '' : 's'} included in export`, 'warning');
    showToast('Opening single-page PDF view...', 'info');
    const darkToggle = document.getElementById('export-dark-mode-toggle');
    const isDark = darkToggle ? darkToggle.checked : true;
    const htmlContent = buildEmailHTML(report, isDark, { isPrint: true, isStandaloneHtml: true }).replace(/<body([^>]*)>/i, '<body class="is-pdf is-single-page-pdf"$1>');
    const printBodyBg = isDark ? '#06080a' : '#ffffff';
    const pageWidthPx = 1200;
    const printWindow = window.open('', '_blank', `width=${pageWidthPx},height=1100`);

    if (!printWindow) {
        showToast('Pop-up blocked. Allow pop-ups to export PDF.', 'warning');
        return;
    }

    try {
        const singlePageScript = `
            <script>
            (() => {
                const pageWidthPx = ${pageWidthPx};
                const printBodyBg = ${JSON.stringify(printBodyBg)};
                const isDark = ${JSON.stringify(isDark)};
                const installSinglePageStyles = () => {
                    const wrapper = document.querySelector('.email-wrapper');
                    const container = document.querySelector('.container');
                    const doc = document.documentElement;
                    const body = document.body;
                    const contentHeight = Math.ceil(Math.max(
                        container?.scrollHeight || 0,
                        wrapper?.scrollHeight || 0,
                        body.scrollHeight || 0,
                        doc.scrollHeight || 0
                    ) + 80);
                    const style = document.createElement('style');
                    style.id = 'single-page-pdf-print-size';
                    style.textContent = '@page { size: ' + pageWidthPx + 'px ' + contentHeight + 'px; margin: 0; }'
                        + '@media print {'
                        + 'html,body{width:' + pageWidthPx + 'px !important;min-width:' + pageWidthPx + 'px !important;height:' + contentHeight + 'px !important;background:' + printBodyBg + ' !important;overflow:visible !important;}'
                        + '.html-export-toolbar{display:none !important;}'
                        + '.email-wrapper{width:' + pageWidthPx + 'px !important;max-width:none !important;margin:0 !important;padding:0 !important;background:' + printBodyBg + ' !important;}'
                        + '.container{width:' + pageWidthPx + 'px !important;max-width:none !important;border-radius:0 !important;box-shadow:none !important;background:' + (isDark ? '#0c0f12' : '#ffffff') + ' !important;}'
                        + '.content{background:' + (isDark ? '#0c0f12' : '#ffffff') + ' !important;}'
                        + '.pdf-page-break{display:none !important;break-before:auto !important;page-break-before:auto !important;height:0 !important;margin:0 !important;border:0 !important;}'
                        + '.tier-container,.section,tr,table{break-inside:auto !important;page-break-inside:auto !important;}'
                        + '.page-number-footer{display:none !important;}'
                        + '.pdf-advisory-bar{display:block !important;}'
                        + 'a{color:inherit;text-decoration:underline;text-underline-offset:2px;}'
                        + '*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}'
                        + '}'
                        + '@media screen {'
                        + '.single-page-print-note{position:sticky;top:0;z-index:50;margin:0;padding:10px 16px;background:' + (isDark ? '#101820' : '#eef7f8') + ';color:' + (isDark ? '#9ccfd8' : '#0369a1') + ';border-bottom:1px solid ' + (isDark ? '#27303a' : '#d8e0e7') + ';font:600 12px system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;}'
                        + '}'
                        + 'body.is-single-page-pdf .pdf-advisory-bar{display:block !important;}';
                    document.head.appendChild(style);
                    const note = document.createElement('div');
                    note.className = 'single-page-print-note';
                    note.textContent = 'Single-page PDF mode: choose Save as PDF. If your browser still paginates, set paper size to custom/default and scale to fit.';
                    document.body.prepend(note);
                };
                window.addEventListener('load', () => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            installSinglePageStyles();
                            setTimeout(() => {
                                window.focus();
                                window.print();
                            }, 250);
                        });
                    });
                });
            })();
            </script>`;
        printWindow.document.open();
        printWindow.document.write(htmlContent.replace('</style>', `
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            html, body { background: ${printBodyBg} !important; }
            body.is-single-page-pdf { width: ${pageWidthPx}px; min-width: ${pageWidthPx}px; }
            body.is-single-page-pdf .email-wrapper { width: ${pageWidthPx}px !important; max-width: none !important; padding: 0 !important; }
            body.is-single-page-pdf .container { width: ${pageWidthPx}px !important; max-width: none !important; box-shadow: none !important; }
            body.is-single-page-pdf .pdf-page-break { display: none !important; break-before: auto !important; page-break-before: auto !important; }
            body.is-single-page-pdf .page-number-footer { display: none !important; }
            @media print {
                body { background: ${printBodyBg} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .email-wrapper { max-width: none !important; width: 100% !important; padding: 0 !important; }
                .container { box-shadow: none !important; border-radius: 0 !important; background-color: ${isDark ? '#0c0f12' : '#ffffff'} !important; }
                .content { background-color: ${isDark ? '#0c0f12' : '#ffffff'} !important; }
                .pdf-page-break { display: none !important; break-before: auto !important; page-break-before: auto !important; }
                a { color: inherit; text-decoration: underline; }
            }
        </style>`).replace('</body>', `${singlePageScript}</body>`));
        printWindow.document.close();
        printWindow.focus();
        showToast('Single-page print view opened. Choose Save as PDF.', 'success');
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
    const qaWarnings = runReportQaValidation(report);
    if (qaWarnings.length) showToast(`Report QA warnings: ${qaWarnings.length} issue${qaWarnings.length === 1 ? '' : 's'} included in export`, 'warning');
    const darkToggle = document.getElementById('export-dark-mode-toggle');
    const isDark = darkToggle ? darkToggle.checked : true;
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
        ? 'width:900px;background:#06080a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#cbd5e1;position:absolute;top:-9999px;left:-9999px;'
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

    const darkToggle = document.getElementById('export-dark-mode-toggle');
    const isDark = darkToggle ? darkToggle.checked : true;

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
                    <strong>Recommendation:</strong> Prioritize targeted hunt queries and validation in these sectors to identify and reduce active blind spots.
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
    const roadmapItems = [
        { color: '#ef4444', label: 'Immediate Defense', detail: `Target and close critical gaps in low-coverage tactics (${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(', ') || 'highest-risk tactics'}).` },
        { color: '#f59e0b', label: 'Query Optimization', detail: 'Refine detection query logic in moderate-coverage sectors to raise them to strong standards.' },
        { color: '#7ba8d8', label: 'Continuous Validation', detail: 'Maintain systematic test-runs against established strong tactics to prevent detection decay.' }
    ];
    html += `
        <div style="background-color: ${isDark ? '#101820' : '#f8fafc'}; border: 1px solid ${isDark ? '#27303a' : '#d8e0e7'}; border-radius: 16px; padding: 16px;">
            ${buildExportSectionTitle('Prioritized Strategic Roadmap', 'Sequenced work to close the highest-risk visibility gaps first.', isDark, '#7ba8d8')}
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: separate; border-spacing: 0 8px; font-size: 12px; margin: 0; border:0;">
                ${roadmapItems.map((item, index) => `
                    <tr>
                        <td style="width: 48px; vertical-align: top; padding: 0 10px 0 0; border: none;">
                            <span style="display: inline-block; width: 34px; height: 34px; line-height: 34px; border-radius: 10px; background-color: ${item.color}; color: #ffffff; text-align: center; font-weight: 900;">${index + 1}</span>
                        </td>
                        <td style="vertical-align: top; padding: 10px 12px; border: 1px solid ${isDark ? '#27303a' : '#d8e0e7'}; border-radius: 12px; background: ${isDark ? '#0c0f12' : '#ffffff'}; color: ${isDark ? '#cbd5e1' : '#334155'};">
                            <strong style="display:block;color:${isDark ? '#ffffff' : '#0f172a'};font-size:13px;margin-bottom:3px;">${escapeHtml(item.label)}</strong>
                            ${escapeHtml(item.detail)}
                        </td>
                    </tr>
                `).join('')}
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
        purple: '#101820',
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
    const qaWarnings = runReportQaValidation(report);

    const contentCoveragePct = getOverallCoverageStatsUpToMonth(month).pct || 0;
    const execSummary = sanitizeMaturityCopy(report.executiveSummary || generateDynamicExecutiveSummary(report), contentCoveragePct);
    const monthlyFocus = sanitizeMaturityCopy(report.monthlyFocus || generateDynamicMonthlyFocus(report), contentCoveragePct);
    const gapAnalysis = sanitizeMaturityCopy(report.gapAnalysis || generateDynamicGapAnalysis(report), contentCoveragePct);
    const leadership = sanitizeMaturityCopy(report.leadershipOverview || generateLeadershipOverview(report), contentCoveragePct);
    const recommendations = sanitizeMaturityCopy(report.recommendations || generateDynamicRecommendations(report), contentCoveragePct);
    const bodyInline = isEmail
        ? isDark
            ? ' style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#cbd5e1;background-color:#06080a;"'
            : ' style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;"'
        : isDark
            ? ' style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;line-height:1.6;color:#cbd5e1;background-color:#06080a;"'
            : ' style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;"';
    const wrapperInline = isEmail
        ? isDark
            ? ' style="width:680px;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#cbd5e1;background-color:#06080a;"'
            : ' style="width:680px;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1e293b;background-color:#f8fafc;"'
        : isDark
            ? ` style="max-width:${isStandaloneHtml ? '900px' : '680px'};margin:0 auto;padding:24px 16px;color:#cbd5e1;background-color:#06080a;"`
            : ` style="max-width:${isStandaloneHtml ? '900px' : '680px'};margin:0 auto;padding:24px 16px;color:#1e293b;background-color:#f8fafc;"`;
    const containerInline = isEmail
        ? isDark
            ? ' style="width:680px;background-color:#0c0f12;border:1px solid #27303a;color:#cbd5e1;"'
            : ' style="width:680px;background-color:#ffffff;border:1px solid #e2e8f0;color:#1e293b;"'
        : isDark
            ? ` style="background-color:#0c0f12;border:1px solid rgba(${accentRgb},0.2);border-radius:12px;overflow:hidden;color:#cbd5e1;"`
            : ' style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;color:#1e293b;"';
    const headerInline = isEmail
        ? ` style="background-color:${fallbackBg};color:#ffffff;padding:28px;text-align:center;border-bottom:3px solid ${theme.accent};font-family:Arial,Helvetica,sans-serif;"`
        : ` style="background-color:${fallbackBg};color:#ffffff;padding:32px 28px 28px;text-align:center;border-bottom:3px solid ${theme.accent};"`;
    const contentInline = isEmail
        ? isDark
            ? ' style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;background-color:#0c0f12;color:#cbd5e1;"'
            : ' style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;background-color:#ffffff;color:#1e293b;"'
        : isDark
            ? ' style="padding:24px 28px;background-color:#0c0f12;color:#cbd5e1;"'
            : ' style="padding:24px 28px;background-color:#ffffff;color:#1e293b;"';
    const footerInline = isEmail
        ? isDark
            ? ' style="background-color:#06080a;padding:16px 28px;text-align:center;border-top:1px solid #27303a;font-family:Arial,Helvetica,sans-serif;color:#64748b;"'
            : ' style="background-color:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#94a3b8;"'
        : isDark
            ? ' style="background-color:#06080a;padding:16px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);color:#64748b;"'
            : ' style="background-color:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;color:#94a3b8;"';
    const standaloneToolbarHtml = isStandaloneHtml ? `
        <div class="html-export-toolbar" role="navigation" aria-label="Export navigation">
            <strong>${escapeHtml(reportTitle)}</strong>
            <span>Generated ${escapeHtml(formatReportDate(report.generatedAt || report.generatedDate || new Date()))}</span>
            <a href="#tier-1">Summary</a>
            <a href="#tier-2">Exposure</a>
            <a href="#tier-3">Progress</a>
            <a href="#tier-4">Evidence</a>
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
                    <div style="background-color: ${isDark ? '#0c0f12' : '#f8fafc'}; border: 1px solid ${isDark ? '#27303a' : '#e2e8f0'}; color: ${isDark ? '#cbd5e1' : '#334155'}; padding: 16px; font-size: 13px; line-height: 1.6;">
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
                    <strong style="color: ${isDark ? '#ffffff' : '#0f172a'}; display: block; margin-bottom: 4px;">Note: Additional Methodology and Scope Notes:</strong>
                    ${markdownToHtml(report.methodologyNotes)}
                </div>
            `;
        }
        const v = getExportVisuals(isDark);
        methodScopeHtml = `<div class="section" id="methodology-scope" style="page-break-inside: avoid;"><a name="methodology-scope"></a>
            ${buildExportSectionTitle('Methodology & Scope', 'How this report was built and what telemetry domains were included.', isDark, '#38bdf8')}
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 -12px; border: 0;">
                <tr>
                    <td valign="top" style="width: 50%; vertical-align: top; border: 1px solid ${v.border}; border-radius: 16px; background: ${v.panel}; padding: 16px;">
                        <div style="font-size:10px;font-weight:900;color:${v.accent};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Hunting Methodology</div>
                            ${selectedMethods.length ? selectedMethods.map(m => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 9px; font-size: 12px; color: ${v.text}; border-collapse: collapse; border:0;">
                                    <tr><td valign="top" style="width: 18px; color: #34d399; font-weight: 900; font-size: 13px; border: none; padding: 0;">+</td><td valign="top" style="padding-left: 6px; border: none; color: ${v.text}; line-height:1.5;">${m}</td></tr>
                                </table>
                            `).join('') : `<p style="color: ${v.muted}; font-size: 12px; font-style: italic; margin: 0;">No specific methodologies specified.</p>`}
                    </td>
                    <td valign="top" style="width: 50%; vertical-align: top; border: 1px solid ${v.border}; border-radius: 16px; background: ${v.panel}; padding: 16px;">
                        <div style="font-size:10px;font-weight:900;color:${isDark ? '#38bdf8' : '#0284c7'};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Defensive Telemetry Scope</div>
                            ${selectedScopes.length ? selectedScopes.map(s => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 9px; font-size: 12px; color: ${v.text}; border-collapse: collapse; border:0;">
                                    <tr><td valign="top" style="width: 18px; color: #38bdf8; font-weight: 900; font-size: 13px; border: none; padding: 0;">+</td><td valign="top" style="padding-left: 6px; border: none; color: ${v.text}; line-height:1.5;">${s}</td></tr>
                                </table>
                            `).join('') : `<p style="color: ${v.muted}; font-size: 12px; font-style: italic; margin: 0;">No specific data scopes specified.</p>`}
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
            const queryRows = newQueries.map(q => {
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
                    <tr>
                        <td style="border: 1px solid ${isDark ? '#27303a' : '#dfe7ee'}; color: ${isDark ? '#ffffff' : '#0f172a'}; font-weight: 700; vertical-align: top;">${escapeHtml(queryName)}</td>
                        <td style="border: 1px solid ${isDark ? '#27303a' : '#dfe7ee'}; vertical-align: top;"><span style="background-color: ${isDark ? '#1e293b' : '#f1f5f9'}; color: ${isDark ? '#cbd5e1' : '#475569'}; padding: 2px 6px; font-size: 9px; font-weight: bold; display: inline-block;">${escapeHtml(q.language || '')}</span>${q.sentinelCandidate ? `<span style="background-color: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; padding: 2px 6px; font-size: 9px; font-weight: bold; margin-left: 6px; display: inline-block;">${reportIcon('robot', '#3b82f6', 11)}Candidate to convert to Sentinel analytic</span>` : ''}</td>
                        <td style="border: 1px solid ${isDark ? '#27303a' : '#dfe7ee'}; color: ${isDark ? '#94a3b8' : '#64748b'}; vertical-align: top;">${q.created ? escapeHtml(formatReportDate(q.created, { includeRelative: true })) : ''}</td>
                        <td style="border: 1px solid ${isDark ? '#27303a' : '#dfe7ee'}; color: ${isDark ? '#cbd5e1' : '#475569'}; vertical-align: top;">
                            ${q.description ? `<div style="font-size: 12px; line-height: 1.5; font-style: italic;">${escapeHtml(q.description)}</div>` : ''}
                            ${renderQuerySourceLinksExport(q, isDark)}
                            ${badgesHtml}
                            ${sigmaLinksHtml}
                        </td>
                    </tr>
                `;
            }).join('');
            newQueriesHtml = `<div class="section" id="query-library"><a name="query-library"></a><h3>${reportIcon('search', isDark ? '#38bdf8' : '#0284c7', 14)}New Query Evidence</h3>
                ${queryRepositoryHtml}
                <p style="margin-bottom: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; font-size: 13px;">${newQueries.length} queries for this period:</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.45;">
                    <thead><tr><th>Query</th><th>Language</th><th>Recorded</th><th>Mappings &amp; sources</th></tr></thead>
                    <tbody>${queryRows}</tbody>
                </table>
            </div>`;
        }
    }

    if (!newQueriesHtml) {
        newQueriesHtml = `<div class="section" id="query-library"><a name="query-library"></a><h3>${reportIcon('search', isDark ? '#38bdf8' : '#0284c7', 14)}New Query Evidence</h3>${queryRepositoryHtml}<p style="color:${isDark ? '#94a3b8' : '#64748b'}; font-size:13px; margin:0;">No new threat hunt queries were recorded for this period.</p></div>`;
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
                <h3>Tactic Coverage Triage</h3>
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
            <h3>${reportIcon('search', isDark ? '#38bdf8' : '#0284c7', 14)}Report Appendix</h3>
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
    const postureGuidanceHtml = buildSecurityPostureGuidanceExport(frameworkCoverage, isDark);

    // Clickable Table of Contents Index using anchors.
    const tocIndexHtml = `
        <nav class="export-toc" aria-label="Report contents">
            <h4>Contents</h4>
            <ol class="export-toc-list">
                <li><a href="#tier-1"><code>01</code><strong>Executive Summary</strong><span>Current position, focus areas and leadership guidance.</span><em class="pdf-page-ref">Page 2</em></a></li>
                <li><a href="#tier-2"><code>02</code><strong>Threat Exposure &amp; Gaps</strong><span>Adversary overlap, zero-coverage exposure, priorities and ownership.</span><em class="pdf-page-ref">Page 3</em></a></li>
                <li><a href="#gap-analysis"><code>03</code><strong>Gap Priorities</strong><span>Tactic visibility, roadmap and mapped coverage gaps.</span><em class="pdf-page-ref">Page 3</em></a></li>
                <li><a href="#tier-3"><code>04</code><strong>Operational Progress</strong><span>Activity history, detection results and coverage movement.</span><em class="pdf-page-ref">Page 4</em></a></li>
                <li><a href="#query-library"><code>05</code><strong>Query Evidence</strong><span>New hunt queries, mappings, Sigma links and deployment state.</span><em class="pdf-page-ref">Page 5</em></a></li>
                <li><a href="#methodology-scope"><code>06</code><strong>Methodology &amp; Scope</strong><span>Telemetry scope, assumptions and assessment method.</span><em class="pdf-page-ref">Page 5</em></a></li>
                <li><a href="#mitre-appendix"><code>07</code><strong>Appendix &amp; References</strong><span>References, ATT&amp;CK version context and export notes.</span><em class="pdf-page-ref">Page 6</em></a></li>
                <li><a href="#top"><code>Top</code><strong>Back to top</strong><span>Normal anchor navigation, export friendly.</span></a></li>
            </ol>
        </nav>
    `;

    // Redesigned Stats Bar - Nested tables to replace flexbox entirely for Outlook support
    const legacyStatsBarHtml = isDark ? `
        <div style="background-color: #0c0f12; padding: 20px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);" id="posture-dashboard"><a name="posture-dashboard"></a>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td width="50%" style="padding: 0 10px 14px 0; border: none; vertical-align: top;">
                        <div style="background-color: #111820; border: 1px solid rgba(${accentRgb}, 0.22); border-radius: 14px; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Framework Coverage</div>
                            <div style="font-size: 26px; font-weight: 800; color: #ffffff; margin-top: 4px; line-height: 1;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                            ${deltaHtml}
                            <div style="font-size: 9px; color: #94a3b8; margin-top: 6px; font-weight: 500;">
                                Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}
                            </div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 0 0 14px 10px; border: none; vertical-align: top;">
                        <div style="background-color: #0c1424; border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 14px; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Active Detection Queries</div>
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
                        <div style="background-color: #0c1c14; border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 14px; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Tactical Gaps Filled</div>
                            <div style="font-size: 26px; font-weight: 800; color: #34d399; margin-top: 4px; line-height: 1;">${techniquesCovered}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px;">techniques covered this period</div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 10px 0 0 10px; border: none; vertical-align: top;">
                        <div style="background-color: #1a150c; border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 14px; padding: 14px; min-height: 90px;">
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
                        <div style="background-color: #101820; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 16px;">
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
            ${postureGuidanceHtml}
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
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Framework Coverage</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 4px; line-height: 1;">${frameworkCoverage % 1 === 0 ? frameworkCoverage : frameworkCoverage.toFixed(1)}%</div>
                            ${deltaHtml}
                            <div style="font-size: 9px; color: #64748b; margin-top: 6px; font-weight: 500;">
                                Parent: ${coverageStats.parents.covered}/${coverageStats.parents.total} • Sub: ${coverageStats.subs.covered}/${coverageStats.subs.total}
                            </div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 0 0 14px 10px; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Active Detection Queries</div>
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
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; min-height: 90px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Tactical Gaps Filled</div>
                            <div style="font-size: 26px; font-weight: 800; color: #16a34a; margin-top: 4px; line-height: 1;">${techniquesCovered}</div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">techniques covered this period</div>
                        </div>
                    </td>
                    <td width="50%" style="padding: 10px 0 0 10px; border: none; vertical-align: top;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; min-height: 90px;">
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
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px;">
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
            ${postureGuidanceHtml}
            <div style="margin-top: 14px; padding: 10px 14px; background-color: #ffffff; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; line-height: 1.4; font-family: sans-serif;">
                Note: <strong>Maturity Grading:</strong> Grade is calculated based on framework technique coverage (A: &ge;70%, B: 50%-70%, C: 30%-50%, D/F: &lt;30%).
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${escapeHtml(report.author || state.author || 'the Security Operations Team')}</strong>.
            </div>
        </div>
    `;

    // Redesigned modern CSS styles
    const stylesHtml = isDark ? `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #cbd5e1; background-color: #06080a; }
        * { box-sizing: border-box; }
        .html-export-toolbar { position: static; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 10px 14px; background: rgba(7, 8, 20, 0.96); border-bottom: 1px solid rgba(255,255,255,0.08); color: #94a3b8; font-size: 11px; }
        .html-export-toolbar strong { color: #ffffff; }
        .html-export-toolbar a { color: #38bdf8; text-decoration: none; font-weight: 700; }
        .html-export-toolbar a:hover { text-decoration: underline; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #0c0f12; border: 1px solid rgba(${accentRgb}, 0.2); border-radius: 12px; overflow: hidden; box-shadow: 0 0 30px rgba(${accentRgb}, 0.1); }
        .header { background-color: ${fallbackBg}; color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; border-bottom: 2px solid ${theme.accent}; }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: none; background: rgba(255,255,255,0.88); padding: 6px 8px; }
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
        .footer { background-color: #06080a; padding: 16px 28px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05); }
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
            border-left: 4px solid #9ccfd8 !important;
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
        .html-export-toolbar { position: static; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 10px 14px; background: rgba(248, 250, 252, 0.96); border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; }
        .html-export-toolbar strong { color: #0f172a; }
        .html-export-toolbar a { color: #0284c7; text-decoration: none; font-weight: 700; }
        .html-export-toolbar a:hover { text-decoration: underline; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04); border: 1px solid #e2e8f0; }
        .header { background-color: ${fallbackBg}; color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; }
        .header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: ${theme.accent}; }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: none; background: rgba(255,255,255,0.88); padding: 6px 8px; }
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
            border-left: 4px solid #0369a1 !important;
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

    const statsBarHtml = buildExportPostureDashboard({
        frameworkCoverage,
        deltaHtml,
        coverageStats,
        totalQueries,
        queryDelta: stats.queries,
        techniquesCovered,
        threatsDisrupted,
        maturityGrade,
        gradeColor,
        postureGuidanceHtml
    }, isDark);

    const reportV9StyleHtml = isEmail ? '' : `
        html { scroll-behavior: smooth; }
        body {
            background: ${isDark ? `radial-gradient(circle at 20% -10%, rgba(${accentRgb},.13), transparent 34rem), radial-gradient(circle at 86% 14%, rgba(216,179,106,.10), transparent 28rem), linear-gradient(180deg,#050607,#090c0f 42%,#06080a)` : '#f3f6f8'} !important;
        }
        .html-export-toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            max-width: 1180px;
            margin: 18px auto 0;
            justify-content: flex-end;
            border: 1px solid ${isDark ? '#2a313a' : '#d8e0e7'} !important;
            border-radius: 18px 18px 0 0;
            background: ${isDark ? 'rgba(12,15,18,.94)' : 'rgba(255,255,255,.94)'} !important;
            backdrop-filter: blur(14px);
        }
        .html-export-toolbar strong { margin-right: auto; }
        .email-wrapper { max-width: 1180px !important; padding: 0 18px 56px !important; }
        .container {
            border-radius: 0 0 24px 24px !important;
            border-color: ${isDark ? '#2a313a' : '#d8e0e7'} !important;
            box-shadow: ${isDark ? '0 30px 100px rgba(0,0,0,.45)' : '0 24px 70px rgba(15,23,42,.12)'} !important;
            background: ${isDark ? '#0c0f12' : '#ffffff'} !important;
        }
        .header {
            text-align: left !important;
            min-height: 235px;
            padding: 34px 38px 32px !important;
            background: ${isDark ? `linear-gradient(135deg, rgba(${accentRgb},.12), transparent 38%), linear-gradient(180deg,#101820,#0c0f12)` : 'linear-gradient(135deg, #eef7f8, #ffffff)'} !important;
            color: ${isDark ? '#e7edf4' : '#0f172a'} !important;
            border-bottom: 1px solid ${isDark ? '#2a313a' : '#d8e0e7'} !important;
        }
        .header::after { display: none !important; }
        .header h1 {
            max-width: 820px;
            margin-top: 20px !important;
            font-size: clamp(34px, 5vw, 54px) !important;
            line-height: .96 !important;
            letter-spacing: -0.075em !important;
            color: inherit !important;
        }
        .export-cover-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 330px;
            gap: 24px;
            align-items: start;
        }
        .export-kicker {
            color: ${theme.accent};
            font: 800 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            letter-spacing: .16em;
            text-transform: uppercase;
        }
        .export-cover-meta {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-top: 34px;
        }
        .export-cover-meta div,
        .export-grade-card,
        .export-guardrail-card {
            border: 1px solid ${isDark ? '#27303a' : '#d8e0e7'};
            border-radius: 14px;
            background: ${isDark ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.72)'};
        }
        .export-cover-meta div { padding: 14px; }
        .export-cover-meta span,
        .export-guardrail-card strong {
            display: block;
            color: ${isDark ? '#7f90a3' : '#64748b'};
            font: 800 9px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            letter-spacing: .12em;
            text-transform: uppercase;
        }
        .export-cover-meta strong {
            display: block;
            margin-top: 7px;
            color: ${isDark ? '#ffffff' : '#0f172a'};
            font-size: 13px;
        }
        .export-cover-side { display: grid; gap: 16px; }
        .export-grade-card {
            display: grid;
            grid-template-columns: minmax(0,1fr) auto;
            gap: 18px;
            align-items: center;
            padding: 22px;
            border-color: ${isDark ? 'rgba(239,104,104,.42)' : '#fecaca'};
            background: ${isDark ? 'rgba(64,20,24,.32)' : '#fff1f2'};
        }
        .export-grade-card strong {
            display: block;
            color: ${isDark ? '#ffffff' : '#0f172a'};
            font-size: 22px;
            letter-spacing: -0.035em;
        }
        .export-grade-card p,
        .export-guardrail-card p {
            margin: 8px 0 0 !important;
            color: ${isDark ? '#d0d8e2' : '#334155'} !important;
            font-size: 12px !important;
            line-height: 1.55 !important;
        }
        .export-grade-card b {
            font-size: 58px;
            line-height: 1;
        }
        .export-guardrail-card { padding: 18px; }
        .export-guardrail-card strong { color: ${theme.accent}; }
        .header .subtitle, .header .report-date, .header .author, .header .attck-version { color: ${isDark ? '#aab6c4' : '#475569'} !important; }
        .header .report-type {
            border-radius: 999px !important;
            color: ${theme.accent} !important;
            background: ${isDark ? 'rgba(156,207,216,.1)' : '#e0f2fe'} !important;
            border-color: ${isDark ? 'rgba(156,207,216,.32)' : '#bae6fd'} !important;
        }
        .content { padding: 34px 42px !important; background: ${isDark ? '#0c0f12' : '#ffffff'} !important; }
        .export-toc {
            margin-bottom: 28px;
            padding: 20px 24px;
            border: 1px solid ${isDark ? '#27303a' : '#dfe7ee'};
            background: ${isDark ? '#0c0f12' : '#ffffff'};
        }
        .export-toc h4 {
            margin: 0 0 16px;
            color: ${theme.accent};
            font: 800 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            letter-spacing: .16em;
            text-transform: uppercase;
        }
        .export-toc-list {
            display: grid;
            gap: 0;
            margin: 0;
            padding: 0;
            list-style: none;
            border-top: 1px solid ${isDark ? '#27303a' : '#dfe7ee'};
        }
        .export-toc-list li { margin: 0; }
        .export-toc-list a {
            display: grid;
            grid-template-columns: 54px minmax(150px, 0.8fr) minmax(0, 1.8fr) auto;
            gap: 14px;
            align-items: baseline;
            padding: 10px 0;
            border-bottom: 1px solid ${isDark ? '#27303a' : '#dfe7ee'};
            color: inherit;
            text-decoration: none;
        }
        .export-toc-list code {
            color: ${isDark ? '#8aa0bd' : '#64748b'};
            font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .export-toc-list strong {
            color: ${isDark ? '#ffffff' : '#0f172a'} !important;
            font-size: 13px;
            letter-spacing: -0.025em;
        }
        .export-toc-list span {
            color: ${isDark ? '#b4c4d6' : '#475569'};
            font-size: 12px;
            line-height: 1.45;
        }
        .export-toc-list em {
            display: none;
            color: ${isDark ? '#7f90a3' : '#94a3b8'};
            font-size: 10px;
            font-style: normal;
        }
        #posture-dashboard { border-bottom-color: ${isDark ? '#2a313a' : '#d8e0e7'} !important; }
        .tier-container {
            margin-top: 52px !important;
        }
        .export-chapter-heading,
        .export-chapter-heading table,
        .export-chapter-heading td {
            border-radius: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
        }
        .export-chapter-heading table {
            border: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
        }
        .export-chapter-heading td {
            border: 0 !important;
        }
        .tier-container > div:not(.page-number-footer):not(.export-chapter-heading),
        .section {
            border-radius: 0 !important;
            box-shadow: none !important;
        }
        .section {
            margin: 0 !important;
            padding: 30px 0 !important;
            border: 0 !important;
            border-bottom: 1px solid ${isDark ? '#27303a' : '#e5edf2'} !important;
            background: transparent !important;
        }
        .section:last-child {
            border-bottom: 0 !important;
        }
        .section > .export-section-title {
            margin-bottom: 18px !important;
        }
        .section h3 {
            padding-left: 0 !important;
            border-left: 0 !important;
            color: ${isDark ? '#e7edf4' : '#0f172a'} !important;
            letter-spacing: -0.035em;
            font-size: 22px !important;
        }
        .tier-container > div:first-child {
            color: ${theme.accent} !important;
        }
        #report-basis h3 { border-radius: 0 !important; }
        table { border: 1px solid ${isDark ? '#27303a' : '#e5edf2'}; border-radius: 14px; overflow: hidden; }
        .header .logo { filter: none !important; background: ${isDark ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.86)'} !important; padding: 7px 10px !important; border: 1px solid ${isDark ? '#27303a' : '#d8e0e7'} !important; }
        .pdf-advisory-bar { background-color: ${isDark ? '#101820' : '#eef7f8'} !important; border-bottom-color: ${isDark ? '#27303a' : '#d8e0e7'} !important; color: ${isDark ? '#9ccfd8' : '#0369a1'} !important; }
        th { background: ${isDark ? '#151a20' : '#f8fafc'} !important; color: ${isDark ? '#9aa8b7' : '#475569'} !important; }
        td { border-color: ${isDark ? '#27303a' : '#eef2f5'} !important; }
        pre, code { white-space: pre-wrap; overflow-wrap: anywhere; }
        .footer { background: ${isDark ? '#07090b' : '#f8fafc'} !important; border-top-color: ${isDark ? '#27303a' : '#e5edf2'} !important; }
        @media print {
            .html-export-toolbar { display: none !important; }
            .email-wrapper { max-width: none !important; padding: 0 !important; }
            .container { border-radius: 0 !important; box-shadow: none !important; }
            .header { min-height: auto; page-break-after: avoid; }
            .export-cover-grid { grid-template-columns: minmax(0, 1fr) 310px; gap: 22px; }
            .export-cover-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .export-toc-list a { grid-template-columns: 44px minmax(130px, 0.8fr) minmax(0, 1.5fr) auto; }
            .section, .tier-container { break-inside: avoid; }
        }
        @media only screen and (max-width: 820px) {
            .export-cover-grid { grid-template-columns: 1fr; }
            .export-cover-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .export-toc-list a { grid-template-columns: 44px minmax(0, 1fr); }
            .export-toc-list span { grid-column: 2; }
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
        ${reportV9StyleHtml}
    </style>
</head>
<body${bodyInline}>
    ${standaloneToolbarHtml}
    <div class="email-wrapper"${wrapperInline}>
        <div class="container" id="top"${containerInline}>
            ${isEmail ? `<div class="advisory-bar" style="background-color: #fffbeb; border-bottom: 1.5px solid #fde68a; padding: 10px 16px; font-size: 11px; color: #b45309; text-align: center; font-family: Arial, Helvetica, sans-serif; font-weight: 600; line-height: 1.4;">
                Outlook-safe summary generated from the interactive MITRE ATT&amp;CK report. Some live dashboard controls are intentionally omitted.
            </div>` : ''}
            <!-- Disclaimer for PDF formats (Pristine layout advisory) -->
            <div class="pdf-advisory-bar" style="display: none; background-color: ${isDark ? '#101820' : '#eef7f8'}; border-bottom: 1.5px solid ${isDark ? '#27303a' : '#d8e0e7'}; padding: 10px 16px; font-size: 11px; color: ${isDark ? '#9ccfd8' : '#0369a1'}; text-align: center; font-family: sans-serif; font-weight: 600; line-height: 1.4;">
                Print Export: This PDF is generated by the browser print engine for selectable text and cleaner pagination.
            </div>
            <div class="header"${headerInline}>
                <div class="export-cover-grid">
                    <div class="export-cover-main">
                        ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Logo">` : ''}
                        <div class="export-kicker">Monthly coverage update / Enterprise ATT&amp;CK v${escapeHtml(formatAttackVersion(getReportAttackVersion(report) || getLoadedAttackVersion()))}</div>
                        <h1>${escapeHtml(reportTitle)}</h1>
                        <p class="subtitle">A dynamic security posture report for detection coverage, adversary overlap, critical gaps, activity history, hunt queries, telemetry scope and export-time limitations.</p>
                        <div class="export-cover-meta">
                            <div><span>Organisation</span><strong>${escapeHtml(report.companyName || state.companyName || 'Not set')}</strong></div>
                            <div><span>Prepared by</span><strong>${escapeHtml(report.author || state.author || 'Security Team')}</strong></div>
                            <div><span>Period</span><strong>${escapeHtml(reportMonthLabel)}</strong></div>
                            <div><span>Classification</span><strong>${escapeHtml(report.classification || 'Internal')}</strong></div>
                        </div>
                    </div>
                    <aside class="export-cover-side">
                        <div class="export-guardrail-card"><strong>Report basis</strong><p>Metrics are calculated at export time from the selected report month, active queries, archived-query state and loaded ATT&amp;CK dataset.</p></div>
                        <div class="export-guardrail-card"><strong>Metric guardrail</strong><p>Coverage means at least one mapped detection/query exists. Track validation quality, telemetry health, false-positive rate and response playbook maturity separately.</p></div>
                        <div class="export-guardrail-card"><strong>Dynamic content policy</strong><p>Sections expand, collapse or show explicit empty states depending on source data. Nothing should disappear silently.</p></div>
                    </aside>
                </div>
            </div>

            ${statsBarHtml}

            ${reportBasisHtml}

            <div class="content"${contentInline}>
                ${options.includeQaWarnings ? buildReportQaWarningsSection(qaWarnings, isDark) : ''}

                ${tocIndexHtml}

                ${topNextActionsHtml}

                <!-- Tier 1: Executive Security Posture Briefing -->
                <div class="tier-container" id="tier-1" style="margin-top: 24px; margin-bottom: 30px;">
                    <a name="tier-1"></a>
                    ${buildExportTierHeading('1', 'Executive Summary', 'Leadership view of mapped coverage, current focus areas and business-facing guidance.', isDark, isDark ? '#9ccfd8' : '#0369a1')}
                    ${buildExecutiveSecurityExport({ execSummary, monthlyFocus, leadership }, isDark)}
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 2 of 5</div>

                <div class="pdf-page-break"></div>

                <!-- Tier 2: Threat Landscape & Strategic Gaps -->
                <div class="tier-container" id="tier-2" style="margin-bottom: 30px;">
                    <a name="tier-2"></a>
                    ${buildExportTierHeading('2', 'Threat Exposure & Gap Priorities', 'Adversary overlap, zero-coverage exposure, roadmap priorities and team ownership.', isDark, isDark ? '#fbbf24' : '#d97706')}
                    
                    ${buildThreatsSectionEmail(report, isDark) ? `<div id="adversary-mapper"><a name="adversary-mapper"></a>${buildThreatsSectionEmail(report, isDark)}</div>` : ''}
                    
                    ${buildTechniquesAtRiskEmail(report, isDark) ? `<div id="techniques-at-risk"><a name="techniques-at-risk"></a>${buildTechniquesAtRiskEmail(report, isDark)}</div>` : ''}

                    ${buildStrategicRecommendationsExport(recommendations, isDark)}
                    
                    ${gapAnalysisHtml}
                    
                    ${teamAssignmentsHtml}
                    
                    ${buildRiskHeatMapExport(report, isDark)}
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 3 of 5</div>

                <div class="pdf-page-break"></div>

                <!-- Tier 3: Operational Hunt Progress -->
                <div class="tier-container" id="tier-3" style="margin-bottom: 30px;">
                    <a name="tier-3"></a>
                    ${buildExportTierHeading('3', 'Operational Progress', 'Reporting-period activity, imported detection results, trend movement and coverage breakdown.', isDark, isDark ? '#34d399' : '#16a34a')}
                    
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
                    ${buildExportTierHeading('4', 'Query Evidence & Appendix', 'New hunt queries, methodology, ATT&CK version context, references and export notes.', isDark, isDark ? '#38bdf8' : '#0284c7')}
                    
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
                            ...activeSigmaReferences.map(sr => `[SigmaHQ] ${sr.title}: ${sr.url}`),
                            ...getQuerySourceReferencesForReport(report, seenUrls).map(sr => `[Query Source] ${sr.title}: ${sr.url}`)
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
                    
                    <div style="background-color: ${isDark ? '#101820' : '#f8fafc'}; border: 1px solid ${isDark ? '#27303a' : '#e2e8f0'}; margin-top: 20px; padding: 14px 18px; overflow: hidden; text-align: left;">
                        <h4 style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'};">${reportIcon('image', isDark ? '#38bdf8' : '#0284c7', 14)}Export Note</h4>
                        <p style="margin: 0; font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; line-height: 1.4;">View the attached SVG snapshot for the full formatted report image.</p>
                    </div>
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 5 of 5</div>
            </div>
 
            <div class="footer"${footerInline}>
                <p>Generated by MITRE ATT&amp;CK Coverage Tool | ${escapeHtml(formatReportDate(report.generatedAt || report.generatedDate || new Date()))}</p>
                <p class="tool-info">ATT&amp;CK v${formatAttackVersion(report.attckVersion || getLoadedAttackVersion() || '19.1')} | Data sourced from MITRE ATT&amp;CK Framework</p>
                <p class="confidential">Confidential - For authorized recipients only</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

export function buildThreatsSectionEmail(report, isDark = false) {
    const v = getExportVisuals(isDark);
    if (!state.groups || state.groups.length === 0) {
        return `<div class="section">${buildExportSectionTitle('Adversary Group Defensive Gap Mapper', 'Threat intelligence data is not loaded, so adversary group coverage mapping is unavailable for this export.', isDark, '#f59e0b')}</div>`;
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
    
    const totalTechniques = allGroups.reduce((sum, group) => sum + group.techCount, 0);
    const totalGaps = allGroups.reduce((sum, group) => sum + group.gaps, 0);
    const avgCoverage = allGroups.length ? Math.round(allGroups.reduce((sum, group) => sum + group.coveragePct, 0) / allGroups.length) : 0;

    const rowsHtml = allGroups.map((t, index) => {
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
        const techIds = t.techniqueIds?.map(formatAttackRelationshipTarget).filter(Boolean) || [];
        const truncatedTechIds = techIds.slice(0, 6);
        const extraCount = techIds.length - truncatedTechIds.length;
        const techList = truncatedTechIds.join(', ') + (extraCount > 0 ? `, +${extraCount} more` : '');
        const progressColor = t.coveragePct >= 70 ? '#10b981' : t.coveragePct >= 40 ? '#f59e0b' : '#ef4444';

        return `
            <tr>
                <td style="border:1px solid ${v.border};vertical-align:top;color:${v.muted};font-weight:900;text-align:center;width:42px;">${index + 1}</td>
                <td style="border:1px solid ${v.border};vertical-align:top;color:${v.heading};font-weight:800;">
                    ${escapeHtml(t.name)}
                    <div style="margin-top:5px;font-family:monospace;font-size:10px;color:${v.muted};line-height:1.45;">${escapeHtml(techList || 'No mapped TTPs')}</div>
                </td>
                <td style="border:1px solid ${v.border};vertical-align:top;white-space:nowrap;"><span style="display:inline-block;background:${expBg};color:${expColor};border:1px solid ${expColor}44;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(exposureLevel)} risk</span></td>
                <td style="border:1px solid ${v.border};vertical-align:top;color:${progressColor};font-size:18px;font-weight:900;white-space:nowrap;">${t.coveragePct}%</td>
                <td style="border:1px solid ${v.border};vertical-align:top;color:${v.text};white-space:nowrap;">${t.coveredCount}/${t.techCount} covered</td>
                <td style="border:1px solid ${v.border};vertical-align:top;color:${t.gaps > 0 ? '#ef4444' : '#10b981'};font-weight:800;white-space:nowrap;">${t.gaps > 0 ? `${t.gaps} gaps` : 'Complete'}</td>
            </tr>
        `;
    }).join('');

    return `<div class="section" id="adversary-mapper-section" style="page-break-inside: avoid;">
        ${buildExportSectionTitle('Adversary Coverage Overlap', 'Threat groups ranked by ATT&CK technique overlap, mapped coverage and remaining gaps.', isDark, '#f59e0b')}
        <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px 14px;border:0;">
            <tr>
                <td width="33.33%" style="width:33.33%;border:1px solid ${v.border};border-radius:14px;background:${v.panel};padding:12px;"><div style="font-size:9px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.08em;">Threat groups ranked</div><div style="font-size:24px;font-weight:900;color:${v.heading};line-height:1;margin-top:6px;">${allGroups.length}</div></td>
                <td width="33.33%" style="width:33.33%;border:1px solid ${v.border};border-radius:14px;background:${v.panel};padding:12px;"><div style="font-size:9px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.08em;">Average mapped coverage</div><div style="font-size:24px;font-weight:900;color:${avgCoverage >= 70 ? '#10b981' : avgCoverage >= 40 ? '#f59e0b' : '#ef4444'};line-height:1;margin-top:6px;">${avgCoverage}%</div></td>
                <td width="33.33%" style="width:33.33%;border:1px solid ${v.border};border-radius:14px;background:${v.panel};padding:12px;"><div style="font-size:9px;font-weight:900;color:${v.muted};text-transform:uppercase;letter-spacing:0.08em;">Mapped gaps</div><div style="font-size:24px;font-weight:900;color:${totalGaps > 0 ? '#ef4444' : '#10b981'};line-height:1;margin-top:6px;">${totalGaps}</div><div style="font-size:10px;color:${v.muted};margin-top:4px;">across ${totalTechniques} adversary techniques</div></td>
            </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:11px;line-height:1.45;">
            <thead><tr><th>Rank</th><th>Threat group</th><th>Exposure</th><th>Mapped coverage</th><th>Mapped count</th><th>Gap state</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    </div>`;
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
    
    let html = `<div class="section"><h3>Threat-Linked Zero-Coverage Techniques</h3>
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
