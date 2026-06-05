const fs = require('fs');

const now = new Date().toISOString();
const lastMonth = new Date();
lastMonth.setMonth(lastMonth.getMonth() - 1);
const lastMonthStr = lastMonth.toISOString().slice(0, 7);

const twoMonthsAgo = new Date();
twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
const twoMonthsAgoStr = twoMonthsAgo.toISOString().slice(0, 7);

const threeMonthsAgo = new Date();
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 7);

const fourMonthsAgo = new Date();
fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
const fourMonthsAgoStr = fourMonthsAgo.toISOString().slice(0, 7);

const currentMonthStr = new Date().toISOString().slice(0, 7);

const layer = {
  "name": "Extensive Threat Hunting Assessment 2026",
  "versions": {
    "attack": "19.1",
    "navigator": "5.2.0",
    "layer": "4.5"
  },
  "domain": "enterprise-attack",
  "description": "Comprehensive Threat Hunting Assessment covering multiple techniques, Sigma rules, Sentinel Candidates, and archived queries.",
  "companyName": "Acme Corp",
  "author": "Threat Intel Team",
  "autoColorRules": [
    { "label": "≥60% sub-techniques covered", "color": "#22c55e", "operator": ">=", "value": 60, "type": "sub-coverage" },
    { "label": "<60% sub-techniques covered", "color": "#eab308", "operator": "<", "value": 60, "type": "sub-coverage" },
    { "label": "2+ queries created", "color": "#22c55e", "operator": ">=", "value": 2, "type": "query-count" },
    { "label": "1 query created", "color": "#eab308", "operator": "=", "value": 1, "type": "query-count" }
  ],
  "techniques": []
};

function makeQuery(opts) {
    const qid = 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    return {
        id: qid,
        name: opts.name,
        language: opts.language || "kql",
        query: opts.query || "DeviceProcessEvents | limit 10",
        description: opts.description || "Example query description.",
        source: opts.source || "SigmaHQ",
        created: opts.date || now,
        lastModified: opts.date || now,
        favorite: !!opts.favorite,
        monthAdded: opts.month || currentMonthStr,
        sigmaRuleId: opts.sigmaRuleId || undefined,
        sigmaRuleTitle: opts.sigmaRuleTitle || undefined,
        sigmaRuleUrl: opts.sigmaRuleUrl || undefined,
        sentinelCandidate: !!opts.sentinelCandidate,
        archived: !!opts.archived,
        archivedAt: opts.archivedAt ? opts.archivedAt : (opts.archived ? now : undefined),
        unarchivedAt: opts.unarchivedAt || undefined,
        archiveReason: opts.archived ? (opts.archiveReason || "Replaced with better logic") : undefined
    };
}

// Helper to quickly generate multiple queries for a technique
function addTechnique(id, tactic, color, queriesArr) {
    layer.techniques.push({
        "techniqueID": id,
        "tactic": tactic,
        "color": color || "#10b981",
        "enabled": true,
        "queries": queriesArr
    });
}

// 1. T1059.001 (PowerShell)
addTechnique("T1059.001", "execution", "#10b981", [
    makeQuery({
        name: "Suspicious PowerShell Downloads",
        query: "DeviceProcessEvents | where FileName =~ 'powershell.exe' and ProcessCommandLine has_any ('Net.WebClient', 'DownloadString', 'Invoke-WebRequest')",
        description: "Detects PowerShell attempting to download payloads from the internet.",
        month: threeMonthsAgoStr,
        sigmaRuleId: "rules/windows/process_creation/proc_creation_win_powershell_download.yml",
        sigmaRuleTitle: "PowerShell Download Pattern",
        sigmaRuleUrl: "https://github.com/SigmaHQ/sigma/blob/master/rules/windows/process_creation/proc_creation_win_powershell_download.yml",
        sentinelCandidate: true,
        favorite: true
    }),
    makeQuery({
        name: "Encoded PowerShell Execution",
        query: "DeviceProcessEvents | where FileName =~ 'powershell.exe' and ProcessCommandLine has_any ('-enc', '-EncodedCommand', '-e')",
        month: twoMonthsAgoStr,
        sigmaRuleId: "rules/windows/process_creation/proc_creation_win_powershell_encoded.yml",
        sigmaRuleTitle: "Encoded PowerShell Command",
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Legacy PS Download String",
        month: fourMonthsAgoStr,
        archived: true,
        archivedAt: twoMonthsAgo.toISOString(),
        archiveReason: "Too noisy, replaced with 'Suspicious PowerShell Downloads'."
    })
]);

// 2. T1003.001 (LSASS Memory)
addTechnique("T1003.001", "credential-access", "#f59e0b", [
    makeQuery({
        name: "Procdump LSASS Extraction",
        query: "DeviceProcessEvents | where FileName =~ 'procdump.exe' and ProcessCommandLine has_any ('lsass', 'lsass.exe')",
        month: currentMonthStr,
        sigmaRuleId: "rules/windows/process_creation/proc_creation_win_sysinternals_procdump_lsass.yml",
        sigmaRuleTitle: "Procdump LSASS Memory Dump",
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Rundll32 Comsvcs.dll Dump",
        query: "DeviceProcessEvents | where FileName =~ 'rundll32.exe' and ProcessCommandLine has_any ('comsvcs.dll', 'MiniDump')",
        month: lastMonthStr
    }),
    makeQuery({
        name: "Taskmgr LSASS Dump",
        month: threeMonthsAgoStr,
        archived: true,
        archivedAt: lastMonth.toISOString(),
        archiveReason: "Extremely low true positive rate."
    })
]);

// 3. T1053.005 (Scheduled Task)
addTechnique("T1053.005", "persistence", "#10b981", [
    makeQuery({
        name: "Suspicious Schtasks Creation",
        query: "DeviceProcessEvents | where FileName =~ 'schtasks.exe' and ProcessCommandLine has '/create' and ProcessCommandLine has_any ('SYSTEM', 'HIGHEST')",
        month: currentMonthStr,
        sentinelCandidate: false
    }),
    makeQuery({
        name: "Schtasks modifying existing task",
        query: "DeviceProcessEvents | where FileName =~ 'schtasks.exe' and ProcessCommandLine has '/change'",
        month: lastMonthStr
    }),
    makeQuery({
        name: "Schtasks from Temp Folder",
        month: fourMonthsAgoStr,
        sentinelCandidate: true
    })
]);

// 4. T1070.001 (Clear Windows Event Logs)
addTechnique("T1070.001", "defense-evasion", "#ef4444", [
    makeQuery({
        name: "Wevtutil Clear Logs",
        month: threeMonthsAgoStr,
        archived: true,
        archivedAt: lastMonth.toISOString(),
        archiveReason: "Merged into a broader defense evasion query."
    }),
    makeQuery({
        name: "Clear Security Event Log via PowerShell",
        query: "DeviceProcessEvents | where FileName =~ 'powershell.exe' and ProcessCommandLine has 'Clear-EventLog' and ProcessCommandLine has 'Security'",
        month: currentMonthStr,
        sigmaRuleId: "rules/windows/powershell/powershell_clear_eventlog.yml",
        sigmaRuleTitle: "PowerShell Clear-EventLog",
        sentinelCandidate: true
    })
]);

// 5. T1566.001 (Spearphishing Attachment)
addTechnique("T1566.001", "initial-access", "#3b82f6", [
    makeQuery({
        name: "Suspicious Office Document Spawning Shell",
        query: "DeviceProcessEvents | where InitiatingProcessFileName in~ ('winword.exe', 'excel.exe', 'powerpnt.exe') and FileName in~ ('cmd.exe', 'powershell.exe', 'wscript.exe', 'cscript.exe')",
        month: lastMonthStr,
        sentinelCandidate: true,
        favorite: true
    }),
    makeQuery({
        name: "Office VBA Macro Execution",
        month: twoMonthsAgoStr,
        archived: false,
        unarchivedAt: currentMonthStr
    })
]);

// 6. T1047 (WMI)
addTechnique("T1047", "execution", "#10b981", [
    makeQuery({
        name: "WMI Process Creation",
        query: "DeviceProcessEvents | where FileName =~ 'wmiprvse.exe' and ProcessCommandLine has 'process call create'",
        month: twoMonthsAgoStr,
        sigmaRuleId: "rules/windows/process_creation/proc_creation_win_wmi_process_creation.yml",
        sigmaRuleTitle: "WMI Process Creation",
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Wmic execution of suspicious scripts",
        query: "DeviceProcessEvents | where FileName =~ 'wmic.exe' and ProcessCommandLine has_any ('.vbs', '.js', '.bat')",
        month: lastMonthStr
    })
]);

// 7. T1105 (Ingress Tool Transfer)
addTechnique("T1105", "command-and-control", "#f59e0b", [
    makeQuery({
        name: "Certutil Download",
        query: "DeviceProcessEvents | where FileName =~ 'certutil.exe' and ProcessCommandLine has_any ('-urlcache', '-split', '-f')",
        month: currentMonthStr,
        sentinelCandidate: true,
        favorite: true
    }),
    makeQuery({
        name: "Bitsadmin Download",
        query: "DeviceProcessEvents | where FileName =~ 'bitsadmin.exe' and ProcessCommandLine has '/transfer'",
        month: lastMonthStr
    }),
    makeQuery({
        name: "Curl Download",
        month: threeMonthsAgoStr,
        archived: true,
        archivedAt: twoMonthsAgo.toISOString(),
        archiveReason: "Legitimate dev activity uses this too much."
    })
]);

// 8. T1078 (Valid Accounts)
addTechnique("T1078", "initial-access", "#ef4444", [
    makeQuery({
        name: "Successful Logon from Suspicious IP",
        query: "SigninLogs | where ResultType == 0 and IPAddress in ('1.1.1.1', '8.8.8.8')",
        month: currentMonthStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Anomalous Login Time",
        month: twoMonthsAgoStr,
        sentinelCandidate: true
    })
]);

// 9. T1110.003 (Password Spraying)
addTechnique("T1110.003", "credential-access", "#3b82f6", [
    makeQuery({
        name: "Multiple Failed Logons Across Accounts",
        query: "SigninLogs | where ResultType != 0 | summarize count() by IPAddress, bin(TimeGenerated, 5m) | where count_ > 50",
        month: threeMonthsAgoStr,
        favorite: true,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Password Spray Alert",
        month: fourMonthsAgoStr,
        archived: true,
        archivedAt: threeMonthsAgo.toISOString(),
        archiveReason: "Too noisy. Replaced with more advanced logic."
    })
]);

// 10. T1027 (Obfuscated Files or Information)
addTechnique("T1027", "defense-evasion", "#10b981", [
    makeQuery({
        name: "Suspicious Base64 Commandline",
        query: "DeviceProcessEvents | where ProcessCommandLine matches regex '[A-Za-z0-9+/]{50,}={0,2}'",
        month: currentMonthStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Certutil Decode",
        query: "DeviceProcessEvents | where FileName =~ 'certutil.exe' and ProcessCommandLine has '-decode'",
        month: lastMonthStr
    })
]);

// 11. T1082 (System Information Discovery)
addTechnique("T1082", "discovery", "#f59e0b", [
    makeQuery({
        name: "Systeminfo Execution",
        query: "DeviceProcessEvents | where FileName =~ 'systeminfo.exe'",
        month: lastMonthStr
    }),
    makeQuery({
        name: "Wmic OS Get",
        query: "DeviceProcessEvents | where FileName =~ 'wmic.exe' and ProcessCommandLine has 'os get'",
        month: twoMonthsAgoStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Whoami /all",
        query: "DeviceProcessEvents | where FileName =~ 'whoami.exe' and ProcessCommandLine has '/all'",
        month: fourMonthsAgoStr
    })
]);

// 12. T1569.002 (Service Execution)
addTechnique("T1569.002", "execution", "#ef4444", [
    makeQuery({
        name: "Suspicious Service Creation via SC",
        query: "DeviceProcessEvents | where FileName =~ 'sc.exe' and ProcessCommandLine has 'create' and ProcessCommandLine has_any ('binpath', 'binPath')",
        month: currentMonthStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "PsExec Service Execution",
        query: "DeviceProcessEvents | where FileName =~ 'PSEXESVC.exe'",
        month: lastMonthStr,
        favorite: true,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Net Start Suspicious Service",
        month: threeMonthsAgoStr,
        archived: true,
        archivedAt: currentMonthStr,
        archiveReason: "Merged logic with SC creation alerts."
    })
]);

// 13. T1486 (Data Encrypted for Impact)
addTechnique("T1486", "impact", "#ef4444", [
    makeQuery({
        name: "Vssadmin Delete Shadows",
        query: "DeviceProcessEvents | where FileName =~ 'vssadmin.exe' and ProcessCommandLine has 'delete shadows'",
        month: currentMonthStr,
        sigmaRuleId: "rules/windows/process_creation/proc_creation_win_vssadmin_delete_shadows.yml",
        sigmaRuleTitle: "Vssadmin Delete Shadows",
        sentinelCandidate: true,
        favorite: true
    }),
    makeQuery({
        name: "Bcdedit Recovery Off",
        query: "DeviceProcessEvents | where FileName =~ 'bcdedit.exe' and ProcessCommandLine has 'recoveryenabled no'",
        month: lastMonthStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Wbadmin Delete SystemStateBackup",
        month: twoMonthsAgoStr,
        sentinelCandidate: false
    })
]);

// 14. T1036.003 (Rename System Utilities)
addTechnique("T1036.003", "defense-evasion", "#ef4444", [
    makeQuery({
        name: "Renamed CMD Execution",
        query: "DeviceProcessEvents | where OriginalFileName =~ 'cmd.exe' and FileName !~ 'cmd.exe'",
        month: lastMonthStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "Renamed PowerShell",
        month: twoMonthsAgoStr,
        archived: true,
        archivedAt: lastMonthStr,
        archiveReason: "Redundant coverage with Sysmon."
    })
]);

// 15. T1136.001 (Create Local Account)
addTechnique("T1136.001", "persistence", "#3b82f6", [
    makeQuery({
        name: "Local User Creation via Net.exe",
        query: "DeviceProcessEvents | where FileName =~ 'net.exe' and ProcessCommandLine has 'user' and ProcessCommandLine has '/add'",
        month: currentMonthStr,
        sentinelCandidate: true
    })
]);

// 16. T1098 (Account Manipulation)
addTechnique("T1098", "persistence", "#3b82f6", [
    makeQuery({
        name: "Add User to Local Administrators",
        query: "DeviceProcessEvents | where FileName =~ 'net.exe' and ProcessCommandLine has 'localgroup administrators' and ProcessCommandLine has '/add'",
        month: threeMonthsAgoStr,
        sentinelCandidate: true
    })
]);

// 17. T1197 (BITS Jobs)
addTechnique("T1197", "defense-evasion", "#10b981", [
    makeQuery({
        name: "Suspicious BITS Job Creation",
        query: "DeviceProcessEvents | where FileName =~ 'bitsadmin.exe' and ProcessCommandLine has '/create'",
        month: currentMonthStr,
        sentinelCandidate: true
    }),
    makeQuery({
        name: "BITS Transfer from Temp",
        month: fourMonthsAgoStr,
        archived: true,
        archivedAt: twoMonthsAgo.toISOString(),
        archiveReason: "High FP rate, logic improved."
    })
]);

fs.writeFileSync('./scratch/Threat_Hunting_Example_Layer.json', JSON.stringify(layer, null, 2));
console.log('JSON generated successfully with 17 techniques and advanced chronological tracking.');
