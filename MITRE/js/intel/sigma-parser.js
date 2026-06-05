/* =========================================================================
   Sigma Rules YAML Parsing & Compilation Module
   ========================================================================= */

export function cleanTitleFromPath(path) {
    const parts = path.split('/');
    const filename = parts[parts.length - 1].replace(/\.ya?ml$/i, '');
    return filename
        .replace(/^(proc_creation_win_|proc_creation_lnx_|sysmon_win_|sysmon_|win_|lnx_|macos_|net_|file_|registry_set_|registry_|proc_)/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\b(Wmi|Lsass|Rdp|Cmd|Dll|Iis|Sam|Ad|Cve|Splunk|Kql|Csv|Xml|Api|Exe|Url|Dns|Http|Ssh|Smb|Tcp|Udp|Ftp|Rpc|Dcom|Msi|Ps1|Bat|Vbs|Hta|Mshta|Csc|Msbuild|Reg|Ntds|Nt)\b/g, m => m.toUpperCase());
}

export function parseLogsourceFromPath(path) {
    const parts = path.split('/');
    if (parts[0] === 'rules-emerging-threats') {
        return { product: 'emerging_threats', category: parts[1] || 'general' };
    }
    let product = parts[1] || 'windows';
    if (/^\d+$/.test(product)) product = 'unknown';
    return { product: product, category: parts[2] || 'process_creation' };
}

export function extractLevelFromYaml(yamlText) {
    if (!yamlText) return '';
    const m = yamlText.match(/level:\s*(\w+)/i);
    return m ? m[1].toLowerCase() : '';
}

export function parseSigmaDate(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr.replace(/\//g, '-'));
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function parseRuleDateField(yaml) {
    if (!yaml) return '';
    const m = yaml.match(/^date:\s*(\d{4}[\/-]\d{2}[\/-]\d{2})/m);
    return m ? m[1].trim() : '';
}

export function parseRuleModifiedField(yaml) {
    if (!yaml) return '';
    const m = yaml.match(/^modified:\s*(\d{4}[\/-]\d{2}[\/-]\d{2})/m);
    return m ? m[1].trim() : '';
}

export function parseYAMLInMainThread(rule) {
    const rawContent = rule.yaml;
    
    const titleMatch = rawContent.match(/^title:\s*(.+)$/m);
    if (titleMatch) rule.title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');

    const descMatch = rawContent.match(/^description:\s*(.+)$/m);
    if (descMatch) rule.description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');

    const tagsMatches = rawContent.match(/attack\.t\d{4}(?:\.\d{3})?/gi);
    rule.technique_id = tagsMatches ? tagsMatches[0].replace(/attack\./i, '').toUpperCase() : 'N/A';

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

    rule.level = extractLevelFromYaml(rawContent);
    rule.ruleDate = parseRuleDateField(rawContent);
    rule.ruleModified = parseRuleModifiedField(rawContent);

    const statusMatch = rawContent.match(/^status:\s*(\w+)/mi);
    rule.ruleStatus = statusMatch ? statusMatch[1].toLowerCase() : '';

    const prodMatch = rawContent.match(/product:\s*(\w+)/i);
    const catMatch = rawContent.match(/category:\s*(\w+)/i);
    if (prodMatch) rule.logsource.product = prodMatch[1].toLowerCase();
    if (catMatch) rule.logsource.category = catMatch[1].toLowerCase();

    rule.isVirtual = false;
    rule.hydratedAt = Date.now();
}

// Legacy Window Bindings
window.cleanTitleFromPath = cleanTitleFromPath;
window.parseLogsourceFromPath = parseLogsourceFromPath;
window.extractLevelFromYaml = extractLevelFromYaml;
window.parseSigmaDate = parseSigmaDate;
window.parseRuleDateField = parseRuleDateField;
window.parseRuleModifiedField = parseRuleModifiedField;
window.parseYAMLInMainThread = parseYAMLInMainThread;
