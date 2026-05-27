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
    
    const snapshot = getLayerSnapshot();
    const changes = detectChanges(lastReport);
    const topThreats = getTopThreatsForChanges(changes);
    const coverageByTactic = getCoverageByTactic();
    const coverageByLanguage = getCoverageByLanguage();
    const fullStats = getFullCoverageStats();
    
    const report = {
        id: `report_${Date.now()}`,
        type: reportType,
        layerId: state.currentLayer.id || 'default',
        layerName: state.currentLayer.name || 'Untitled Layer',
        generatedAt: now.toISOString(),
        generatedDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        reportMonth: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
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
    const stats = report.fullStats || getFullCoverageStats();
    const snapshot = report.snapshot;
    const coveragePct = stats.pct;
    
    const leadershipOverview = `This report provides a comprehensive overview of our organization's detection capabilities against the MITRE ATT&CK framework, which is the global standard for understanding adversary behavior. Our security team has implemented ${snapshot.totalQueries} detection queries across ${stats.logged} of ${stats.total} known attack techniques, achieving ${coveragePct}% coverage. These queries represent our active detection logging efforts across the framework. Coverage percentages reflect techniques with logged queries, though individual techniques may have multiple attack vectors not yet covered. The remaining gaps highlight areas for future detection development.`;
    
    if (report.type === 'initial') {
        let summary = `This initial assessment establishes our baseline detection coverage across the MITRE ATT&CK framework. `;
        summary += `We have implemented ${snapshot.totalQueries} detection queries covering ${stats.logged} techniques out of ${stats.total} total techniques in the framework, achieving ${coveragePct}% coverage. `;
        
        if (snapshot.totalQueries > 0) {
            const langBreakdown = report.coverageByLanguage?.map(l => `${l.count} ${l.language}`).join(', ') || 'none';
            summary += `Our detection queries span multiple languages including ${langBreakdown}, providing diverse coverage across our security infrastructure. `;
        }
        
        summary += `This report serves as our starting point for measuring detection maturity and identifying priority areas for improvement.`;
        
        return {
            executiveSummary: summary,
            leadershipOverview: leadershipOverview
        };
    } else {
        const changeCount = report.changes.all.length;
        const newTechCount = report.changes.newTechniques.length;
        const newQueryCount = report.changes.newQueries.length;
        const colorChangeCount = report.changes.colorChanges.length;
        const mitigationChangeCount = report.changes.mitigationChanges.length;
        
        let summary = `This monthly update covers detection coverage changes from ${new Date(report.periodStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} to ${report.generatedDate}. `;
        
        if (changeCount === 0) {
            summary += `No significant changes were detected during this reporting period. Current coverage remains at ${coveragePct}% across ${stats.total} techniques.`;
        } else {
            summary += `During this period, we made ${changeCount} improvements: `;
            const parts = [];
            if (newTechCount > 0) parts.push(`added ${newTechCount} new technique(s)`);
            if (newQueryCount > 0) parts.push(`implemented ${newQueryCount} new detection query/queries`);
            if (colorChangeCount > 0) parts.push(`updated ${colorChangeCount} detection priority level(s)`);
            if (mitigationChangeCount > 0) parts.push(`updated ${mitigationChangeCount} mitigation status(es)`);
            summary += parts.join(', ') + '. ';
            
            const prevCoverage = report.fullStats?.prevPct || coveragePct;
            if (coveragePct > prevCoverage) {
                summary += `Overall coverage improved from ${prevCoverage}% to ${coveragePct}%, representing a ${coveragePct - prevCoverage}% increase in our detection capabilities.`;
            } else if (coveragePct < prevCoverage) {
                summary += `Overall coverage decreased from ${prevCoverage}% to ${coveragePct}%, representing a ${prevCoverage - coveragePct}% decrease that requires attention.`;
            } else {
                summary += `Overall coverage remains stable at ${coveragePct}%.`;
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

function getFullCoverageStats() {
    if (!state.techniques || !state.currentLayer?.techniques) return { total: 0, covered: 0, pct: 0 };
    
    const totalTechniques = state.techniques.filter(t => !t.x_mitre_is_subtechnique).length;
    const layerTechIds = new Set(state.currentLayer.techniques.map(t => t.techniqueID));
    const coveredCount = state.currentLayer.techniques.filter(t => t.queries && t.queries.length > 0).length;
    
    return {
        total: totalTechniques,
        logged: layerTechIds.size,
        covered: coveredCount,
        pct: totalTechniques > 0 ? Math.round((coveredCount / totalTechniques) * 1000) / 10 : 0
    };
}
