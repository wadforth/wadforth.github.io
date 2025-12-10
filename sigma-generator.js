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

    // State
    let currentMode = 'simple';
    let selectionCounter = 0;
    let savedRules = JSON.parse(localStorage.getItem('sigma-rules') || '[]');

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
            fields: {
                'Image': 'NewProcessName',
                'CommandLine': 'CommandLine',
                'ParentImage': 'ParentProcessName',
                'User': 'SubjectUserName',
                'DestinationIp': 'DestinationIP',
                'DestinationPort': 'DestinationPort'
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
            }

            e.target.value = ''; // Reset selector
        });
    }

    // Clear Form
    const clearFormBtn = document.getElementById('clear-form-btn');
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', () => {
            if (!confirm('Are you sure you want to clear the entire form?')) return;

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

        // ID (generate UUID)
        const id = generateUUID();
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
        const category = document.getElementById('logsource-category').value;
        const selections = document.querySelectorAll('[data-selection-id]');

        // Get Schema Config from global mappings
        const schema = mappings[platform] && mappings[platform][category] ? mappings[platform][category] : null;
        let baseTable = schema ? schema.table : (platform === 'crowdstrike' ? 'event_simpleName=*' : 'Union *');

        // Warn if no mapping
        let warnings = [];
        if (!schema && platform !== 'crowdstrike' && mappings[platform]) {
            warnings.push(`No specific mapping for category '${category}' on ${platform}. Using generic table.`);
        }

        // 1. Build Conditions
        let conditions = [];
        selections.forEach(sel => {
            const field = sel.querySelector('.selection-field').value;
            const value = sel.querySelector('.selection-value').value;
            const modifier = currentMode === 'advanced' ? sel.querySelector('.selection-modifier')?.value : '';

            // Map field name if possible, else keep original and warn
            let mappedField = field;
            if (mappings[platform] && mappings[platform].fields && mappings[platform].fields[field]) {
                mappedField = mappings[platform].fields[field];
            } else {
                warnings.push(`Custom field '${field}' may not exist in ${platform} schema.`);
            }

            if (platform === 'defender' || platform === 'sentinel') {
                // KQL Logic
                let operator = '==';
                let valQuote = `"${value}"`;

                if (modifier === 'contains') operator = 'contains';
                if (modifier === 'startswith') operator = 'startswith';
                if (modifier === 'endswith') operator = 'endswith';

                conditions.push(`${mappedField} ${operator} ${valQuote}`);
            } else if (platform === 'crowdstrike') {
                // FQL Logic (Splunk-like)
                let valStr = `"${value}"`;
                if (modifier === 'contains') valStr = `"*${value}*"`;
                if (modifier === 'startswith') valStr = `"${value}*"`;
                if (modifier === 'endswith') valStr = `"*${value}"`;

                conditions.push(`${mappedField}=${valStr}`);
            }
        });

        // 2. Assemble Query
        let query = '';
        if (platform === 'defender' || platform === 'sentinel') {
            query = `${baseTable}\n| where ${conditions.join(' or ')}`;
        } else if (platform === 'crowdstrike') {
            query = `${baseTable} ${conditions.join(' OR ')}`;
        }

        // 3. Add Projection/Selection
        const selectedColumns = Array.from(document.querySelectorAll('input[name="display-columns"]:checked'))
            .map(cb => cb.value);
        if (selectedColumns.length > 0) {
            if (platform === 'defender' || platform === 'sentinel') {
                query += `\n| project ${selectedColumns.join(', ')}`;
            } else if (platform === 'crowdstrike') {
                query += ` | select([${selectedColumns.join(', ')}])`;
            }
        }

        // 4. Append Warnings
        if (warnings.length > 0) {
            query = `// WARNING: ${warnings.join(' | ')}\n` + query;
            showToast('Query generated with warnings (check top of query)', 'warning');
        } else {
            showToast(`Generated ${platform} query`, 'success');
        }

        queryOutput.textContent = query;
    }

    // Dynamic Columns Options
    function updateQueryOptions() {
        const platform = targetPlatform.value;
        const category = document.getElementById('logsource-category').value;
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

        const rule = {
            id: generateUUID(),
            title: title,
            yaml: yaml,
            timestamp: new Date().toISOString()
        };

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
            // This is a simplified load - in production you'd parse the YAML back into form fields
            yamlOutput.innerHTML = highlightYAML(rule.yaml);
            showToast('Rule loaded into preview (Read-only)', 'info');
        }
    };

    window.deleteRule = function (ruleId) {
        savedRules = savedRules.filter(r => r.id !== ruleId);
        localStorage.setItem('sigma-rules', JSON.stringify(savedRules));
        renderSavedRules();
    };

    // Add event listeners to all form inputs
    document.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('input', generateYAML);
    });

    // Initialize
    addSelection('CommandLine', 'powershell.exe', 'contains');
    renderSavedRules();
    generateYAML();
});
