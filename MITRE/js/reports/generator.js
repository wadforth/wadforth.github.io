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

function generateReport(reportType = 'initial') {
    if (!state.currentLayer) {
        showToast('No active layer', 'error');
        return;
    }

    const reports = state._cachedReports || [];
    const lastReport = reports.length > 0 ? reports[0] : null;
    const now = new Date();
    const layerName = state.currentLayer.name || 'Default';
    const monthLabel = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    
    const snapshot = getLayerSnapshot();
    const changes = detectChanges(lastReport);
    const topThreats = getTopThreatsForChanges(changes);
    const coverageByTactic = getCoverageByTactic();
    const coverageByLanguage = getCoverageByLanguage();
    const fullStats = getFullCoverageStats();
    
    const report = {
        id: `report_${Date.now()}`,
        title: `${layerName} - ${monthLabel} ${reportType === 'initial' ? 'Initial Assessment' : 'Coverage Update'}`,
        tags: [layerName.toLowerCase().replace(/\s+/g, '_'), now.toISOString().slice(0, 7), reportType],
        type: reportType,
        layerId: state.currentLayer.id || 'default',
        layerName: layerName,
        generatedAt: now.toISOString(),
        generatedDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        reportMonth: monthLabel,
        periodStart: lastReport ? lastReport.periodEnd || lastReport.generatedAt : now.toISOString(),
        periodEnd: now.toISOString(),
        snapshot: snapshot,
        changes: changes,
        topThreats: topThreats,
        coverageByTactic: coverageByTactic,
        coverageByLanguage: coverageByLanguage,
        fullStats: fullStats,
        author: state.author || '',
        companyName: snapshot.companyName,
        companyLogo: snapshot.companyLogo,
        bannerTheme: 'blue',
        executiveSummary: '',
        monthlyFocus: '',
        detectionResults: [],
        gapAnalysis: '',
        prioritization: '',
        recommendations: '',
        teamAssignments: [],
        references: [],
        methodology: {},
        scope: {},
        methodologyNotes: '',
        appendix: {
            methodology: '',
            scope: '',
            limitations: '',
            additionalNotes: ''
        }
    };

    const summaryData = generateExecutiveSummary(report);
    report.executiveSummary = summaryData.executiveSummary;
    report.leadershipOverview = summaryData.leadershipOverview;
    
    // Snapshot remaining dynamic content
    if (!report.monthlyFocus) {
        report.monthlyFocus = generateDynamicMonthlyFocus(report);
    }
    if (!report.gapAnalysis) {
        report.gapAnalysis = generateDynamicGapAnalysis(report);
    }
    if (!report.attckVersion) {
        report.attckVersion = '19.1';
    }
    
    saveReport(report).then(() => {
        showToast('Report generated successfully', 'success');
        loadReportsList();
    }).catch(err => {
        showToast('Failed to save report: ' + err.message, 'error');
    });
}

function generateExecutiveSummary(report) {
    const targetMonth = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    
    // Dynamically calculate the month's stats if the functions exist
    const stats = typeof getMonthStats === 'function' ? getMonthStats(targetMonth) : { queries: 0, mainTechs: 0, subTechs: 0, techIds: new Set() };
    const coverageStats = typeof getOverallCoverageStatsUpToMonth === 'function' ? getOverallCoverageStatsUpToMonth(targetMonth) : { total: 0, covered: 0, pct: 0 };
    const threatsDisrupted = typeof getThreatsDisruptedCount === 'function' ? getThreatsDisruptedCount(targetMonth) : 0;
    
    const coveragePct = coverageStats.pct % 1 === 0 ? coverageStats.pct : coverageStats.pct.toFixed(1);
    const periodLabel = report.reportMonth || (typeof getMonthLabel === 'function' ? getMonthLabel(targetMonth) : 'this period');
    
    let statsText = '';
    if (coverageStats.parents && coverageStats.parents.total) {
        const allPct = coverageStats.all.pct % 1 === 0 ? coverageStats.all.pct : coverageStats.all.pct.toFixed(1);
        statsText = `${coverageStats.parents.covered} of ${coverageStats.parents.total} known parent attack techniques (and ${coverageStats.subs.covered} sub-techniques), achieving ${coveragePct}% overall parent coverage (or ${allPct}% combined framework coverage)`;
    } else {
        statsText = `${coverageStats.covered} of ${coverageStats.total} known attack techniques, achieving ${coveragePct}% overall coverage`;
    }
    
    const leadershipOverview = `This report provides a comprehensive overview of our organization's detection capabilities against the MITRE ATT&CK framework for ${periodLabel}. Our security team has disrupted ${threatsDisrupted} active threat groups and tools by deploying targeted detection queries across ${statsText}. These queries represent our active detection logging efforts across the framework. Coverage percentages reflect techniques with logged queries, though individual techniques may have multiple attack vectors not yet covered. The remaining gaps highlight areas for future detection development.`;
    
    if (report.type === 'initial') {
        let summary = `This initial assessment establishes our baseline detection coverage across the MITRE ATT&CK framework. `;
        if (coverageStats.parents && coverageStats.parents.total) {
            const allPct = coverageStats.all.pct % 1 === 0 ? coverageStats.all.pct : coverageStats.all.pct.toFixed(1);
            summary += `We have implemented detection queries covering ${coverageStats.parents.covered} parent techniques out of ${coverageStats.parents.total} (or ${allPct}% across ${coverageStats.all.covered} of ${coverageStats.all.total} total techniques and sub-techniques), achieving ${coveragePct}% overall parent coverage. `;
        } else {
            summary += `We have implemented detection queries covering ${coverageStats.covered} techniques out of ${coverageStats.total} total techniques in the framework, achieving ${coveragePct}% overall coverage. `;
        }
        
        if (stats.queries > 0) {
            summary += `Our security team has deployed ${stats.queries} new detection queries this period, providing diverse coverage across our security infrastructure. `;
        }
        
        summary += `This report serves as our starting point for measuring detection maturity and identifying priority areas for improvement.`;
        
        return {
            executiveSummary: summary,
            leadershipOverview: leadershipOverview
        };
    } else {
        const changeCount = report.changes?.all?.length || 0;
        const newTechCount = report.changes?.newTechniques?.length || 0;
        const newQueryCount = stats.queries; // dynamic queries deployed this month
        
        let summary = `This monthly update covers detection coverage changes for ${periodLabel}. `;
        
        if (changeCount === 0 && newQueryCount === 0) {
            if (coverageStats.parents && coverageStats.parents.total) {
                summary += `No significant changes were detected during this reporting period. Current parent coverage remains at ${coveragePct}% across ${coverageStats.parents.total} techniques.`;
            } else {
                summary += `No significant changes were detected during this reporting period. Current coverage remains at ${coveragePct}% across ${coverageStats.total} techniques.`;
            }
        } else {
            summary += `During this period, we made progress by implementing ${newQueryCount} new detection queries across ${newTechCount} techniques. `;
            
            const prevCoverage = report.fullStats?.prevPct || coveragePct;
            if (coveragePct > prevCoverage) {
                summary += `Overall parent coverage improved from ${prevCoverage}% to ${coveragePct}%, representing a ${(coveragePct - prevCoverage).toFixed(1)}% increase in our detection capabilities.`;
            } else {
                summary += `Overall parent coverage remains stable at ${coveragePct}%.`;
            }
        }
        
        return {
            executiveSummary: summary,
            leadershipOverview: leadershipOverview
        };
    }
}

function getTopThreatsForChanges(changes) {
    if (!state.groups || !state.software || !state.relationships) return [];
    
    const changedTechStixIds = new Set();
    changes.all.forEach(c => {
        if (c.data?.techniqueID) {
            const stixId = getTechniqueStixId(c.data.techniqueID);
            if (stixId) changedTechStixIds.add(stixId);
        }
    });
    
    if (changedTechStixIds.size === 0) return [];
    
    const threatMap = { groups: [], software: [] };
    
    state.relationships.forEach(rel => {
        if (rel.relationship_type !== 'uses') return;
        const targetId = rel.target_ref;
        if (!changedTechStixIds.has(targetId)) return;
        
        const sourceId = rel.source_ref;
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
    
    const threats = [];
    threatMap.groups.forEach(g => {
        threats.push({ type: 'group', name: g.name, techniques: g.techniques.length, techniqueIds: g.techniques });
    });
    threatMap.software.forEach(s => {
        threats.push({ type: s.type, name: s.name, techniques: s.techniques.length, techniqueIds: s.techniques });
    });
    
    return threats.sort((a, b) => b.techniques - a.techniques).slice(0, 8);
}

function getCoverageByTactic() {
    if (!state.currentLayer?.techniques || !state.techniques) return [];
    
    const tacticMap = {};
    
    state.techniques.forEach(stixTech => {
        const techId = stixTech.external_references?.[0]?.external_id;
        if (!techId) return;
        
        const tactics = stixTech.kill_chain_phases
            ?.filter(k => k.kill_chain_name === 'mitre-attack')
            .map(k => k.phase_name) || [];
        
        const layerTech = state.currentLayer.techniques.find(t => t.techniqueID === techId);
        const hasQueries = layerTech?.queries?.length > 0;
        
        tactics.forEach(tactic => {
            if (!tacticMap[tactic]) tacticMap[tactic] = { total: 0, withQueries: 0 };
            tacticMap[tactic].total++;
            if (hasQueries) tacticMap[tactic].withQueries++;
        });
    });
    
    return Object.entries(tacticMap)
        .map(([tactic, data]) => ({
            tactic,
            coverage: data.total > 0 ? Math.round((data.withQueries / data.total) * 1000) / 10 : 0,
            withQueries: data.withQueries,
            total: data.total
        }))
        .sort((a, b) => b.coverage - a.coverage);
}

function getCoverageByLanguage() {
    if (!state.currentLayer?.techniques) return [];
    const langMap = {};
    
    state.currentLayer.techniques.forEach(t => {
        if (!t.queries) return;
        t.queries.forEach(q => {
            if (!langMap[q.language]) langMap[q.language] = 0;
            langMap[q.language]++;
        });
    });
    
    return Object.entries(langMap)
        .map(([lang, count]) => ({ language: lang, count }))
        .sort((a, b) => b.count - a.count);
}

function getLayerSnapshot() {
    if (!state.currentLayer) return null;
    const techniques = (state.currentLayer.techniques || []).map(t => ({
        techniqueID: t.techniqueID,
        color: t.color || null,
        enabled: t.enabled !== false,
        queryCount: t.queries ? t.queries.length : 0,
        queries: t.queries ? t.queries.map(q => ({ id: q.id, name: q.name, language: q.language })) : []
    }));
    
    return {
        techniqueCount: techniques.length,
        totalQueries: techniques.reduce((sum, t) => sum + t.queryCount, 0),
        techniques,
        mitigationStatus: state.currentLayer.mitigationStatus || {},
        companyName: state.currentLayer.companyName || '',
        companyLogo: state.currentLayer.companyLogo || null
    };
}

function getFullCoverageStats(snapshotTechniques) {
    const layerTechs = snapshotTechniques || state.currentLayer?.techniques;
    if (!state.techniques || !layerTechs) {
        return {
            total: 0, covered: 0, pct: 0,
            parents: { total: 0, covered: 0, pct: 0 },
            subs: { total: 0, covered: 0, pct: 0 },
            all: { total: 0, covered: 0, pct: 0 }
        };
    }
    
    const parentTechniques = state.techniques.filter(t => !t.x_mitre_is_subtechnique);
    const subTechniques = state.techniques.filter(t => t.x_mitre_is_subtechnique);
    const totalTechniques = parentTechniques.length;
    
    let coveredCount = 0;
    const coveredIds = new Set();
    
    layerTechs.forEach(lt => {
        if (lt.queries && lt.queries.length > 0) {
            coveredIds.add(lt.techniqueID);
        }
    });
    
    parentTechniques.forEach(parentTech => {
        const parentId = parentTech.external_references?.[0]?.external_id;
        if (!parentId) return;
        
        if (coveredIds.has(parentId)) {
            coveredCount++;
            return;
        }
        
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
    
    const coveredAll = [...coveredIds].filter(id => {
        return state.techniques.some(t => t.external_references?.[0]?.external_id === id);
    }).length;
    
    return {
        total: totalTechniques,
        logged: layerTechs.length,
        covered: coveredCount,
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
