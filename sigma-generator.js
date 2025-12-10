document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentMode = 'simple';
    let selectionCounter = 0;
    let savedRules = JSON.parse(localStorage.getItem('sigma-rules') || '[]');

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
                <input type="text" class="selection-field px-3 py-2 bg-dark border border-white/10 rounded text-white text-sm focus:border-accent focus:outline-none" placeholder="Field name" value="${field}">
                <input type="text" class="selection-value px-3 py-2 bg-dark border border-white/10 rounded text-white text-sm focus:border-accent focus:outline-none" placeholder="Value" value="${value}">
                ${currentMode === 'advanced' ? `
                <select class="selection-modifier px-3 py-2 bg-dark border border-white/10 rounded text-white text-sm focus:border-accent focus:outline-none">
                    <option value="">No Modifier</option>
                    <option value="contains" ${modifier === 'contains' ? 'selected' : ''}>Contains</option>
                    <option value="startswith" ${modifier === 'startswith' ? 'selected' : ''}>Starts With</option>
                    <option value="endswith" ${modifier === 'endswith' ? 'selected' : ''}>Ends With</option>
                    <option value="all" ${modifier === 'all' ? 'selected' : ''}>All</option>
                    <option value="re" ${modifier === 're' ? 'selected' : ''}>Regex</option>
                </select>
                ` : ''}
            </div>
        `;

        selectionsContainer.appendChild(selectionDiv);

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

        yamlOutput.textContent = yaml || '# Your SIGMA rule will appear here...';
    }

    // Generate UUID
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Copy YAML
    copyYamlBtn.addEventListener('click', () => {
        const yaml = yamlOutput.textContent;
        navigator.clipboard.writeText(yaml).then(() => {
            const originalHTML = copyYamlBtn.innerHTML;
            copyYamlBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            copyYamlBtn.classList.add('!bg-accent/30', '!text-accent');

            setTimeout(() => {
                copyYamlBtn.innerHTML = originalHTML;
                copyYamlBtn.classList.remove('!bg-accent/30', '!text-accent');
            }, 2000);
        });
    });

    // Download YAML
    downloadYamlBtn.addEventListener('click', () => {
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
    });

    // Save Rule to LocalStorage
    saveRuleBtn.addEventListener('click', () => {
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

        // Show feedback
        const originalHTML = saveRuleBtn.innerHTML;
        saveRuleBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
        saveRuleBtn.classList.add('!bg-accent/30', '!text-accent');

        setTimeout(() => {
            saveRuleBtn.innerHTML = originalHTML;
            saveRuleBtn.classList.remove('!bg-accent/30', '!text-accent');
        }, 2000);
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
            yamlOutput.textContent = rule.yaml;
            alert('Rule loaded into preview. (Full form population coming in v2)');
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
