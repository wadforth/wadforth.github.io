function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadReportsList() {
    if (!state.currentLayer) {
        const container = document.getElementById('reports-list');
        if (container) container.innerHTML = '<p class="text-muted">No active layer loaded.</p>';
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
        const month = ann.monthAdded || new Date().toISOString().slice(0, 7);
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(ann);
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

    if (emptyState) emptyState.classList.add('d-none');

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
                        <i class="bi bi-crosshair me-2"></i>Threat Hunt Report
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
                    <div class="stat-value">${stats.pct}%</div>
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
                <label class="text-muted small me-2">View by Month:</label>
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
                <h5><i class="bi bi-journal-text me-2"></i>Generated Reports</h5>
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
            <h4><i class="bi bi-calendar-event me-2"></i>${getMonthLabel(month)}</h4>
            <span class="changelog-count">${techniques.length} technique${techniques.length === 1 ? '' : 's'} logged</span>
        </div>
    `;

    if (colorChanges.length > 0) {
        html += `
            <div class="changelog-section">
                <h5><i class="bi bi-palette me-2"></i>Status Changes</h5>
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
                            <i class="bi bi-code-slash me-1"></i>
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
                    <h5><i class="bi bi-plus-circle me-2"></i>New Techniques Added</h5>
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
                            ` : '<div class="changelog-item-detail">No queries yet</div>'}
                            ${threatHunts.length > 0 ? `
                                <div class="changelog-item-meta">
                                    <i class="bi bi-crosshair me-1"></i>
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
                    <h5><i class="bi bi-plus-circle me-2"></i>New Sub-techniques Added</h5>
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
                                    <i class="bi bi-crosshair me-1"></i>
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
                <h5><i class="bi bi-crosshair me-2"></i>New Hunts on Existing Techniques</h5>
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
                        ${hunt.sirTicket ? `<div class="changelog-item-meta"><i class="bi bi-ticket-perforated me-1"></i>SIR: ${hunt.sirTicket}</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }

    if (existingTechniques.length > 0 && newHunts.length === 0) {
        html += `
            <div class="changelog-section">
                <h5><i class="bi bi-arrow-repeat me-2"></i>Existing Techniques (No New Hunts)</h5>
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
        if (ann.monthAdded !== month) return;
        if (!ann.queries || ann.queries.length === 0) return;
        
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
            if (q.created) {
                const queryMonth = q.created.slice(0, 7);
                if (queryMonth === month) {
                    hunts.push({
                        techniqueID: ann.techniqueID,
                        huntName: q.name,
                        sirTicket: '',
                        queryId: q.id
                    });
                }
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

function openThreatHuntReportModal() {
    const selectedMonth = document.querySelector('.month-selector-bar select')?.value || new Date().toISOString().slice(0, 7);
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
        changes: { all: [], newTechniques: [], newQueries: [], colorChanges: [], mitigationChanges: [] },
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
        : '<p class="text-muted">No changes detected during this period.</p>';
    
    const threatsHtml = buildThreatsSection({ _reportId: report.id });
    
    const tacticTableHtml = (report.coverageByTactic?.length > 0 || report.type === 'initial') 
        ? buildTacticTable(report.coverageByTactic || getCoverageByTactic(), report) 
        : '<p class="text-muted">No tactic data available.</p>';
    
    const langTableHtml = (report.coverageByLanguage?.length > 0 || report.type === 'initial') 
        ? buildLanguageTable(report.coverageByLanguage || getCoverageByLanguage(), report) 
        : '<p class="text-muted">No language data available.</p>';

    const detectionResultsHtml = buildDetectionResults(report);
    const referencesHtml = buildReferences(report);
    const appendixHtml = buildAppendix(report);
    const methodologyHtml = buildMethodology(report);
    const monthlyChangelogHtml = buildMonthlyChangelog(report);
    const tacticsGraphHtml = buildTacticsGraph(report);
    const newQueriesHtml = buildNewQueriesSection(report);
    const techniquesAtRiskHtml = buildTechniquesAtRisk(report);

    body.innerHTML = `
        <div class="report-viewer" id="report-export-area">
            <div class="report-viewer-header">
                ${logoHtml}
                <h2>${report.companyName || 'MITRE ATT&CK Coverage Report'}</h2>
                <div class="report-type">${report.type === 'initial' ? 'Initial Assessment' : 'Monthly Update'}</div>
                <div class="report-date">${report.reportMonth || report.generatedDate}</div>
                ${report.author ? `<div class="report-date">Prepared by: ${report.author}</div>` : ''}
            </div>

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
                <p class="text-muted mb-3">Threat actors and tools associated with recently added or modified techniques.</p>
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
                        <h6 class="text-muted mb-3">By Tactic</h6>
                        ${tacticTableHtml}
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-muted mb-3">By Query Language</h6>
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

            <div class="report-actions">
                <button class="btn btn-success" onclick="saveAndValidateReport('${report.id}')">
                    <i class="bi bi-check-circle me-2"></i>Save & Validate
                </button>
                <button class="btn btn-primary" onclick="exportReportPDF('${report.id}')">
                    <i class="bi bi-file-earmark-pdf me-2"></i>Export PDF
                </button>
                <button class="btn btn-outline-primary" onclick="exportReportEmail('${report.id}')">
                    <i class="bi bi-file-earmark-html me-2"></i>Export HTML
                </button>
                <button class="btn btn-outline-info" onclick="exportReportEML('${report.id}')">
                    <i class="bi bi-envelope me-2"></i>Export EML
                </button>
                <button class="btn btn-outline-secondary" onclick="printReport()">
                    <i class="bi bi-printer me-2"></i>Print
                </button>
            </div>
        </div>
    `;

    const modalEl = new bootstrap.Modal(modal);
    modalEl.show();
}

function buildMonthlyChangelog(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    if (techniques.length === 0) return '';
    
    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);
    
    let html = '<div class="report-section monthly-activity-section"><h4><i class="bi bi-calendar-check"></i> Monthly Activity Summary</h4>';
    
    if (colorChanges.length > 0) {
        html += '<div class="activity-subsection"><h5 class="activity-title status-title"><i class="bi bi-palette"></i> Status Changes</h5><div class="activity-cards">';
        colorChanges.forEach(change => {
            const techName = getTechniqueName(change.techniqueID);
            const isSub = isSubTechnique(change.techniqueID);
            const typeLabel = isSub ? 'Sub-technique' : 'Technique';
            const fromColor = change.from || 'transparent';
            const toColor = change.to || 'transparent';
            
            html += `
                <div class="activity-card status-card">
                    <div class="activity-card-header">
                        <strong>${change.techniqueID}</strong> - ${techName}
                        <span class="activity-type-badge ${isSub ? 'sub' : 'main'}">${typeLabel}</span>
                    </div>
                    <div class="activity-status-flow">
                        <div class="status-pill" style="background: ${fromColor}; border-color: ${fromColor}">
                            <span class="status-pill-label">${change.fromLabel}</span>
                        </div>
                        <i class="bi bi-arrow-right status-arrow"></i>
                        <div class="status-pill" style="background: ${toColor}; border-color: ${toColor}">
                            <span class="status-pill-label">${change.toLabel}</span>
                        </div>
                    </div>
                    <div class="activity-card-footer">
                        <i class="bi bi-code-slash"></i> Triggered by: "${change.queryName}"
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    const newMains = newTechniques.filter(t => !isSubTechnique(t.techniqueID));
    const newSubs = newTechniques.filter(t => isSubTechnique(t.techniqueID));
    
    if (newMains.length > 0) {
        html += '<div class="activity-subsection"><h5 class="activity-title new-title"><i class="bi bi-plus-circle"></i> New Techniques Added</h5><div class="activity-cards">';
        newMains.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID);
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = ann.queries?.map(q => q.name).join(', ') || 'No queries';
            
            html += `
                <div class="activity-card new-card">
                    <div class="activity-card-header">
                        <strong>${ann.techniqueID}</strong> - ${techName}
                    </div>
                    ${techDesc ? `<div class="activity-card-body"><i class="bi bi-info-circle"></i> ${techDesc}</div>` : ''}
                    ${techTactics.length > 0 ? `<div class="activity-card-body"><i class="bi bi-diagram-3"></i> Tactics: ${techTactics.join(', ')}</div>` : ''}
                    <div class="activity-card-body">
                        <i class="bi bi-code-slash"></i> Queries: ${queryNames}
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    if (newSubs.length > 0) {
        html += '<div class="activity-subsection"><h5 class="activity-title new-title"><i class="bi bi-plus-circle"></i> New Sub-techniques Added</h5><div class="activity-cards">';
        newSubs.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID);
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = ann.queries?.map(q => q.name).join(', ') || 'No queries';
            
            html += `
                <div class="activity-card new-card">
                    <div class="activity-card-header">
                        <strong>${ann.techniqueID}</strong> - ${techName}
                    </div>
                    ${techDesc ? `<div class="activity-card-body"><i class="bi bi-info-circle"></i> ${techDesc}</div>` : ''}
                    ${techTactics.length > 0 ? `<div class="activity-card-body"><i class="bi bi-diagram-3"></i> Tactics: ${techTactics.join(', ')}</div>` : ''}
                    <div class="activity-card-body">
                        <i class="bi bi-code-slash"></i> Queries: ${queryNames}
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    if (newHunts.length > 0) {
        html += '<div class="activity-subsection"><h5 class="activity-title hunt-title"><i class="bi bi-crosshair"></i> New Hunts on Existing Techniques</h5><div class="activity-cards">';
        newHunts.forEach(hunt => {
            const techName = getTechniqueName(hunt.techniqueID);
            const isSub = isSubTechnique(hunt.techniqueID);
            const typeLabel = isSub ? 'Sub-technique' : 'Technique';
            
            html += `
                <div class="activity-card hunt-card">
                    <div class="activity-card-header">
                        <strong>${hunt.techniqueID}</strong> - ${techName}
                        <span class="activity-type-badge ${isSub ? 'sub' : 'main'}">${typeLabel}</span>
                    </div>
                    <div class="activity-card-body">
                        <i class="bi bi-crosshair"></i> Hunt: "${hunt.huntName}"
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    html += '</div>';
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
    
    html += '<div class="methodology-section"><h6 class="text-muted mb-2">Detection Methodologies</h6>';
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
    
    html += '<div class="methodology-section"><h6 class="text-muted mb-2">Scope</h6>';
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
            <label class="form-label text-muted small">Additional Notes</label>
            <textarea class="form-control" rows="2" onchange="updateReportField('${report.id}', 'methodologyNotes', this.value)" placeholder="Any additional methodology notes...">${report.methodologyNotes || ''}</textarea>
        </div>
    `;
    
    return html;
}

function generateLeadershipOverview(report) {
    const stats = report.fullStats || getFullCoverageStats();
    const coveragePct = stats.pct;
    return `This report provides a comprehensive overview of our organization's detection capabilities against the MITRE ATT&CK framework, which is the global standard for understanding adversary behavior. Our security team has implemented detection queries across ${stats.logged} of ${stats.total} known attack techniques, achieving ${coveragePct}% coverage. This means we can detect and respond to ${coveragePct}% of known attacker tactics, techniques, and procedures.`;
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
                        name: q.name,
                        techniqueID: ann.techniqueID,
                        language: q.language,
                        created: q.created
                    });
                }
            });
        }
    });
    
    if (allQueries.length === 0) return '';
    
    const techNameMap = {};
    techniques.forEach(ann => {
        techNameMap[ann.techniqueID] = getTechniqueName(ann.techniqueID);
    });
    
    let html = '<div class="report-section"><h4><i class="bi bi-search"></i> New Threat Hunt Queries</h4>';
    html += `<p class="text-muted mb-3">${allQueries.length} queries for ${getMonthLabel(month)}:</p>`;
    html += '<ul class="query-list">';
    
    allQueries.forEach(q => {
        const queryName = q.name || 'Unnamed Query';
        const techName = techNameMap[q.techniqueID] || '';
        html += `<li><strong>${escapeHtml(queryName)}</strong> <span class="text-muted">(${q.language})</span><br><span class="text-muted small">${q.techniqueID}${techName ? ' - ' + techName : ''}</span></li>`;
    });
    
    html += '</ul></div>';
    return html;
}

function buildTechniquesAtRisk(report) {
    if (!state.techniques || !state.relationships || !state.groups) return '';
    
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
        
        if (!threatGroups[group.name]) threatGroups[group.name] = new Set();
        threatGroups[group.name].add(techId);
    });
    
    const atRisk = [];
    Object.entries(threatGroups).forEach(([groupName, techIds]) => {
        const techArray = [...techIds].slice(0, 5);
        atRisk.push({ group: groupName, techniques: techArray, count: techIds.size });
    });
    
    atRisk.sort((a, b) => b.count - a.count);
    if (atRisk.length === 0) return '';
    
    let html = '<div class="report-section techniques-at-risk"><h4><i class="bi bi-exclamation-triangle"></i> Techniques at Risk</h4>';
    html += '<p class="text-muted mb-3">Zero-coverage techniques used by known threat groups, prioritized by group relevance.</p>';
    
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
    const tactics = report.coverageByTactic || getCoverageByTactic();
    if (tactics.length === 0) return '';
    
    const topTactics = tactics.slice(0, 8);
    
    let html = '<div class="report-section"><h4><i class="bi bi-bar-chart-line"></i> Top Tactics by Coverage</h4>';
    html += '<div class="tactics-graph">';
    
    topTactics.forEach(t => {
        const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const barColor = t.coverage >= 80 ? 'var(--report-success)' : t.coverage >= 50 ? 'var(--report-warning)' : 'var(--report-danger)';
        
        html += `
            <div class="tactic-bar-item">
                <div class="tactic-bar-label">${tacticName}</div>
                <div class="tactic-bar-track">
                    <div class="tactic-bar-fill" style="width: ${t.coverage}%; background: ${barColor}"></div>
                </div>
                <div class="tactic-bar-value">${t.coverage}%</div>
            </div>
        `;
    });
    
    html += '</div></div>';
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
                const fromColor = change.data.from || 'none';
                const toColor = change.data.to || 'none';
                text = `<strong>Priority Updated:</strong> ${change.data.techniqueID} - ${fromColor} → ${toColor}`;
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

function buildThreatsSection(threats) {
    const report = state._cachedReports?.find(r => r.id === threats?._reportId);
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
        return '<p class="text-muted">No techniques added this month.</p>';
    }
    
    if (!state.groups || state.groups.length === 0 || !state.software || state.software.length === 0) {
        return '<p class="text-muted">Threat intelligence data not loaded. Please ensure ATT&CK data is loaded.</p>';
    }
    
    if (!state.relationships || state.relationships.length === 0) {
        return '<p class="text-muted">No threat associations found in the loaded data.</p>';
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
        return '<p class="text-muted">No threat actors or tools associated with this month\'s techniques.</p>';
    }
    
    const sortedThreats = allThreats.sort((a, b) => b.techniques - a.techniques).slice(0, 8);
    
    let html = '<table class="report-table"><thead><tr><th>Type</th><th>Name</th><th>Associated Techniques</th></tr></thead><tbody>';
    
    sortedThreats.forEach(t => {
        const icon = t.type === 'group' ? 'bi-people' : 'bi-cpu';
        const techList = t.techniqueIds?.map(id => {
            const techId = getTechniqueIdFromStix(id);
            const name = getTechniqueName(techId || id);
            return techId ? `${techId} (${name})` : id;
        }).join(', ') || t.techniques;
        
        html += `<tr>
            <td><i class="bi ${icon} me-2"></i>${t.type}</td>
            <td>${t.name}</td>
            <td>${techList}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

function buildTacticTable(tactics, report) {
    if (!tactics || tactics.length === 0) return '<p class="text-muted">No tactic data available.</p>';
    
    let html = '<table class="report-table"><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>';
    
    tactics.forEach(t => {
        const tacticName = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        html += `<tr>
            <td>${tacticName}</td>
            <td>${t.withQueries}/${t.total}</td>
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
    if (!languages || languages.length === 0) return '<p class="text-muted">No language data available.</p>';
    
    let html = '<table class="report-table"><thead><tr><th>Language</th><th>Query Count</th></tr></thead><tbody>';
    
    languages.forEach(l => {
        html += `<tr><td>${l.language}</td><td>${l.count}</td></tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

function buildCoverageChanges(report) {
    const lastReport = state._cachedReports?.find(r => r.id !== report.id && r.type === 'update');
    if (!lastReport) return '<p class="text-muted">No previous update report to compare against.</p>';
    
    const currentTactics = report.coverageByTactic || [];
    const lastTactics = lastReport.coverageByTactic || [];
    
    let html = '<table class="report-table"><thead><tr><th>Tactic</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>';
    
    const allTactics = new Set([...currentTactics.map(t => t.tactic), ...lastTactics.map(t => t.tactic)]);
    
    allTactics.forEach(tactic => {
        const current = currentTactics.find(t => t.tactic === tactic);
        const last = lastTactics.find(t => t.tactic === tactic);
        
        const currentPct = current?.coverage || 0;
        const lastPct = last?.coverage || 0;
        const change = currentPct - lastPct;
        
        const changeIcon = change > 0 ? '<i class="bi bi-arrow-up text-success"></i>' : change < 0 ? '<i class="bi bi-arrow-down text-danger"></i>' : '<i class="bi bi-dash text-muted"></i>';
        const changeText = change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '0%';
        
        const tacticName = tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        html += `<tr>
            <td>${tacticName}</td>
            <td>${lastPct}%</td>
            <td>${currentPct}%</td>
            <td>${changeIcon} ${changeText}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

function buildDetectionResults(report) {
    const results = report.detectionResults || [];
    
    let html = '<div id="detection-results-container">';
    
    if (results.length === 0) {
        html += '<p class="text-muted mb-3">No tangible results for this update.</p>';
    }
    
    results.forEach((result, idx) => {
        html += `
            <div class="detection-result-item mb-3 p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <input type="text" class="form-control form-control-sm me-2" placeholder="Threat Hunt Name" value="${result.huntName || ''}" onchange="updateDetectionResult('${report.id}', ${idx}, 'huntName', this.value)">
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
            <i class="bi bi-plus me-1"></i>Add Detection Result
        </button>
    </div>`;
    
    return html;
}

function buildReferences(report) {
    const references = report.references || [];
    
    let html = '<div id="references-container">';
    
    references.forEach((ref, idx) => {
        html += `
            <div class="reference-item mb-2 d-flex align-items-center gap-2">
                <input type="text" class="form-control form-control-sm" placeholder="Reference URL or description" value="${ref}" onchange="updateReference('${report.id}', ${idx}, this.value)">
                <button class="btn btn-sm btn-outline-danger" onclick="removeReference('${report.id}', ${idx})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    });
    
    html += `
        <button class="btn btn-sm btn-outline-primary" onclick="addReference('${report.id}')">
            <i class="bi bi-plus me-1"></i>Add Reference
        </button>
    </div>`;
    
    return html;
}

function buildAppendix(report) {
    const appendix = report.appendix || {};
    const dynamicAppendix = generateDynamicAppendix(report);
    
    return `
        <div class="mb-3">
            <label class="form-label text-muted small">Methodology</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'methodology', this.value)" placeholder="Describe the methodology used for this assessment...">${appendix.methodology || dynamicAppendix.methodology}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-muted small">Scope</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'scope', this.value)" placeholder="Define the scope of this assessment...">${appendix.scope || dynamicAppendix.scope}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-muted small">Limitations</label>
            <textarea class="form-control" rows="3" onchange="updateAppendixField('${report.id}', 'limitations', this.value)" placeholder="Document any limitations or constraints...">${appendix.limitations || dynamicAppendix.limitations}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label text-muted small">Additional Notes</label>
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
        { field: 'monthlyFocus', label: 'Monthly Focus Areas', dynamic: true },
        { field: 'gapAnalysis', label: 'Gap Analysis & Prioritization', dynamic: true }
    ];
    
    const missing = [];
    requiredFields.forEach(({ field, label, dynamic }) => {
        const value = report[field];
        const isEmpty = !value || value.trim() === '';
        const hasDynamic = dynamic && (
            (field === 'executiveSummary' && generateDynamicExecutiveSummary(report)) ||
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
    
    const newTechCount = techniques.filter(t => !isSubTechnique(t.techniqueID)).length;
    const newSubCount = techniques.filter(t => isSubTechnique(t.techniqueID)).length;
    const totalQueries = techniques.reduce((sum, ann) => sum + (ann.queries?.length || 0), 0);
    
    let focus = `This month's threat hunting activities focused on ${topTactics.length > 0 ? topTactics.join(', ') + ' tactics' : 'multiple tactics'}. `;
    focus += `Added ${newTechCount} new technique${newTechCount !== 1 ? 's' : ''} and ${newSubCount} sub-technique${newSubCount !== 1 ? 's' : ''} with ${totalQueries} detection queries. `;
    
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
    const tactics = report.coverageByTactic || getCoverageByTactic();
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
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    const tactics = report.coverageByTactic || getCoverageByTactic();
    const overallCoverage = tactics.length > 0 ? Math.round(tactics.reduce((sum, t) => sum + t.coverage, 0) / tactics.length) : 0;
    
    const newTechCount = techniques.filter(t => !isSubTechnique(t.techniqueID)).length;
    const newSubCount = techniques.filter(t => isSubTechnique(t.techniqueID)).length;
    const totalQueries = techniques.reduce((sum, ann) => sum + (ann.queries?.length || 0), 0);
    
    const tacticCounts = {};
    techniques.forEach(ann => {
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
    
    summary += `Overall detection coverage stands at ${overallCoverage}% across ${tactics.length} tactics. `;
    
    if (newTechCount > 0 || newSubCount > 0) {
        summary += `During this period, ${newTechCount} new technique${newTechCount !== 1 ? 's' : ''} and ${newSubCount} sub-technique${newSubCount !== 1 ? 's' : ''} were added to the detection portfolio, `;
        summary += `resulting in ${totalQueries} active detection queries. `;
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

function exportThreatHuntPDF(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) return;
    
    showToast('Generating PDF...', 'info');
    
    const content = `
${report.companyName || 'MITRE ATT&CK Coverage Report'}
Threat Hunting Report
${getMonthLabel(report.generatedAt.slice(0, 7))}
${report.author ? `Prepared by: ${report.author}` : ''}

${report.title}
Focus Area: ${report.focus?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
${report.threatActor ? `Threat Actor: ${report.threatActor}` : ''}
${report.techniques ? `Targeted Techniques: ${report.techniques}` : ''}
${report.sources ? `Data Sources: ${report.sources}` : ''}

Hunt Hypothesis
${report.hypothesis || 'No hypothesis provided.'}

Findings
${report.findings || 'No findings documented.'}

Recommendations
${report.recommendations || 'No recommendations provided.'}
    `;
    
    if (typeof window.jspdf !== 'undefined') {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const lines = pdf.splitTextToSize(content, 180);
        pdf.setFontSize(16);
        pdf.text(report.companyName || 'Threat Hunting Report', 15, 20);
        pdf.setFontSize(10);
        pdf.text(lines, 15, 30);
        pdf.save(`threat-hunt-${reportId}.pdf`);
        showToast('PDF exported', 'success');
    } else {
        showToast('jsPDF not loaded', 'error');
    }
}

function exportThreatHuntEmail(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) return;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        h1, h2, h3 { color: #0f172a; }
        .header { text-align: center; border-bottom: 3px solid #3b82f6; padding-bottom: 30px; margin-bottom: 40px; }
        .logo { max-height: 60px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 0.85rem; }
    </style>
</head>
<body>
    <div class="header">
        ${report.companyLogo ? `<img src="${report.companyLogo}" class="logo" alt="Logo">` : ''}
        <h1>${report.companyName || 'Threat Hunting Report'}</h1>
        <p>${getMonthLabel(report.generatedAt.slice(0, 7))}</p>
        ${report.author ? `<p>Prepared by: ${report.author}</p>` : ''}
    </div>

    <div class="section">
        <h2>${report.title}</h2>
        <p><strong>Focus Area:</strong> ${report.focus?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
        ${report.threatActor ? `<p><strong>Threat Actor:</strong> ${report.threatActor}</p>` : ''}
        ${report.techniques ? `<p><strong>Targeted Techniques:</strong> ${report.techniques}</p>` : ''}
        ${report.sources ? `<p><strong>Data Sources:</strong> ${report.sources}</p>` : ''}
    </div>

    <div class="section">
        <h3>Hunt Hypothesis</h3>
        <p>${report.hypothesis || 'No hypothesis provided.'}</p>
    </div>

    <div class="section">
        <h3>Findings</h3>
        <p>${report.findings || 'No findings documented.'}</p>
    </div>

    <div class="section">
        <h3>Recommendations</h3>
        <p>${report.recommendations || 'No recommendations provided.'}</p>
    </div>

    <div class="footer">
        <p>Generated by MITRE ATT&CK Coverage Tool</p>
    </div>
</body>
</html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.download = `threat-hunt-${reportId}.html`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Email HTML exported', 'success');
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

function exportReportPDF(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    showToast('Generating PDF...', 'info');
    
    if (typeof window.jspdf === 'undefined') {
        showToast('PDF library not loaded', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    
    let y = 20;
    
    function checkPage(needed = 20) {
        if (y + needed > pageHeight - 15) { pdf.addPage(); y = 20; }
    }
    
    function addTitle(text) {
        checkPage(15);
        pdf.setFontSize(14);
        pdf.setTextColor(30, 58, 138);
        pdf.setFont(undefined, 'bold');
        pdf.text(text, margin, y);
        y += 2;
        pdf.setDrawColor(59, 130, 246);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, margin + 40, y);
        y += 6;
    }
    
    function addParagraph(text, size = 10, color = [71, 85, 105]) {
        if (!text) return;
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        pdf.setFont(undefined, 'normal');
        const plain = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/\n/g, ' ');
        const lines = pdf.splitTextToSize(plain, contentWidth);
        lines.forEach(line => { checkPage(6); pdf.text(line, margin, y); y += size * 0.4; });
        y += 4;
    }
    
    function addStatsBar(stats) {
        checkPage(25);
        const h = 18, w = contentWidth / stats.length;
        stats.forEach((s, i) => {
            const x = margin + (i * w);
            pdf.setFillColor(248, 250, 252);
            pdf.rect(x, y, w - 1, h, 'F');
            pdf.setDrawColor(226, 232, 240);
            pdf.rect(x, y, w - 1, h, 'S');
            pdf.setFontSize(16);
            pdf.setTextColor(30, 64, 175);
            pdf.setFont(undefined, 'bold');
            pdf.text(String(s.value), x + w/2, y + 8, { align: 'center' });
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            pdf.setFont(undefined, 'normal');
            pdf.text(s.label, x + w/2, y + 14, { align: 'center' });
        });
        y += h + 8;
    }
    
    function addTable(headers, rows) {
        if (!rows || rows.length === 0) return;
        checkPage(20 + rows.length * 8);
        const cw = contentWidth / headers.length, rh = 7;
        pdf.setFillColor(248, 250, 252);
        pdf.rect(margin, y, contentWidth, rh, 'F');
        pdf.setFontSize(8);
        pdf.setTextColor(71, 85, 105);
        pdf.setFont(undefined, 'bold');
        headers.forEach((h, i) => pdf.text(h, margin + (i * cw) + 2, y + 5));
        y += rh;
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(51, 65, 85);
        pdf.setFontSize(9);
        rows.forEach((row, ri) => {
            checkPage(rh + 2);
            pdf.setFillColor(ri % 2 === 0 ? 255 : 248, ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 252);
            pdf.rect(margin, y, contentWidth, rh, 'F');
            row.forEach((cell, ci) => pdf.text(String(cell).substring(0, 30), margin + (ci * cw) + 2, y + 5));
            y += rh;
        });
        y += 4;
    }
    
    // 1. Header - Professional design
    pdf.setFillColor(30, 58, 138);
    pdf.rect(0, 0, pageWidth, 55, 'F');
    
    // Accent line
    pdf.setFillColor(59, 130, 246);
    pdf.rect(0, 55, pageWidth, 2, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text('THREAT HUNTING MITRE MONTHLY UPDATE', margin, 16);
    
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'normal');
    pdf.text(report.companyName || 'MITRE ATT&CK Coverage Report', margin, 24);
    
    pdf.setFontSize(9);
    pdf.setTextColor(191, 219, 254);
    pdf.text(report.reportMonth || report.generatedDate, margin, 32);
    if (report.attckVersion) pdf.text(`ATT&CK Framework v${report.attckVersion}`, margin, 38);
    if (report.author) pdf.text(`Prepared by: ${report.author}`, margin, report.attckVersion ? 44 : 38);
    
    // Report type badge
    const typeText = report.type === 'initial' ? 'INITIAL ASSESSMENT' : 'MONTHLY UPDATE';
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(30, 58, 138);
    const badgeW = pdf.getTextWidth(typeText) + 10;
    pdf.setFillColor(219, 234, 254);
    pdf.roundedRect(pageWidth - margin - badgeW, 14, badgeW, 8, 2, 2, 'F');
    pdf.text(typeText, pageWidth - margin - badgeW / 2, 20, { align: 'center' });
    
    y = 68;
    
    // 2. Stats - Month & Overall
    const tactics = report.coverageByTactic || getCoverageByTactic();
    const overallCoverage = tactics.length > 0 ? Math.round(tactics.reduce((s, t) => s + t.coverage, 0) / tactics.length) : 0;
    const tacticsWithCoverage = tactics.filter(t => t.coverage > 0).length;
    
    // Month stats
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const monthTechniques = byMonth[month] || [];
    const monthNewTechs = monthTechniques.filter(t => !isSubTechnique(t.techniqueID)).length;
    const monthNewSubs = monthTechniques.filter(t => isSubTechnique(t.techniqueID)).length;
    const monthQueries = monthTechniques.reduce((s, a) => s + (a.queries?.length || 0), 0);
    
    addStatsBar([
        { value: `${overallCoverage}%`, label: 'Overall Coverage' },
        { value: tacticsWithCoverage, label: 'Tactics Covered' },
        { value: monthNewTechs + monthNewSubs, label: `New This Month (${monthQueries} queries)` }
    ]);
    
    // 3. Executive Summary
    const execSummary = report.executiveSummary || generateDynamicExecutiveSummary(report);
    if (execSummary) { addTitle('Executive Summary'); addParagraph(execSummary); }
    
    // 4. Leadership Overview
    const leadership = report.leadershipOverview || generateLeadershipOverview(report);
    if (leadership) { addTitle('Leadership Overview'); addParagraph(leadership); }
    
    // 5. Methodology & Scope with descriptions
    if (report.methodology && Object.keys(report.methodology).length > 0) {
        addTitle('Methodology & Scope');
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
        
        const selectedMethods = Object.entries(report.methodology).filter(([, v]) => v).map(([k]) => {
            const name = k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const desc = methodDescriptions[k] || '';
            return desc ? `${name}: ${desc}` : name;
        });
        if (selectedMethods.length) addParagraph('Detection Methodologies:\n' + selectedMethods.join('\n'));
        
        const selectedScopes = report.scope ? Object.entries(report.scope).filter(([, v]) => v).map(([k]) => {
            const name = k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const desc = scopeDescriptions[k] || '';
            return desc ? `${name}: ${desc}` : name;
        }) : [];
        if (selectedScopes.length) addParagraph('Scope:\n' + selectedScopes.join('\n'));
    }
    
    // 6. Top Tactics Graph
    if (tactics.length > 0) {
        addTitle('Top Tactics by Coverage');
        const topTactics = tactics.slice(0, 8);
        topTactics.forEach(t => {
            checkPage(10);
            const name = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).substring(0, 20);
            const barW = 80, fillW = (t.coverage / 100) * barW;
            pdf.setFontSize(9);
            pdf.setTextColor(51, 65, 85);
            pdf.setFont(undefined, 'normal');
            pdf.text(name, margin, y + 4);
            pdf.setFillColor(226, 232, 240);
            pdf.rect(margin + 60, y, barW, 5, 'F');
            const c = t.coverage >= 80 ? [34, 197, 94] : t.coverage >= 50 ? [234, 179, 8] : [239, 68, 68];
            pdf.setFillColor(...c);
            pdf.rect(margin + 60, y, fillW, 5, 'F');
            pdf.text(`${t.coverage}%`, margin + 60 + barW + 3, y + 4);
            y += 8;
        });
        y += 4;
    }
    
    // 7. Monthly Activity Summary
    if (month) {
        const byMonth = getTechniquesByMonth();
        const techniques = byMonth[month] || [];
        if (techniques.length > 0) {
            addTitle('Monthly Activity Summary');
            const newMains = techniques.filter(t => !isSubTechnique(t.techniqueID));
            const newSubs = techniques.filter(t => isSubTechnique(t.techniqueID));
            const totalQueries = techniques.reduce((s, a) => s + (a.queries?.length || 0), 0);
            pdf.setFontSize(10);
            pdf.setTextColor(71, 85, 105);
            pdf.setFont(undefined, 'normal');
            pdf.text(`New Techniques: ${newMains.length}  |  New Sub-techniques: ${newSubs.length}  |  Total Queries: ${totalQueries}`, margin, y);
            y += 8;
            
            if (newMains.length > 0) {
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(30, 58, 138);
                pdf.text('New Techniques:', margin, y);
                y += 6;
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(51, 65, 85);
                newMains.slice(0, 8).forEach(ann => {
                    checkPage(6);
                    pdf.text(`• ${ann.techniqueID} - ${getTechniqueName(ann.techniqueID)}`, margin + 3, y);
                    y += 5;
                });
                if (newMains.length > 8) {
                    pdf.setFontSize(9);
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`... and ${newMains.length - 8} more`, margin + 3, y);
                    y += 5;
                    pdf.setFontSize(10);
                    pdf.setTextColor(51, 65, 85);
                }
                y += 3;
            }
            
            if (newSubs.length > 0) {
                checkPage(15);
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(30, 58, 138);
                pdf.text('New Sub-techniques:', margin, y);
                y += 6;
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(51, 65, 85);
                newSubs.slice(0, 8).forEach(ann => {
                    checkPage(6);
                    pdf.text(`• ${ann.techniqueID} - ${getTechniqueName(ann.techniqueID)}`, margin + 3, y);
                    y += 5;
                });
                if (newSubs.length > 8) {
                    pdf.setFontSize(9);
                    pdf.setTextColor(100, 116, 139);
                    pdf.text(`... and ${newSubs.length - 8} more`, margin + 3, y);
                    y += 5;
                    pdf.setFontSize(10);
                    pdf.setTextColor(51, 65, 85);
                }
                y += 3;
            }
        }
    }
    
    // 7b. New Threat Hunt Queries
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
                        newQueries.push({ name: q.name, techniqueID: ann.techniqueID, language: q.language });
                    }
                });
            }
        });
        
        if (newQueries.length > 0) {
            addTitle('New Threat Hunt Queries');
            pdf.setFontSize(10);
            pdf.setTextColor(71, 85, 105);
            pdf.setFont(undefined, 'normal');
            pdf.text(`${newQueries.length} queries for this period:`, margin, y);
            y += 6;
            
            newQueries.forEach(q => {
                checkPage(6);
                const techName = getTechniqueName(q.techniqueID);
                const queryName = q.name || 'Unnamed Query';
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(30, 58, 138);
                pdf.text(`• ${queryName}`, margin + 3, y);
                y += 5;
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(100, 116, 139);
                pdf.setFontSize(8);
                pdf.text(`  ${q.language} | ${q.techniqueID}${techName ? ' - ' + techName : ''}`, margin + 3, y);
                y += 4;
                pdf.setFontSize(10);
                pdf.setTextColor(71, 85, 105);
            });
            y += 3;
        }
    }
    
    // 8. Top Associated Threats
    const mThreats = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (mThreats) {
        const byM = getTechniquesByMonth();
        const techs = byM[mThreats] || [];
        const techStixIds = new Set();
        techs.forEach(a => {
            const stixId = getTechniqueStixId(a.techniqueID);
            if (stixId) techStixIds.add(stixId);
        });
        
        if (state.relationships?.length > 0 && techStixIds.size > 0) {
            const tMap = { groups: [], software: [] };
            state.relationships.forEach(rel => {
                if (rel.relationship_type !== 'uses') return;
                if (!techStixIds.has(rel.target_ref)) return;
                const g = state.groups?.find(x => x.id === rel.source_ref);
                if (g) {
                    let e = tMap.groups.find(x => x.id === g.id);
                    if (!e) { e = { id: g.id, name: g.name, count: 0 }; tMap.groups.push(e); }
                    e.count++;
                    return;
                }
                const s = state.software?.find(x => x.id === rel.source_ref);
                if (s) {
                    let e = tMap.software.find(x => x.id === s.id);
                    if (!e) { e = { id: s.id, name: s.name, type: s.x_mitre_type || 'tool', count: 0 }; tMap.software.push(e); }
                    e.count++;
                }
            });
            
            const all = [];
            tMap.groups.forEach(g => all.push({ type: 'Group', name: g.name, count: g.count }));
            tMap.software.forEach(s => all.push({ type: s.type || 'Tool', name: s.name, count: s.count }));
            const sorted = all.sort((a, b) => b.count - a.count).slice(0, 8);
            
            if (sorted.length > 0) {
                addTitle('Top Associated Threats');
                addTable(['Type', 'Name', 'Techniques'], sorted.map(t => [t.type, t.name.substring(0, 35), t.count]));
            }
        }
    }
    
    // 8b. Techniques at Risk
    if (state.techniques && state.relationships && state.groups) {
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
        
        if (zeroCoverageTechs.size > 0) {
            const threatGroups = {};
            state.relationships.forEach(rel => {
                if (rel.relationship_type !== 'uses') return;
                if (!zeroCoverageTechs.has(rel.target_ref)) return;
                const group = state.groups.find(g => g.id === rel.source_ref);
                if (!group) return;
                const tid = getTechniqueIdFromStix(rel.target_ref);
                if (!tid) return;
                if (!threatGroups[group.name]) threatGroups[group.name] = new Set();
                threatGroups[group.name].add(tid);
            });
            
            const atRisk = [];
            Object.entries(threatGroups).forEach(([groupName, techIds]) => {
                atRisk.push({ group: groupName, techniques: [...techIds].slice(0, 3), count: techIds.size });
            });
            atRisk.sort((a, b) => b.count - a.count);
            
            if (atRisk.length > 0) {
                addTitle('Techniques at Risk');
                pdf.setFontSize(9);
                pdf.setTextColor(71, 85, 105);
                pdf.setFont(undefined, 'normal');
                pdf.text('Zero-coverage techniques used by known threat groups:', margin, y);
                y += 6;
                
                atRisk.slice(0, 8).forEach(item => {
                    checkPage(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.setTextColor(30, 58, 138);
                    pdf.text(`${item.group} (${item.count} techniques)`, margin + 3, y);
                    y += 5;
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(100, 116, 139);
                    pdf.setFontSize(8);
                    const techStr = item.techniques.map(id => {
                        const name = getTechniqueName(id);
                        return `${id}${name ? ' - ' + name : ''}`;
                    }).join(', ');
                    const more = item.count > 3 ? ` +${item.count - 3} more` : '';
                    pdf.text(techStr + more, margin + 6, y);
                    y += 5;
                    pdf.setFontSize(10);
                    pdf.setTextColor(71, 85, 105);
                });
                y += 3;
            }
        }
    }
    
    // 9. Detection Results
    if (report.detectionResults?.length > 0) {
        addTitle('Detection Results');
        report.detectionResults.forEach(r => {
            checkPage(12);
            pdf.setFontSize(10);
            pdf.setTextColor(30, 58, 138);
            pdf.setFont(undefined, 'bold');
            pdf.text(r.huntName || 'Untitled', margin, y);
            y += 5;
            pdf.setFont(undefined, 'normal');
            pdf.setTextColor(71, 85, 105);
            if (r.sirTicket) { pdf.text(`SIR: ${r.sirTicket}`, margin, y); y += 5; }
            if (r.notes) addParagraph(r.notes, 9, [100, 116, 139]);
            y += 3;
        });
    }
    
    // 10. Monthly Focus
    const mFocus = report.monthlyFocus || generateDynamicMonthlyFocus(report);
    if (mFocus) { addTitle('Monthly Focus Areas'); addParagraph(mFocus); }
    
    // 11. Gap Analysis
    const gap = report.gapAnalysis || generateDynamicGapAnalysis(report);
    if (gap) { addTitle('Gap Analysis & Prioritization'); addParagraph(gap); }
    
    // 12. Coverage Breakdown/Changes
    if (report.type === 'initial') {
        addTitle('Coverage Breakdown');
        const rows = tactics.map(t => [t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), `${t.withQueries}/${t.total}`, `${t.coverage}%`]);
        addTable(['Tactic', 'Coverage', 'Progress'], rows);
    } else {
        const lastReport = state._cachedReports?.find(r => r.id !== report.id && r.type === 'update');
        if (lastReport) {
            addTitle('Coverage Changes');
            const lastTactics = lastReport.coverageByTactic || [];
            const allTactics = new Set([...tactics.map(t => t.tactic), ...lastTactics.map(t => t.tactic)]);
            const rows = [];
            allTactics.forEach(tactic => {
                const cur = tactics.find(t => t.tactic === tactic);
                const last = lastTactics.find(t => t.tactic === tactic);
                const curPct = cur?.coverage || 0;
                const lastPct = last?.coverage || 0;
                const change = curPct - lastPct;
                const icon = change > 0 ? '+' : '';
                rows.push([tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), `${lastPct}%`, `${curPct}%`, `${icon}${change}%`]);
            });
            addTable(['Tactic', 'Previous', 'Current', 'Change'], rows);
        }
    }
    
    // 13. References
    if (report.references?.length > 0) {
        addTitle('References');
        report.references.forEach((ref, i) => {
            checkPage(6);
            pdf.setFontSize(9);
            pdf.setTextColor(71, 85, 105);
            pdf.text(`${i + 1}. ${ref.substring(0, 80)}`, margin, y);
            y += 5;
        });
    }
    
    // 14. Appendix
    if (report.appendix) {
        const app = report.appendix;
        if (app.methodology) { addTitle('Appendix - Methodology'); addParagraph(app.methodology); }
        if (app.scope) { addTitle('Appendix - Scope'); addParagraph(app.scope); }
        if (app.limitations) { addTitle('Appendix - Limitations'); addParagraph(app.limitations); }
        if (app.additionalNotes) { addTitle('Appendix - Additional Notes'); addParagraph(app.additionalNotes); }
    }
    
    // Footer with page numbers
    checkPage(15);
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFillColor(248, 250, 252);
        pdf.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.3);
        pdf.line(0, pageHeight - 15, pageWidth, pageHeight - 15);
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`Generated by MITRE ATT&CK Coverage Tool | ${report.generatedDate || new Date().toLocaleDateString()}`, margin, pageHeight - 7);
        pdf.text('Confidential - For authorized recipients only', margin, pageHeight - 3);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }
    
    pdf.save(`report_${reportId}.pdf`);
    showToast('PDF exported', 'success');
}

function exportReportEmail(reportId) {
    const report = state._cachedReports?.find(r => r.id === reportId);
    if (!report) {
        showToast('Report not found', 'error');
        return;
    }

    const htmlContent = buildEmailHTML(report);
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

    const htmlContent = buildEmailHTML(report);
    const subject = `MITRE ATT&CK Coverage Report - ${report.reportMonth || report.generatedDate}`;
    const emlContent = [
        'From: MITRE ATT&CK Coverage Tool',
        `To: recipient@example.com`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="UTF-8"',
        '',
        htmlContent
    ].join('\r\n');

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const link = document.createElement('a');
    link.download = `report_${reportId}.eml`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('EML file exported', 'success');
}

function buildEmailMonthlyActivity(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || report.reportMonth?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    if (techniques.length === 0) return '';
    
    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);
    
    let html = '';
    
    if (colorChanges.length > 0) {
        html += `<div class="section"><h3>Status Changes</h3><ul class="changes-list">`;
        colorChanges.forEach(change => {
            const techName = getTechniqueName(change.techniqueID);
            const isSub = isSubTechnique(change.techniqueID);
            const typeLabel = isSub ? 'Sub-technique' : 'Technique';
            html += `<li class="status"><strong>${change.techniqueID}</strong> - ${techName} <span class="badge badge-blue">${typeLabel}</span><br><span style="color: #64748b; font-size: 0.85rem;">${change.fromLabel} → ${change.toLabel} | Triggered by: "${change.queryName}"</span></li>`;
        });
        html += '</ul></div>';
    }
    
    const newMains = newTechniques.filter(t => !isSubTechnique(t.techniqueID));
    const newSubs = newTechniques.filter(t => isSubTechnique(t.techniqueID));
    
    if (newMains.length > 0) {
        html += `<div class="section"><h3>New Techniques Added</h3><ul class="changes-list">`;
        newMains.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID);
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = ann.queries?.map(q => q.name).join(', ') || 'No queries';
            
            html += `<li class="new"><strong>${ann.techniqueID}</strong> - ${techName}<br>`;
            if (techDesc) html += `<span style="color: #64748b; font-size: 0.85rem;">${techDesc}</span><br>`;
            if (techTactics.length > 0) html += `<span style="color: #3b82f6; font-size: 0.8rem;">Tactics: ${techTactics.join(', ')}</span><br>`;
            html += `<span style="color: #64748b; font-size: 0.85rem;">Queries: ${queryNames}</span></li>`;
        });
        html += '</ul></div>';
    }
    
    if (newSubs.length > 0) {
        html += `<div class="section"><h3>New Sub-techniques Added</h3><ul class="changes-list">`;
        newSubs.forEach(ann => {
            const techName = getTechniqueName(ann.techniqueID);
            const techDesc = getTechniqueDescription(ann.techniqueID);
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = ann.queries?.map(q => q.name).join(', ') || 'No queries';
            
            html += `<li class="new"><strong>${ann.techniqueID}</strong> - ${techName}<br>`;
            if (techDesc) html += `<span style="color: #64748b; font-size: 0.85rem;">${techDesc}</span><br>`;
            if (techTactics.length > 0) html += `<span style="color: #3b82f6; font-size: 0.8rem;">Tactics: ${techTactics.join(', ')}</span><br>`;
            html += `<span style="color: #64748b; font-size: 0.85rem;">Queries: ${queryNames}</span></li>`;
        });
        html += '</ul></div>';
    }
    
    if (newHunts.length > 0) {
        html += `<div class="section"><h3>New Hunts on Existing Techniques</h3><ul class="changes-list">`;
        newHunts.forEach(hunt => {
            const techName = getTechniqueName(hunt.techniqueID);
            const isSub = isSubTechnique(hunt.techniqueID);
            const typeLabel = isSub ? 'Sub-technique' : 'Technique';
            html += `<li class="hunt"><strong>${hunt.techniqueID}</strong> - ${techName} <span class="badge badge-blue">${typeLabel}</span><br><span style="color: #64748b; font-size: 0.85rem;">Hunt: "${hunt.huntName}"</span></li>`;
        });
        html += '</ul></div>';
    }
    
    return html;
}

function buildEmailHTML(report) {
    const tactics = report.coverageByTactic || getCoverageByTactic();
    const overallCoverage = tactics.length > 0 ? Math.round(tactics.reduce((sum, t) => sum + t.coverage, 0) / tactics.length) : 0;
    const tacticsWithCoverage = tactics.filter(t => t.coverage > 0).length;
    
    // Month stats for stats bar
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    const byMonth = getTechniquesByMonth();
    const monthTechniques = byMonth[month] || [];
    const monthNewTechs = monthTechniques.filter(t => !isSubTechnique(t.techniqueID)).length;
    const monthNewSubs = monthTechniques.filter(t => isSubTechnique(t.techniqueID)).length;
    const monthQueries = monthTechniques.reduce((s, a) => s + (a.queries?.length || 0), 0);
    
    const execSummary = report.executiveSummary || generateDynamicExecutiveSummary(report);
    const monthlyFocus = report.monthlyFocus || generateDynamicMonthlyFocus(report);
    const gapAnalysis = report.gapAnalysis || generateDynamicGapAnalysis(report);
    const leadership = report.leadershipOverview || generateLeadershipOverview(report);
    
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
        return desc ? `<strong>${name}:</strong> ${desc}` : name;
    }) : [];
    const selectedScopes = report.scope ? Object.entries(report.scope).filter(([, v]) => v).map(([k]) => {
        const name = k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const desc = scopeDescriptions[k] || '';
        return desc ? `<strong>${name}:</strong> ${desc}` : name;
    }) : [];
    
    if (selectedMethods.length > 0 || selectedScopes.length > 0) {
        methodScopeHtml = `<div class="section"><h3>Methodology & Scope</h3>
            ${selectedMethods.length ? `<p>${selectedMethods.join('<br>')}</p>` : ''}
            ${selectedScopes.length ? `<p style="margin-top: 12px;">${selectedScopes.join('<br>')}</p>` : ''}
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
                        newQueries.push({ name: q.name, techniqueID: ann.techniqueID, language: q.language });
                    }
                });
            }
        });
        
        if (newQueries.length > 0) {
            const queryList = newQueries.map(q => {
                const techName = getTechniqueName(q.techniqueID);
                const queryName = q.name || 'Unnamed Query';
                return `<li><strong>${queryName}</strong><br><span style="color: #64748b; font-size: 12px;">${q.language} | ${q.techniqueID}${techName ? ' - ' + techName : ''}</span></li>`;
            }).join('');
            newQueriesHtml = `<div class="section"><h3>New Threat Hunt Queries</h3>
                <p style="margin-bottom: 8px;">${newQueries.length} queries for this period:</p>
                <ul style="padding-left: 20px; margin: 0;">${queryList}</ul>
            </div>`;
        }
    }
    
    // Tactics Graph
    let tacticsGraphHtml = '';
    if (tactics.length > 0) {
        const topTactics = tactics.slice(0, 8);
        tacticsGraphHtml = `<div class="section"><h3>Top Tactics by Coverage</h3>
            ${topTactics.map(t => {
                const name = t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const color = t.coverage >= 80 ? '#22c55e' : t.coverage >= 50 ? '#eab308' : '#ef4444';
                return `<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <span style="width: 120px; font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
                    <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${t.coverage}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
                    </div>
                    <span style="width: 40px; font-size: 13px; font-weight: 600; color: #334155; text-align: right;">${t.coverage}%</span>
                </div>`;
            }).join('')}
        </div>`;
    }
    
    // Coverage Breakdown/Changes
    let coverageHtml = '';
    if (report.type === 'initial') {
        const rows = tactics.map(t => {
            const badgeClass = t.coverage >= 80 ? 'coverage-high' : t.coverage >= 50 ? 'coverage-mid' : 'coverage-low';
            return `<tr><td>${t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td>${t.withQueries}/${t.total}</td><td><span class="coverage-badge ${badgeClass}">${t.coverage}%</span></td></tr>`;
        }).join('');
        coverageHtml = `<div class="section"><h3>Coverage Breakdown</h3>
            <table><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>
        </div>`;
    } else {
        const lastReport = state._cachedReports?.find(r => r.id !== report.id && r.type === 'update');
        if (lastReport) {
            const lastTactics = lastReport.coverageByTactic || [];
            const allTactics = new Set([...tactics.map(t => t.tactic), ...lastTactics.map(t => t.tactic)]);
            let rows = '';
            allTactics.forEach(tactic => {
                const cur = tactics.find(t => t.tactic === tactic);
                const last = lastTactics.find(t => t.tactic === tactic);
                const curPct = cur?.coverage || 0;
                const lastPct = last?.coverage || 0;
                const change = curPct - lastPct;
                const icon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
                const color = change > 0 ? '#22c55e' : change < 0 ? '#ef4444' : '#64748b';
                const badgeClass = curPct >= 80 ? 'coverage-high' : curPct >= 50 ? 'coverage-mid' : 'coverage-low';
                rows += `<tr><td>${tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td>${lastPct}%</td><td><span class="coverage-badge ${badgeClass}">${curPct}%</span></td><td style="color: ${color}; font-weight: 600;">${icon} ${change > 0 ? '+' : ''}${change}%</td></tr>`;
            });
            coverageHtml = `<div class="section"><h3>Coverage Changes</h3>
                <table><thead><tr><th>Tactic</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table>
            </div>`;
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
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
        * { box-sizing: border-box; }
        .email-wrapper { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
        .container { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #ffffff; padding: 32px 28px 28px; text-align: center; position: relative; }
        .header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #3b82f6, #60a5fa); }
        .header .logo { max-height: 40px; margin-bottom: 14px; filter: brightness(0) invert(1); }
        .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
        .header .subtitle { font-size: 13px; font-weight: 400; color: #94a3b8; margin: 0 0 12px 0; }
        .header .report-type { display: inline-block; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #93c5fd; margin-bottom: 10px; }
        .header .report-date { font-size: 13px; color: #cbd5e1; margin: 0; }
        .header .attck-version { font-size: 11px; color: #64748b; margin: 3px 0 0; }
        .header .author { font-size: 12px; color: #94a3b8; margin-top: 4px; }
        .stats-bar { display: flex; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; }
        .stat-item { flex: 1; text-align: center; padding: 18px 10px; border-right: 1px solid #f1f5f9; }
        .stat-item:last-child { border-right: none; }
        .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; line-height: 1; margin-bottom: 3px; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; }
        .content { padding: 24px 28px; }
        .section { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; }
        .section:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
        .section h3 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; padding-left: 10px; border-left: 3px solid #3b82f6; }
        .section p { margin: 0; color: #475569; font-size: 13px; line-height: 1.65; }
        .subsection { margin-top: 14px; padding-top: 14px; border-top: 1px solid #f8fafc; }
        .subsection h4 { font-size: 13px; font-weight: 600; color: #1e40af; margin: 0 0 6px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
        th { background-color: #f8fafc; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
        td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        tr:last-child td { border-bottom: none; }
        .coverage-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .coverage-high { background: #dcfce7; color: #15803d; }
        .coverage-mid { background: #fef3c7; color: #a16207; }
        .coverage-low { background: #fee2e2; color: #b91c1c; }
        .changes-list { list-style: none; padding: 0; margin: 0; }
        .changes-list li { padding: 10px; margin-bottom: 6px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6; font-size: 12px; }
        .changes-list li:last-child { margin-bottom: 0; }
        .changes-list li.status { border-left-color: #eab308; }
        .changes-list li.new { border-left-color: #22c55e; }
        .changes-list li.hunt { border-left-color: #ec4899; }
        .changes-list li strong { color: #0f172a; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
        .badge-blue { background: #dbeafe; color: #1d4ed8; }
        .badge-green { background: #dcfce7; color: #15803d; }
        .badge-yellow { background: #fef3c7; color: #a16207; }
        .badge-red { background: #fee2e2; color: #b91c1c; }
        .detection-item { padding: 10px; background: #f8fafc; border-radius: 6px; margin-bottom: 6px; border: 1px solid #e2e8f0; }
        .detection-item:last-child { margin-bottom: 0; }
        .detection-item strong { color: #0f172a; font-size: 13px; }
        .detection-item .notes { color: #64748b; font-size: 12px; margin-top: 3px; }
        .attachment-notice { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-top: 16px; text-align: center; }
        .attachment-notice .icon { font-size: 28px; margin-bottom: 6px; }
        .attachment-notice h4 { color: #1e40af; margin: 0 0 4px 0; font-size: 14px; font-weight: 700; }
        .attachment-notice p { color: #475569; font-size: 12px; margin: 0; line-height: 1.5; }
        .footer { background-color: #f8fafc; padding: 16px 28px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { margin: 0; font-size: 11px; color: #94a3b8; }
        .footer .tool-info { font-size: 10px; color: #cbd5e1; margin-top: 3px; }
        .footer .confidential { font-size: 10px; color: #e2e8f0; margin-top: 2px; }
        strong { font-weight: 600; color: #0f172a; }
        em { font-style: italic; color: #475569; }
        @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 8px; }
            .header { padding: 24px 16px; }
            .content { padding: 16px; }
            .stats-bar { flex-direction: column; }
            .stat-item { border-right: none; border-bottom: 1px solid #f1f5f9; padding: 14px; }
            .stat-item:last-child { border-bottom: none; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="container">
            <div class="header">
                ${report.companyLogo ? `<img src="${report.companyLogo}" class="logo" alt="Logo">` : ''}
                <h1>THREAT HUNTING MITRE MONTHLY UPDATE</h1>
                <p class="subtitle">${report.companyName || 'MITRE ATT&CK Coverage Report'}</p>
                <div class="report-type">${report.type === 'initial' ? 'Initial Assessment' : 'Monthly Update'}</div>
                <p class="report-date">${report.reportMonth || report.generatedDate}</p>
                ${report.attckVersion ? `<p class="attck-version">ATT&CK Framework v${report.attckVersion}</p>` : ''}
                ${report.author ? `<p class="author">Prepared by: ${report.author}</p>` : ''}
            </div>

            <div class="stats-bar">
                <div class="stat-item">
                    <div class="stat-value">${overallCoverage}%</div>
                    <div class="stat-label">Overall Coverage</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${tacticsWithCoverage}</div>
                    <div class="stat-label">Tactics Covered</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${monthNewTechs + monthNewSubs}</div>
                    <div class="stat-label">New This Month (${monthQueries} queries)</div>
                </div>
            </div>

            <div class="content">
                ${execSummary ? `<div class="section"><h3>Executive Summary</h3><p>${markdownToHtml(execSummary)}</p></div>` : ''}

                ${leadership ? `<div class="section"><h3>Leadership Overview</h3><p>${markdownToHtml(leadership)}</p></div>` : ''}

                ${methodScopeHtml}

                ${tacticsGraphHtml}

                ${buildEmailMonthlyActivity(report)}

                ${newQueriesHtml}

                ${buildThreatsSectionEmail(report)}

                ${buildTechniquesAtRiskEmail(report)}

                ${report.detectionResults?.length > 0 ? `<div class="section"><h3>Detection Results</h3>${report.detectionResults.map(r => `<div class="detection-item"><strong>${r.huntName || 'Untitled'}</strong>${r.sirTicket ? ` <span class="badge badge-yellow">SIR: ${r.sirTicket}</span>` : ''}${r.notes ? `<div class="notes">${r.notes}</div>` : ''}</div>`).join('')}</div>` : ''}

                ${monthlyFocus ? `<div class="section"><h3>Monthly Focus Areas</h3><p>${markdownToHtml(monthlyFocus)}</p></div>` : ''}

                ${gapAnalysis ? `<div class="section"><h3>Gap Analysis & Prioritization</h3><p style="white-space: pre-line;">${markdownToHtml(gapAnalysis)}</p></div>` : ''}

                ${coverageHtml}

                ${report.references?.length > 0 ? `<div class="section"><h3>References</h3><ul style="padding-left: 20px; margin: 0;">${report.references.map(r => `<li style="margin-bottom: 6px; font-size: 12px; color: #475569;">${r}</li>`).join('')}</ul></div>` : ''}

                ${appendixHtml}

                <div class="attachment-notice">
                    <div class="icon">📊</div>
                    <h4>Full MITRE ATT&CK Matrix SVG Attached</h4>
                    <p>A complete visual representation of the MITRE ATT&CK matrix with coverage highlights is attached to this email.</p>
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

function buildThreatsSectionEmail(report) {
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
    
    const sortedThreats = allThreats.sort((a, b) => b.techniques - a.techniques).slice(0, 8);
    
    let html = `<div class="section"><h3>Top Associated Threats</h3><table>
        <thead><tr><th>Type</th><th>Name</th><th>Techniques</th></tr></thead>
        <tbody>`;
    
    sortedThreats.forEach(t => {
        const techList = t.techniqueIds?.map(id => {
            const techId = getTechniqueIdFromStix(id);
            const name = getTechniqueName(techId || id);
            return techId ? `${techId} (${name})` : id;
        }).join(', ') || t.techniques;
        
        html += `<tr><td><span class="badge ${t.type === 'group' ? 'badge-blue' : 'badge-green'}">${t.type}</span></td><td>${t.name}</td><td>${techList}</td></tr>`;
    });
    
    html += '</tbody></table></div>';
    return html;
}

function buildTechniquesAtRiskEmail(report) {
    if (!state.techniques || !state.relationships || !state.groups) return '';
    
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
        const tid = getTechniqueIdFromStix(rel.target_ref);
        if (!tid) return;
        if (!threatGroups[group.name]) threatGroups[group.name] = new Set();
        threatGroups[group.name].add(tid);
    });
    
    const atRisk = [];
    Object.entries(threatGroups).forEach(([groupName, techIds]) => {
        atRisk.push({ group: groupName, techniques: [...techIds].slice(0, 3), count: techIds.size });
    });
    atRisk.sort((a, b) => b.count - a.count);
    if (atRisk.length === 0) return '';
    
    let html = `<div class="section"><h3>Techniques at Risk</h3>
        <p style="margin-bottom: 8px; color: #64748b; font-size: 13px;">Zero-coverage techniques used by known threat groups:</p>`;
    
    atRisk.slice(0, 8).forEach(item => {
        const techList = item.techniques.map(id => {
            const name = getTechniqueName(id);
            return `<span style="display: inline-block; padding: 2px 6px; margin: 2px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; font-size: 11px; color: #991b1b;">${id}${name ? ' - ' + name : ''}</span>`;
        }).join('');
        const moreText = item.count > 3 ? ` <span style="color: #64748b; font-size: 11px;">+${item.count - 3} more</span>` : '';
        
        html += `<div style="padding: 8px 10px; margin-bottom: 6px; background: #fef2f2; border-radius: 6px; border-left: 3px solid #ef4444;">
            <strong style="font-size: 13px; color: #991b1b;">${item.group}</strong>
            <span style="font-size: 11px; color: #64748b; margin-left: 8px;">${item.count} techniques</span>
            <div style="margin-top: 4px;">${techList}${moreText}</div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}

function printReport() {
    window.print();
}
