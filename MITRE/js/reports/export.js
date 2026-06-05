/* =========================================================================
   Reports Export & Email Layout Templates Module
   ========================================================================= */

export const BANNER_THEMES = {
    blue: { bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', accent: '#3b82f6', label: 'Blue' },
    orange: { bg: 'linear-gradient(135deg, #1a0f00 0%, #4a2800 100%)', accent: '#f97316', label: 'Orange' },
    green: { bg: 'linear-gradient(135deg, #052e16 0%, #0f4a2e 100%)', accent: '#22c55e', label: 'Green' },
    purple: { bg: 'linear-gradient(135deg, #1a0a2e 0%, #3b1d6e 100%)', accent: '#a855f7', label: 'Purple' },
    red: { bg: 'linear-gradient(135deg, #2a0a0a 0%, #5f1e1e 100%)', accent: '#ef4444', label: 'Red' },
    teal: { bg: 'linear-gradient(135deg, #042f2e 0%, #0e4a47 100%)', accent: '#14b8a6', label: 'Teal' },
    slate: { bg: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', accent: '#94a3b8', label: 'Slate' },
}

export function buildEmailHTML(report, isDark = false) {
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
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    
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
    
    if (selectedMethods.length > 0 || selectedScopes.length > 0) {
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
                            <h4 style="margin-top: 0; margin-bottom: 12px; color: ${isDark ? '#a855f7' : '#7c3aed'}; font-size: 14px; font-weight: 700; border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding-bottom: 6px;">
                                HUNTING METHODOLOGY
                            </h4>
                            ${selectedMethods.length ? selectedMethods.map(m => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; border-collapse: collapse;">
                                    <tr>
                                        <td valign="top" style="width: 16px; color: #10b981; font-weight: bold; font-size: 13px; border: none; padding: 0;">✓</td>
                                        <td valign="top" style="padding-left: 6px; border: none; color: ${isDark ? '#cbd5e1' : '#475569'};">${m}</td>
                                    </tr>
                                </table>
                            `).join('') : `<p style="color: ${isDark ? '#6b709c' : '#94a3b8'}; font-size: 12px; font-style: italic; margin: 0;">No specific methodologies specified.</p>`}
                        </div>
                    </td>
                    <td valign="top" style="width: 48%; vertical-align: top; border: none;">
                        <div style="background-color: ${isDark ? '#121324' : '#fafafa'}; border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding: 16px; min-height: 220px;">
                            <h4 style="margin-top: 0; margin-bottom: 12px; color: ${isDark ? '#06b6d4' : '#0284c7'}; font-size: 14px; font-weight: 700; border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}; padding-bottom: 6px;">
                                DEFENSIVE TELEMETRY SCOPE
                            </h4>
                            ${selectedScopes.length ? selectedScopes.map(s => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px; font-size: 12px; color: ${isDark ? '#cbd5e1' : '#475569'}; border-collapse: collapse;">
                                    <tr>
                                        <td valign="top" style="width: 16px; color: #06b6d4; font-weight: bold; font-size: 13px; border: none; padding: 0;">•</td>
                                        <td valign="top" style="padding-left: 6px; border: none; color: ${isDark ? '#cbd5e1' : '#475569'};">${s}</td>
                                    </tr>
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
                            description: q.description,
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
                
                let badgesHtml = '<div style="margin-top: 6px; font-size: 10px; line-height: 1.6;">';
                if (parents.length > 0) {
                    badgesHtml += `<div style="margin-bottom: 2px;"><span style="font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Techniques:</span>`;
                    badgesHtml += parents.map(p => {
                        const bg = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(14, 165, 233, 0.08)';
                        const text = isDark ? '#38bdf8' : '#0369a1';
                        const border = isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(14, 165, 233, 0.2)';
                        return `<span style="background-color: ${bg}; color: ${text}; border: 1px solid ${border}; padding: 1px 4px; font-weight: 600; font-family: monospace; font-size: 9px; margin-right: 4px; display: inline-block; white-space: nowrap;" title="${escapeHtml(p.name)}">${p.id}</span>`;
                    }).join(' ');
                    badgesHtml += `</div>`;
                }
                if (subs.length > 0) {
                    badgesHtml += `<div><span style="font-weight: 700; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; margin-right: 6px; display: inline-block; min-width: 90px;">Sub-techniques:</span>`;
                    badgesHtml += subs.map(s => {
                        const bg = isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.08)';
                        const text = isDark ? '#34d399' : '#047857';
                        const border = isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(16, 185, 129, 0.2)';
                        return `<span style="background-color: ${bg}; color: ${text}; border: 1px solid ${border}; padding: 1px 4px; font-weight: 600; font-family: monospace; font-size: 9px; margin-right: 4px; display: inline-block; white-space: nowrap;" title="${escapeHtml(s.name)}">${s.id}</span>`;
                    }).join(' ');
                    badgesHtml += `</div>`;
                }
                badgesHtml += '</div>';
                
                return `
                    <li style="margin-bottom: 12px; list-style-type: none; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}; padding-bottom: 8px;">
                        <strong style="font-size: 13px; color: ${isDark ? '#ffffff' : '#0f172a'};">${queryName}</strong>
                        <span style="background-color: ${isDark ? '#1e293b' : '#f1f5f9'}; color: ${isDark ? '#cbd5e1' : '#475569'}; padding: 2px 6px; font-size: 9px; font-weight: bold; margin-left: 8px; vertical-align: middle; display: inline-block;">${q.language}</span>
                        ${q.sentinelCandidate ? `<span style="background-color: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); padding: 2px 6px; font-size: 9px; font-weight: bold; margin-left: 6px; vertical-align: middle; display: inline-block; border-radius: 3px;"><i class="bi bi-robot"></i> Sentinel Candidate</span>` : ''}
                        ${q.description ? `<div style="font-size: 12px; color: ${isDark ? '#a2a6cc' : '#475569'}; margin-top: 4px; line-height: 1.5; font-style: italic;">${q.description}</div>` : ''}
                        ${badgesHtml}
                    </li>
                `;
            }).join('');
            newQueriesHtml = `<div class="section" id="query-library"><a name="query-library"></a><h3>New Threat Hunt Queries</h3>
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
                                    [!] Critical (<50%) [${criticalGaps.length}]
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
                                    [OK] Strong (&ge;80%) [${strongCoverage.length}]
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
        coverageHtml = `<div class="section"><h3>Coverage Breakdown</h3>
            <table><thead><tr><th>Tactic</th><th>Coverage</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table>
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
            coverageHtml = `<div class="section"><h3>Coverage Changes <span style="font-size:12px;font-weight:400;color:#64748b;">(vs ${lastMonthLabel})</span></h3>
                <table><thead><tr><th>Tactic</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table>
                <p style="margin-top: 8px; color: #64748b; font-size: 11px; font-style: italic; line-height: 1.4;">Note: Tactic coverage changes evaluate both parent and sub-techniques mapped to each tactical phase.</p>
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

    // Clickable Table of Contents Index (Outlook & EML safe using anchors)
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
                            <div style="font-size: 9px; font-weight: 700; color: #a2a6cc; text-transform: uppercase; letter-spacing: 0.5px;">Threats Disrupted</div>
                            <div style="font-size: 26px; font-weight: 800; color: #fbbf24; margin-top: 4px; line-height: 1;">${threatsDisrupted}</div>
                            <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 2px;">threat groups &amp; tools impacted</div>
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
                                        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; margin-top: 4px;">standard framework grade</div>
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
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${report.author || state.author || 'the Security Operations Team'}</strong>.
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
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Threats Disrupted</div>
                            <div style="font-size: 26px; font-weight: 800; color: #b45309; margin-top: 4px; line-height: 1;">${threatsDisrupted}</div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px;">threat groups &amp; tools impacted</div>
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
                                        <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 4px;">standard framework grade</div>
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
                For the complete catalog of all <strong>${totalQueries}</strong> active detection queries, please email the author: <strong>${report.author || state.author || 'the Security Operations Team'}</strong>.
            </div>
        </div>
    `;

    // Redesigned modern CSS styles
    const stylesHtml = isDark ? `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #cbd5e1; background-color: #070814; }
        * { box-sizing: border-box; }
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
    ` : `
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
        * { box-sizing: border-box; }
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
    <style>
        ${stylesHtml}
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="container">
            <!-- Disclaimer for EML formats -->
            <div class="advisory-bar" style="background-color: ${isDark ? '#1d1607' : '#fffbeb'}; border-bottom: 1.5px solid ${isDark ? 'rgba(251,191,36,0.15)' : '#fde68a'}; padding: 10px 16px; font-size: 11px; color: ${isDark ? '#fbbf24' : '#b45309'}; text-align: center; font-family: sans-serif; font-weight: 600; line-height: 1.4;">
                [!] Format Advisory: Replying directly to this email may break the structured column layout in thread responses.
            </div>
            <!-- Disclaimer for PDF formats (Pristine layout advisory) -->
            <div class="pdf-advisory-bar" style="display: none; background-color: ${isDark ? '#16101d' : '#fcfaff'}; border-bottom: 1.5px solid ${isDark ? 'rgba(168,85,247,0.15)' : '#f5f3ff'}; padding: 10px 16px; font-size: 11px; color: ${isDark ? '#c084fc' : '#6d28d9'}; text-align: center; font-family: sans-serif; font-weight: 600; line-height: 1.4;">
                Document Snapshot: This PDF is a high-fidelity visual snapshot of the interactive dashboard. Text elements within this PDF are non-selectable. For an interactive or text-selectable format, please view the live web report.
            </div>
            <div class="header">
                ${report.companyLogo ? `<img src="${report.companyLogo}" class="logo" alt="Logo">` : ''}
                <h1>THREAT HUNTING MITRE MONTHLY UPDATE</h1>
                <p class="subtitle">${escapeHtml(report.companyName) || 'MITRE ATT&amp;CK Coverage Report'}</p>
                <div class="report-type">${report.type === 'initial' ? 'Initial Assessment' : 'Monthly Update'}</div>
                <p class="report-date">${escapeHtml(report.reportMonth) || escapeHtml(report.generatedDate)}</p>
                ${report.attckVersion ? `<p class="attck-version">ATT&amp;CK Framework v${escapeHtml(report.attckVersion)}</p>` : ''}
                ${report.author || state.author ? `<p class="author">Prepared by: ${escapeHtml(report.author || state.author)}</p>` : ''}
            </div>

            ${statsBarHtml}

            <div class="content">
                ${tocIndexHtml}

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
                    
                    ${gapAnalysisHtml}
                    
                    ${(() => {
                        const assignedTeams = report.teamAssignments || [];
                        if (assignedTeams.length === 0) return '';
                        let teamHtml = `<div class="section" id="team-assignments" style="page-break-inside: avoid;"><a name="team-assignments"></a><h3>Team Assignments &amp; Focus Areas</h3>
                            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 10px;">`;
                        assignedTeams.forEach(teamId => {
                            const team = TEAM_OPTIONS.find(t => t.id === teamId);
                            if (!team) return;
                            const rec = getTeamRecommendations(teamId, report);
                            
                            let sentinelExportHtml = '';
                            if (teamId === 'engineering') {
                                const candidates = [];
                                const seenIds = new Set();
                                const targetMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
                                const techniques = report.snapshot?.techniques || state.currentLayer?.techniques || [];
                                techniques.forEach(ann => {
                                    const baseMonth = ann.monthAdded || new Date().toISOString().slice(0, 7);
                                    if (ann.queries) {
                                        ann.queries.forEach(q => {
                                            const resolvedQMonth = window.resolveQueryMonth ? window.resolveQueryMonth(q, ann) : (q.monthAdded || (q.created ? q.created.slice(0, 7) : targetMonth));
                                            if (resolvedQMonth !== targetMonth) return;
                                            
                                            let isSentinel = q.sentinelCandidate;
                                            let desc = q.description || '';
                                            let qMonth = resolvedQMonth;
                                            
                                            // Fallback lookup in currentLayer if snapshot is missing properties
                                            if (state.currentLayer?.techniques) {
                                                const activeTech = state.currentLayer.techniques.find(t => t.techniqueID === ann.techniqueID);
                                                const activeQuery = activeTech?.queries?.find(lq => lq.id === q.id || (lq.name === q.name && lq.language === q.language));
                                                if (activeQuery) {
                                                    if (isSentinel === undefined) isSentinel = activeQuery.sentinelCandidate;
                                                    if (!desc) desc = activeQuery.description || '';
                                                    if (q.monthAdded === undefined) qMonth = activeQuery.monthAdded || qMonth;
                                                }
                                            }
                                            
                                            if (isSentinel && !seenIds.has(q.id)) {
                                                seenIds.add(q.id);
                                                candidates.push({
                                                    id: q.id,
                                                    name: q.name || 'Unnamed Query',
                                                    techniqueID: ann.techniqueID,
                                                    techniqueName: getTechniqueName(ann.techniqueID),
                                                    description: desc,
                                                    language: q.language
                                                });
                                            }
                                        });
                                    }
                                });
                                
                                if (candidates.length > 0) {
                                    sentinelExportHtml = `
                                        <div style="margin-top: 10px; padding: 10px; background-color: ${isDark ? 'rgba(59, 130, 246, 0.05)' : '#eff6ff'}; border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 4px;">
                                            <div style="font-size: 11px; font-weight: 700; color: #3b82f6; margin-bottom: 6px;">
                                                🤖 Microsoft Sentinel Candidate Queue (${candidates.length})
                                            </div>
                                            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 0; font-size: 10.5px;">
                                                ${candidates.map(c => {
                                                    return `
                                                    <tr>
                                                        <td style="padding: 6px 0; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#e2e8f0'}; color: ${isDark ? '#cbd5e1' : '#334155'}; text-align: left; vertical-align: top;">
                                                            <strong>${escapeHtml(c.name)}</strong>
                                                            <div style="font-size: 9px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-top: 3px; font-style: italic;">
                                                                (View full details in Tier 4: New Queries)
                                                            </div>
                                                        </td>
                                                        <td align="right" style="padding: 6px 0; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#e2e8f0'}; text-align: right; width: 60px; vertical-align: top;">
                                                            <span style="background-color: ${isDark ? '#1e293b' : '#f1f5f9'}; color: ${isDark ? '#cbd5e1' : '#475569'}; padding: 1px 4px; font-size: 8.5px; font-weight: bold; border-radius: 2px;">${c.language}</span>
                                                        </td>
                                                    </tr>
                                                    `;
                                                }).join('')}
                                            </table>
                                        </div>
                                    `;
                                }
                            }
                            
                            teamHtml += `
                                <tr>
                                    <td style="padding: 12px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}; vertical-align: top; background-color: ${isDark ? 'rgba(255,255,255,0.02)' : '#fafafa'};">
                                        <div style="font-size: 12px; font-weight: 700; color: ${team.color}; margin-bottom: 6px;">
                                            ${team.label}
                                        </div>
                                        <div style="font-size: 11px; color: ${isDark ? '#cbd5e1' : '#475569'}; margin-bottom: 4px;">
                                            <strong>Focus:</strong> ${rec.focus}
                                        </div>
                                        <div style="font-size: 11px; color: ${isDark ? '#cbd5e1' : '#475569'}; margin-bottom: 4px;">
                                            <strong>Priority:</strong> ${rec.priority}
                                        </div>
                                        <div style="font-size: 11px; color: ${isDark ? '#cbd5e1' : '#475569'}; margin-bottom: 8px;">
                                            <strong>Actions:</strong>
                                            <ul style="margin: 4px 0 0 0; padding-left: 16px;">
                                                ${rec.actions.map(a => `<li style="margin-bottom: 2px;">${a}</li>`).join('')}
                                            </ul>
                                        </div>
                                        ${sentinelExportHtml}
                                    </td>
                                </tr>`;
                        });
                        teamHtml += '</table></div>';
                        return teamHtml;
                    })()}
                    
                    ${(() => {
                        if (!state.groups || state.groups.length === 0) return '';
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
                        
                        if (allGroups.length === 0) return '';
                        
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
                                        <div style="font-size: 10px; font-weight: 600; color: ${color}; margin-bottom: 2px;">${g.name.split(' ')[0]}</div>
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
                    
                    ${buildUnifiedActivityFeed(report, isDark, true)}
                    
                    ${report.detectionResults?.length > 0 ? `
                        <div class="section" style="page-break-inside: avoid;">
                            <h3>Active Hunt Detections</h3>
                            <p style="margin-bottom: 12px; font-size: 13px; color: ${isDark ? '#cbd5e1' : '#475569'};">Live alerts and indicators detected during this period's hunts:</p>
                            ${report.detectionResults.map(r => `
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin-bottom:12px;" class="detection-item">
                                    <tr>
                                        <td style="padding:14px 18px; border:none; vertical-align:middle; text-align:left;">
                                            <strong>${r.huntName || 'Untitled'}</strong>
                                            ${r.sirTicket ? `<span class="badge-yellow">SIR: ${r.sirTicket}</span>` : ''}
                                            ${r.notes ? `<div class="notes" style="margin-top:8px;">${r.notes}</div>` : ''}
                                        </td>
                                    </tr>
                                </table>
                            `).join('')}
                        </div>
                    ` : ''}
                    
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
                        <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: none; background: transparent;">
                            <tr>
                                <td style="padding: 0; border: none; width: 40px; vertical-align: middle; font-size: 24px; line-height: 1; text-align: left;">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#38bdf8' : '#0284c7'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                </td>
                                <td style="padding: 0; border: none; vertical-align: middle; text-align: left;">
                                    <h4 style="margin: 0 0 3px 0; font-size: 13px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'};">Full MITRE ATT&CK Matrix SVG Attached</h4>
                                    <p style="margin: 0; font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; line-height: 1.4;">A complete visual representation of the MITRE ATT&CK matrix with coverage highlights is attached to this email.</p>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                <div class="page-number-footer" style="display:none; text-align:center; font-size:9px; color:#94a3b8; padding:8px 0; border-top:1px solid #e2e8f0; margin-top:15px;">Page 5 of 5</div>
            </div>
 
            <div class="footer">
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
                    [!] CRITICAL VISIBILITY GAPS (&lt;50% COVERAGE)
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

export function buildThreatsSectionEmail(report, isDark = false) {
    if (!state.groups || state.groups.length === 0) {
        return '';
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
        let expBg = 'rgba(56, 189, 248, 0.1)';
        if (t.techCount >= 40) {
            exposureLevel = 'Critical';
            expColor = '#ef4444';
            expBg = 'rgba(239, 68, 68, 0.1)';
        } else if (t.techCount >= 20) {
            exposureLevel = 'High';
            expColor = '#fbbf24';
            expBg = 'rgba(245, 158, 11, 0.1)';
        }
        
        // Truncate techniques list to top 6 elements
        const techIds = t.techniqueIds?.map(id => getTechniqueIdFromStix(id) || id) || [];
        const truncatedTechIds = techIds.slice(0, 6);
        const extraCount = techIds.length - truncatedTechIds.length;
        const techList = truncatedTechIds.join(', ') + (extraCount > 0 ? `, +${extraCount} more` : '');
        
        const progressColor = t.coveragePct >= 70 ? '#10b981' : t.coveragePct >= 40 ? '#f59e0b' : '#ef4444';
        const progressBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        
        cardsHtml += `
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; background-color: ${isDark ? 'rgba(255,255,255,0.02)' : '#fafafa'}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'};">
                <tr>
                    <td style="padding: 10px 14px; border: none; vertical-align: middle; width: 60%;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">${typeLabel}</span>
                            <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; background-color: ${expBg}; color: ${expColor}; letter-spacing: 0.5px;">${exposureLevel} Risk</span>
                        </div>
                        <div style="font-size: 14px; font-weight: 700; color: ${isDark ? '#ffffff' : '#0f172a'}; margin-bottom: 2px;">${t.name}</div>
                        <div style="font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; font-family: monospace; background-color: ${isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9'}; padding: 3px 8px; display: inline-block;">
                            TTPs: ${techList}
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
                            <span style="margin-left: 8px; font-weight: 600; color: ${t.gaps > 0 ? '#ef4444' : '#10b981'};">${t.gaps > 0 ? `[!] ${t.gaps} gaps` : '[OK] Complete'}</span>
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
            return `<span style="display: inline-block; padding: 2px 6px; margin: 2px; ${isDark ? 'background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;' : 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;'} font-size: 11px;">${id}${name ? ' - ' + name : ''}</span>`;
        }).join('');
        const moreText = item.count > 3 ? ` <span style="color: #64748b; font-size: 11px;">+${item.count - 3} more</span>` : '';
        
        html += `<div style="padding: 8px 10px; margin-bottom: 6px; ${isDark ? 'background: rgba(239, 68, 68, 0.04); border-left: 3px solid #ef4444;' : 'background: #fef2f2; border-left: 3px solid #ef4444;'}">
            <strong style="font-size: 13px; color: ${isDark ? '#fca5a5' : '#991b1b'};">${item.group}</strong>
            <span style="font-size: 11px; color: ${isDark ? '#cbd5e1' : '#64748b'}; margin-left: 8px;">${item.count} techniques</span>
            <div style="margin-top: 4px;">${techList}${moreText}</div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}



// Legacy Window Bindings
window.BANNER_THEMES = BANNER_THEMES;
window.buildEmailHTML = buildEmailHTML;
window.buildGapAnalysisVisual = buildGapAnalysisVisual;
window.buildThreatsSectionEmail = buildThreatsSectionEmail;
window.buildTechniquesAtRiskEmail = buildTechniquesAtRiskEmail;
