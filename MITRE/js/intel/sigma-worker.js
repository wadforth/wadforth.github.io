// Sigma Web Worker - Handles heavy YAML parsing, filtering, and sorting
// Runs off the main thread to keep UI responsive

export let sigmaRulesCache = [];

self.onmessage = function(e) {
    const { type, payload } = e.data;
    
    switch (type) {
        case 'INIT_RULES':
            sigmaRulesCache = payload.rules;
            self.postMessage({ type: 'INIT_COMPLETE', count: sigmaRulesCache.length });
            break;
            
        case 'PARSE_YAML':
            handleParseYAML(payload.rule);
            break;
            
        case 'FILTER_AND_SORT':
            handleFilterAndSort(payload);
            break;
            
        case 'UPDATE_RULE':
            const idx = sigmaRulesCache.findIndex(r => r.id === payload.rule.id);
            if (idx !== -1) {
                sigmaRulesCache[idx] = payload.rule;
            } else {
                sigmaRulesCache.push(payload.rule);
            }
            break;
            
        case 'BATCH_UPDATE_RULES':
            for (const rule of payload.rules) {
                const idx = sigmaRulesCache.findIndex(r => r.id === rule.id);
                if (idx !== -1) {
                    sigmaRulesCache[idx] = rule;
                } else {
                    sigmaRulesCache.push(rule);
                }
            }
            self.postMessage({ type: 'BATCH_UPDATE_COMPLETE', count: sigmaRulesCache.length });
            break;
    }
};

export function handleParseYAML(rule) {
    try {
        const rawContent = rule.yaml;
        if (!rawContent) {
            self.postMessage({ type: 'PARSE_ERROR', ruleId: rule.id, error: 'Empty YAML' });
            return;
        }
        
        // Parse title
        const titleMatch = rawContent.match(/^title:\s*(.+)$/m);
        if (titleMatch) rule.title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
        
        // Parse description
        const descMatch = rawContent.match(/^description:\s*(.+)$/m);
        if (descMatch) rule.description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
        
        // Parse technique_id from attack tags
        const tagsMatches = rawContent.match(/attack\.t\d{4}(?:\.\d{3})?/gi);
        rule.technique_id = tagsMatches ? tagsMatches[0].replace(/attack\./i, '').toUpperCase() : 'N/A';
        
        // Parse tactic
        const tacticMatch = rawContent.match(/attack\.(initial_access|reconnaissance|resource_development|execution|persistence|privilege_escalation|defense_evasion|credential_access|discovery|lateral_movement|collection|exfiltration|command_and_control|impact)/gi);
        if (tacticMatch) {
            const tKey = tacticMatch[0].replace(/attack\./i, '').toLowerCase();
            const map = {
                'initial_access': 'Initial Access', 'reconnaissance': 'Reconnaissance',
                'resource_development': 'Resource Development', 'execution': 'Execution',
                'persistence': 'Persistence', 'privilege_escalation': 'Privilege Escalation',
                'defense_evasion': 'Defense Evasion', 'credential_access': 'Credential Access',
                'discovery': 'Discovery', 'lateral_movement': 'Lateral Movement',
                'collection': 'Collection', 'exfiltration': 'Exfiltration',
                'command_and_control': 'Command and Control', 'impact': 'Impact'
            };
            rule.tactic = map[tKey] || 'Unknown';
        } else {
            rule.tactic = 'Unknown';
        }
        
        // Parse level
        const levelMatch = rawContent.match(/level:\s*(\w+)/i);
        rule.level = levelMatch ? levelMatch[1].toLowerCase() : '';
        
        // Parse dates
        const dateMatch = rawContent.match(/^date:\s*(\d{4}[\/-]\d{2}[\/-]\d{2})/m);
        rule.ruleDate = dateMatch ? dateMatch[1].trim() : '';
        
        const modifiedMatch = rawContent.match(/^modified:\s*(\d{4}[\/-]\d{2}[\/-]\d{2})/m);
        rule.ruleModified = modifiedMatch ? modifiedMatch[1].trim() : '';
        
        // Parse status
        const statusMatch = rawContent.match(/^status:\s*(\w+)/mi);
        rule.ruleStatus = statusMatch ? statusMatch[1].toLowerCase() : '';
        
        // Parse logsource from YAML
        const prodMatch = rawContent.match(/product:\s*(\w+)/i);
        const catMatch = rawContent.match(/category:\s*(\w+)/i);
        if (prodMatch) rule.logsource.product = prodMatch[1].toLowerCase();
        if (catMatch) rule.logsource.category = catMatch[1].toLowerCase();
        
        rule.isVirtual = false;
        rule.hydratedAt = Date.now();
        
        self.postMessage({ type: 'PARSE_SUCCESS', rule });
    } catch (err) {
        self.postMessage({ type: 'PARSE_ERROR', ruleId: rule.id, error: err.message });
    }
}

export function handleFilterAndSort({ rules, filters, coverageMap, sort }) {
    const { searchQuery, logsource, tactic, level, coverage, product, date } = filters;
    
    let filtered = rules.filter(rule => {
        // Text search
        const q = searchQuery;
        const matchText = !q ||
            rule.title.toLowerCase().includes(q) ||
            rule.description.toLowerCase().includes(q) ||
            (rule.technique_id && rule.technique_id.toLowerCase().includes(q)) ||
            (rule.tactic && rule.tactic.toLowerCase().includes(q)) ||
            (rule.yaml && rule.yaml.toLowerCase().includes(q));
        
        // Logsource
        const matchLog = logsource === 'all' ||
            (rule.logsource && rule.logsource.category === logsource);
        
        // Tactic
        const matchTactic = tactic === 'all' ||
            (rule.tactic && rule.tactic.toLowerCase() === tactic.toLowerCase());
        
        // Level
        const rLevel = rule.level || (rule.isVirtual ? '' : extractLevelFromYaml(rule.yaml));
        const matchLevel = level === 'all' || rLevel === level;
        
        // Coverage
        const cov = coverageMap[rule.id] || 'gap';
        const matchCov = coverage === 'all' || cov === coverage;
        
        // Product
        const matchProd = product === 'all' ||
            (rule.logsource && rule.logsource.product === product);
        
        // Date filter
        let matchDate = true;
        if (date === 'new') {
            matchDate = rule.detectedType === 'new' || rule.detectedType === 'modified';
        }
        
        return matchText && matchLog && matchTactic && matchLevel && matchCov && matchProd && matchDate;
    });
    
    // Apply sorting
    switch (sort) {
        case 'az':
            filtered.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'za':
            filtered.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'severity-desc':
            filtered.sort((a, b) => getSeverityRank(b) - getSeverityRank(a));
            break;
        case 'severity-asc':
            filtered.sort((a, b) => getSeverityRank(a) - getSeverityRank(b));
            break;
        case 'date-desc':
            filtered.sort((a, b) => getEffectiveDate(b) - getEffectiveDate(a));
            break;
    }
    
    self.postMessage({ type: 'FILTER_COMPLETE', filtered, total: filtered.length });
}

export function extractLevelFromYaml(yamlText) {
    if (!yamlText) return '';
    const m = yamlText.match(/level:\s*(\w+)/i);
    return m ? m[1].toLowerCase() : '';
}

export function getSeverityRank(rule) {
    const level = rule.level || extractLevelFromYaml(rule.yaml);
    const ranks = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 };
    return ranks[level] || 0;
}

export function parseSigmaDate(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr.replace(/\//g, '-'));
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function getEffectiveDate(rule) {
    const modified = rule.ruleModified ? parseSigmaDate(rule.ruleModified) : 0;
    const created = rule.ruleDate ? parseSigmaDate(rule.ruleDate) : 0;
    const latest = Math.max(modified, created);
    if (latest > 0) return latest;
    return 0;
}

// Legacy Window Bindings
window.sigmaRulesCache = sigmaRulesCache;
window.handleParseYAML = handleParseYAML;
window.handleFilterAndSort = handleFilterAndSort;
window.extractLevelFromYaml = extractLevelFromYaml;
window.getSeverityRank = getSeverityRank;
window.parseSigmaDate = parseSigmaDate;
window.getEffectiveDate = getEffectiveDate;
