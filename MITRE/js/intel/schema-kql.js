// js/intel/schema-kql.js

// Comprehensive Mapping for Sigma LogSources to Microsoft Sentinel and Defender for Endpoint (MDE)
// Structured contextually by Category to ensure fields map accurately (e.g. Image in FileEvents vs ProcessEvents)

export const KqlSchemaMap = {
    // -----------------------------------------------------------------
    // TABLE DEFINITIONS
    // -----------------------------------------------------------------
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
        'dns_query': {
            mde: 'DeviceNetworkEvents', // MDE lacks a pure DNS table, usually DeviceNetworkEvents ActionType="DnsConnection"
            sentinel: 'DnsEvents'
        },
        'wmi': {
            mde: 'DeviceEvents | where ActionType startswith "Wmi"',
            sentinel: 'SecurityEvent | where EventID == 5861'
        },
        'scheduled_task': {
            mde: 'DeviceEvents | where ActionType startswith "ScheduledTask"',
            sentinel: 'SecurityEvent | where EventID == 4698'
        },
        'service': {
            mde: 'DeviceEvents | where ActionType startswith "Service"',
            sentinel: 'SecurityEvent | where EventID == 7045'
        },
        'default': {
            mde: 'DeviceEvents',
            sentinel: 'SecurityEvent'
        }
    },

    // -----------------------------------------------------------------
    // FIELD DEFINITIONS (Contextual by Category)
    // -----------------------------------------------------------------
    fields: {
        'process_creation': {
            'Image': { mde: 'FolderPath', sentinel: 'NewProcessName' },
            'CommandLine': { mde: 'ProcessCommandLine', sentinel: 'CommandLine' },
            'ParentImage': { mde: 'ParentFolderPath', sentinel: 'ParentProcessName' },
            'ParentCommandLine': { mde: 'ParentProcessCommandLine', sentinel: 'ParentCommandLine' },
            'OriginalFileName': { mde: 'FileName', sentinel: 'NewProcessName' },
            'CurrentDirectory': { mde: 'FolderPath', sentinel: 'CurrentDirectory' },
            'User': { mde: 'AccountName', sentinel: 'SubjectUserName' },
            'LogonId': { mde: 'LogonId', sentinel: 'LogonId' },
            'TerminalSessionId': { mde: 'LogonId', sentinel: 'LogonId' },
            'IntegrityLevel': { mde: 'ProcessIntegrityLevel', sentinel: 'MandatoryLabel' },
            'Hashes': { mde: 'SHA256', sentinel: 'Hashes' }, // Approximate matching for hash aggregates
            'sha256': { mde: 'SHA256', sentinel: 'Hashes' },
            'md5': { mde: 'MD5', sentinel: 'Hashes' },
            'sha1': { mde: 'SHA1', sentinel: 'Hashes' },
            'Company': { mde: 'Signer', sentinel: 'Company' },
            'Description': { mde: 'FileDescription', sentinel: 'Description' },
            'Product': { mde: 'FileProduct', sentinel: 'Product' }
        },
        
        'file_event': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' }, // The process doing the action
            'CommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: 'ProcessCommandLine' },
            'TargetFilename': { mde: 'FileName', sentinel: 'ObjectName' }, // Often FileName is better for '*\file.exe'
            'TargetFilenamePath': { mde: 'FolderPath', sentinel: 'ObjectName' }, // Alternate if explicit path match is needed
            'CreationUtcTime': { mde: 'Timestamp', sentinel: 'TimeGenerated' },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: 'SubjectUserName' },
            'Hashes': { mde: 'SHA256', sentinel: 'Hashes' }
        },
        
        'network_connection': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' },
            'CommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: 'ProcessCommandLine' },
            'DestinationIp': { mde: 'RemoteIP', sentinel: 'DestinationIP' },
            'DestinationPort': { mde: 'RemotePort', sentinel: 'DestinationPort' },
            'SourceIp': { mde: 'LocalIP', sentinel: 'SourceIP' },
            'SourcePort': { mde: 'LocalPort', sentinel: 'SourcePort' },
            'Protocol': { mde: 'Protocol', sentinel: 'Protocol' },
            'DestinationHostname': { mde: 'RemoteUrl', sentinel: 'DestinationHostName' },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: 'SubjectUserName' }
        },
        
        'registry_event': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' },
            'TargetObject': { mde: 'RegistryKey', sentinel: 'ObjectName' }, // The Key path
            'Details': { mde: 'RegistryValueData', sentinel: 'ObjectValueName' }, // The Value being set
            'NewName': { mde: 'RegistryValueName', sentinel: 'NewObjectName' },
            'EventType': { mde: 'ActionType', sentinel: 'EventType' },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: 'SubjectUserName' }
        },
        
        'image_load': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' }, // Process loading the DLL
            'ImageLoaded': { mde: 'FolderPath', sentinel: 'NewProcessName' }, // The DLL itself
            'OriginalFileName': { mde: 'FileName', sentinel: 'OriginalFileName' },
            'Hashes': { mde: 'SHA256', sentinel: 'Hashes' },
            'Signature': { mde: 'Signer', sentinel: 'Signature' },
            'Signed': { mde: 'IsSigned', sentinel: 'Signed' }
        },
        
        'logon': {
            'TargetUser': { mde: 'AccountName', sentinel: 'TargetUserName' },
            'TargetDomainName': { mde: 'AccountDomain', sentinel: 'TargetDomainName' },
            'LogonType': { mde: 'LogonType', sentinel: 'LogonType' },
            'IpAddress': { mde: 'RemoteIP', sentinel: 'IpAddress' },
            'WorkstationName': { mde: 'RemoteDeviceName', sentinel: 'WorkstationName' },
            'ProcessName': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' },
            'Status': { mde: 'ActionType', sentinel: 'Status' }
        },
        
        'default': {
            'EventID': { mde: 'ActionType', sentinel: 'EventID' },
            'ComputerName': { mde: 'DeviceName', sentinel: 'Computer' },
            'User': { mde: 'AccountName', sentinel: 'SubjectUserName' }
        }
    }
};

export function getKqlTable(category, product, platform = 'mde') {
    const catLower = (category || '').toLowerCase();
    const prodLower = (product || '').toLowerCase();
    
    // Windows specifically
    if (prodLower === 'windows' || prodLower === '') {
        const mapping = KqlSchemaMap.tables[catLower] || KqlSchemaMap.tables['file_change'] && catLower.includes('file');
        if (mapping) return mapping[platform] || mapping['mde'];
        
        // Fallbacks based on category substrings
        if (catLower.includes('file')) return KqlSchemaMap.tables['file_event'][platform];
        if (catLower.includes('network')) return KqlSchemaMap.tables['network_connection'][platform];
        if (catLower.includes('registry')) return KqlSchemaMap.tables['registry_event'][platform];
        if (catLower.includes('process')) return KqlSchemaMap.tables['process_creation'][platform];
    }
    
    return KqlSchemaMap.tables['default'][platform] || KqlSchemaMap.tables['default']['mde'];
}

export function getKqlField(sigmaField, category, platform = 'mde') {
    const catLower = (category || '').toLowerCase();
    let fieldMap = null;
    
    // 1. Try to find the exact contextual category mapping first
    if (KqlSchemaMap.fields[catLower] && KqlSchemaMap.fields[catLower][sigmaField]) {
        fieldMap = KqlSchemaMap.fields[catLower][sigmaField];
    } 
    // 2. Try substring match on categories (e.g. 'file_change' -> 'file_event')
    else {
        const matchingCat = Object.keys(KqlSchemaMap.fields).find(c => catLower.includes(c.split('_')[0]));
        if (matchingCat && KqlSchemaMap.fields[matchingCat][sigmaField]) {
            fieldMap = KqlSchemaMap.fields[matchingCat][sigmaField];
        }
    }
    
    // 3. Fallback to default
    if (!fieldMap && KqlSchemaMap.fields['default'][sigmaField]) {
        fieldMap = KqlSchemaMap.fields['default'][sigmaField];
    }
    
    if (fieldMap) {
        return fieldMap[platform] || sigmaField;
    }
    
    // 4. Heuristic Fallback: If no map, intelligently guess based on common patterns
    if (sigmaField.endsWith('Ip')) return platform === 'mde' ? 'RemoteIP' : 'IPAddress';
    if (sigmaField.endsWith('Port')) return platform === 'mde' ? 'RemotePort' : 'Port';
    if (sigmaField.toLowerCase() === 'filename') return 'FileName';
    
    // Ultimate Fallback: Return the exact sigma field
    return sigmaField;
}
