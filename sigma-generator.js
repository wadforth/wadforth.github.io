document.addEventListener('DOMContentLoaded', () => {
    // Global Error Handler for debugging
    window.onerror = function (msg, url, line, col, error) {
        showToast(`Error: ${msg}`, 'error');
        console.error(error);
        return false;
    };
    // Toast Container
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = type === 'success' ? 'fa-check' :
            type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';

        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        // Trigger reflow
        toast.offsetHeight;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // Helper to normalize category naming variations
    function normalizeCategory(cat) {
        if (!cat) return '';
        const normalized = cat.toLowerCase().trim();
        if (normalized.includes('registry')) return 'registry_event';
        if (normalized.includes('process') || normalized.includes('creation')) return 'process_creation';
        if (normalized.includes('network') || normalized.includes('connection')) return 'network_connection';
        if (normalized.includes('file')) return 'file_event';
        if (normalized.includes('image') || normalized.includes('load')) return 'image_load';
        if (normalized.includes('dns') || normalized.includes('query')) return 'dns_query';
        if (normalized.includes('pipe')) return 'pipe_created';
        if (normalized.includes('web') || normalized.includes('server')) return 'webserver';
        return normalized;
    }

    // State
    let currentMode = 'simple';
    let selectionCounter = 0;
    let savedRules = JSON.parse(localStorage.getItem('sigma-rules') || '[]');
    let activeUUID = generateUUID();

    // Quick Templates
    const templates = {
        powershell: {
            title: 'Suspicious PowerShell Encoded Command',
            category: 'process_creation',
            product: 'windows',
            service: 'powershell',
            status: 'stable',
            level: 'high',
            description: 'Detects usage of the "EncodedCommand" parameter in PowerShell, often used to conceal malicious scripts. Handles all abbreviations of the parameter.',
            tags: 'attack.t1059.001, attack.execution',
            falsepositives: 'Legitimate administrative scripts using encoded commands\nSCCM/System management tools',
            selections: [{ field: 'CommandLine', value: ' -(e|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand) ', modifier: 're' }]
        },
        privilege_esc: {
            title: 'Sticky Keys Binary Replacement Backdoor',
            category: 'file_event',
            product: 'windows',
            status: 'critical',
            level: 'critical',
            description: 'Detects the replacement of accessibility binaries (like sethc.exe) with cmd.exe or other tools, a common persistence and privilege escalation technique.',
            tags: 'attack.t1546.008, attack.persistence, attack.privilege_escalation',
            falsepositives: 'None expected in a healthy environment',
            selections: [
                { field: 'TargetFilename', value: '\\sethc.exe', modifier: 'endswith' },
                { field: 'Image', value: '\\cmd.exe', modifier: 'endswith' }
            ]
        },
        suspicious_network: {
            title: 'CertUtil Download (Ingress Tool Transfer)',
            category: 'process_creation',
            product: 'windows',
            status: 'stable',
            level: 'high',
            description: 'Detects the use of certutil.exe to download files from the internet, a technique often used by attackers to download tools (Living off the Land).',
            tags: 'attack.t1105, attack.command_and_control',
            falsepositives: 'Legitimate certificate downloads (rare via command line)',
            selections: [
                { field: 'Image', value: 'certutil.exe', modifier: 'endswith' },
                { field: 'CommandLine', value: 'urlcache', modifier: 'contains' },
                { field: 'CommandLine', value: 'split', modifier: 'contains' }
            ]
        },
        malware_process: {
            title: 'Mimikatz Command Line Arguments',
            category: 'process_creation',
            product: 'windows',
            status: 'stable',
            level: 'high',
            description: 'Detects well-known Mimikatz command line arguments used for credential dumping.',
            tags: 'attack.t1003, attack.credential_access',
            falsepositives: 'Security testing / Red teaming',
            selections: [
                { field: 'CommandLine', value: 'sekurlsa::logonpasswords', modifier: 'contains' },
                { field: 'CommandLine', value: 'lsadump::sam', modifier: 'contains' },
                { field: 'CommandLine', value: 'privilege::debug', modifier: 'contains' }
            ]
        },
        lateral_movement: {
            title: 'RDP Session Hijacking via TSCON',
            category: 'process_creation',
            product: 'windows',
            status: 'critical',
            level: 'high',
            description: 'Detects RDP session hijacking attempts using the tscon.exe utility to connect to existing sessions without credentials.',
            tags: 'attack.t1563.002, attack.lateral_movement',
            falsepositives: 'Administrator switching sessions (rare)',
            selections: [
                { field: 'Image', value: 'tscon.exe', modifier: 'endswith' },
                { field: 'CommandLine', value: '/dest:rdp-tcp', modifier: 'contains' }
            ]
        },
        data_exfil: {
            title: 'DNS Tunneling via Long Domains',
            category: 'dns_query',
            product: 'windows',
            status: 'experimental',
            level: 'medium',
            description: 'Detects potentially malicious DNS tunneling or C2 by identifying DNS queries with unusually long domain names (>180 chars).',
            tags: 'attack.t1048.003, attack.exfiltration',
            falsepositives: 'CDN domains\nCloud services with long subdomains',
            selections: [{ field: 'QueryName', value: '.{180,}', modifier: 're' }]
        },
        lsass_dump: {
            title: 'ProcDump LSASS Memory Dump',
            category: 'process_creation',
            product: 'windows',
            service: 'security',
            status: 'stable',
            level: 'critical',
            description: 'Detects the dump of Local Security Authority Subsystem Service (LSASS) memory using ProcDump tool flags.',
            tags: 'attack.t1003.001, attack.credential_access',
            falsepositives: 'Authorized administrative troubleshooting (extremely rare on domain controllers)',
            selections: [
                { field: 'CommandLine', value: 'lsass', modifier: 'contains' },
                { field: 'CommandLine', value: ' -ma ', modifier: 're' }
            ]
        },
        webshell_spawn: {
            title: 'Web Server Spawning Command Shell',
            category: 'process_creation',
            product: 'windows',
            status: 'stable',
            level: 'high',
            description: 'Detects system shell processors spawned by IIS w3wp, Apache httpd, or Tomcat server services, indicating web shell persistence or remote command execution.',
            tags: 'attack.t1505.003, attack.persistence',
            falsepositives: 'Web server installation scripts or legacy application updates (verify child processes)',
            selections: [
                { field: 'ParentImage', value: '\\(w3wp|httpd|tomcat|nginx)\\.exe', modifier: 're' },
                { field: 'Image', value: '\\(cmd|powershell|pwsh)\\.exe', modifier: 're' }
            ]
        },
        shadow_delete: {
            title: 'Volume Shadow Copy Deletion via Vssadmin',
            category: 'process_creation',
            product: 'windows',
            status: 'stable',
            level: 'high',
            description: 'Detects backup shadow copy destruction commands, a typical ransomware operation to inhibit system recovery processes.',
            tags: 'attack.t1490, attack.impact',
            falsepositives: 'Legitimate backup software resizing storage or managing shadow spaces',
            selections: [
                { field: 'Image', value: 'vssadmin.exe', modifier: 'endswith' },
                { field: 'CommandLine', value: 'delete shadows', modifier: 'contains' }
            ]
        },
        registry_run: {
            title: 'Registry Run Key Startup Persistence',
            category: 'registry_event',
            product: 'windows',
            status: 'stable',
            level: 'medium',
            description: 'Detects registry modifications in local user run key paths, indicating malicious software establishing boot persistency.',
            tags: 'attack.t1547.001, attack.persistence',
            falsepositives: 'Legitimate application installer installers creating autorun values',
            selections: [
                { field: 'RegistryKey', value: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', modifier: 'contains' }
            ]
        }
    };

    // Platform Mappings & Schema
    const mappings = {
        defender: {
            process_creation: {
                table: 'DeviceProcessEvents',
                columns: ['Timestamp', 'DeviceName', 'AccountName', 'FileName', 'ProcessCommandLine', 'InitiatingProcessFileName', 'SHA256']
            },
            network_connection: {
                table: 'DeviceNetworkEvents',
                columns: ['Timestamp', 'DeviceName', 'AccountName', 'RemoteIP', 'RemotePort', 'LocalIP', 'LocalPort', 'RemoteUrl']
            },
            file_event: {
                table: 'DeviceFileEvents',
                columns: ['Timestamp', 'DeviceName', 'AccountName', 'FileName', 'FolderPath', 'SHA256', 'ActionType']
            },
            registry_event: {
                table: 'DeviceRegistryEvents',
                columns: ['Timestamp', 'DeviceName', 'AccountName', 'RegistryKey', 'RegistryValueName', 'RegistryValueData', 'ActionType']
            },
            image_load: {
                table: 'DeviceImageLoadEvents',
                columns: ['Timestamp', 'DeviceName', 'AccountName', 'FileName', 'FolderPath', 'SHA256']
            },
            fields: {
                'Image': 'FileName',
                'CommandLine': 'ProcessCommandLine',
                'ParentImage': 'InitiatingProcessFileName',
                'User': 'AccountName',
                'Hashes': 'SHA256',
                'DestinationIp': 'RemoteIP',
                'DestinationPort': 'RemotePort',
                'SourceIp': 'LocalIP',
                'SourcePort': 'LocalPort',
                'Protocol': 'Protocol',
                'TargetFilename': 'FileName'
            }
        },
        crowdstrike: {
            process_creation: {
                table: '#event_simpleName=ProcessRollup2',
                columns: ['_time', 'ComputerName', 'UserName', 'ImageFileName', 'CommandLine', 'ParentBaseFileName']
            },
            network_connection: {
                table: '#event_simpleName=NetworkConnect',
                columns: ['_time', 'ComputerName', 'UserName', 'RemoteAddress', 'RemotePort', 'LocalAddress', 'LocalPort']
            },
            fields: {
                'Image': 'ImageFileName',
                'CommandLine': 'CommandLine',
                'ParentImage': 'ParentBaseFileName',
                'User': 'UserName',
                'DestinationIp': 'RemoteAddress',
                'DestinationPort': 'RemotePort'
            }
        },
        sentinel: {
            process_creation: {
                table: 'SecurityEvent | where EventID == 4688',
                columns: ['TimeGenerated', 'Computer', 'SubjectUserName', 'NewProcessName', 'CommandLine', 'ParentProcessName']
            },
            network_connection: {
                table: 'CommonSecurityLog | where DeviceVendor == "Palo Alto Networks"',
                columns: ['TimeGenerated', 'DeviceName', 'SourceIP', 'DestinationIP', 'DestinationPort', 'ApplicationProtocol']
            },
            file_event: {
                table: 'SecurityEvent | where EventID == 11',
                columns: ['TimeGenerated', 'Computer', 'SubjectUserName', 'TargetFilename', 'Image']
            },
            registry_event: {
                table: 'SecurityEvent | where EventID in (4657, 4663)',
                columns: ['TimeGenerated', 'Computer', 'SubjectUserName', 'RegistryKey', 'RegistryValueName', 'RegistryValueData']
            },
            image_load: {
                table: 'SecurityEvent | where EventID == 7',
                columns: ['TimeGenerated', 'Computer', 'SubjectUserName', 'ImageLoaded']
            },
            fields: {
                'Image': 'NewProcessName',
                'CommandLine': 'CommandLine',
                'ParentImage': 'ParentProcessName',
                'User': 'SubjectUserName',
                'DestinationIp': 'DestinationIP',
                'DestinationPort': 'DestinationPort',
                'SourceIp': 'SourceIP',
                'SourcePort': 'SourcePort',
                'RegistryKey': 'RegistryKey',
                'RegistryValueName': 'RegistryValueName',
                'RegistryValueData': 'RegistryValueData',
                'TargetFilename': 'TargetFilename'
            }
        },
        splunk: {
            process_creation: {
                table: 'index=security sourcetype="WinEventLog:Security" EventCode=4688',
                columns: ['_time', 'host', 'user', 'NewProcessName', 'CommandLine', 'ParentProcessName']
            },
            network_connection: {
                table: 'index=security (sourcetype="pan:threat" OR sourcetype="cisco:asa")',
                columns: ['_time', 'host', 'src_ip', 'src_port', 'dest_ip', 'dest_port', 'protocol']
            },
            file_event: {
                table: 'index=security sourcetype="WinEventLog:Security" EventCode=11',
                columns: ['_time', 'host', 'user', 'TargetFilename', 'Image']
            },
            registry_event: {
                table: 'index=security sourcetype="WinEventLog:Security" (EventCode=12 OR EventCode=13 OR EventCode=14)',
                columns: ['_time', 'host', 'user', 'RegistryKey', 'RegistryValueName', 'RegistryValueData']
            },
            image_load: {
                table: 'index=security sourcetype="WinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=7',
                columns: ['_time', 'host', 'Image', 'ImageLoaded']
            },
            fields: {
                'Image': 'NewProcessName',
                'CommandLine': 'CommandLine',
                'ParentImage': 'ParentProcessName',
                'User': 'user',
                'DestinationIp': 'dest_ip',
                'DestinationPort': 'dest_port',
                'SourceIp': 'src_ip',
                'SourcePort': 'src_port',
                'RegistryKey': 'RegistryKey',
                'RegistryValueName': 'RegistryValueName',
                'RegistryValueData': 'RegistryValueData',
                'TargetFilename': 'TargetFilename'
            }
        },
        elastic: {
            process_creation: {
                table: 'event.category:process AND event.type:start',
                columns: ['@timestamp', 'host.name', 'user.name', 'process.executable', 'process.command_line', 'process.parent.executable']
            },
            network_connection: {
                table: 'event.category:network AND event.type:connection',
                columns: ['@timestamp', 'host.name', 'source.ip', 'source.port', 'destination.ip', 'destination.port', 'network.protocol']
            },
            file_event: {
                table: 'event.category:file AND NOT event.type:deletion',
                columns: ['@timestamp', 'host.name', 'user.name', 'file.path', 'process.executable']
            },
            registry_event: {
                table: 'event.category:registry',
                columns: ['@timestamp', 'host.name', 'user.name', 'registry.path', 'registry.value', 'registry.data.strings']
            },
            image_load: {
                table: 'event.category:library AND event.type:start',
                columns: ['@timestamp', 'host.name', 'process.executable', 'library.path']
            },
            fields: {
                'Image': 'process.executable',
                'CommandLine': 'process.command_line',
                'ParentImage': 'process.parent.executable',
                'User': 'user.name',
                'DestinationIp': 'destination.ip',
                'DestinationPort': 'destination.port',
                'SourceIp': 'source.ip',
                'SourcePort': 'source.port',
                'RegistryKey': 'registry.path',
                'RegistryValueName': 'registry.value',
                'RegistryValueData': 'registry.data.strings',
                'TargetFilename': 'file.path'
            }
        }
    };

    // Elements
    const simpleModeBtn = document.getElementById('simple-mode-btn');
    const advancedModeBtn = document.getElementById('advanced-mode-btn');
    const selectionsContainer = document.getElementById('selections-container');
    const addSelectionBtn = document.getElementById('add-selection-btn');
    const advancedDetection = document.getElementById('advanced-detection');
    const yamlOutput = document.getElementById('yaml-output');
    const copyYamlBtn = document.getElementById('copy-yaml-btn');
    const downloadYamlBtn = document.getElementById('download-yaml-btn');
    const saveRuleBtn = document.getElementById('save-rule-btn');
    const toggleMetadataBtn = document.getElementById('toggle-metadata-btn');
    const metadataSection = document.getElementById('metadata-section');
    const metadataChevron = document.getElementById('metadata-chevron');

    // Mode Toggle
    simpleModeBtn.addEventListener('click', () => {
        currentMode = 'simple';
        simpleModeBtn.classList.add('active');
        advancedModeBtn.classList.remove('active');
        advancedDetection.style.display = 'none';
        generateYAML();
    });

    advancedModeBtn.addEventListener('click', () => {
        currentMode = 'advanced';
        advancedModeBtn.classList.add('active');
        simpleModeBtn.classList.remove('active');
        advancedDetection.style.display = 'block';
        generateYAML();
    });

    // Metadata Toggle
    toggleMetadataBtn.addEventListener('click', () => {
        const isHidden = metadataSection.style.display === 'none';
        metadataSection.style.display = isHidden ? 'block' : 'none';
        metadataChevron.style.transform = isHidden ? 'rotate(180deg)' : '';
    });

    // Add Selection
    addSelectionBtn.addEventListener('click', () => {
        addSelection();
    });

    // Template Selector
    const templateSelector = document.getElementById('template-selector');
    if (templateSelector) {
        templateSelector.addEventListener('change', (e) => {
            const templateKey = e.target.value;
            if (!templateKey) return;

            const template = templates[templateKey];
            if (template) {
                // Clear existing selections
                selectionsContainer.innerHTML = '';
                selectionCounter = 0;

                // Populate form
                document.getElementById('rule-title').value = template.title || '';
                document.getElementById('logsource-category').value = template.category || '';
                document.getElementById('logsource-product').value = template.product || '';
                document.getElementById('logsource-service').value = template.service || '';
                document.getElementById('rule-status').value = template.status || 'experimental';
                document.getElementById('rule-level').value = template.level || 'high';
                document.getElementById('rule-description').value = template.description || '';
                document.getElementById('rule-tags').value = template.tags || '';

                // Check if we need advanced mode
                const needsAdvanced = template.selections && template.selections.some(s => s.modifier);
                if (needsAdvanced && currentMode !== 'advanced') {
                    // Switch to advanced mode
                    currentMode = 'advanced';
                    advancedModeBtn.click(); // Trigger UI update
                }

                // Add selections
                if (template.selections) {
                    template.selections.forEach(sel => {
                        addSelection(sel.field || '', sel.value || '', sel.modifier || '');
                    });
                }

                // Update Badge
                const badge = document.getElementById('current-template-badge');
                if (badge) {
                    const selectedOption = templateSelector.options[templateSelector.selectedIndex];
                    badge.textContent = selectedOption ? selectedOption.text : template.title;
                    badge.classList.remove('hidden');
                }

                generateYAML();
                updateQueryOptions();
                convertRule();
            }

            e.target.value = ''; // Reset selector
        });
    }

    // Clear Form
    const clearFormBtn = document.getElementById('clear-form-btn');
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', () => {
            if (!confirm('Are you sure you want to clear the entire form?')) return;

            activeUUID = generateUUID();

            // Clear all inputs
            document.getElementById('rule-title').value = '';
            document.getElementById('logsource-category').value = '';
            document.getElementById('logsource-product').value = '';
            document.getElementById('logsource-service').value = '';
            document.getElementById('rule-status').value = 'experimental';
            document.getElementById('rule-level').value = 'informational';
            document.getElementById('rule-author').value = '';
            document.getElementById('rule-description').value = '';
            document.getElementById('rule-references').value = '';
            document.getElementById('rule-tags').value = '';
            document.getElementById('rule-falsepositives').value = '';
            document.getElementById('detection-condition').value = 'selection';

            // Hide Badge
            const badge = document.getElementById('current-template-badge');
            if (badge) badge.classList.add('hidden');

            // Clear selections
            selectionsContainer.innerHTML = '';
            selectionCounter = 0;

            // Add default selection
            addSelection();
            generateYAML();
        });
    }

    function validateForm() {
        const title = document.getElementById('rule-title').value.trim();
        const category = document.getElementById('logsource-category').value;
        const product = document.getElementById('logsource-product').value;
        const selections = document.querySelectorAll('[data-selection-id]');

        let isValid = true;
        let errorMessage = "Please check the following:\n";

        if (!title) {
            isValid = false;
            errorMessage += "- Title is required\n";
            document.getElementById('rule-title').classList.add('!border-red-400', 'bg-red-400/10');
            setTimeout(() => document.getElementById('rule-title').classList.remove('!border-red-400', 'bg-red-400/10'), 3000);
        }

        if (!category) {
            isValid = false;
            errorMessage += "- Log Source Category is required\n";
            document.getElementById('logsource-category').classList.add('!border-red-400', 'bg-red-400/10');
            setTimeout(() => document.getElementById('logsource-category').classList.remove('!border-red-400', 'bg-red-400/10'), 3000);
        }

        if (!product) {
            isValid = false;
            errorMessage += "- Log Source Product is required\n";
            document.getElementById('logsource-product').classList.add('!border-red-400', 'bg-red-400/10');
            setTimeout(() => document.getElementById('logsource-product').classList.remove('!border-red-400', 'bg-red-400/10'), 3000);
        }

        if (selections.length === 0) {
            isValid = false;
            errorMessage += "- At least one Detection Logic selection is required\n";
            document.getElementById('selections-container').classList.add('border', 'border-red-400', 'rounded', 'p-2');
            setTimeout(() => document.getElementById('selections-container').classList.remove('border', 'border-red-400', 'rounded', 'p-2'), 3000);
        } else {
            // Check if any selection fields are empty
            let emptyFields = false;
            selections.forEach(sel => {
                const field = sel.querySelector('.selection-field').value.trim();
                const value = sel.querySelector('.selection-value').value.trim();
                if (!field || !value) {
                    emptyFields = true;
                    sel.classList.add('!border-red-400', 'bg-red-400/10');
                    setTimeout(() => sel.classList.remove('!border-red-400', 'bg-red-400/10'), 3000);
                }
            });

            if (emptyFields) {
                isValid = false;
                errorMessage += "- All detection fields and values must be filled\n";
            }
        }

        if (!isValid) {
            showToast(errorMessage.replace(/\n/g, '<br>'), 'error');
        }

        return isValid;
    }

    function addSelection(field = '', value = '', modifier = '') {
        selectionCounter++;
        const selectionId = `selection${selectionCounter}`;

        const selectionDiv = document.createElement('div');
        selectionDiv.className = 'p-4 bg-dark/50 border border-white/10 rounded-lg';
        selectionDiv.dataset.selectionId = selectionId;

        selectionDiv.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-mono text-accent">${selectionId}</span>
                <button class="remove-selection text-xs text-red-400 hover:text-red-300" onclick="removeSelection('${selectionId}')">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </div>
            <div class="grid grid-cols-${currentMode === 'advanced' ? '3' : '2'} gap-3">
                <input type="text" list="sigma-fields" class="selection-field px-3 py-2 bg-dark border border-white/10 rounded text-white text-sm focus:border-accent focus:outline-none" placeholder="Select or type field...">
                <input type="text" class="selection-value px-3 py-2 bg-dark border border-white/10 rounded text-white text-sm focus:border-accent focus:outline-none" placeholder="Value">
                ${currentMode === 'advanced' ? `
                <select class="selection-modifier px-3 py-2 bg-dark border border-white/10 rounded text-white text-sm focus:border-accent focus:outline-none">
                    <option value="">No Modifier</option>
                    <option value="contains">Contains</option>
                    <option value="startswith">Starts With</option>
                    <option value="endswith">Ends With</option>
                    <option value="all">All</option>
                    <option value="re">Regex</option>
                </select>
                ` : ''}
            </div>
        `;

        selectionsContainer.appendChild(selectionDiv);

        // Safely set values (avoids quote breaking)
        selectionDiv.querySelector('.selection-field').value = field;
        selectionDiv.querySelector('.selection-value').value = value;
        if (currentMode === 'advanced' && modifier) {
            const modSelect = selectionDiv.querySelector('.selection-modifier');
            if (modSelect) modSelect.value = modifier;
        }

        // Add event listeners to inputs
        const inputs = selectionDiv.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('input', generateYAML);
        });

        generateYAML();
    }

    window.removeSelection = function (selectionId) {
        const selection = document.querySelector(`[data-selection-id="${selectionId}"]`);
        if (selection) {
            selection.remove();
            generateYAML();
        }
    };

    // Generate YAML
    function generateYAML() {
        const title = document.getElementById('rule-title').value;
        const category = document.getElementById('logsource-category').value;
        const product = document.getElementById('logsource-product').value;
        const service = document.getElementById('logsource-service').value;
        const status = document.getElementById('rule-status').value;
        const level = document.getElementById('rule-level').value;
        const author = document.getElementById('rule-author').value;
        const description = document.getElementById('rule-description').value;
        const references = document.getElementById('rule-references').value;
        const tags = document.getElementById('rule-tags').value;
        const falsepositives = document.getElementById('rule-falsepositives').value;
        const detectionCondition = document.getElementById('detection-condition').value;

        let yaml = '';

        // Title
        if (title) {
            yaml += `title: ${title}\n`;
        }

        // ID (use persistent activeUUID)
        const id = activeUUID;
        yaml += `id: ${id}\n`;

        // Status
        if (status) {
            yaml += `status: ${status}\n`;
        }

        // Description
        if (description) {
            yaml += `description: ${description.replace(/\n/g, ' ')}\n`;
        }

        // References
        if (references) {
            yaml += `references:\n`;
            references.split('\n').filter(ref => ref.trim()).forEach(ref => {
                yaml += `    - ${ref.trim()}\n`;
            });
        }

        // Author
        if (author) {
            yaml += `author: ${author}\n`;
        }

        // Date
        const today = new Date().toISOString().split('T')[0];
        yaml += `date: ${today}\n`;

        // Tags
        if (tags) {
            yaml += `tags:\n`;
            tags.split(',').map(tag => tag.trim()).filter(tag => tag).forEach(tag => {
                yaml += `    - ${tag}\n`;
            });
        }

        // Log Source
        yaml += `logsource:\n`;
        if (category) yaml += `    category: ${category}\n`;
        if (product) yaml += `    product: ${product}\n`;
        if (service) yaml += `    service: ${service}\n`;

        // Detection
        yaml += `detection:\n`;

        // Get all selections
        const selections = document.querySelectorAll('[data-selection-id]');
        selections.forEach((selDiv, index) => {
            const field = selDiv.querySelector('.selection-field').value;
            const value = selDiv.querySelector('.selection-value').value;
            const modifier = currentMode === 'advanced' ? selDiv.querySelector('.selection-modifier')?.value : '';
            const selectionId = selDiv.dataset.selectionId;

            if (field && value) {
                yaml += `    ${selectionId}:\n`;
                if (modifier) {
                    yaml += `        ${field}|${modifier}: ${value}\n`;
                } else {
                    yaml += `        ${field}: ${value}\n`;
                }
            }
        });

        // Condition
        let condition = '';
        if (currentMode === 'advanced' && detectionCondition) {
            condition = detectionCondition;
        } else {
            // Simple mode: OR all selections
            const selIds = Array.from(selections).map((_, i) => `selection${i + 1}`);
            condition = selIds.length > 0 ? selIds.join(' or ') : 'selection';
        }
        yaml += `    condition: ${condition}\n`;

        // False Positives
        if (falsepositives) {
            yaml += `falsepositives:\n`;
            falsepositives.split('\n').filter(fp => fp.trim()).forEach(fp => {
                yaml += `    - ${fp.trim()}\n`;
            });
        }

        // Level
        if (level) {
            yaml += `level: ${level}\n`;
        }

        // Syntax Highlighting
        yamlOutput.innerHTML = highlightYAML(yaml) || '<span class="text-slate-500"># Your SIGMA rule will appear here...</span>';
        
        // Live Schema Validation
        validateSchemaLive();
    }

    function highlightYAML(yaml) {
        if (typeof yaml !== 'string') return '';
        try {
            return yaml
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/^([a-z0-9_]+):/gm, '<span class="yaml-key">$1</span>:')
                .replace(/: (.+)$/gm, ': <span class="yaml-string">$1</span>')
                .replace(/- (.+)$/gm, '<span class="yaml-bullet">-</span> <span class="yaml-string">$1</span>')
                .replace(/(^#.*$)/gm, '<span class="yaml-comment">$1</span>');
        } catch (e) {
            console.error(e);
            return yaml;
        }
    }

    // Threat Hunting Query Conversion
    const convertBtn = document.getElementById('convert-btn');
    const copyQueryBtn = document.getElementById('copy-query-btn');
    const queryOutput = document.getElementById('query-output');
    const targetPlatform = document.getElementById('target-platform');

    function convertRule() {
        if (!validateForm()) return;

        const platform = targetPlatform.value;
        const rawCategory = document.getElementById('logsource-category').value;
        const category = normalizeCategory(rawCategory);
        const selections = document.querySelectorAll('[data-selection-id]');
        const detectionCondition = document.getElementById('detection-condition').value;

        // Get Schema Config (custom base table has priority)
        const customBaseTable = document.getElementById('custom-base-table')?.value?.trim();
        let baseTable = customBaseTable;
        if (!baseTable) {
            const schema = mappings[platform] && mappings[platform][category] ? mappings[platform][category] : null;
            if (schema) {
                baseTable = schema.table;
            } else {
                if (platform === 'crowdstrike') baseTable = 'event_simpleName=*';
                else if (platform === 'splunk') baseTable = 'index=security';
                else if (platform === 'elastic') baseTable = 'event.category:*';
                else if (platform === 'defender') baseTable = 'DeviceProcessEvents';
                else if (platform === 'sentinel') baseTable = 'SecurityEvent | where EventID == 4688';
                else baseTable = 'Union *';
            }
        }

        // Warn if no mapping
        let warnings = [];
        const schema = mappings[platform] && mappings[platform][category] ? mappings[platform][category] : null;
        if (!schema && platform !== 'crowdstrike' && mappings[platform] && !customBaseTable) {
            warnings.push(`No specific mapping for category '${rawCategory}' on ${platform}. Using generic table.`);
        }

        // 1. Build Selection Expressions
        const selectionExpressions = {};
        
        // Parse Custom Field Mappings
        const customMappingsText = document.getElementById('custom-field-mappings')?.value || '';
        const customFieldMappings = {};
        customMappingsText.split('\n').forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                customFieldMappings[parts[0].trim()] = parts[1].trim();
            }
        });

        selections.forEach(sel => {
            const field = sel.querySelector('.selection-field').value.trim();
            const value = sel.querySelector('.selection-value').value.trim();
            const modifier = currentMode === 'advanced' ? sel.querySelector('.selection-modifier')?.value : '';
            const selectionId = sel.getAttribute('data-selection-id') || sel.dataset.selectionId;

            // Map field name if possible (custom mapping has priority), else keep original and warn
            let mappedField = field;
            if (customFieldMappings[field]) {
                mappedField = customFieldMappings[field];
            } else if (mappings[platform] && mappings[platform].fields && mappings[platform].fields[field]) {
                mappedField = mappings[platform].fields[field];
            } else if (schema && schema.columns && schema.columns.includes(field)) {
                mappedField = field;
            } else {
                warnings.push(`Custom field '${field}' may not exist in ${platform} schema.`);
            }

            if (platform === 'defender' || platform === 'sentinel') {
                // KQL Logic
                let operator = '==';
                let valQuote = `"${value}"`;

                if (modifier === 'contains') operator = 'contains';
                else if (modifier === 'startswith') operator = 'startswith';
                else if (modifier === 'endswith') operator = 'endswith';
                else if (modifier === 're') operator = 'matches regex';

                selectionExpressions[selectionId] = `${mappedField} ${operator} ${valQuote}`;
            } else if (platform === 'crowdstrike') {
                // FQL Logic (Falcon Query Language / LogScale)
                let valStr = `"${value}"`;
                if (modifier === 'contains') valStr = `"*${value}*"`;
                else if (modifier === 'startswith') valStr = `"${value}*"`;
                else if (modifier === 'endswith') valStr = `"*${value}"`;
                else if (modifier === 're') valStr = `/${value}/i`;

                selectionExpressions[selectionId] = `${mappedField}=${valStr}`;
            } else if (platform === 'splunk') {
                // Splunk SPL where-clause logic
                let expr = `${mappedField} == "${value}"`;
                if (modifier === 'contains') expr = `like(${mappedField}, "%${value}%")`;
                else if (modifier === 'startswith') expr = `like(${mappedField}, "${value}%")`;
                else if (modifier === 'endswith') expr = `like(${mappedField}, "%${value}")`;
                else if (modifier === 're') expr = `match(${mappedField}, "${value}")`;

                selectionExpressions[selectionId] = expr;
            } else if (platform === 'elastic') {
                // Elastic Lucene Syntax
                let expr = `${mappedField}:"${value}"`;
                if (modifier === 'contains') expr = `${mappedField}:*${value}*`;
                else if (modifier === 'startswith') expr = `${mappedField}:${value}*`;
                else if (modifier === 'endswith') expr = `${mappedField}:*${value}`;
                else if (modifier === 're') expr = `${mappedField}:/${value}/`;

                selectionExpressions[selectionId] = expr;
            }
        });

        // 2. Build Condition Expression
        let conditionString = 'selection';
        if (currentMode === 'advanced' && detectionCondition) {
            conditionString = detectionCondition.trim();
        } else {
            const selIds = Array.from(selections).map((_, i) => `selection${i + 1}`);
            conditionString = selIds.length > 0 ? selIds.join(' or ') : 'selection';
        }

        let compiledCondition = conditionString;
        const tokens = conditionString.match(/\bselection\d*\b/g) || [];
        
        tokens.forEach(tok => {
            let exprKey = tok;
            if (!selectionExpressions[exprKey]) {
                if (tok === 'selection' && selectionExpressions['selection1']) {
                    exprKey = 'selection1';
                } else {
                    const keys = Object.keys(selectionExpressions);
                    if (keys.length > 0) {
                        exprKey = keys[0];
                    }
                }
            }
            if (selectionExpressions[exprKey]) {
                compiledCondition = compiledCondition.replace(new RegExp(`\\b${tok}\\b`, 'g'), `(${selectionExpressions[exprKey]})`);
            } else {
                compiledCondition = compiledCondition.replace(new RegExp(`\\b${tok}\\b`, 'g'), 'false');
            }
        });

        // Translate operators
        if (platform === 'defender' || platform === 'sentinel') {
            compiledCondition = compiledCondition
                .replace(/\band\b/g, 'and')
                .replace(/\bor\b/g, 'or')
                .replace(/\bnot\b/g, 'not');
        } else if (platform === 'crowdstrike' || platform === 'splunk' || platform === 'elastic') {
            compiledCondition = compiledCondition
                .replace(/\band\b/g, 'AND')
                .replace(/\bor\b/g, 'OR')
                .replace(/\bnot\b/g, 'NOT');
        }

        // 3. Assemble Query
        let query = '';
        if (platform === 'defender' || platform === 'sentinel') {
            query = `${baseTable}\n| where ${compiledCondition}`;
        } else if (platform === 'crowdstrike') {
            query = `${baseTable} ${compiledCondition}`;
        } else if (platform === 'splunk') {
            query = `${baseTable}\n| where ${compiledCondition}`;
        } else if (platform === 'elastic') {
            query = `${baseTable} AND (${compiledCondition})`;
        }

        // 4. Add Projection/Selection
        const selectedColumns = Array.from(document.querySelectorAll('input[name="display-columns"]:checked'))
            .map(cb => cb.value);
            
        // Check for Custom Projections input
        const customProjectionsInput = document.getElementById('custom-projections')?.value?.trim();
        if (customProjectionsInput) {
            customProjectionsInput.split(',').forEach(c => {
                const trimmed = c.trim();
                if (trimmed && !selectedColumns.includes(trimmed)) {
                    selectedColumns.push(trimmed);
                }
            });
        }

        if (selectedColumns.length > 0) {
            if (platform === 'defender' || platform === 'sentinel') {
                query += `\n| project ${selectedColumns.join(', ')}`;
            } else if (platform === 'crowdstrike') {
                query += ` | select([${selectedColumns.join(', ')}])`;
            } else if (platform === 'splunk') {
                query += `\n| table ${selectedColumns.join(', ')}`;
            } else if (platform === 'elastic') {
                query += `\n# Projected Fields: [${selectedColumns.join(', ')}]`;
            }
        }

        // 5. Append Warnings
        if (warnings.length > 0) {
            query = `// WARNING: ${warnings.join(' | ')}\n` + query;
            showToast('Query generated with warnings (check top of query)', 'warning');
        } else {
            showToast(`Generated ${platform} query`, 'success');
        }

        queryOutput.innerHTML = highlightQuerySyntax(query, platform);
        
        // Execute Real-Time Syntax Checker
        checkQuerySyntaxErrors(query, platform);
    }

    // Dynamic Columns Options
    function updateQueryOptions() {
        const platform = targetPlatform.value;
        const rawCategory = document.getElementById('logsource-category').value;
        const category = normalizeCategory(rawCategory);
        const optionsDiv = document.getElementById('query-options');
        const checkboxContainer = document.getElementById('column-checkboxes');

        // Lookup Schema
        const schema = mappings[platform] && mappings[platform][category] ? mappings[platform][category] : null;
        let columns = schema ? schema.columns : [];

        // Fallback defaults
        if (!columns || columns.length === 0) {
            if (platform === 'defender') columns = ['Timestamp', 'DeviceName', 'ActionType'];
            if (platform === 'crowdstrike') columns = ['_time', 'ComputerName', 'event_simpleName'];
            if (platform === 'sentinel') columns = ['TimeGenerated', 'Computer', 'EventID'];
        }

        checkboxContainer.innerHTML = '';
        columns.forEach(col => {
            const wrapper = document.createElement('label');
            wrapper.className = 'flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded border border-white/10 cursor-pointer hover:bg-white/10 text-[10px] text-slate-300 select-none';
            wrapper.innerHTML = `
                <input type="checkbox" name="display-columns" value="${col}" class="rounded bg-dark border-white/20 text-accent focus:ring-0 w-3 h-3">
                ${col}
            `;
            checkboxContainer.appendChild(wrapper);
        });

        optionsDiv.classList.remove('hidden');
        populateCustomSettings();
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', convertRule);
    }

    // Add listener for platform AND category change
    if (targetPlatform) {
        const categorySelect = document.getElementById('logsource-category');

        targetPlatform.addEventListener('change', updateQueryOptions);
        if (categorySelect) {
            categorySelect.addEventListener('change', updateQueryOptions);
        }

        updateQueryOptions(); // Init
    }

    if (copyQueryBtn) {
        copyQueryBtn.addEventListener('click', () => {
            if (queryOutput.textContent.includes('Select a platform')) return;
            navigator.clipboard.writeText(queryOutput.textContent).then(() => {
                showToast('Query copied to clipboard!', 'success');
            });
        });
    }

    // Generate UUID
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+S to Save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveRuleBtn.click();
        }
        // Ctrl+C to Copy (only if not selecting text)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection().toString()) {
            e.preventDefault();
            copyYamlBtn.click();
        }
    });

    // Copy YAML
    copyYamlBtn.addEventListener('click', () => {
        if (!validateForm()) return;
        const yaml = yamlOutput.textContent;
        navigator.clipboard.writeText(yaml).then(() => {
            showToast('Rule copied to clipboard!', 'success');
        });
    });

    // Download YAML
    downloadYamlBtn.addEventListener('click', () => {
        if (!validateForm()) return;
        const yaml = yamlOutput.textContent;
        const title = document.getElementById('rule-title').value || 'sigma-rule';
        const filename = title.toLowerCase().replace(/\s+/g, '-') + '.yml';

        const blob = new Blob([yaml], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Rule downloaded successfully!', 'success');
    });

    // Save Rule to LocalStorage
    saveRuleBtn.addEventListener('click', () => {
        if (!validateForm()) return;
        const title = document.getElementById('rule-title').value || 'Untitled Rule';
        const yaml = yamlOutput.textContent;

        const inputsState = {
            title: document.getElementById('rule-title').value,
            category: document.getElementById('logsource-category').value,
            product: document.getElementById('logsource-product').value,
            service: document.getElementById('logsource-service').value,
            status: document.getElementById('rule-status').value,
            level: document.getElementById('rule-level').value,
            author: document.getElementById('rule-author').value,
            description: document.getElementById('rule-description').value,
            references: document.getElementById('rule-references').value,
            tags: document.getElementById('rule-tags').value,
            falsepositives: document.getElementById('rule-falsepositives').value,
            detectionCondition: document.getElementById('detection-condition').value,
            mode: currentMode,
            selections: Array.from(document.querySelectorAll('[data-selection-id]')).map(selDiv => ({
                field: selDiv.querySelector('.selection-field').value,
                value: selDiv.querySelector('.selection-value').value,
                modifier: currentMode === 'advanced' ? selDiv.querySelector('.selection-modifier')?.value : ''
            }))
        };

        const rule = {
            id: activeUUID,
            title: title,
            yaml: yaml,
            inputsState: inputsState,
            timestamp: new Date().toISOString()
        };

        // Prevent duplicate IDs in history, keep most recent
        savedRules = savedRules.filter(r => r.id !== activeUUID);
        savedRules.unshift(rule);
        if (savedRules.length > 10) savedRules = savedRules.slice(0, 10); // Keep only 10 most recent

        localStorage.setItem('sigma-rules', JSON.stringify(savedRules));
        renderSavedRules();

        showToast('Rule saved to history!', 'success');
    });

    // Render Saved Rules
    function renderSavedRules() {
        const savedRulesList = document.getElementById('saved-rules-list');

        if (savedRules.length === 0) {
            savedRulesList.innerHTML = '<p class="text-slate-500 italic">No saved rules yet</p>';
            return;
        }

        savedRulesList.innerHTML = savedRules.map(rule => `
            <div class="p-2 bg-dark/50 border border-white/5 rounded hover:border-accent/30 transition-all cursor-pointer" onclick="loadRule('${rule.id}')">
                <div class="flex items-center justify-between">
                    <span class="text-white text-xs font-medium">${rule.title}</span>
                    <button onclick="event.stopPropagation(); deleteRule('${rule.id}')" class="text-xs text-red-400 hover:text-red-300">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <span class="text-slate-500 text-xs">${new Date(rule.timestamp).toLocaleDateString()}</span>
            </div>
        `).join('');
    }

    window.loadRule = function (ruleId) {
        const rule = savedRules.find(r => r.id === ruleId);
        if (rule) {
            if (rule.inputsState) {
                activeUUID = rule.id;

                // Populate Form Fields
                document.getElementById('rule-title').value = rule.inputsState.title || '';
                document.getElementById('logsource-category').value = rule.inputsState.category || '';
                document.getElementById('logsource-product').value = rule.inputsState.product || '';
                document.getElementById('logsource-service').value = rule.inputsState.service || '';
                document.getElementById('rule-status').value = rule.inputsState.status || 'experimental';
                document.getElementById('rule-level').value = rule.inputsState.level || 'high';
                document.getElementById('rule-author').value = rule.inputsState.author || '';
                document.getElementById('rule-description').value = rule.inputsState.description || '';
                document.getElementById('rule-references').value = rule.inputsState.references || '';
                document.getElementById('rule-tags').value = rule.inputsState.tags || '';
                document.getElementById('rule-falsepositives').value = rule.inputsState.falsepositives || '';
                document.getElementById('detection-condition').value = rule.inputsState.detectionCondition || 'selection';

                // Restore Mode
                currentMode = rule.inputsState.mode || 'simple';
                if (currentMode === 'simple') {
                    simpleModeBtn.classList.add('active');
                    advancedModeBtn.classList.remove('active');
                    advancedDetection.style.display = 'none';
                } else {
                    advancedModeBtn.classList.add('active');
                    simpleModeBtn.classList.remove('active');
                    advancedDetection.style.display = 'block';
                }

                // Restore Selections
                selectionsContainer.innerHTML = '';
                selectionCounter = 0;
                if (rule.inputsState.selections && rule.inputsState.selections.length > 0) {
                    rule.inputsState.selections.forEach(sel => {
                        addSelection(sel.field, sel.value, sel.modifier);
                    });
                } else {
                    addSelection();
                }

                // Update current template badge to history load
                const badge = document.getElementById('current-template-badge');
                if (badge) {
                    badge.textContent = 'History Load';
                    badge.classList.remove('hidden');
                }

                generateYAML();
                updateQueryOptions();
                convertRule();
                showToast('Rule loaded and editable!', 'success');
            } else {
                // Fallback to read-only load for legacy rules
                yamlOutput.innerHTML = highlightYAML(rule.yaml);
                showToast('Rule loaded in read-only preview (legacy history)', 'info');
            }
        }
    };

    window.deleteRule = function (ruleId) {
        savedRules = savedRules.filter(r => r.id !== ruleId);
        localStorage.setItem('sigma-rules', JSON.stringify(savedRules));
        renderSavedRules();
    };

    // === 3. MITRE ATT&CK Tag Auto-Suggest & Reference Generator ===
    const ruleTags = document.getElementById('rule-tags');
    const ruleReferences = document.getElementById('rule-references');
    if (ruleTags && ruleReferences) {
        ruleTags.addEventListener('input', (e) => {
            const val = e.target.value;
            const tags = val.split(',').map(t => t.trim());
            
            tags.forEach(tag => {
                const match = tag.match(/t\d{4}/i);
                if (match) {
                    const techniqueId = match[0].toUpperCase();
                    const mitreUrl = `https://attack.mitre.org/techniques/${techniqueId}/`;
                    
                    let currentRefs = ruleReferences.value.trim().split('\n').map(r => r.trim());
                    if (!currentRefs.includes(mitreUrl) && currentRefs.every(r => !r.includes(techniqueId))) {
                        if (ruleReferences.value.trim() !== '') {
                            ruleReferences.value = ruleReferences.value.trim() + '\n' + mitreUrl;
                        } else {
                            ruleReferences.value = mitreUrl;
                        }
                        showToast(`MITRE reference link generated for ${techniqueId}`, 'info');
                        generateYAML();
                    }
                }
            });
        });
    }

    // === 4. Import YAML Modal & Engine ===
    const importModal = document.getElementById('import-modal');
    const openImportBtn = document.getElementById('open-import-btn');
    const closeImportBtn = document.getElementById('close-import-btn');
    const cancelImportBtn = document.getElementById('cancel-import-btn');
    const submitImportBtn = document.getElementById('submit-import-btn');
    const importTextarea = document.getElementById('import-textarea');

    if (openImportBtn && importModal) {
        openImportBtn.addEventListener('click', () => {
            importModal.classList.remove('opacity-0', 'pointer-events-none');
            importModal.querySelector('.glass-card').classList.remove('scale-95');
            importModal.querySelector('.glass-card').classList.add('scale-100');
            if (importTextarea) {
                importTextarea.value = '';
                importTextarea.focus();
            }
        });

        const closeModal = () => {
            importModal.classList.add('opacity-0', 'pointer-events-none');
            importModal.querySelector('.glass-card').classList.remove('scale-100');
            importModal.querySelector('.glass-card').classList.add('scale-95');
        };

        closeImportBtn.addEventListener('click', closeModal);
        cancelImportBtn.addEventListener('click', closeModal);

        // Simple custom YAML parser for Sigma rules
        function parseSigmaYAML(yamlText) {
            const lines = yamlText.split('\n');
            const data = {
                title: '',
                id: '',
                status: 'experimental',
                level: 'high',
                author: '',
                description: '',
                logsource: { category: '', product: '', service: '' },
                tags: [],
                references: [],
                falsepositives: [],
                selections: [],
                condition: 'selection'
            };

            let currentSection = null;
            let currentSelectionName = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;

                const indent = line.length - line.trimStart().length;

                if (indent === 0) {
                    currentSection = null;
                    currentSelectionName = null;

                    const match = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
                    if (match) {
                        const key = match[1].toLowerCase();
                        let val = match[2].trim().replace(/^["']|["']$/g, '');

                        if (key === 'title') data.title = val;
                        else if (key === 'id') data.id = val;
                        else if (key === 'status') data.status = val;
                        else if (key === 'level') data.level = val;
                        else if (key === 'author') data.author = val;
                        else if (key === 'description') data.description = val;
                        else if (key === 'logsource') currentSection = 'logsource';
                        else if (key === 'detection') currentSection = 'detection';
                        else if (key === 'tags') currentSection = 'tags';
                        else if (key === 'references') currentSection = 'references';
                        else if (key === 'falsepositives') currentSection = 'falsepositives';
                    }
                } else if (indent > 0) {
                    if (currentSection === 'logsource') {
                        const match = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
                        if (match) {
                            const key = match[1].toLowerCase();
                            const val = match[2].trim().replace(/^["']|["']$/g, '');
                            if (key === 'category') data.logsource.category = val;
                            else if (key === 'product') data.logsource.product = val;
                            else if (key === 'service') data.logsource.service = val;
                        }
                    } else if (currentSection === 'tags' || currentSection === 'references' || currentSection === 'falsepositives') {
                        if (trimmed.startsWith('-')) {
                            const val = trimmed.substring(1).trim().replace(/^["']|["']$/g, '');
                            if (currentSection === 'tags') data.tags.push(val);
                            if (currentSection === 'references') data.references.push(val);
                            if (currentSection === 'falsepositives') data.falsepositives.push(val);
                        }
                    } else if (currentSection === 'detection') {
                        if (trimmed.startsWith('condition:')) {
                            data.condition = trimmed.substring(10).trim().replace(/^["']|["']$/g, '');
                        } else {
                            const match = trimmed.match(/^([a-zA-Z0-9_|\\-]+):\s*(.*)$/);
                            if (match) {
                                const key = match[1].trim();
                                const val = match[2].trim().replace(/^["']|["']$/g, '');

                                if (indent === 4) {
                                    if (val === '') {
                                        currentSelectionName = key;
                                    }
                                } else if (indent > 4 && currentSelectionName) {
                                    let fieldName = key;
                                    let modifierName = '';
                                    if (key.includes('|')) {
                                        const parts = key.split('|');
                                        fieldName = parts[0];
                                        modifierName = parts[1];
                                    }
                                    data.selections.push({
                                        selectionId: currentSelectionName,
                                        field: fieldName,
                                        value: val,
                                        modifier: modifierName
                                    });
                                }
                            }
                        }
                    }
                }
            }
            return data;
        }

        submitImportBtn.addEventListener('click', () => {
            const text = importTextarea.value.trim();
            if (!text) {
                showToast('Please paste YAML rule text first', 'error');
                return;
            }

            try {
                const ruleData = parseSigmaYAML(text);
                if (!ruleData.title && ruleData.selections.length === 0) {
                    showToast('Failed to parse a valid Sigma rule structure.', 'error');
                    return;
                }

                activeUUID = ruleData.id || generateUUID();

                document.getElementById('rule-title').value = ruleData.title || '';
                document.getElementById('logsource-category').value = ruleData.logsource.category || '';
                document.getElementById('logsource-product').value = ruleData.logsource.product || '';
                document.getElementById('logsource-service').value = ruleData.logsource.service || '';
                document.getElementById('rule-status').value = ruleData.status || 'experimental';
                document.getElementById('rule-level').value = ruleData.level || 'high';
                document.getElementById('rule-author').value = ruleData.author || '';
                document.getElementById('rule-description').value = ruleData.description || '';
                document.getElementById('rule-references').value = ruleData.references.join('\n') || '';
                document.getElementById('rule-tags').value = ruleData.tags.join(', ') || '';
                document.getElementById('rule-falsepositives').value = ruleData.falsepositives.join('\n') || '';
                document.getElementById('detection-condition').value = ruleData.condition || 'selection';

                // Mode logic
                const hasModifiers = ruleData.selections.some(s => s.modifier);
                const isComplexCondition = ruleData.condition && (ruleData.condition.includes('and') || ruleData.condition.includes('not') || ruleData.condition.includes('('));
                
                currentMode = (hasModifiers || isComplexCondition) ? 'advanced' : 'simple';
                if (currentMode === 'simple') {
                    simpleModeBtn.classList.add('active');
                    advancedModeBtn.classList.remove('active');
                    advancedDetection.style.display = 'none';
                } else {
                    advancedModeBtn.classList.add('active');
                    simpleModeBtn.classList.remove('active');
                    advancedDetection.style.display = 'block';
                }

                // Rebuild selections
                selectionsContainer.innerHTML = '';
                selectionCounter = 0;
                if (ruleData.selections.length > 0) {
                    ruleData.selections.forEach(sel => {
                        addSelection(sel.field, sel.value, sel.modifier);
                    });
                } else {
                    addSelection();
                }

                const badge = document.getElementById('current-template-badge');
                if (badge) badge.classList.add('hidden');

                generateYAML();
                updateQueryOptions();
                convertRule();
                closeModal();
                showToast('Sigma rule successfully parsed and loaded!', 'success');
            } catch (err) {
                showToast(`Error parsing YAML: ${err.message}`, 'error');
            }
        });
    }

    // === 5. Live Schema Validation ===
    function validateSchemaLive() {
        const badge = document.getElementById('schema-validator-badge');
        if (!badge) return;

        const title = document.getElementById('rule-title')?.value?.trim() || '';
        const rawCategory = document.getElementById('logsource-category')?.value?.trim() || '';
        const category = normalizeCategory(rawCategory);
        const product = document.getElementById('logsource-product')?.value?.trim() || '';
        const service = document.getElementById('logsource-service')?.value?.trim() || '';
        const detectionCondition = document.getElementById('detection-condition')?.value?.trim() || '';
        
        const selections = Array.from(document.querySelectorAll('[data-selection-id]')).map(selDiv => ({
            field: selDiv.querySelector('.selection-field')?.value?.trim() || '',
            value: selDiv.querySelector('.selection-value')?.value?.trim() || ''
        }));

        const hasTitle = title.length > 0;
        const hasLogsource = category.length > 0 || product.length > 0 || service.length > 0;
        const hasCondition = detectionCondition.length > 0;
        const hasSelections = selections.length > 0 && selections.every(s => s.field.length > 0 && s.value.length > 0);

        if (hasTitle && hasLogsource && hasCondition && hasSelections) {
            badge.textContent = 'VALID SCHEMA';
            badge.className = 'px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-accent/10 border border-accent/20 text-accent';
            badge.title = 'All required Sigma fields are filled correctly.';
        } else {
            let missing = [];
            if (!hasTitle) missing.push('Title');
            if (!hasLogsource) missing.push('Logsource');
            if (!hasSelections) missing.push('Selections');
            if (!hasCondition) missing.push('Condition');
            
            badge.textContent = 'INCOMPLETE';
            badge.className = 'px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 animate-pulse';
            badge.title = 'Missing: ' + missing.join(', ');
        }
    }

    // === 6. Query Converter Syntax Highlighting ===
    function highlightQuerySyntax(queryText, platform) {
        if (!queryText) return '';
        
        // Escape HTML
        let html = queryText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Highlight Comments: // ... or # ...
        html = html.replace(/(\/\/.*$)/gm, '<span class="text-slate-500 italic">$1</span>');
        html = html.replace(/(#.*$)/gm, '<span class="text-slate-500 italic">$1</span>');

        // Tokenize HTML so we only highlight non-HTML-tag parts
        const parts = html.split(/(<[^>]+>)/g);

        // Keywords
        const kqlKeywords = ['where', 'project', 'union', 'distinct', 'summarize', 'take', 'limit', 'extend', 'join', 'by', 'on'];
        const fqlKeywords = ['select', 'groupby'];
        const splunkKeywords = ['index', 'sourcetype', 'EventCode', 'table', 'where', 'search', 'regex', 'like', 'match'];
        const elasticKeywords = ['event.category', 'event.type', 'process.executable', 'process.command_line', 'process.parent.executable', 'registry.path', 'file.path', 'destination.ip', 'source.ip'];

        let keywords = [];
        if (platform === 'defender' || platform === 'sentinel') keywords = kqlKeywords;
        else if (platform === 'crowdstrike') keywords = fqlKeywords;
        else if (platform === 'splunk') keywords = splunkKeywords;
        else if (platform === 'elastic') keywords = elasticKeywords;

        // Operators
        const kqlOperators = ['==', '!=', 'contains', 'startswith', 'endswith', 'matches regex', 'and', 'or', 'not'];
        const fqlOperators = ['AND', 'OR', 'NOT', '=', '!='];
        const splunkOperators = ['AND', 'OR', 'NOT', '==', '=', '!='];
        const elasticOperators = ['AND', 'OR', 'NOT', ':'];

        let operators = [];
        if (platform === 'defender' || platform === 'sentinel') operators = kqlOperators;
        else if (platform === 'crowdstrike') operators = fqlOperators;
        else if (platform === 'splunk') operators = splunkOperators;
        else if (platform === 'elastic') operators = elasticOperators;

        // Process only text parts (even indices are text, odd indices are HTML tags)
        for (let i = 0; i < parts.length; i += 2) {
            let txt = parts[i];
            if (!txt) continue;

            // Highlight Strings: "..." or '...'
            txt = txt.replace(/(".*?")/g, '<span class="text-yellow-300">$1</span>');
            txt = txt.replace(/('.*?')/g, '<span class="text-yellow-300">$1</span>');

            // Keywords
            keywords.forEach(kw => {
                const regex = new RegExp(`\\b(${kw.replace(/\./g, '\\.')})\\b`, 'gi');
                txt = txt.replace(regex, '<span class="text-purple-400 font-semibold">$1</span>');
            });

            // Operators
            operators.forEach(op => {
                if (/^[a-zA-Z]/.test(op)) {
                    const regex = new RegExp(`\\b(${op})\\b`, 'g');
                    txt = txt.replace(regex, '<span class="text-accent font-medium">$1</span>');
                } else {
                    const escaped = op.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`(${escaped})`, 'g');
                    txt = txt.replace(regex, '<span class="text-accent font-medium">$1</span>');
                }
            });

            // Splunk Pipe Operator highlight
            if (platform === 'splunk') {
                txt = txt.replace(/(\|)/g, '<span class="text-purple-400 font-bold">$1</span>');
            }

            parts[i] = txt;
        }

        return parts.join('');
    }

    // === 7. Download Query Utility ===
    const downloadQueryBtn = document.getElementById('download-query-btn');
    if (downloadQueryBtn) {
        downloadQueryBtn.addEventListener('click', () => {
            const query = queryOutput.textContent.trim();
            if (query.startsWith('Select a platform')) {
                showToast('Please generate a query first!', 'error');
                return;
            }
            const platform = targetPlatform.value;
            const title = document.getElementById('rule-title').value || 'hunting-query';
            
            let ext = 'kql';
            if (platform === 'defender' || platform === 'sentinel') ext = 'kql';
            else if (platform === 'crowdstrike') ext = 'fql';
            else if (platform === 'splunk') ext = 'spl';
            else if (platform === 'elastic') ext = 'txt';

            const filename = title.toLowerCase().replace(/\s+/g, '-') + '.' + ext;

            const blob = new Blob([query], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Query downloaded successfully!', 'success');
        });
    }

    // === 8. Changelog Modal Toggles & Micro-Interactions ===
    const changelogModal = document.getElementById('changelog-modal');
    const openChangelogBtn = document.getElementById('open-changelog-btn');
    const closeChangelogBtn = document.getElementById('close-changelog-btn');
    const okChangelogBtn = document.getElementById('ok-changelog-btn');

    if (openChangelogBtn && changelogModal) {
        const openChangelog = () => {
            // Remove pulsing unread dot upon view
            const dot = openChangelogBtn.querySelector('.flex.h-2\\.5.w-2\\.5');
            if (dot) dot.remove();

            changelogModal.classList.remove('opacity-0', 'pointer-events-none');
            changelogModal.querySelector('.glass-card').classList.remove('scale-95');
            changelogModal.querySelector('.glass-card').classList.add('scale-100');
        };

        const closeChangelog = () => {
            changelogModal.classList.add('opacity-0', 'pointer-events-none');
            changelogModal.querySelector('.glass-card').classList.remove('scale-100');
            changelogModal.querySelector('.glass-card').classList.add('scale-95');
        };

        openChangelogBtn.addEventListener('click', openChangelog);
        if (closeChangelogBtn) closeChangelogBtn.addEventListener('click', closeChangelog);
        if (okChangelogBtn) okChangelogBtn.addEventListener('click', closeChangelog);

        changelogModal.addEventListener('click', (e) => {
            if (e.target === changelogModal) {
                closeChangelog();
            }
        });
    }

    // === 9. Collapsible Query Converter Customizer & Syntax Verifier ===
    function populateCustomSettings() {
        const platform = targetPlatform.value;
        const rawCategory = document.getElementById('logsource-category').value;
        const category = normalizeCategory(rawCategory);
        const baseTableInput = document.getElementById('custom-base-table');
        const fieldMappingsArea = document.getElementById('custom-field-mappings');

        if (!baseTableInput || !fieldMappingsArea) return;

        const schema = mappings[platform] && mappings[platform][category] ? mappings[platform][category] : null;
        let defaultBaseTable = '';
        if (schema) {
            defaultBaseTable = schema.table;
        } else {
            if (platform === 'crowdstrike') defaultBaseTable = 'event_simpleName=*';
            else if (platform === 'defender') defaultBaseTable = 'DeviceProcessEvents';
            else if (platform === 'sentinel') defaultBaseTable = 'SecurityEvent | where EventID == 4688';
            else if (platform === 'splunk') defaultBaseTable = 'index=security';
            else if (platform === 'elastic') defaultBaseTable = 'event.category:*';
        }
        baseTableInput.value = defaultBaseTable;

        const fields = mappings[platform] && mappings[platform].fields ? mappings[platform].fields : {};
        let mappingLines = [];
        for (const [sigmaField, targetField] of Object.entries(fields)) {
            mappingLines.push(`${sigmaField}: ${targetField}`);
        }
        fieldMappingsArea.value = mappingLines.join('\n');
    }

    function checkQuerySyntaxErrors(queryText, platform) {
        const alertContainer = document.getElementById('query-syntax-alerts');
        if (!alertContainer) return;

        alertContainer.innerHTML = '';
        let errors = [];

        if (!queryText || queryText.startsWith('Select a platform')) {
            alertContainer.classList.add('hidden');
            return;
        }

        // Parentheses check
        const openParens = (queryText.match(/\(/g) || []).length;
        const closeParens = (queryText.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
            errors.push(`Unbalanced parentheses detected: ${openParens} opening vs ${closeParens} closing.`);
        }

        // Quotes check
        const doubleQuotes = (queryText.match(/"/g) || []).length;
        if (doubleQuotes % 2 !== 0) {
            errors.push(`Unbalanced double quotes (") detected: total count is odd (${doubleQuotes}).`);
        }
        const singleQuotes = (queryText.match(/'/g) || []).length;
        if (singleQuotes % 2 !== 0) {
            errors.push(`Unbalanced single quotes (') detected: total count is odd (${singleQuotes}).`);
        }

        // Operator check
        if (platform === 'defender' || platform === 'sentinel') {
            const lines = queryText.split('\n');
            lines.forEach((line, idx) => {
                if (line.trim().startsWith('//')) return;
                const match = line.match(/(?<![<>=!~])=(?!=)/);
                if (match) {
                    errors.push(`KQL Warning: Single "=" comparison detected on line ${idx + 1}. KQL requires "==" comparison operator.`);
                }
            });
        }

        if (platform === 'crowdstrike' || platform === 'splunk' || platform === 'elastic') {
            if (queryText.includes('matches regex')) {
                errors.push(`Syntax Warning: "matches regex" is KQL-specific. Use platform-native regex options.`);
            }
        }

        if (platform === 'splunk') {
            const parts = queryText.split('|');
            const prePipe = parts[0] || '';
            if (prePipe.includes('==')) {
                errors.push(`Splunk SPL Warning: "==" comparison found in search index filter. Splunk search filters use single "=" (e.g. Field="Value").`);
            }
        }

        if (errors.length > 0) {
            alertContainer.innerHTML = errors.map(err => `
                <div class="p-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-start gap-2 mb-1.5 animate-enter">
                     <i class="fa-solid fa-triangle-exclamation mt-0.5 animate-pulse text-red-400"></i>
                     <span>${err}</span>
                </div>
            `).join('');
            alertContainer.classList.remove('hidden');
        } else {
            alertContainer.classList.add('hidden');
        }
    }

    // Toggle Settings Panel Click Listener
    const toggleQuerySettingsBtn = document.getElementById('toggle-query-settings-btn');
    const querySettingsPanel = document.getElementById('query-settings-panel');
    if (toggleQuerySettingsBtn && querySettingsPanel) {
        toggleQuerySettingsBtn.addEventListener('click', () => {
            querySettingsPanel.classList.toggle('hidden');
            toggleQuerySettingsBtn.classList.toggle('bg-accent/15');
            toggleQuerySettingsBtn.classList.toggle('text-accent');
            toggleQuerySettingsBtn.classList.toggle('border-accent/30');
        });
    }

    // Bind real-time change listener to customizable settings inputs
    ['custom-base-table', 'custom-projections', 'custom-field-mappings'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', convertRule);
        }
    });

    // Add event listeners to all form inputs
    document.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('input', generateYAML);
    });

    // Initialize
    addSelection('CommandLine', 'powershell.exe', 'contains');
    renderSavedRules();
    generateYAML();
});
