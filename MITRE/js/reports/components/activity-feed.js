export function buildUnifiedActivityFeed(report, isDark = false, isEmail = false) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    
    const colorChanges = getColorChangesForMonth(month);
    const newTechniques = techniques.filter(t => !existingIds.has(t.techniqueID));
    const newHunts = getNewHuntsForExistingTechniques(month, existingIds);
    const archivedQueries = [];
    const restoredQueries = [];
    const seenArchived = new Set();
    const seenRestored = new Set();

    techniques.forEach(ann => {
        (ann.queries || []).forEach(q => {
            if (q.archived && q.archivedAt && q.archivedAt.startsWith(month) && !seenArchived.has(q.id)) {
                seenArchived.add(q.id);
                archivedQueries.push({ id: q.id, name: q.name, techniqueID: ann.techniqueID, archivedAt: q.archivedAt, archiveReason: q.archiveReason });
            }
            if (q.unarchivedAt && q.unarchivedAt.startsWith(month) && !seenRestored.has(q.id)) {
                seenRestored.add(q.id);
                restoredQueries.push({ id: q.id, name: q.name, techniqueID: ann.techniqueID, unarchivedAt: q.unarchivedAt });
            }
        });
    });
    
    if (colorChanges.length === 0 && newTechniques.length === 0 && newHunts.length === 0 && archivedQueries.length === 0 && restoredQueries.length === 0) return '';
    
    // Filter: only include techniques that exist in STIX data (have a name) AND have actual queries
    const validNewTechniques = newTechniques.filter(t => {
        const name = getTechniqueName(t.techniqueID);
        return name && name.length > 0 && t.queries && t.queries.length > 0;
    });
    
    const mainTechniques = validNewTechniques.filter(t => !isSubTechnique(t.techniqueID));
    const subTechniques = validNewTechniques.filter(t => isSubTechnique(t.techniqueID));
    
    // Only show section if there's actual content
    if (colorChanges.length === 0 && mainTechniques.length === 0 && subTechniques.length === 0 && newHunts.length === 0 && archivedQueries.length === 0 && restoredQueries.length === 0) return '';
    
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
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? '#1a150c' : '#fffbeb'};">
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
                                    <span style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0369a1'};">${escapeHtml(change.techniqueID)}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none;">
                                    <span style="color: ${textColor};">${escapeHtml(techName)}</span>
                                    <span style="font-size: 9px; color: ${mutedColor}; margin-left: 6px;">(${isSub ? 'sub-technique' : 'technique'})</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; text-align: right; white-space: nowrap;">
                                    <span style="font-weight: 600; color: ${isDark ? '#fbbf24' : '#d97706'};">${escapeHtml(fromLabel)}</span>
                                    <span style="color: ${mutedColor}; margin: 0 4px;">&rarr;</span>
                                    <span style="font-weight: 600; color: ${isDark ? '#4ade80' : '#16a34a'};">${escapeHtml(toLabel)}</span>
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
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? '#0c1c14' : '#f0fdf4'};">
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
                                    <span style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0369a1'};">${escapeHtml(ann.techniqueID)}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                    <span style="font-weight: 600; color: ${primaryText};">${escapeHtml(techName)}</span>
                                    ${techTactics.length > 0 ? `<div style="font-size: 9px; color: ${isDark ? '#38bdf8' : '#0284c7'}; margin-top: 1px;">${escapeHtml(techTactics.join(', '))}</div>` : ''}
                                </td>
                                <td style="padding: 5px 10px; border: none; text-align: right; vertical-align: top; max-width: 280px;">
                                    ${queryNames ? `<div style="font-size: 9.5px; color: ${textColor}; font-style: italic;">&quot;${escapeHtml(queryNames)}&quot;</div>` : ''}
                                    ${hasSentinel ? `<div style="font-size: 8px; color: #3b82f6; margin-top: 2px;">${activityIcon('robot', '#3b82f6', 10)}Sentinel candidate</div>` : ''}
                                </td>
                            </tr>
                        </table>
                        ${relatedSubs.length > 0 && queryNames ? `<table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 2px 10px 4px 14px; border: none; background-color: ${isDark ? '#0c1424' : '#f0f9ff'};">
                                    <span style="font-size: 9px; color: ${mutedColor};">Sub-techniques: ${escapeHtml(relatedSubs.map(s => s.techniqueID).join(', '))}</span>
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
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? '#0c1424' : '#f0f9ff'};">
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
                                    <span style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0369a1'};">${escapeHtml(ann.techniqueID)}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                    <span style="font-weight: 600; color: ${primaryText};">${escapeHtml(techName)}</span>
                                    ${techTactics.length > 0 ? `<div style="font-size: 9px; color: ${isDark ? '#38bdf8' : '#0284c7'}; margin-top: 1px;">${escapeHtml(techTactics.join(', '))}</div>` : ''}
                                </td>
                                <td style="padding: 5px 10px; border: none; text-align: right; vertical-align: top; max-width: 280px;">
                                    ${queryNames ? `<div style="font-size: 9.5px; color: ${textColor}; font-style: italic;">&quot;${escapeHtml(queryNames)}&quot;</div>` : ''}
                                    ${hasSentinelSub ? `<div style="font-size: 8px; color: #3b82f6; margin-top: 2px;">${activityIcon('robot', '#3b82f6', 10)}Sentinel candidate</div>` : ''}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `;
        });
    }

    // New hunts on existing techniques
    if (newHunts.length > 0) {
        html += `
            <tr>
                <td style="padding: 10px 0 4px 0; border: none;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 0; border: none; width: 4px; background-color: #7c3aed;"></td>
                            <td style="padding: 4px 10px; border: none; background-color: ${isDark ? '#171028' : '#f5f3ff'};">
                                <span style="font-size: 10px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.5px;">New Hunts on Existing Techniques (${newHunts.length})</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;
        newHunts.forEach((hunt, idx) => {
            const techName = getTechniqueName(hunt.techniqueID);
            if (!techName) return;
            const bg = idx % 2 === 0 ? rowBg : altRowBg;

            html += `
                <tr>
                    <td style="padding: 0; border: none; background-color: ${bg};">
                        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 5px 10px 5px 14px; border: none; width: 100px; vertical-align: top;">
                                    <span style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0369a1'};">${escapeHtml(hunt.techniqueID)}</span>
                                </td>
                                <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                    <span style="font-weight: 600; color: ${primaryText};">${escapeHtml(techName)}</span>
                                    <div style="font-size: 9px; color: ${textColor}; margin-top: 2px; font-style: italic;">${escapeHtml(hunt.huntName || 'Unnamed hunt')}</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `;
        });
    }

if (archivedQueries.length > 0) {
    html += `
        <tr>
            <td style="padding: 10px 0 4px 0; border: none;">
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 0; border: none; width: 4px; background-color: #fb923c;"></td>
                        <td style="padding: 4px 10px; border: none; background-color: ${isDark ? '#1c1208' : '#fff7ed'};">
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
                                <span style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0369a1'};">${escapeHtml(aq.techniqueID)}</span>
                            </td>
                            <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                <span style="font-weight: 600; color: ${primaryText};">${escapeHtml(techName)}</span>
                                <div style="font-size: 9px; color: #ea580c; margin-top: 2px;">
                                    ${activityIcon('archive', '#ea580c', 10)}${escapeHtml(aq.name)}
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

if (restoredQueries.length > 0) {
    html += `
        <tr>
            <td style="padding: 10px 0 4px 0; border: none;">
                <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 0; border: none; width: 4px; background-color: #22c55e;"></td>
                        <td style="padding: 4px 10px; border: none; background-color: ${isDark ? '#0c1c14' : '#f0fdf4'};">
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
                                <span style="font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0369a1'};">${escapeHtml(rq.techniqueID)}</span>
                            </td>
                            <td style="padding: 5px 10px; border: none; vertical-align: top;">
                                <span style="font-weight: 600; color: ${primaryText};">${escapeHtml(techName)}</span>
                                <div style="font-size: 9px; color: #16a34a; margin-top: 2px;">
                                    ${activityIcon('restore', '#16a34a', 10)}${escapeHtml(rq.name)}
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

function activityIcon(name, color = '#3b82f6', size = 12) {
    const paths = {
        robot: '<path d="M7 2h2v2h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm-3 4v5h8V6H4Zm1.5 2.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 14h6v1H5v-1Z"/>',
        archive: '<path d="M2 3h12v3H2V3Zm1 4h10v6.5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5V7Zm3 2v1.2h4V9H6Z"/>',
        restore: '<path d="M8 3a5 5 0 1 1-4.4 7.4l1.3-.7A3.5 3.5 0 1 0 4.8 6H7v1.5H2.3V2.8h1.5v2A5 5 0 0 1 8 3Z"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:3px;fill:${escapeHtml(color)};">${paths[name] || paths.robot}</svg>`;
}

// Legacy Window Bindings
window.buildUnifiedActivityFeed = buildUnifiedActivityFeed;
