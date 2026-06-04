/* =========================================================================
   Reports Analytics & Dynamic Recommendations Module
   ========================================================================= */

export function resolveQueryMonth(q, ann) {
    if (q.monthAdded) return q.monthAdded;
    if (q.created) return q.created.slice(0, 7);
    if (ann && ann.monthAdded) return ann.monthAdded;
    return new Date().toISOString().slice(0, 7);
}

export function getCoverageByTacticUpToMonth(targetMonth) {
    if (!state.currentLayer?.techniques || !state.techniques) return [];
    const tacticMap = {};
    state.techniques.forEach(stixTech => {
        const techId = stixTech.external_references?.[0]?.external_id;
        if (!techId) return;
        const tactics = stixTech.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        const layerTech = state.currentLayer.techniques.find(t => t.techniqueID === techId);
        
        const hasQueries = layerTech?.queries?.some(q => {
            const qMonth = resolveQueryMonth(q, layerTech);
            return qMonth <= targetMonth;
        });
        
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
            focus: `Threat Actor Research & IOC Extraction: ${topGroupName}`,
            actions: [
                `Research threat actor behaviors, campaigns, and TTPs for ${topGroupName} (${topGroupAliases}) - ${topGroup ? topGroup.techCount + ' known TTPs' : 'High-volume threat actor'}`,
                `Extract Indicators of Compromise (IOCs) from threat reports and intelligence feeds`,
                `Send extracted IP addresses, domains, and file hashes to SOC blocklists for active containment`,
                `Map ${topGroupTTPs} to current detection gaps`,
                `Track emerging TTPs from groups exploiting ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ')).join(' and ') || 'critical'} gaps`
            ],
            priority: `Critical - Research threat actor patterns and send IOC blocklists to SOC`
        },
        engineering: {
            focus: `Detection Development: Review Sentinel Candidates`,
            actions: [
                `Review Sentinel Candidates queue for rule layout and compatibility`,
                `Deploy priority Sentinel Candidates to workspace via CI/CD pipeline`,
                `Develop queries for ${topGroupTTPs} (${topGroupName} primary TTPs)`,
                `Create KQL rules for ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ')).join(' and ') || 'critical'} tactics`,
                `Tune existing rules to reduce false positives on ${topGroup ? topGroup.topTechniques[0] || 'T1059' : 'command execution'} detections`
            ],
            priority: `Critical - Review and deploy Sentinel Candidates to workspace`
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

export function generateDynamicExecutiveSummary(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const stats = getMonthStats(month);
    const coverageStats = getOverallCoverageStatsUpToMonth(month);
    const overallCoverage = coverageStats.pct % 1 === 0 ? coverageStats.pct : coverageStats.pct.toFixed(1);
    
    let summary = `This ${report.type === 'initial' ? 'initial assessment' : 'monthly update'} report details the strategic expansion of our threat detection portfolio for ${report.reportMonth || month}. `;
    
    const frameworkCoverageStr = coverageStats.parents && coverageStats.parents.total 
        ? `${overallCoverage}% (parent techniques)` 
        : `${overallCoverage}%`;

    summary += `Currently, our global defensive footprint covers ${frameworkCoverageStr} of the MITRE ATT&CK framework. `;
    
    if (stats.queries > 0) {
        summary += `During this reporting cycle, the engineering team successfully closed critical defensive gaps by deploying ${stats.queries} new active detection${stats.queries !== 1 ? 's' : ''}. `;
    } else {
        summary += `During this reporting cycle, engineering efforts prioritized the tuning and maintenance of our existing detection portfolio. `;
    }
    
    summary += `These ongoing investments directly reduce our organizational risk and ensure continuous validation of our security controls against emerging threats.`;
    
    return summary;
}

export function generateLeadershipOverview(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    
    const tacticsCoverage = getCoverageByTacticUpToMonth(month);
    const topTactics = tacticsCoverage.sort((a, b) => b.covered - a.covered).slice(0, 2);
    
    let overview = `Our security posture continues to mature, aligning with our objective to counter advanced adversaries early in their attack lifecycle. `;
    
    if (topTactics.length > 0) {
        const primaryTactic = topTactics[0];
        overview += `This month, our capabilities in the ${primaryTactic.tactic} phase demonstrated exceptional maturity, achieving ${primaryTactic.coverage}% total coverage. `;
        
        if (topTactics.length > 1) {
            const secondaryTactic = topTactics[1];
            overview += `Similarly, our visibility within the ${secondaryTactic.tactic} phase reached ${secondaryTactic.coverage}%, significantly limiting an attacker's operational freedom. `;
        }
    } else {
        overview += `We are continuously establishing baselines across the attack lifecycle to identify malicious activity early. `;
    }
    
    overview += `By maintaining strict visibility over these critical chokepoints, the Security Operations Center is positioned to disrupt intrusions before they escalate into material impact.`;
    
    return overview;
}

export function generateDynamicMonthlyFocus(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7);
    if (!month) return '';
    
    const byMonth = getTechniquesByMonth();
    const techniques = byMonth[month] || [];
    
    if (techniques.length === 0) return 'No new techniques were added to the detection portfolio this month. Engineering efforts were focused on maintaining and tuning existing analytics.';
    
    const groupHits = {};
    if (state.groups) {
        techniques.forEach(ann => {
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
        focus += `Specifically, our recent deployments directly counter known behaviors associated with advanced persistent threats such as ${topGroups.join(' and ')}. `;
    } else {
        focus += `Specifically, our recent deployments target novel evasion techniques and emerging adversary playbooks. `;
    }
    
    focus += `By aligning our detection engineering cycle against verified threat intelligence, we ensure that our defenses evolve dynamically in response to the changing landscape.`;
    
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

export function generateDynamicRecommendations(report) {
    const month = report.selectedMonth || report.generatedAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const tactics = getCoverageByTacticUpToMonth(month);
    const lowCoverage = tactics.filter(t => t.coverage < 50).sort((a, b) => a.coverage - b.coverage);
    const mediumCoverage = tactics.filter(t => t.coverage >= 50 && t.coverage < 80);
    
    let recs = '**Strategic Recommendations:**\n\n';
    
    if (lowCoverage.length > 0) {
        recs += '**1. Close Critical Gaps:**\n';
        recs += `   Focus immediate resources on ${lowCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')} tactics.\n`;
        recs += `   These represent the highest risk blind spots in our detection coverage.\n\n`;
    }
    
    if (mediumCoverage.length > 0) {
        recs += '**2. Strengthen Moderate Coverage:**\n';
        recs += `   Develop additional detection queries for ${mediumCoverage.slice(0, 2).map(t => t.tactic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' and ')}.\n`;
        recs += `   Target 80%+ coverage across all tactics within the next quarter.\n\n`;
    }
    
    recs += '**3. Threat-Aligned Detection:**\n';
    recs += '   Prioritize detections based on active threat actor TTPs targeting our industry.\n';
    recs += '   Focus on techniques used by APT groups with known interest in our sector.\n\n';
    
    recs += '**4. Detection Quality:**\n';
    recs += '   Review existing queries for false positive rates and tuning opportunities.\n';
    recs += '   Implement automated testing for detection validation.\n\n';
    
    recs += '**5. Team Coordination:**\n';
    recs += '   Assign specific tactics to dedicated teams for ownership and accountability.\n';
    recs += '   Establish regular review cadence for coverage progress.';
    
    return recs;
}

export function generateDynamicAppendix(report) {
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

// O(1) Cache for getQueryAssociations
export let _queryAssocMap = new Map();
export let _lastLayerTechsRef = null;

export function buildQueryAssociationsMap(layerTechs) {
    _queryAssocMap.clear();
    _lastLayerTechsRef = layerTechs;
    layerTechs.forEach(lt => {
        if (!lt.queries) return;
        lt.queries.forEach(lq => {
            const key = lq.id || (lq.name + '|' + lq.language);
            if (!_queryAssocMap.has(key)) _queryAssocMap.set(key, []);
            _queryAssocMap.get(key).push({
                id: lt.techniqueID,
                name: getTechniqueName(lt.techniqueID) || lt.name || '',
                isSub: lt.techniqueID.includes('.')
            });
        });
    });
    // Deduplicate and sort
    _queryAssocMap.forEach((assoc, key) => {
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
        _queryAssocMap.set(key, unique);
    });
}

export function getQueryAssociations(q, layerTechs) {
    if (!layerTechs) return [];
    if (_lastLayerTechsRef !== layerTechs) {
        buildQueryAssociationsMap(layerTechs);
    }
    const key = q.id || (q.name + '|' + q.language);
    return _queryAssocMap.get(key) || [];
}

// Legacy Window Bindings
window.resolveQueryMonth = resolveQueryMonth;
window.getCoverageByTacticUpToMonth = getCoverageByTacticUpToMonth;
window.getTeamRecommendations = getTeamRecommendations;
window.generateDynamicExecutiveSummary = generateDynamicExecutiveSummary;
window.generateLeadershipOverview = generateLeadershipOverview;
window.generateDynamicMonthlyFocus = generateDynamicMonthlyFocus;
window.generateDynamicGapAnalysis = generateDynamicGapAnalysis;
window.generateDynamicRecommendations = generateDynamicRecommendations;
window.generateDynamicAppendix = generateDynamicAppendix;
window._queryAssocMap = _queryAssocMap;
window._lastLayerTechsRef = _lastLayerTechsRef;
window.buildQueryAssociationsMap = buildQueryAssociationsMap;
window.getQueryAssociations = getQueryAssociations;
