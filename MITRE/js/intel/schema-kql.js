// js/intel/schema-kql.js

export const KqlSchemaMap = {
    tables: {
        'process_creation': {
            mde: 'DeviceProcessEvents',
            sentinel: 'SecurityEvent | where EventID == 4688'
        },
        'network_connection': {
            mde: 'DeviceNetworkEvents',
            sentinel: 'CommonSecurityLog'
        },
        'file_change': {
            mde: 'DeviceFileEvents',
            sentinel: 'SecurityEvent | where EventID in (4663, 4656)'
        },
        'file_event': {
            mde: 'DeviceFileEvents',
            sentinel: 'SecurityEvent | where EventID in (4663, 4656)'
        },
        'registry_event': {
            mde: 'DeviceRegistryEvents',
            sentinel: 'SecurityEvent | where EventID == 4657'
        },
        'registry_set': {
            mde: 'DeviceRegistryEvents',
            sentinel: 'SecurityEvent | where EventID == 4657'
        },
        'image_load': {
            mde: 'DeviceImageLoadEvents',
            sentinel: 'SecurityEvent | where EventID == 7'
        },
        'logon': {
            mde: 'DeviceLogonEvents',
            sentinel: 'SecurityEvent | where EventID == 4624'
        },
        'default': {
            mde: 'DeviceEvents',
            sentinel: 'SecurityEvent'
        }
    },
    fields: {
        // Process Creation Fields
        'Image': { mde: 'FolderPath', sentinel: 'NewProcessName' },
        'CommandLine': { mde: 'ProcessCommandLine', sentinel: 'CommandLine' },
        'ParentImage': { mde: 'ParentFolderPath', sentinel: 'ParentProcessName' },
        'ParentCommandLine': { mde: 'ParentProcessCommandLine', sentinel: 'ParentCommandLine' },
        'Hashes': { mde: 'SHA1', sentinel: 'Hashes' },
        'CurrentDirectory': { mde: 'FolderPath', sentinel: 'CurrentDirectory' },
        'User': { mde: 'AccountName', sentinel: 'SubjectUserName' },
        'TerminalSessionId': { mde: 'LogonId', sentinel: 'LogonId' },
        'LogonId': { mde: 'LogonId', sentinel: 'LogonId' },
        'IntegrityLevel': { mde: 'ProcessIntegrityLevel', sentinel: 'MandatoryLabel' },
        'OriginalFileName': { mde: 'FileName', sentinel: 'NewProcessName' }, // Approx
        'Company': { mde: 'Signer', sentinel: 'Company' },
        
        // Network Fields
        'DestinationIp': { mde: 'RemoteIP', sentinel: 'DestinationIP' },
        'DestinationPort': { mde: 'RemotePort', sentinel: 'DestinationPort' },
        'SourceIp': { mde: 'LocalIP', sentinel: 'SourceIP' },
        'SourcePort': { mde: 'LocalPort', sentinel: 'SourcePort' },
        'Protocol': { mde: 'Protocol', sentinel: 'Protocol' },
        'DestinationHostname': { mde: 'RemoteUrl', sentinel: 'DestinationHostName' },
        
        // File Fields
        'TargetFilename': { mde: 'FolderPath', sentinel: 'ObjectName' },
        'CreationUtcTime': { mde: 'Timestamp', sentinel: 'TimeGenerated' },
        
        // Registry Fields
        'TargetObject': { mde: 'RegistryKey', sentinel: 'ObjectName' },
        'Details': { mde: 'RegistryValueData', sentinel: 'ObjectValueName' },
        
        // Shared
        'EventID': { mde: 'ActionType', sentinel: 'EventID' }
    }
};

export function getKqlTable(category, product, platform = 'mde') {
    const catLower = (category || '').toLowerCase();
    const prodLower = (product || '').toLowerCase();
    
    // Windows specifically
    if (prodLower === 'windows') {
        const mapping = KqlSchemaMap.tables[catLower];
        if (mapping) return mapping[platform] || mapping['mde'];
    }
    
    return KqlSchemaMap.tables['default'][platform] || KqlSchemaMap.tables['default']['mde'];
}

export function getKqlField(sigmaField, platform = 'mde') {
    const fieldMap = KqlSchemaMap.fields[sigmaField];
    if (fieldMap) {
        return fieldMap[platform] || sigmaField;
    }
    // Fallback: If no exact map, return the exact sigma field
    return sigmaField;
}
