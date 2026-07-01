/* ============================================
   Reports View Enhancements - Phase 2
   Preview cards, timeline, comparison, insights
   ============================================ */

/* ============================================
   Report Preview Cards with Visual Charts
   ============================================ */

function getInlineCallArg(value) {
    return `decodeURIComponent('${encodeURIComponent(String(value || ''))}')`;
}

function safeClassToken(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
}

function getReportAttackVersionLabel(report) {
    const version = String(report?.attckVersion || report?.attackVersion || 'unknown').trim().replace(/^v/i, '');
    return version || 'unknown';
}

export function getChangeCount(report) {
    if (!report) return 0;
    if (typeof report.changes === 'number') return report.changes;
    if (report.changes && Array.isArray(report.changes.all)) return report.changes.all.length;
    if (report.changes && typeof report.changes === 'object') {
        return Object.keys(report.changes).reduce((acc, key) => acc + (Array.isArray(report.changes[key]) ? report.changes[key].length : 0), 0);
    }
    return 0;
}

export function renderReportPreviewCard(report) {
    const coverageData = calculateReportCoverage(report);
    const trendData = calculateCoverageTrend(report);
    const safeReportId = escapeHtml(report.id || '');
    const safeType = safeClassToken(report.type || 'initial');
    const typeLabel = String(report.type || 'Initial').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const reportVersion = getReportAttackVersionLabel(report);
    
    return `
        <div class="report-preview-card card-hover-lift" data-report-id="${escapeHtml(report.id || '')}">
            <div class="report-preview-header">
                <div class="report-preview-title">${escapeHtml(report.title || 'Untitled Report')}</div>
                <div class="report-preview-actions">
                    <button class="btn btn-ghost btn-sm" data-report-action="view-report" data-report-id="${safeReportId}" data-tooltip="View Report" aria-label="View report">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-ghost btn-sm" data-report-action="export-html" data-report-id="${safeReportId}" data-tooltip="Export HTML" aria-label="Export report HTML">
                        <i class="bi bi-download"></i>
                    </button>
                </div>
            </div>
            <div class="report-preview-meta">
                <span class="report-type-badge ${safeType}">${escapeHtml(typeLabel)}</span>
                <span class="report-preview-date"><i class="bi bi-calendar3"></i> ${formatTimestamp(report.generatedAt)}</span>
                <span class="report-preview-version"><i class="bi bi-diagram-3"></i> ATT&amp;CK v${escapeHtml(reportVersion)}</span>
                ${report.layerName ? `<span class="report-preview-layer text-sm text-primary" style="margin-left: 8px;"><i class="bi bi-layers"></i> ${escapeHtml(report.layerName)}</span>` : ''}
                ${getChangeCount(report) > 0 ? `<span class="report-preview-changes"><i class="bi bi-arrow-left-right"></i> ${getChangeCount(report)} changes</span>` : ''}
            </div>
            <div class="report-preview-metrics" aria-label="Report summary metrics">
                <div><span>Coverage</span><strong>${coverageData.percentage}%</strong><small>${coverageData.covered}/${coverageData.total || 0} mapped</small></div>
                <div><span>Change Set</span><strong>${getChangeCount(report)}</strong><small>tracked events</small></div>
                <div><span>Trend</span><strong>${trendData.length ? trendData[trendData.length - 1].percentage + '%' : 'n/a'}</strong><small>${trendData.length ? 'latest month' : 'no history'}</small></div>
            </div>
            ${report.summary ? `<div class="report-preview-summary">${escapeHtml(report.summary.substring(0, 100))}${report.summary.length > 100 ? '...' : ''}</div>` : ''}
        </div>
    `;
}

export function calculateReportCoverage(report) {
    if (report?.fullStats) {
        return {
            covered: report.fullStats.covered || 0,
            total: report.fullStats.total || 0,
            percentage: Math.round(report.fullStats.pct || report.fullStats.percentage || 0)
        };
    }
    const snapshotTechs = report?.snapshot?.techniques || report?.techniques;
    if (typeof getFullCoverageStats === 'function') {
        const stats = getFullCoverageStats(snapshotTechs);
        return {
            covered: stats.covered || 0,
            total: stats.total || 0,
            percentage: Math.round(stats.pct || 0)
        };
    }
    if (!state.currentLayer?.techniques) return { covered: 0, total: 0, percentage: 0 };
    
    const techniques = state.currentLayer.techniques;
    const covered = techniques.filter(t => t.queries && t.queries.length > 0).length;
    const total = techniques.length;
    const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
    
    return { covered, total, percentage };
}

export function calculateCoverageTrend(report) {
    const byMonth = getTechniquesByMonth();
    const months = Object.keys(byMonth).sort();
    
    return months.map(month => {
        const techniques = byMonth[month] || [];
        const covered = techniques.filter(t => t.queries && t.queries.length > 0).length;
        const total = techniques.length;
        return {
            month,
            covered,
            total,
            percentage: total > 0 ? Math.round((covered / total) * 100) : 0
        };
    });
}

function getReportPostureGrade(coveragePct) {
    if (coveragePct >= 80) return { label: 'A+ Excellent', short: 'A+', tone: 'good' };
    if (coveragePct >= 70) return { label: 'A Strong', short: 'A', tone: 'good' };
    if (coveragePct >= 60) return { label: 'B+ Capable', short: 'B+', tone: 'warn' };
    if (coveragePct >= 50) return { label: 'B Good', short: 'B', tone: 'warn' };
    if (coveragePct >= 40) return { label: 'C+ Developing', short: 'C+', tone: 'watch' };
    if (coveragePct >= 30) return { label: 'C Baseline', short: 'C', tone: 'watch' };
    if (coveragePct >= 20) return { label: 'D Lacking', short: 'D', tone: 'bad' };
    return { label: 'F Critical Gaps', short: 'F', tone: 'bad' };
}

function renderReportsOverview(reports, latest, latestCoverage, latestChanges) {
    const latestGrade = getReportPostureGrade(latestCoverage.percentage || 0);
    const previous = reports?.[1] || null;
    const previousCoverage = previous ? calculateReportCoverage(previous) : null;
    const delta = previousCoverage ? latestCoverage.percentage - previousCoverage.percentage : null;
    const deltaLabel = delta === null ? 'Initial baseline' : `${delta > 0 ? '+' : ''}${delta}% since previous report`;
    const attackVersion = latest ? getReportAttackVersionLabel(latest) : String(state.currentVersion || state.currentLayer?.versions?.attack || 'unknown').trim().replace(/^v/i, '');
    const generated = latest ? formatTimestamp(latest.generatedAt) : 'No generated report yet';

    return `
        <section class="reports-summary-strip" aria-label="Reports workspace summary">
            <div><span>Posture</span><strong class="${latestGrade.tone}">${escapeHtml(latestGrade.short)}</strong><small>${escapeHtml(latestGrade.label)}</small></div>
            <div><span>Coverage</span><strong>${latestCoverage.percentage}%</strong><small>${latestCoverage.covered}/${latestCoverage.total || 0} mapped</small></div>
            <div><span>History</span><strong>${escapeHtml(deltaLabel)}</strong><small>${reports.length} generated reports</small></div>
            <div><span>Report data</span><strong>ATT&amp;CK v${escapeHtml(attackVersion)}</strong><small>${escapeHtml(generated)} / ${latestChanges} changes</small></div>
        </section>
    `;
}

/* ============================================
   Timeline View
   ============================================ */

export function renderReportsTimeline(reports) {
    if (!reports || reports.length === 0) {
        return '<div class="empty-state"><i class="bi bi-calendar-x"></i><p>No reports to display.</p></div>';
    }
    
    const sorted = [...reports].sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    
    let html = '<div class="reports-timeline">';
    sorted.forEach((report, index) => {
        const isFirst = index === 0;
        const isLast = index === sorted.length - 1;
        const safeReportId = escapeHtml(report.id || '');
        const safeType = safeClassToken(report.type || 'initial');
        
        html += `
            <div class="timeline-item fade-in-up" style="animation-delay: ${index * 0.05}s">
                <div class="timeline-marker ${isFirst ? 'timeline-marker-first' : ''}"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${formatTimestamp(report.generatedAt)}</div>
                    <div class="timeline-card report-preview-card card-hover-lift" data-report-action="view-report" data-report-id="${safeReportId}" role="button" tabindex="0">
                        <div class="timeline-card-header">
                            <span class="report-type-badge ${safeType}">${escapeHtml(report.type || 'Initial')}</span>
                            <h6 class="timeline-title">${escapeHtml(report.title || 'Untitled Report')}</h6>
                        </div>
                        ${report.summary ? `<p class="timeline-summary">${escapeHtml(report.summary.substring(0, 150))}${report.summary.length > 150 ? '...' : ''}</p>` : ''}
                        <div class="timeline-meta">
                            ${getChangeCount(report) > 0 ? `<span><i class="bi bi-arrow-left-right"></i> ${getChangeCount(report)} changes</span>` : ''}
                            <span><i class="bi bi-file-earmark-text"></i> Report</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    return html;
}

/* ============================================
   Comparison Mode
   ============================================ */

export function showReportComparison(reportId1, reportId2) {
    const reports = state._cachedReports || [];
    const report1 = reports.find(r => r.id === reportId1);
    const report2 = reports.find(r => r.id === reportId2);
    
    if (!report1 || !report2) {
        showToast('Select two reports to compare', 'warning');
        return;
    }
    
    const diff = calculateReportDiff(report1, report2);
    
    const modalHtml = `
        <div class="modal fade" id="report-comparison-modal" tabindex="-1">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Compare Reports</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="comparison-header">
                            <div class="comparison-report">
                                <h6>${escapeHtml(report1.title)}</h6>
                                <span class="text-muted">${formatTimestamp(report1.generatedAt)}</span>
                            </div>
                            <div class="comparison-vs">vs</div>
                            <div class="comparison-report">
                                <h6>${escapeHtml(report2.title)}</h6>
                                <span class="text-muted">${formatTimestamp(report2.generatedAt)}</span>
                            </div>
                        </div>
                        <div class="comparison-results">
                            <div class="comparison-section">
                                <h6><i class="bi bi-plus-circle text-success"></i> New Techniques (${diff.added.length})</h6>
                                <div class="comparison-list">
                                    ${diff.added.map(t => `<div class="comparison-item added"><span class="tech-id">${t}</span></div>`).join('') || '<p class="text-muted">No new techniques</p>'}
                                </div>
                            </div>
                            <div class="comparison-section">
                                <h6><i class="bi bi-x-circle text-danger"></i> Removed Techniques (${diff.removed.length})</h6>
                                <div class="comparison-list">
                                    ${diff.removed.map(t => `<div class="comparison-item removed"><span class="tech-id">${t}</span></div>`).join('') || '<p class="text-muted">No removed techniques</p>'}
                                </div>
                            </div>
                            <div class="comparison-section">
                                <h6><i class="bi bi-arrow-left-right text-warning"></i> Changed Queries (${diff.changed.length})</h6>
                                <div class="comparison-list">
                                    ${diff.changed.map(t => `<div class="comparison-item changed"><span class="tech-id">${t.techniqueId}</span><span class="change-detail">${t.detail}</span></div>`).join('') || '<p class="text-muted">No query changes</p>'}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('report-comparison-modal');
    if (existing) existing.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(document.getElementById('report-comparison-modal')).show();
}

export function calculateReportDiff(report1, report2) {
    const normalizeTechniques = (report) => (report?.snapshot?.techniques || report?.techniques || [])
        .map(t => typeof t === 'string' ? { id: t, techniqueID: t, queries: [] } : t)
        .filter(t => t?.techniqueID || t?.id);
    const getId = (technique) => technique.techniqueID || technique.id;
    const techniques1List = normalizeTechniques(report1);
    const techniques2List = normalizeTechniques(report2);
    const techniques1ById = new Map(techniques1List.map(t => [getId(t), t]));
    const techniques2ById = new Map(techniques2List.map(t => [getId(t), t]));
    const techniques1 = new Set(techniques1ById.keys());
    const techniques2 = new Set(techniques2ById.keys());
    
    const added = [...techniques2].filter(t => !techniques1.has(t));
    const removed = [...techniques1].filter(t => !techniques2.has(t));
    const common = [...techniques1].filter(t => techniques2.has(t));
    
    const changed = common.map(techId => {
        const t1 = techniques1ById.get(techId);
        const t2 = techniques2ById.get(techId);
        const queryDiff = (t2?.queries?.length || 0) - (t1?.queries?.length || 0);
        return {
            techniqueId: techId,
            detail: queryDiff > 0 ? `+${queryDiff} queries` : queryDiff < 0 ? `${queryDiff} queries` : 'No change'
        };
    }).filter(c => c.detail !== 'No change');
    
    return { added, removed, changed };
}

/* ============================================
   Auto-Generated Insights
   ============================================ */

export function generateReportInsights(report) {
    const snapshotTechs = report?.snapshot?.techniques || report?.techniques;
    const coverageStats = getFullCoverageStats(snapshotTechs);
    const coveragePct = coverageStats.pct;
    const totalParents = coverageStats.parents.total;
    const coveredParents = coverageStats.parents.covered;
    const uncoveredParents = totalParents - coveredParents;
    
    const insights = [];
    
    if (coveragePct >= 70) {
        insights.push({
            type: 'success',
            icon: 'bi-shield-check',
            title: 'Excellent Coverage',
            description: `Your parent technique coverage is at ${coveragePct % 1 === 0 ? coveragePct : coveragePct.toFixed(1)}% (${coveredParents}/${totalParents} parent techniques). Your defensive posture is robust.`
        });
    } else if (coveragePct >= 40) {
        insights.push({
            type: 'warning',
            icon: 'bi-exclamation-triangle',
            title: 'Moderate Coverage',
            description: `Your parent technique coverage is at ${coveragePct % 1 === 0 ? coveragePct : coveragePct.toFixed(1)}%. Consider adding queries for the ${uncoveredParents} remaining parent techniques.`
        });
    } else {
        insights.push({
            type: 'error',
            icon: 'bi-x-circle',
            title: 'Low Coverage',
            description: `Your parent technique coverage is at ${coveragePct % 1 === 0 ? coveragePct : coveragePct.toFixed(1)}% (${coveredParents}/${totalParents} covered). ${uncoveredParents} parent techniques remain uncovered. Prioritize adding detection queries.`
        });
    }
    
    const tactics = getTacticsWithLowestCoverage(snapshotTechs);
    if (tactics.length > 0) {
        insights.push({
            type: 'info',
            icon: 'bi-grid',
            title: 'Tactics Needing Attention',
            description: `The following tactics have the lowest coverage: ${tactics.map(t => `${t.name} (${t.percentage}%)`).join(', ')}.`
        });
    }
    
    const topTechniques = getTopTechniquesByQueries(snapshotTechs);
    if (topTechniques.length > 0) {
        insights.push({
            type: 'info',
            icon: 'bi-bar-chart',
            title: 'Most Detected Techniques',
            description: `Your top covered techniques by query count are: ${topTechniques.map(t => `${t.id} (${t.queries} queries)`).join(', ')}.`
        });
    }
    
    return insights;
}

export function getTacticsWithLowestCoverage(snapshotTechs) {
    const tacticCoverage = {};
    const layerTechs = snapshotTechs || state.currentLayer?.techniques || [];
    
    state.tactics.forEach(tactic => {
        const shortname = tactic.x_mitre_shortname;
        const techniques = state.techniques.filter(t => 
            t.kill_chain_phases?.some(k => k.kill_chain_name === 'mitre-attack' && k.phase_name === shortname)
        );
        
        const covered = techniques.filter(t => {
            const techId = t.external_references?.[0]?.external_id;
            const ann = layerTechs.find(a => a.techniqueID === techId);
            return ann?.queries && ann.queries.length > 0;
        }).length;
        
        const total = techniques.length;
        tacticCoverage[tactic.name] = {
            name: tactic.name,
            covered,
            total,
            percentage: total > 0 ? Math.round((covered / total) * 100) : 0
        };
    });
    
    return Object.values(tacticCoverage)
        .filter(t => t.total > 0)
        .sort((a, b) => a.percentage - b.percentage)
        .slice(0, 3);
}

export function getTopTechniquesByQueries(snapshotTechs) {
    const layerTechs = snapshotTechs || state.currentLayer?.techniques;
    if (!layerTechs) return [];
    
    return layerTechs
        .filter(t => t.queries && t.queries.length > 0)
        .sort((a, b) => b.queries.length - a.queries.length)
        .slice(0, 5)
        .map(t => ({
            id: t.techniqueID,
            queries: t.queries.length
        }));
}

export function renderInsightsSection(insights) {
    if (!insights || insights.length === 0) return '';
    
    let html = '<div class="report-insights-section">';
    html += '<h5><i class="bi bi-lightbulb"></i> Insights & Recommendations</h5>';
    html += '<div class="insights-grid">';
    
    insights.forEach(insight => {
        html += `
            <div class="insight-card insight-${insight.type}">
                <div class="insight-icon">
                    <i class="bi ${insight.icon}"></i>
                </div>
                <div class="insight-content">
                    <h6>${insight.title}</h6>
                    <p>${insight.description}</p>
                </div>
            </div>
        `;
    });
    
    html += '</div></div>';
    return html;
}

/* ============================================
   Enhanced Reports List Renderer
   ============================================ */

export function renderReportsListEnhanced(reports) {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    const viewMode = 'list';
    const latest = reports?.[0] || null;
    const latestCoverage = latest ? calculateReportCoverage(latest) : { covered: 0, total: 0, percentage: 0 };
    const latestChanges = latest ? getChangeCount(latest) : 0;
    const latestTitle = latest ? (latest.title || 'Untitled Report') : 'No report generated yet';
    const latestId = escapeHtml(latest?.id || '');
    
    let html = `
        <div class="reports-container reports-workbench-container">
            <div class="reports-header">
                <div>
                    <div class="reports-breadcrumb"><strong>Reports</strong><span>/</span><span>${latest ? escapeHtml(formatTimestamp(latest.generatedAt)) : 'leadership coverage updates'}</span></div>
                    <h2>Coverage reports</h2>
                    <p>Report history, latest posture, and monthly export controls. Create a report, open it, edit tier text, assign teams, add evidence, then export HTML/PDF.</p>
                </div>
                <div class="reports-actions">
                    ${latest ? `
                    <button class="btn btn-outline-secondary" data-report-action="view-report" data-report-id="${latestId}">Review latest</button>
                    <button class="btn btn-outline-secondary" data-report-action="export-html" data-report-id="${latestId}">Export HTML</button>
                    ` : ''}
                    ${reports && reports.length > 0 ? `
                    <span class="reports-list-mode-pill"><i class="bi bi-list-ul"></i> List view</span>
                    <button class="btn btn-outline-danger" data-report-action="delete-all-reports">
                        <i class="bi bi-trash-fill"></i> Delete All
                    </button>
                    ` : ''}
                    <button class="btn btn-primary" data-report-action="create-report">
                        <i class="bi bi-plus-lg"></i> New Report
                    </button>
                </div>
            </div>
            ${renderReportsOverview(reports || [], latest, latestCoverage, latestChanges)}
    `;
    
    if (reports && reports.length > 0) {
        if (viewMode === 'cards') {
            html += '<div class="reports-grid">';
            reports.forEach(report => {
                html += renderReportPreviewCard(report);
            });
            html += '</div>';
        } else if (viewMode === 'timeline') {
            html += renderReportsTimeline(reports);
        } else {
            html += '<div class="reports-list">';
            reports.forEach(report => {
                html += renderReportListItem(report);
            });
            html += '</div>';
        }
        
    } else {
        html += `
            <div class="reports-empty">
                <i class="bi bi-file-earmark-text"></i>
                <h5>No reports yet</h5>
                <p>Create your first report to get started</p>
                <button class="btn btn-primary" data-report-action="create-report">
                    <i class="bi bi-plus-lg"></i> Create Report
                </button>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    initTooltips();
}

export function renderReportListItem(report) {
    const safeReportId = escapeHtml(report.id || '');
    const safeType = safeClassToken(report.type || 'initial');
    const reportVersion = getReportAttackVersionLabel(report);
    return `
        <div class="report-card" data-report-action="view-report" data-report-id="${safeReportId}" role="button" tabindex="0">
            <span class="report-type-badge ${safeType}">${escapeHtml(report.type || 'Initial')}</span>
            <div class="report-info">
                <h6 class="report-title">${escapeHtml(report.title || 'Untitled Report')}</h6>
                <p class="report-summary">${escapeHtml(report.summary || '')}</p>
            </div>
            <div class="report-meta">
                <span class="report-date">${formatTimestamp(report.generatedAt)}</span>
                <span class="report-version"><i class="bi bi-diagram-3"></i> ATT&amp;CK v${escapeHtml(reportVersion)}</span>
                ${report.layerName ? `<span class="report-layer text-sm text-primary" style="margin-right: 8px;"><i class="bi bi-layers"></i> ${escapeHtml(report.layerName)}</span>` : ''}
                ${getChangeCount(report) > 0 ? `<span class="report-changes">${getChangeCount(report)} changes</span>` : ''}
            </div>
            <button class="report-delete" data-report-action="delete-report" data-report-id="${safeReportId}" data-tooltip="Delete" aria-label="Delete report">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `;
}

export function setReportsViewMode(mode) {
    try {
        localStorage.setItem('reports-view-mode', mode);
    } catch (err) {
        console.warn('Unable to persist reports view mode:', err);
    }
    renderReportsListEnhanced(state._cachedReports || []);
}

export function createNewReport() {
    openReportPreviewWizardModal();
}

export function confirmDeleteReport(reportId) {
    showConfirm('Delete Report', 'Are you sure you want to delete this report? This action cannot be undone.').then(async confirmed => {
        if (confirmed) {
            try {
                await deleteReport(reportId);
                showToast('Report deleted', 'success');
                loadReportsList();
            } catch (err) {
                showToast('Failed to delete report: ' + err.message, 'error');
            }
        }
    });
}

export function confirmDeleteAllReports() {
    if (!state.currentLayer) return;
    showConfirm('Delete All Reports', 'Are you sure you want to delete all reports for the current layer? This action cannot be undone.').then(async confirmed => {
        if (confirmed) {
            try {
                await deleteAllReports(state.currentLayer.id || 'default');
                showToast('All reports deleted', 'success');
                loadReportsList();
            } catch (err) {
                showToast('Failed to delete reports: ' + err.message, 'error');
            }
        }
    });
}

export function openReportPreviewWizardModal() {
    const availableMonths = getAvailableMonths();
    if (availableMonths.length === 0) {
        showToast('No months with logs or activity found', 'warning');
        return;
    }
    
    const monthOptions = availableMonths.map(m => 
        `<option value="${m}">${getMonthLabel(m)}</option>`
    ).join('');
    
    const modalHtml = `
        <div class="modal fade" id="report-preview-wizard-modal" tabindex="-1">
            <div class="modal-dialog modal-md">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-file-earmark-plus mr-2"></i>Create New Report</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-2">
                            <label class="form-label font-semibold text-on-surface">Select Month for Report:</label>
                            <select id="preview-wizard-month-select" class="form-select">
                                ${monthOptions}
                            </select>
                            <p class="text-on-surface-tertiary text-sm mt-3" style="line-height:1.5;">
                                The system will collect and consolidate threat hunt telemetry, query additions, and coverage updates for the selected period to compile a polished, executive-ready pyramid report.
                            </p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" data-report-action="generate-report-wizard">
                            <i class="bi bi-file-earmark-plus mr-1"></i>Generate Full Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('report-preview-wizard-modal');
    if (existing) existing.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const bsModal = new bootstrap.Modal(document.getElementById('report-preview-wizard-modal'));
    bsModal.show();
}

window.updateWizardPreview = function(month) {
    const container = document.getElementById('wizard-preview-container');
    if (container) {
        container.innerHTML = renderMonthChangelogHTML(month);
    }
};

window.generateReportFromWizard = function() {
    const select = document.getElementById('preview-wizard-month-select');
    if (!select) return;
    
    const selectedMonth = select.value;
    
    const modalEl = document.getElementById('report-preview-wizard-modal');
    if (modalEl) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
    }
    
    openThreatHuntReportModal(selectedMonth);
};

/* Override the original renderReportsList */
export const originalRenderReportsList = window.renderReportsList;
window.renderReportsList = function(reports) {
    renderReportsListEnhanced(reports);
};

// Legacy Window Bindings
window.getChangeCount = getChangeCount;
window.renderReportPreviewCard = renderReportPreviewCard;
window.calculateReportCoverage = calculateReportCoverage;
window.calculateCoverageTrend = calculateCoverageTrend;
window.renderReportsTimeline = renderReportsTimeline;
window.showReportComparison = showReportComparison;
window.calculateReportDiff = calculateReportDiff;
window.generateReportInsights = generateReportInsights;
window.getTacticsWithLowestCoverage = getTacticsWithLowestCoverage;
window.getTopTechniquesByQueries = getTopTechniquesByQueries;
window.renderInsightsSection = renderInsightsSection;
window.renderReportsListEnhanced = renderReportsListEnhanced;
window.renderReportListItem = renderReportListItem;
window.setReportsViewMode = setReportsViewMode;
window.createNewReport = createNewReport;
window.confirmDeleteReport = confirmDeleteReport;
window.confirmDeleteAllReports = confirmDeleteAllReports;
window.openReportPreviewWizardModal = openReportPreviewWizardModal;
window.originalRenderReportsList = originalRenderReportsList;
