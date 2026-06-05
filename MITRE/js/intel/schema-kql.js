// js/intel/schema-kql.js

// Comprehensive Mapping for Sigma LogSources to Microsoft Sentinel and Defender for Endpoint (MDE)
export const KqlSchemaMap = {
    // -----------------------------------------------------------------
    // TABLE DEFINITIONS
    // -----------------------------------------------------------------
    tables: {
        'process_creation': { mde: 'DeviceProcessEvents', sentinel: 'SecurityEvent | where EventID == 4688' },
        'process_access': { mde: 'DeviceEvents | where ActionType == "ProcessAccessed"', sentinel: 'SecurityEvent | where EventID == 4656' },
        'network_connection': { mde: 'DeviceNetworkEvents', sentinel: 'CommonSecurityLog' },
        'file_change': { mde: 'DeviceFileEvents', sentinel: 'SecurityEvent | where EventID in (4663, 4656)' },
        'file_event': { mde: 'DeviceFileEvents', sentinel: 'SecurityEvent | where EventID in (4663, 4656)' },
        'file_rename': { mde: 'DeviceFileEvents | where ActionType == "FileRenamed"', sentinel: 'SecurityEvent | where EventID == 4663' },
        'file_delete': { mde: 'DeviceFileEvents | where ActionType == "FileDeleted"', sentinel: 'SecurityEvent | where EventID == 4660' },
        'registry_event': { mde: 'DeviceRegistryEvents', sentinel: 'SecurityEvent | where EventID == 4657' },
        'registry_set': { mde: 'DeviceRegistryEvents | where ActionType == "RegistryValueSet"', sentinel: 'SecurityEvent | where EventID == 4657' },
        'registry_add': { mde: 'DeviceRegistryEvents | where ActionType == "RegistryKeyCreated"', sentinel: 'SecurityEvent | where EventID == 4657' },
        'image_load': { mde: 'DeviceImageLoadEvents', sentinel: 'SecurityEvent | where EventID == 7' },
        'logon': { mde: 'DeviceLogonEvents', sentinel: 'SecurityEvent | where EventID == 4624' },
        'logoff': { mde: 'DeviceLogonEvents | where ActionType == "Logoff"', sentinel: 'SecurityEvent | where EventID == 4634' },
        'dns_query': { mde: 'DeviceNetworkEvents', sentinel: 'DnsEvents' },
        'wmi': { mde: 'DeviceEvents | where ActionType startswith "Wmi"', sentinel: 'SecurityEvent | where EventID == 5861' },
        'scheduled_task': { mde: 'DeviceEvents | where ActionType startswith "ScheduledTask"', sentinel: 'SecurityEvent | where EventID == 4698' },
        'service': { mde: 'DeviceEvents | where ActionType startswith "Service"', sentinel: 'SecurityEvent | where EventID == 7045' },
        'pipe_created': { mde: 'DeviceEvents | where ActionType == "NamedPipeCreated"', sentinel: 'SecurityEvent | where EventID == 5145' },
        'pipe_connected': { mde: 'DeviceEvents | where ActionType == "NamedPipeConnected"', sentinel: 'SecurityEvent | where EventID == 5145' },
        'driver_load': { mde: 'DeviceEvents | where ActionType == "DriverLoad"', sentinel: 'SecurityEvent' },
        'default': { mde: 'DeviceEvents', sentinel: 'SecurityEvent' }
    },

    // -----------------------------------------------------------------
    // FIELD DEFINITIONS (Contextual by Category)
    // -----------------------------------------------------------------
    fields: {
        'process_creation': {
            'Image': { mde: 'FolderPath', sentinel: 'NewProcessName' },
            'CommandLine': { mde: 'ProcessCommandLine', sentinel: 'CommandLine' },
            'ParentImage': { mde: 'InitiatingProcessFolderPath', sentinel: 'ParentProcessName' },
            'ParentCommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: 'ParentCommandLine' },
            'OriginalFileName': { mde: 'FileName', sentinel: 'NewProcessName' },
            'CurrentDirectory': { mde: 'FolderPath', sentinel: 'CurrentDirectory' },
            'User': { mde: 'AccountName', sentinel: 'SubjectUserName' },
            'LogonId': { mde: 'LogonId', sentinel: 'LogonId' },
            'IntegrityLevel': { mde: 'ProcessIntegrityLevel', sentinel: 'MandatoryLabel' },
            'Hashes': { mde: 'SHA256', sentinel: 'Hashes' },
            'sha256': { mde: 'SHA256', sentinel: 'Hashes' },
            'md5': { mde: 'MD5', sentinel: 'Hashes' },
            'sha1': { mde: 'SHA1', sentinel: 'Hashes' },
            'Company': { mde: 'Signer', sentinel: 'Company' },
            'Description': { mde: 'FileDescription', sentinel: 'Description' }
        },
        
        'file_event': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' },
            'CommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: 'ProcessCommandLine' },
            'TargetFilename': { mde: 'FileName', sentinel: 'ObjectName' },
            'CreationUtcTime': { mde: 'Timestamp', sentinel: 'TimeGenerated' },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: 'SubjectUserName' }
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
            'TargetObject': { mde: 'RegistryKey', sentinel: 'ObjectName' },
            'Details': { mde: 'RegistryValueData', sentinel: 'ObjectValueName' },
            'NewName': { mde: 'RegistryValueName', sentinel: 'NewObjectName' },
            'EventType': { mde: 'ActionType', sentinel: 'EventType' },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: 'SubjectUserName' }
        },
        
        'image_load': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' },
            'ImageLoaded': { mde: 'FolderPath', sentinel: 'NewProcessName' },
            'OriginalFileName': { mde: 'FileName', sentinel: 'OriginalFileName' },
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

        'dns_query': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: 'ProcessName' },
            'QueryName': { mde: 'RemoteUrl', sentinel: 'Name' },
            'QueryStatus': { mde: 'ActionType', sentinel: 'ResultCode' },
            'QueryResults': { mde: 'RemoteIP', sentinel: 'IPAddresses' }
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
    
    if (prodLower === 'windows' || prodLower === 'linux' || prodLower === 'macos' || prodLower === '') {
        const mapping = KqlSchemaMap.tables[catLower] || KqlSchemaMap.tables['file_change'] && catLower.includes('file');
        if (mapping) return mapping[platform] || mapping['mde'];
        
        // Fallbacks
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
    
    // Check specific contextual map
    if (KqlSchemaMap.fields[catLower] && KqlSchemaMap.fields[catLower][sigmaField]) {
        fieldMap = KqlSchemaMap.fields[catLower][sigmaField];
    } 
    // Substring fallback
    else {
        const matchingCat = Object.keys(KqlSchemaMap.fields).find(c => catLower.includes(c.split('_')[0]));
        if (matchingCat && KqlSchemaMap.fields[matchingCat][sigmaField]) {
            fieldMap = KqlSchemaMap.fields[matchingCat][sigmaField];
        }
    }
    
    // Global fallback
    if (!fieldMap && KqlSchemaMap.fields['default'][sigmaField]) {
        fieldMap = KqlSchemaMap.fields['default'][sigmaField];
    }
    
    if (fieldMap) {
        return fieldMap[platform] || sigmaField;
    }
    
    // Dynamic Heuristics
    if (sigmaField.endsWith('Ip')) return platform === 'mde' ? 'RemoteIP' : 'IPAddress';
    if (sigmaField.endsWith('Port')) return platform === 'mde' ? 'RemotePort' : 'Port';
    if (sigmaField.toLowerCase() === 'filename') return 'FileName';
    
    return sigmaField;
}
