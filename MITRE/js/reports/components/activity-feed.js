export function buildUnifiedActivityFeed(report, isDark = false, isEmail = false, options = {}) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (!month) return '';

    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    const existingIds = getExistingTechniqueIds(month);
    const colorChanges = options.includeStatusChanges === false ? [] : getColorChangesForMonth(month);
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

    const validNewTechniques = newTechniques.filter(t => {
        const name = getTechniqueName(t.techniqueID);
        return name && t.queries && t.queries.length > 0;
    });

    const events = buildActivityEvents({
        colorChanges,
        mainTechniques: validNewTechniques.filter(t => !isSubTechnique(t.techniqueID)),
        subTechniques: validNewTechniques.filter(t => isSubTechnique(t.techniqueID)),
        newHunts,
        archivedQueries,
        restoredQueries
    });

    if (!events.length) return '';
    return isEmail ? buildActivityFeedEmail(events, isDark, report) : buildActivityFeedView(events);
}

function buildActivityEvents({ colorChanges, mainTechniques, subTechniques, newHunts, archivedQueries, restoredQueries }) {
    const events = [];

    colorChanges.forEach(change => {
        const techName = getTechniqueName(change.techniqueID);
        if (!techName) return;
        events.push({
            tone: 'status',
            type: 'Status change',
            techniqueID: change.techniqueID,
            name: techName,
            detail: change.queryName || 'Coverage colour/status changed',
            before: change.fromLabel === 'None' ? 'Unassigned' : change.fromLabel,
            after: change.toLabel === 'None' ? 'Unassigned' : change.toLabel
        });
    });

    mainTechniques.forEach(ann => {
        const techName = getTechniqueName(ann.techniqueID);
        if (!techName) return;
        events.push({
            tone: 'new',
            type: 'New technique',
            techniqueID: ann.techniqueID,
            name: techName,
            detail: getTechniqueDetail(ann),
            before: 'Untracked',
            after: 'Covered'
        });
    });

    subTechniques.forEach(ann => {
        const techName = getTechniqueName(ann.techniqueID);
        if (!techName) return;
        events.push({
            tone: 'sub',
            type: 'New sub-technique',
            techniqueID: ann.techniqueID,
            name: techName,
            detail: getTechniqueDetail(ann),
            before: 'Untracked',
            after: 'Covered'
        });
    });

    newHunts.forEach(hunt => {
        const techName = getTechniqueName(hunt.techniqueID);
        if (!techName) return;
        events.push({
            tone: 'hunt',
            type: 'New hunt',
            techniqueID: hunt.techniqueID,
            name: techName,
            detail: hunt.huntName || 'Unnamed hunt',
            before: 'Existing coverage',
            after: 'New query'
        });
    });

    archivedQueries.forEach(query => {
        const techName = getTechniqueName(query.techniqueID);
        if (!techName) return;
        events.push({
            tone: 'archive',
            type: 'Archived query',
            techniqueID: query.techniqueID,
            name: techName,
            detail: [query.name, query.archiveReason].filter(Boolean).join(' - '),
            before: 'Active',
            after: 'Archived',
            date: query.archivedAt?.slice(0, 10)
        });
    });

    restoredQueries.forEach(query => {
        const techName = getTechniqueName(query.techniqueID);
        if (!techName) return;
        events.push({
            tone: 'restore',
            type: 'Restored query',
            techniqueID: query.techniqueID,
            name: techName,
            detail: query.name || 'Restored query',
            before: 'Archived',
            after: 'Active',
            date: query.unarchivedAt?.slice(0, 10)
        });
    });

    return events;
}

function getTechniqueDetail(ann) {
    const tactics = getTechniqueTactics(ann.techniqueID);
    const queries = ann.queries?.map(q => q.name).filter(Boolean).join(', ');
    const sentinel = ann.queries?.some(q => q.sentinelCandidate) ? 'Candidate to convert to Sentinel analytic' : '';
    return [queries, tactics.join(', '), sentinel].filter(Boolean).join(' - ');
}

function getActivityGroups(events) {
    const groups = [
        { key: 'status', label: 'Status changes', tones: new Set(['status']), accent: '#9ccfd8', bg: isDarkColor('#9ccfd8') },
        { key: 'new-techniques', label: 'New techniques', tones: new Set(['new']), accent: '#34d399', bg: isDarkColor('#34d399') },
        { key: 'new-sub-techniques', label: 'New sub-techniques', tones: new Set(['sub']), accent: '#38bdf8', bg: isDarkColor('#38bdf8') },
        { key: 'new-hunts', label: 'New hunts', tones: new Set(['hunt']), accent: '#7ba8d8', bg: isDarkColor('#7ba8d8') },
        { key: 'archived', label: 'Archived queries', tones: new Set(['archive']), accent: '#f87171', bg: isDarkColor('#f87171') },
        { key: 'restored', label: 'Restored queries', tones: new Set(['restore']), accent: '#fbbf24', bg: isDarkColor('#fbbf24') }
    ];

    return groups
        .map(group => ({ ...group, events: events.filter(event => group.tones.has(event.tone)) }))
        .filter(group => group.events.length > 0);
}

function isDarkColor(hex) {
    return `${hex}18`;
}

function buildActivityFeedView(events) {
    const groups = getActivityGroups(events);
    return `
        <div class="report-section monthly-activity-section" id="monthly-activity">
            <h4><i class="bi bi-activity"></i> Status &amp; Coverage Changes</h4>
            <p class="text-on-surface-secondary mb-3" style="font-size: 0.8rem;">One compact activity stream for status changes, new techniques, sub-techniques, new hunts, archived queries, and restored queries in this reporting period.</p>
            <div class="activity-feed-compact">
                ${groups.map(group => `
                    <section class="activity-feed-group ${escapeHtml(group.key)}" style="--activity-group-accent:${escapeHtml(group.accent)};--activity-group-bg:${escapeHtml(group.bg)};">
                        <header><span></span><strong>${escapeHtml(group.label)}</strong><em>${group.events.length} event${group.events.length === 1 ? '' : 's'}</em></header>
                        <div class="activity-feed-rows">
                            ${group.events.map(renderActivityEventRow).join('')}
                        </div>
                    </section>
                `).join('')}
            </div>
        </div>
    `;
}

function renderActivityEventRow(event) {
    return `
        <div class="activity-feed-row ${escapeHtml(event.tone)}">
            <code>${escapeHtml(event.techniqueID)}</code>
            <div class="activity-feed-main">
                <div class="activity-feed-titleline">
                    <strong>${escapeHtml(event.name)}</strong>
                    <small>${escapeHtml(event.type)}</small>
                </div>
                ${event.detail ? `<div class="activity-feed-query">${escapeHtml(event.detail)}</div>` : ''}
                <div class="activity-feed-meta"><span>${escapeHtml(event.before)}</span><b>to</b><span>${escapeHtml(event.after)}</span>${event.date ? `<span>${escapeHtml(event.date)}</span>` : ''}</div>
            </div>
        </div>
    `;
}

function buildActivityFeedEmail(events, isDark, report) {
    const border = isDark ? '#27303a' : '#dfe7ee';
    const panel = isDark ? '#111820' : '#f8fafc';
    const text = isDark ? '#cbd5e1' : '#475569';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const heading = isDark ? '#ffffff' : '#0f172a';
    const monthLabel = getActivityReportMonthLabel(report);
    const groups = getActivityGroups(events);
    return `
        <div class="section" id="monthly-activity" style="page-break-inside: avoid;"><a name="monthly-activity"></a>
            <h3>${activityIcon('activity', isDark ? '#9ccfd8' : '#0369a1', 14)}Status &amp; Coverage Changes</h3>
            <p style="margin-bottom:10px;font-size:12px;color:${muted};">One activity stream for ${escapeHtml(monthLabel)}: status changes, new techniques, sub-techniques, new hunts, archived queries, and restored queries.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:11px;line-height:1.45;">
                <thead><tr><th>Event</th><th>Technique</th><th>Name</th><th>Movement</th><th>Detail</th></tr></thead>
                <tbody>
                    ${groups.map(group => `
                        <tr><td colspan="5" style="border:1px solid ${border};border-left:4px solid ${group.accent};background-color:${group.bg};color:${heading};font-weight:800;text-transform:uppercase;letter-spacing:0.05em;font-size:10px;">${escapeHtml(group.label)} (${group.events.length})</td></tr>
                        ${group.events.map(event => `
                            <tr>
                                <td style="border:1px solid ${border};background-color:${panel};color:${heading};font-weight:700;">${escapeHtml(event.type)}</td>
                                <td style="border:1px solid ${border};font-family:monospace;font-weight:700;color:${heading};">${escapeHtml(event.techniqueID)}</td>
                                <td style="border:1px solid ${border};color:${text};">${escapeHtml(event.name)}</td>
                                <td style="border:1px solid ${border};color:${muted};white-space:nowrap;">${escapeHtml(event.before)} &rarr; ${escapeHtml(event.after)}</td>
                                <td style="border:1px solid ${border};color:${muted};">${escapeHtml(event.detail || event.date || '')}</td>
                            </tr>
                        `).join('')}
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getActivityReportMonthLabel(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (month && typeof window.getMonthLabel === 'function') return window.getMonthLabel(month);
    return report.reportMonth || report.generatedDate || 'Current Period';
}

function activityIcon(name, color = '#3b82f6', size = 12) {
    const paths = {
        activity: '<path d="M6.4 13.5 3.5 7.7 2.6 10H1l1.8-4.5h1.4l2.1 4.2L9.5 2.5h1.3l2 5H15V9h-3.2L10.1 4.9l-3.7 8.6Z"/>',
        robot: '<path d="M7 2h2v2h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm-3 4v5h8V6H4Zm1.5 2.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 14h6v1H5v-1Z"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:3px;fill:${escapeHtml(color)};">${paths[name] || paths.activity}</svg>`;
}

window.buildUnifiedActivityFeed = buildUnifiedActivityFeed;
