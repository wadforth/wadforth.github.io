// js/intel/schema-kql.js

export const KqlSchemaMap = {
    // -----------------------------------------------------------------
    // TABLE DEFINITIONS
    // -----------------------------------------------------------------
    // Format: category: { platform: { service: 'table_string' } } or default string
    tables: {
        'process_creation': {
            mde: 'DeviceProcessEvents',
            sentinel: {
                sysmon: 'Event | where EventLog == "Microsoft-Windows-Sysmon/Operational" and EventID == 1',
                security: 'SecurityEvent | where EventID == 4688',
                default: 'SecurityEvent | where EventID == 4688'
            }
        },
        'process_access': {
            mde: 'DeviceEvents | where ActionType == "ProcessAccessed"',
            sentinel: {
                sysmon: 'Event | where EventID == 10',
                security: 'SecurityEvent | where EventID == 4656',
                default: 'SecurityEvent | where EventID == 4656'
            }
        },
        'network_connection': {
            mde: 'DeviceNetworkEvents',
            sentinel: {
                sysmon: 'Event | where EventID == 3',
                security: 'SecurityEvent | where EventID == 5156',
                default: 'SecurityEvent | where EventID == 5156'
            }
        },
        'file_change': {
            mde: 'DeviceFileEvents',
            sentinel: {
                sysmon: 'Event | where EventID == 11',
                security: 'SecurityEvent | where EventID in (4663, 4656)',
                default: 'SecurityEvent | where EventID in (4663, 4656)'
            }
        },
        'file_event': { // Same as file_change
            mde: 'DeviceFileEvents',
            sentinel: {
                sysmon: 'Event | where EventID == 11',
                security: 'SecurityEvent | where EventID in (4663, 4656)',
                default: 'SecurityEvent | where EventID in (4663, 4656)'
            }
        },
        'file_rename': {
            mde: 'DeviceFileEvents | where ActionType == "FileRenamed"',
            sentinel: {
                sysmon: 'Event | where EventID == 11',
                security: 'SecurityEvent | where EventID == 4663',
                default: 'SecurityEvent | where EventID == 4663'
            }
        },
        'file_delete': {
            mde: 'DeviceFileEvents | where ActionType == "FileDeleted"',
            sentinel: {
                sysmon: 'Event | where EventID in (23, 26)',
                security: 'SecurityEvent | where EventID == 4660',
                default: 'SecurityEvent | where EventID == 4660'
            }
        },
        'registry_event': {
            mde: 'DeviceRegistryEvents',
            sentinel: {
                sysmon: 'Event | where EventID in (12, 13, 14)',
                security: 'SecurityEvent | where EventID == 4657',
                default: 'SecurityEvent | where EventID == 4657'
            }
        },
        'registry_set': {
            mde: 'DeviceRegistryEvents | where ActionType == "RegistryValueSet"',
            sentinel: {
                sysmon: 'Event | where EventID == 13',
                security: 'SecurityEvent | where EventID == 4657',
                default: 'SecurityEvent | where EventID == 4657'
            }
        },
        'registry_add': {
            mde: 'DeviceRegistryEvents | where ActionType == "RegistryKeyCreated"',
            sentinel: {
                sysmon: 'Event | where EventID == 12',
                security: 'SecurityEvent | where EventID == 4657',
                default: 'SecurityEvent | where EventID == 4657'
            }
        },
        'registry_delete': {
            mde: 'DeviceRegistryEvents | where ActionType == "RegistryValueDeleted" or ActionType == "RegistryKeyDeleted"',
            sentinel: {
                sysmon: 'Event | where EventID in (12, 13) /* and Action is Delete */', 
                security: 'SecurityEvent | where EventID == 4657',
                default: 'SecurityEvent | where EventID == 4657'
            }
        },
        'image_load': {
            mde: 'DeviceImageLoadEvents',
            sentinel: {
                sysmon: 'Event | where EventID == 7',
                security: 'SecurityEvent | where EventID == 7',
                default: 'Event | where EventID == 7'
            }
        },
        'driver_load': {
            mde: 'DeviceEvents | where ActionType == "DriverLoad"',
            sentinel: {
                sysmon: 'Event | where EventID == 6',
                security: 'SecurityEvent | where EventID == 7045',
                default: 'Event | where EventID == 6'
            }
        },
        'logon': {
            mde: 'DeviceLogonEvents',
            sentinel: {
                sysmon: 'SecurityEvent | where EventID == 4624', 
                security: 'SecurityEvent | where EventID == 4624',
                default: 'SecurityEvent | where EventID == 4624'
            }
        },
        'logoff': {
            mde: 'DeviceLogonEvents | where ActionType == "Logoff"',
            sentinel: {
                sysmon: 'SecurityEvent | where EventID == 4634',
                security: 'SecurityEvent | where EventID == 4634',
                default: 'SecurityEvent | where EventID == 4634'
            }
        },
        'dns_query': {
            mde: 'DeviceNetworkEvents',
            sentinel: {
                sysmon: 'Event | where EventID == 22',
                security: 'DnsEvents',
                default: 'DnsEvents'
            }
        },
        'wmi': {
            mde: 'DeviceEvents | where ActionType startswith "Wmi"',
            sentinel: {
                sysmon: 'Event | where EventID in (19, 20, 21)',
                security: 'SecurityEvent | where EventID == 5861',
                default: 'SecurityEvent | where EventID == 5861'
            }
        },
        'scheduled_task': {
            mde: 'DeviceEvents | where ActionType startswith "ScheduledTask"',
            sentinel: {
                sysmon: 'SecurityEvent | where EventID == 4698', 
                security: 'SecurityEvent | where EventID == 4698',
                default: 'SecurityEvent | where EventID == 4698'
            }
        },
        'service': {
            mde: 'DeviceEvents | where ActionType startswith "Service"',
            sentinel: {
                sysmon: 'SecurityEvent | where EventID == 7045',
                security: 'SecurityEvent | where EventID == 7045',
                default: 'SecurityEvent | where EventID == 7045'
            }
        },
        'pipe_created': {
            mde: 'DeviceEvents | where ActionType == "NamedPipeCreated"',
            sentinel: {
                sysmon: 'Event | where EventID == 17',
                security: 'SecurityEvent | where EventID == 5145', 
                default: 'Event | where EventID == 17'
            }
        },
        'pipe_connected': {
            mde: 'DeviceEvents | where ActionType == "NamedPipeConnected"',
            sentinel: {
                sysmon: 'Event | where EventID == 18',
                security: 'SecurityEvent | where EventID == 5145',
                default: 'Event | where EventID == 18'
            }
        },
        'create_remote_thread': {
            mde: 'DeviceEvents | where ActionType == "CreateRemoteThreadApiCall"',
            sentinel: {
                sysmon: 'Event | where EventID == 8',
                security: 'SecurityEvent',
                default: 'Event | where EventID == 8'
            }
        },
        'default': {
            mde: 'DeviceEvents',
            sentinel: {
                sysmon: 'Event',
                security: 'SecurityEvent',
                default: 'SecurityEvent'
            }
        }
    },

    // -----------------------------------------------------------------
    // FIELD DEFINITIONS
    // -----------------------------------------------------------------
    // Format: category: { sigma_field: { platform: { service: 'kql_field' } } }
    fields: {
        'process_creation': {
            'Image': { mde: 'FolderPath', sentinel: { sysmon: 'Image', security: 'NewProcessName', default: 'NewProcessName' } },
            'CommandLine': { mde: 'ProcessCommandLine', sentinel: { sysmon: 'CommandLine', security: 'CommandLine', default: 'CommandLine' } },
            'ParentImage': { mde: 'InitiatingProcessFolderPath', sentinel: { sysmon: 'ParentImage', security: 'ParentProcessName', default: 'ParentProcessName' } },
            'ParentCommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: { sysmon: 'ParentCommandLine', security: 'ParentCommandLine', default: 'ParentCommandLine' } },
            'OriginalFileName': { mde: 'FileName', sentinel: { sysmon: 'OriginalFileName', security: 'NewProcessName', default: 'OriginalFileName' } },
            'CurrentDirectory': { mde: 'FolderPath', sentinel: { sysmon: 'CurrentDirectory', security: 'CurrentDirectory', default: 'CurrentDirectory' } },
            'User': { mde: 'AccountName', sentinel: { sysmon: 'User', security: 'SubjectUserName', default: 'SubjectUserName' } },
            'LogonId': { mde: 'LogonId', sentinel: { sysmon: 'LogonId', security: 'LogonId', default: 'LogonId' } },
            'IntegrityLevel': { mde: 'ProcessIntegrityLevel', sentinel: { sysmon: 'IntegrityLevel', security: 'MandatoryLabel', default: 'IntegrityLevel' } },
            'Hashes': { mde: 'SHA256', sentinel: { sysmon: 'Hashes', security: 'Hashes', default: 'Hashes' } },
            'sha256': { mde: 'SHA256', sentinel: { sysmon: 'Hashes', security: 'Hashes', default: 'Hashes' } },
            'md5': { mde: 'MD5', sentinel: { sysmon: 'Hashes', security: 'Hashes', default: 'Hashes' } },
            'sha1': { mde: 'SHA1', sentinel: { sysmon: 'Hashes', security: 'Hashes', default: 'Hashes' } },
            'Company': { mde: 'Signer', sentinel: { sysmon: 'Company', security: 'Company', default: 'Company' } },
            'Description': { mde: 'FileDescription', sentinel: { sysmon: 'Description', security: 'Description', default: 'Description' } }
        },
        
        'file_event': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: { sysmon: 'Image', security: 'ProcessName', default: 'ProcessName' } },
            'CommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: { sysmon: 'CommandLine', security: 'ProcessCommandLine', default: 'ProcessCommandLine' } },
            'TargetFilename': { mde: 'FileName', sentinel: { sysmon: 'TargetFilename', security: 'ObjectName', default: 'ObjectName' } },
            'CreationUtcTime': { mde: 'Timestamp', sentinel: { sysmon: 'CreationUtcTime', security: 'TimeGenerated', default: 'TimeGenerated' } },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: { sysmon: 'User', security: 'SubjectUserName', default: 'SubjectUserName' } }
        },
        
        'network_connection': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: { sysmon: 'Image', security: 'ProcessName', default: 'ProcessName' } },
            'CommandLine': { mde: 'InitiatingProcessCommandLine', sentinel: { sysmon: 'CommandLine', security: 'ProcessCommandLine', default: 'ProcessCommandLine' } },
            'DestinationIp': { mde: 'RemoteIP', sentinel: { sysmon: 'DestinationIp', security: 'DestIpAddr', default: 'DestinationIp' } },
            'DestinationPort': { mde: 'RemotePort', sentinel: { sysmon: 'DestinationPort', security: 'DestPort', default: 'DestinationPort' } },
            'SourceIp': { mde: 'LocalIP', sentinel: { sysmon: 'SourceIp', security: 'SourceIpAddr', default: 'SourceIp' } },
            'SourcePort': { mde: 'LocalPort', sentinel: { sysmon: 'SourcePort', security: 'SourcePort', default: 'SourcePort' } },
            'Protocol': { mde: 'Protocol', sentinel: { sysmon: 'Protocol', security: 'Protocol', default: 'Protocol' } },
            'DestinationHostname': { mde: 'RemoteUrl', sentinel: { sysmon: 'DestinationHostname', security: 'DestinationHostName', default: 'DestinationHostname' } },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: { sysmon: 'User', security: 'SubjectUserName', default: 'SubjectUserName' } }
        },
        
        'registry_event': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: { sysmon: 'Image', security: 'ProcessName', default: 'ProcessName' } },
            'TargetObject': { mde: 'RegistryKey', sentinel: { sysmon: 'TargetObject', security: 'ObjectName', default: 'ObjectName' } },
            'Details': { mde: 'RegistryValueData', sentinel: { sysmon: 'Details', security: 'ObjectValueName', default: 'ObjectValueName' } },
            'NewName': { mde: 'RegistryValueName', sentinel: { sysmon: 'NewName', security: 'NewObjectName', default: 'NewObjectName' } },
            'EventType': { mde: 'ActionType', sentinel: { sysmon: 'EventType', security: 'EventType', default: 'EventType' } },
            'User': { mde: 'InitiatingProcessAccountName', sentinel: { sysmon: 'User', security: 'SubjectUserName', default: 'SubjectUserName' } }
        },
        
        'image_load': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: { sysmon: 'Image', security: 'ProcessName', default: 'Image' } },
            'ImageLoaded': { mde: 'FolderPath', sentinel: { sysmon: 'ImageLoaded', security: 'NewProcessName', default: 'ImageLoaded' } },
            'OriginalFileName': { mde: 'FileName', sentinel: { sysmon: 'OriginalFileName', security: 'OriginalFileName', default: 'OriginalFileName' } },
            'Signature': { mde: 'Signer', sentinel: { sysmon: 'Signature', security: 'Signature', default: 'Signature' } },
            'Signed': { mde: 'IsSigned', sentinel: { sysmon: 'Signed', security: 'Signed', default: 'Signed' } }
        },
        
        'logon': {
            'TargetUser': { mde: 'AccountName', sentinel: { default: 'TargetUserName' } },
            'TargetDomainName': { mde: 'AccountDomain', sentinel: { default: 'TargetDomainName' } },
            'LogonType': { mde: 'LogonType', sentinel: { default: 'LogonType' } },
            'IpAddress': { mde: 'RemoteIP', sentinel: { default: 'IpAddress' } },
            'WorkstationName': { mde: 'RemoteDeviceName', sentinel: { default: 'WorkstationName' } },
            'ProcessName': { mde: 'InitiatingProcessFolderPath', sentinel: { default: 'ProcessName' } },
            'Status': { mde: 'ActionType', sentinel: { default: 'Status' } }
        },

        'dns_query': {
            'Image': { mde: 'InitiatingProcessFolderPath', sentinel: { sysmon: 'Image', security: 'ProcessName', default: 'Image' } },
            'QueryName': { mde: 'RemoteUrl', sentinel: { sysmon: 'QueryName', security: 'Name', default: 'Name' } },
            'QueryStatus': { mde: 'ActionType', sentinel: { sysmon: 'QueryStatus', security: 'ResultCode', default: 'ResultCode' } },
            'QueryResults': { mde: 'RemoteIP', sentinel: { sysmon: 'QueryResults', security: 'IPAddresses', default: 'IPAddresses' } }
        },
        
        'default': {
            'EventID': { mde: 'ActionType', sentinel: { default: 'EventID' } },
            'ComputerName': { mde: 'DeviceName', sentinel: { default: 'Computer' } },
            'User': { mde: 'AccountName', sentinel: { default: 'SubjectUserName' } }
        }
    }
};

export function getKqlTable(category, product, service, platform = 'mde') {
    const catLower = (category || '').toLowerCase();
    const prodLower = (product || '').toLowerCase();
    const svcLower = (service || '').toLowerCase();
    
    // Find base category mapping, or fallback to file_* wildcards
    let mapping = KqlSchemaMap.tables[catLower];
    if (!mapping && catLower.includes('file')) mapping = KqlSchemaMap.tables['file_change'];
    if (!mapping && catLower.includes('network')) mapping = KqlSchemaMap.tables['network_connection'];
    if (!mapping && catLower.includes('registry')) mapping = KqlSchemaMap.tables['registry_event'];
    if (!mapping && catLower.includes('process')) mapping = KqlSchemaMap.tables['process_creation'];
    
    if (!mapping) mapping = KqlSchemaMap.tables['default'];

    if (platform === 'mde') {
        return mapping.mde || KqlSchemaMap.tables['default'].mde;
    } else {
        // Sentinel specific logic
        const sentMapping = mapping.sentinel;
        if (typeof sentMapping === 'string') return sentMapping;
        
        if (svcLower.includes('sysmon')) return sentMapping.sysmon || sentMapping.default;
        if (svcLower.includes('security')) return sentMapping.security || sentMapping.default;
        
        return sentMapping.default || KqlSchemaMap.tables['default'].sentinel.default;
    }
}

export function getKqlField(sigmaField, category, service, platform = 'mde') {
    const catLower = (category || '').toLowerCase();
    const svcLower = (service || '').toLowerCase();
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
        if (platform === 'mde') {
            return fieldMap.mde || sigmaField;
        } else {
            const sentMapping = fieldMap.sentinel;
            if (!sentMapping) return sigmaField;
            if (typeof sentMapping === 'string') return sentMapping;
            
            if (svcLower.includes('sysmon')) return sentMapping.sysmon || sentMapping.default || sigmaField;
            if (svcLower.includes('security')) return sentMapping.security || sentMapping.default || sigmaField;
            return sentMapping.default || sigmaField;
        }
    }
    
    // Dynamic Heuristics
    if (sigmaField.endsWith('Ip')) return platform === 'mde' ? 'RemoteIP' : 'IPAddress';
    if (sigmaField.endsWith('Port')) return platform === 'mde' ? 'RemotePort' : 'Port';
    if (sigmaField.toLowerCase() === 'filename') return 'FileName';
    
    return sigmaField;
}
