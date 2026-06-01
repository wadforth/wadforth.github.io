/* ============================================
   Reports View Enhancements - Phase 2
   Preview cards, timeline, comparison, insights
   ============================================ */

/* ============================================
   Report Preview Cards with Visual Charts
   ============================================ */

function getChangeCount(report) {
    if (!report) return 0;
    if (typeof report.changes === 'number') return report.changes;
    if (report.changes && Array.isArray(report.changes.all)) return report.changes.all.length;
    if (report.changes && typeof report.changes === 'object') {
        return Object.keys(report.changes).reduce((acc, key) => acc + (Array.isArray(report.changes[key]) ? report.changes[key].length : 0), 0);
    }
    return 0;
}

function renderReportPreviewCard(report) {
    const coverageData = calculateReportCoverage(report);
    const trendData = calculateCoverageTrend(report);
    
    return `
        <div class="report-preview-card card-hover-lift" data-report-id="${report.id}">
            <div class="report-preview-header">
                <div class="report-preview-type">
                    <span class="report-type-badge ${report.type || 'initial'}">${report.type || 'Initial'}</span>
                </div>
                <div class="report-preview-actions">
                    <button class="btn btn-ghost btn-sm" onclick="viewReport('${report.id}')" data-tooltip="View Report">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="exportReportPDF('${report.id}')" data-tooltip="Export">
                        <i class="bi bi-download"></i>
                    </button>
                </div>
            </div>
            <div class="report-preview-title">${escapeHtml(report.title || 'Untitled Report')}</div>
            <div class="report-preview-meta">
                <span class="report-preview-date"><i class="bi bi-calendar3"></i> ${formatTimestamp(report.generatedAt)}</span>
                ${report.layerName ? `<span class="report-preview-layer text-sm text-primary" style="margin-left: 8px;"><i class="bi bi-layers"></i> ${escapeHtml(report.layerName)}</span>` : ''}
                ${getChangeCount(report) > 0 ? `<span class="report-preview-changes"><i class="bi bi-arrow-left-right"></i> ${getChangeCount(report)} changes</span>` : ''}
            </div>
            <div class="report-preview-charts">
                <div class="report-preview-chart">
                    <div class="chart-label">Coverage</div>
                    <div class="mini-bar-chart">
                        ${renderMiniBarChart(coverageData)}
                    </div>
                </div>
                <div class="report-preview-chart">
                    <div class="chart-label">Trend</div>
                    <div class="mini-sparkline">
                        ${renderMiniSparkline(trendData)}
                    </div>
                </div>
            </div>
            ${report.summary ? `<div class="report-preview-summary">${escapeHtml(report.summary.substring(0, 100))}${report.summary.length > 100 ? '...' : ''}</div>` : ''}
        </div>
    `;
}

function calculateReportCoverage(report) {
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

function calculateCoverageTrend(report) {
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

function renderMiniBarChart(data) {
    const { covered, total, percentage } = data;
    const height = 40;
    const barWidth = 8;
    const gap = 2;
    
    return `
        <svg width="100%" height="${height}" viewBox="0 0 120 ${height}">
            <rect x="10" y="${height - (percentage / 100) * height}" width="${barWidth}" height="${(percentage / 100) * height}" fill="var(--primary)" rx="2"/>
            <rect x="22" y="${height - ((covered / total) * 100 / 100) * height}" width="${barWidth}" height="${((covered / total) * 100 / 100) * height}" fill="var(--accent-green)" rx="2"/>
            <text x="60" y="${height / 2 + 4}" fill="var(--on-surface-secondary)" font-size="10" text-anchor="middle">${percentage}%</text>
        </svg>
    `;
}

function renderMiniSparkline(data) {
    if (data.length === 0) return '<span class="text-muted">No data</span>';
    
    const width = 120;
    const height = 40;
    const padding = 5;
    const maxVal = Math.max(...data.map(d => d.percentage), 100);
    
    const points = data.map((d, i) => {
        const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
        const y = height - padding - (d.percentage / maxVal) * (height - padding * 2);
        return `${x},${y}`;
    }).join(' ');
    
    const lastPoint = data[data.length - 1];
    const trendIcon = data.length > 1 
        ? (lastPoint.percentage > data[data.length - 2].percentage ? '↑' : lastPoint.percentage < data[data.length - 2].percentage ? '↓' : '→')
        : '';
    
    return `
        <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}">
            <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${points.split(' ').pop().split(',')[0]}" cy="${points.split(' ').pop().split(',')[1]}" r="3" fill="var(--primary)"/>
        </svg>
        <span class="sparkline-trend ${trendIcon === '↑' ? 'trend-up' : trendIcon === '↓' ? 'trend-down' : ''}">${trendIcon} ${lastPoint.percentage}%</span>
    `;
}

/* ============================================
   Timeline View
   ============================================ */

function renderReportsTimeline(reports) {
    if (!reports || reports.length === 0) {
        return '<div class="empty-state"><i class="bi bi-calendar-x"></i><p>No reports to display.</p></div>';
    }
    
    const sorted = [...reports].sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    
    let html = '<div class="reports-timeline">';
    sorted.forEach((report, index) => {
        const isFirst = index === 0;
        const isLast = index === sorted.length - 1;
        
        html += `
            <div class="timeline-item fade-in-up" style="animation-delay: ${index * 0.05}s">
                <div class="timeline-marker ${isFirst ? 'timeline-marker-first' : ''}"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${formatTimestamp(report.generatedAt)}</div>
                    <div class="timeline-card report-preview-card card-hover-lift" onclick="viewReport('${report.id}')">
                        <div class="timeline-card-header">
                            <span class="report-type-badge ${report.type || 'initial'}">${report.type || 'Initial'}</span>
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

function showReportComparison(reportId1, reportId2) {
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

function calculateReportDiff(report1, report2) {
    const techniques1 = new Set(report1.techniques || []);
    const techniques2 = new Set(report2.techniques || []);
    
    const added = [...techniques2].filter(t => !techniques1.has(t));
    const removed = [...techniques1].filter(t => !techniques2.has(t));
    const common = [...techniques1].filter(t => techniques2.has(t));
    
    const changed = common.map(techId => {
        const t1 = report1.techniques?.find(t => t.id === techId);
        const t2 = report2.techniques?.find(t => t.id === techId);
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

function generateReportInsights(report) {
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

function getTacticsWithLowestCoverage(snapshotTechs) {
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

function getTopTechniquesByQueries(snapshotTechs) {
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

function renderInsightsSection(insights) {
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

function renderReportsListEnhanced(reports) {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    const viewMode = localStorage.getItem('reports-view-mode') || 'cards';
    
    let html = `
        <div class="reports-container">
            <div class="reports-header">
                <div>
                    <h2>Reports</h2>
                    <p>Generate and manage detection coverage reports</p>
                </div>
                <div class="reports-actions">
                    ${reports && reports.length > 0 ? `
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-secondary ${viewMode === 'cards' ? 'active' : ''}" onclick="setReportsViewMode('cards')" data-tooltip="Card View">
                            <i class="bi bi-grid"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-secondary ${viewMode === 'list' ? 'active' : ''}" onclick="setReportsViewMode('list')" data-tooltip="List View">
                            <i class="bi bi-list-ul"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-secondary ${viewMode === 'timeline' ? 'active' : ''}" onclick="setReportsViewMode('timeline')" data-tooltip="Timeline View">
                            <i class="bi bi-calendar3"></i>
                        </button>
                    </div>
                    <button class="btn btn-outline-danger" onclick="confirmDeleteAllReports()">
                        <i class="bi bi-trash-fill"></i> Delete All
                    </button>
                    ` : ''}
                    <button class="btn btn-primary" onclick="createNewReport()">
                        <i class="bi bi-plus-lg"></i> New Report
                    </button>
                </div>
            </div>
    `;
    
    if (reports && reports.length > 0) {
        html += '<div class="reports-stats">';
        html += renderReportStats(reports);
        html += '</div>';
        
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
        
        html += renderInsightsSection(generateReportInsights(reports[0]));
    } else {
        html += `
            <div class="reports-empty">
                <i class="bi bi-file-earmark-text"></i>
                <h5>No reports yet</h5>
                <p>Create your first report to get started</p>
                <button class="btn btn-primary" onclick="createNewReport()">
                    <i class="bi bi-plus-lg"></i> Create Report
                </button>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    initTooltips();
}

function renderReportStats(reports) {
    const totalReports = reports.length;
    const totalChanges = reports.reduce((sum, r) => sum + getChangeCount(r), 0);
    const latestReport = reports[0];
    const coverage = calculateReportCoverage(latestReport);
    
    return `
        <div class="stat-card">
            <div class="stat-value">${totalReports}</div>
            <div class="stat-label">Total Reports</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${coverage.percentage}%</div>
            <div class="stat-label">Coverage</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalChanges}</div>
            <div class="stat-label">Total Changes</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatTimestamp(latestReport?.generatedAt)}</div>
            <div class="stat-label">Latest Report</div>
        </div>
    `;
}

function renderReportListItem(report) {
    return `
        <div class="report-card" onclick="viewReport('${report.id}')">
            <span class="report-type-badge ${report.type || 'initial'}">${report.type || 'Initial'}</span>
            <div class="report-info">
                <h6 class="report-title">${escapeHtml(report.title || 'Untitled Report')}</h6>
                <p class="report-summary">${escapeHtml(report.summary || '')}</p>
            </div>
            <div class="report-meta">
                <span class="report-date">${formatTimestamp(report.generatedAt)}</span>
                ${report.layerName ? `<span class="report-layer text-sm text-primary" style="margin-right: 8px;"><i class="bi bi-layers"></i> ${escapeHtml(report.layerName)}</span>` : ''}
                ${getChangeCount(report) > 0 ? `<span class="report-changes">${getChangeCount(report)} changes</span>` : ''}
            </div>
            <button class="report-delete" onclick="event.stopPropagation(); confirmDeleteReport('${report.id}')" data-tooltip="Delete">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `;
}

function setReportsViewMode(mode) {
    localStorage.setItem('reports-view-mode', mode);
    renderReportsListEnhanced(state._cachedReports || []);
}

function createNewReport() {
    openReportPreviewWizardModal();
}

function confirmDeleteReport(reportId) {
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

function confirmDeleteAllReports() {
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

function openReportPreviewWizardModal() {
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
                        <button type="button" class="btn btn-primary" onclick="generateReportFromWizard()">
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
const originalRenderReportsList = window.renderReportsList;
window.renderReportsList = function(reports) {
    renderReportsListEnhanced(reports);
};
