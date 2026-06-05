export function buildUnifiedActivityFeed(report, isDark = false, isEmail = false) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    if (techniques.length === 0) return '';
    
    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);
    
    if (colorChanges.length === 0 && newTechniques.length === 0 && newHunts.length === 0) return '';
    
    // Filter: only include techniques that exist in STIX data (have a name) AND have actual queries
    const validNewTechniques = newTechniques.filter(t => {
        const name = getTechniqueName(t.techniqueID);
        return name && name.length > 0 && t.queries && t.queries.length > 0;
    });
    
    const mainTechniques = validNewTechniques.filter(t => !isSubTechnique(t.techniqueID));
    const subTechniques = validNewTechniques.filter(t => isSubTechnique(t.techniqueID));
    
    // Only show section if there's actual content
    if (colorChanges.length === 0 && mainTechniques.length === 0 && subTechniques.length === 0) return '';
    
    const rowBg = isEmail ? (isDark ? '#141528' : '#ffffff') : 'var(--report-surface)';
    const altRowBg = isEmail ? (isDark ? '#161730' : '#f8fafc') : 'var(--report-bg)';
    const mutedColor = isEmail ? (isDark ? '#94a3b8' : '#64748b') : 'var(--report-text-muted)';
    const textColor = isEmail ? (isDark ? '#cbd5e1' : '#475569') : 'var(--report-text)';
    const primaryText = isEmail ? (isDark ? '#f3f4f6' : '#1e293b') : 'var(--report-text)';
    
    let html = '';
    if (isEmail) {
        html += `<div class="section" id="monthly-activity"><a name="monthly-activity"></a><h3>Monthly Activity Feed</h3>
        <p style="margin-bottom:8px;font-size:11px;color:${isDark?'#94a3b8':'#64748b'};">A summary of new detection deployments and coverage status changes for this reporting period. Only techniques with active queries are listed.</p>`;
    } else {
        html += `<div class="report-section monthly-activity-section" id="monthly-activity">
            <h4><i class="bi bi-calendar-check"></i> Monthly Activity Feed</h4>
            <p class="text-on-surface-secondary mb-3" style="font-size: 0.8rem;">A chronological summary of new detection deployments, coverage status changes, and query lifecycle events for this reporting period.</p>`;
    }
    
    html += `<table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; line-height: 1.5;">`;
    
    // Status & Coverage Changes
    if (colorChanges.length > 0) {
        html += `
            <tr>
                <td style="padding: 8px 0 4px 0; border: none;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 0; border: none; width: 4px; background-color: #fbbf24;"></td>
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? 'rgba(251, 191, 36, 0.05)' : '#fffbeb'};">
                                <span style="font-size: 10px; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px;">Status &amp; Coverage Changes (${colorChanges.length})</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;
        colorChanges.forEach((change, idx) => {
            const techName = getTechniqueName(change.techniqueID);
            if (!techName) return;
            const isSub = isSubTechnique(change.techniqueID);
            const fromLabel = change.fromLabel === 'None' ? 'Unassigned' : change.fromLabel;
            const toLabel = change.toLabel === 'None' ? 'Unassigned' : change.toLabel;
            const bg = idx % 2 === 0 ? rowBg : altRowBg;
            html += `
                <tr>
                    <td style="padding: 0; border: none; background-color: ${bg};">
                        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 5px 10px 5px 14px; border: none; width: 100px;">
                                    <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: ;">${change.techniqueID}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none;">
                                    <span style="color: ${textColor};">${techName}</span>
                                    <span style="font-size: 9px; color: ${mutedColor}; margin-left: 6px;">(${isSub ? 'sub-technique' : 'technique'})</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; text-align: right; white-space: nowrap;">
                                    <span style="font-weight: 600; color: ${isDark ? '#fbbf24' : '#d97706'};">${fromLabel}</span>
                                    <span style="color: ${mutedColor}; margin: 0 4px;">&rarr;</span>
                                    <span style="font-weight: 600; color: ${isDark ? '#4ade80' : '#16a34a'};">${toLabel}</span>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `;
        });
    }
    
    // New Main Techniques
    if (mainTechniques.length > 0) {
        html += `
            <tr>
                <td style="padding: 10px 0 4px 0; border: none;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 0; border: none; width: 4px; background-color: #16a34a;"></td>
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? 'rgba(22, 163, 74, 0.05)' : '#f0fdf4'};">
                                <span style="font-size: 10px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px;">New Main Techniques (${mainTechniques.length})</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;
        mainTechniques.forEach((ann, idx) => {
            const techName = getTechniqueName(ann.techniqueID);
            if (!techName) return;
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = (ann.queries && ann.queries.length > 0) ? ann.queries.map(q => q.name).join(', ') : '';
            const hasSentinel = ann.queries?.some(q => q.sentinelCandidate);
            const bg = idx % 2 === 0 ? rowBg : altRowBg;
            const relatedSubs = subTechniques.filter(s => s.techniqueID.startsWith(ann.techniqueID + '.'));
            
            html += `
                <tr>
                    <td style="padding: 0; border: none; background-color: ${bg};">
                        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 5px 10px 5px 14px; border: none; width: 100px; vertical-align: top;">
                                    <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: ;">${ann.techniqueID}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                    <span style="font-weight: 600; color: ;">${techName}</span>
                                    ${techTactics.length > 0 ? `<div style="font-size: 9px; color: ${isDark ? '#38bdf8' : '#0284c7'}; margin-top: 1px;">${techTactics.join(', ')}</div>` : ''}
                                </td>
                                <td style="padding: 5px 10px; border: none; text-align: right; vertical-align: top; max-width: 280px;">
                                    ${queryNames ? `<div style="font-size: 9.5px; color: ${textColor}; font-style: italic;">"${queryNames}"</div>` : ''}
                                    ${hasSentinel ? `<div style="font-size: 8px; color: #3b82f6; margin-top: 2px;"><i class="bi bi-robot"></i> Sentinel candidate</div>` : ''}
                                </td>
                            </tr>
                        </table>
                        ${relatedSubs.length > 0 && queryNames ? `<table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 2px 10px 4px 14px; border: none; background-color: ${isDark ? 'rgba(56, 189, 248, 0.03)' : '#f0f9ff'};">
                                    <span style="font-size: 9px; color: ${mutedColor};">Sub-techniques: ${relatedSubs.map(s => s.techniqueID).join(', ')}</span>
                                </td>
                            </tr>
                        </table>` : ''}
                    </td>
                </tr>
            `;
        });
    }
    
    // New Sub-techniques
    if (subTechniques.length > 0) {
        html += `
            <tr>
                <td style="padding: 10px 0 4px 0; border: none;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 0; border: none; width: 4px; background-color: #0284c7;"></td>
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? 'rgba(2, 132, 199, 0.05)' : '#f0f9ff'};">
                                <span style="font-size: 10px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px;">New Sub-techniques (${subTechniques.length})</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;
        subTechniques.forEach((ann, idx) => {
            const techName = getTechniqueName(ann.techniqueID);
            if (!techName) return;
            const techTactics = getTechniqueTactics(ann.techniqueID);
            const queryNames = (ann.queries && ann.queries.length > 0) ? ann.queries.map(q => q.name).join(', ') : '';
            const hasSentinelSub = ann.queries?.some(q => q.sentinelCandidate);
            const bg = idx % 2 === 0 ? rowBg : altRowBg;
            
            html += `
                <tr>
                    <td style="padding: 0; border: none; background-color: ${bg};">
                        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 5px 10px 5px 14px; border: none; width: 100px; vertical-align: top;">
                                    <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: ;">${ann.techniqueID}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                    <span style="font-weight: 600; color: ;">${techName}</span>
                                    ${techTactics.length > 0 ? `<div style="font-size: 9px; color: ${isDark ? '#38bdf8' : '#0284c7'}; margin-top: 1px;">${techTactics.join(', ')}</div>` : ''}
                                </td>
                                <td style="padding: 5px 10px; border: none; text-align: right; vertical-align: top; max-width: 280px;">
                                    ${queryNames ? `<div style="font-size: 9.5px; color: ${textColor}; font-style: italic;">"${queryNames}"</div>` : ''}
                                    ${hasSentinelSub ? `<div style="font-size: 8px; color: #3b82f6; margin-top: 2px;"><i class="bi bi-robot"></i> Sentinel candidate</div>` : ''}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `;
        });
    }

// Archived Queries
const archivedQueries = [];
const seenArchived = new Set();
techniques.forEach(ann => {
    if (ann.queries) {
        ann.queries.forEach(q => {
            if (q.archived && q.archivedAt && q.archivedAt.startsWith(month) && !seenArchived.has(q.id)) {
                seenArchived.add(q.id);
                archivedQueries.push({
                    id: q.id,
                    name: q.name,
                    techniqueID: ann.techniqueID,
                    archivedAt: q.archivedAt,
                    archiveReason: q.archiveReason
                });
            }
        });
    }
});

if (archivedQueries.length > 0) {
    html += `
        <tr>
            <td style="padding: 10px 0 4px 0; border: none;">
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 0; border: none; width: 4px; background-color: #fb923c;"></td>
                        <td style="padding: 4px 10px; border: none; background-color: ${isDark ? 'rgba(251, 146, 60, 0.05)' : '#fff7ed'};">
                            <span style="font-size: 10px; font-weight: 700; color: #ea580c; text-transform: uppercase; letter-spacing: 0.5px;">Archived Queries (${archivedQueries.length})</span>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    `;
    archivedQueries.forEach((aq, idx) => {
        const techName = getTechniqueName(aq.techniqueID);
        if (!techName) return;
        const bg = idx % 2 === 0 ? rowBg : altRowBg;
        
        html += `
            <tr>
                <td style="padding: 0; border: none; background-color: ${bg};">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 10px 5px 14px; border: none; width: 100px; vertical-align: top;">
                                <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: ;">${aq.techniqueID}</span>
                            </td>
                            <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                <span style="font-weight: 600; color: ;">${techName}</span>
                                <div style="font-size: 9px; color: #ea580c; margin-top: 2px;">
                                    <i class="bi bi-archive"></i> ${escapeHtml(aq.name)}
                                </div>
                                ${aq.archiveReason ? `<div style="font-size: 9px; color: ${mutedColor}; margin-top: 2px; font-style: italic;">"${escapeHtml(aq.archiveReason)}"</div>` : ''}
                            </td>
                            <td style="padding: 5px 10px; border: none; text-align: right; vertical-align: top;">
                                <span style="font-size: 9px; color: ${mutedColor};">${aq.archivedAt.slice(0, 10)}</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;
    });
}

// Restored Queries
const restoredQueries = [];
const seenRestored = new Set();
techniques.forEach(ann => {
    if (ann.queries) {
        ann.queries.forEach(q => {
            if (q.unarchivedAt && q.unarchivedAt.startsWith(month) && !seenRestored.has(q.id)) {
                seenRestored.add(q.id);
                restoredQueries.push({
                    id: q.id,
                    name: q.name,
                    techniqueID: ann.techniqueID,
                    unarchivedAt: q.unarchivedAt
                });
            }
        });
    }
});

if (restoredQueries.length > 0) {
    html += `
        <tr>
            <td style="padding: 10px 0 4px 0; border: none;">
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 0; border: none; width: 4px; background-color: #22c55e;"></td>
                        <td style="padding: 4px 10px; border: none; background-color: ${isDark ? 'rgba(34, 197, 94, 0.05)' : '#f0fdf4'};">
                            <span style="font-size: 10px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px;">Restored Queries (${restoredQueries.length})</span>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    `;
    restoredQueries.forEach((rq, idx) => {
        const techName = getTechniqueName(rq.techniqueID);
        if (!techName) return;
        const bg = idx % 2 === 0 ? rowBg : altRowBg;
        
        html += `
            <tr>
                <td style="padding: 0; border: none; background-color: ${bg};">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 10px 5px 14px; border: none; width: 100px; vertical-align: top;">
                                <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: ;">${rq.techniqueID}</span>
                            </td>
                            <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                <span style="font-weight: 600; color: ;">${techName}</span>
                                <div style="font-size: 9px; color: #16a34a; margin-top: 2px;">
                                    <i class="bi bi-arrow-counterclockwise"></i> ${escapeHtml(rq.name)}
                                </div>
                            </td>
                            <td style="padding: 5px 10px; border: none; text-align: right; vertical-align: top;">
                                <span style="font-size: 9px; color: ${mutedColor};">${rq.unarchivedAt.slice(0, 10)}</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;
    });
}

html += `</table></div>`;
return html;
}

// Legacy Window Bindings
window.buildUnifiedActivityFeed = buildUnifiedActivityFeed;
