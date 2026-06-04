// Import Module: Handles Layer Importing, Parsing, and Migrations

export class LayerImportEngine {
    static init() {
        this.bindEvents();
    }

    static bindEvents() {
        document.getElementById('btn-import-layer')?.addEventListener('click', () => {
            document.getElementById('file-import')?.click();
        });

        document.getElementById('file-import')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const layerData = JSON.parse(ev.target.result);
                    if (!layerData.id) {
                        layerData.id = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    }
                    
                    const state = window.state;
                    if (!state) return;
                    
                    state.currentDomain = layerData.domain || 'enterprise-attack';
                    
                    const importedVer = layerData.versions?.attack || layerData.attackVersion || 'master';
                    const latestVer = state.releases[0]?.tag || 'master';
                    
                    state.companyName = layerData.companyName || '';
                    state.companyLogo = layerData.companyLogo || null;
                    state.author = layerData.author || '';
                    state.autoColorRules = layerData.autoColorRules || state.autoColorRules;
                    state.expandedTechniques.clear();
                    
                    if (window.showWorkspace) window.showWorkspace();
                    
                    if (importedVer !== latestVer) {
                        const proceed = await window.showConfirm(
                            'Upgrade Imported Layer?',
                            `This layer was created using ATT&CK ${importedVer}. Would you like to automatically upgrade and migrate your queries to the latest version (${latestVer})?`
                        );
                        
                        if (proceed) {
                            if (window.showLoading) window.showLoading(true, 'Fetching latest STIX dataset for migration...');
                            try {
                                const url = `${window.RAW_BASE || 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data'}/${latestVer}/${state.currentDomain}/${state.currentDomain}.json`;
                                const resp = await fetch(url);
                                if (!resp.ok) throw new Error('Failed to load dataset');
                                const bundle = await resp.json();
                                
                                const tempState = {
                                    techniques: [], revokedTechniques: [], tactics: [], groups: [], software: [], mitigations: [], relationships: [], dataSources: [], dataComponents: []
                                };
                                const objects = bundle.objects || [];
                                for (const obj of objects) {
                                    if (obj.type === 'attack-pattern') {
                                        if (!obj.deprecated && !obj.revoked) tempState.techniques.push(obj);
                                        else tempState.revokedTechniques.push(obj);
                                    } else if (obj.type === 'relationship') {
                                        tempState.relationships.push(obj);
                                    }
                                }
                                
                                const changes = window.MigrationEngine.analyzeMigration(layerData, latestVer, tempState.techniques, tempState.relationships);
                                if (window.showLoading) window.showLoading(false);
                                
                                window.MigrationEngine.showMigrationWizard(layerData, latestVer, changes, async (migratedLayer) => {
                                    state.currentVersion = latestVer;
                                    document.getElementById('version-select').value = latestVer;
                                    if (window.loadSTIX) await window.loadSTIX(state.currentDomain, latestVer, migratedLayer);
                                    if (window.showToast) window.showToast(`Layer migrated to ATT&CK ${latestVer}`, 'success');
                                }, async () => {
                                    state.currentVersion = importedVer;
                                    document.getElementById('version-select').value = importedVer;
                                    if (window.loadSTIX) await window.loadSTIX(state.currentDomain, importedVer, layerData);
                                });
                                return;
                            } catch (err) {
                                if (window.showLoading) window.showLoading(false);
                                if (window.showToast) window.showToast('Failed to fetch migration data. Loading original layer.', 'warning');
                            }
                        }
                    }
                    
                    state.currentVersion = importedVer;
                    document.getElementById('version-select').value = importedVer;
                    if (window.loadSTIX) await window.loadSTIX(state.currentDomain, importedVer, layerData);
                    
                } catch (err) {
                    if (window.showToast) window.showToast('Invalid layer file: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        document.getElementById('domain-select')?.addEventListener('change', (e) => {
            const state = window.state;
            if (!state) return;
            state.currentDomain = e.target.value;
            if (state.currentLayer && window.loadSTIX) {
                window.loadSTIX(state.currentDomain, state.currentVersion || 'master', state.currentLayer);
            }
        });

        document.getElementById('version-select')?.addEventListener('change', async (e) => {
            const state = window.state;
            if (!state) return;
            const newVersion = e.target.value;
            if (!state.currentLayer) {
                state.currentVersion = newVersion;
                if (window.loadSTIX) window.loadSTIX(state.currentDomain, newVersion);
                return;
            }
            
            const currentVer = state.currentVersion;
            if (currentVer === newVersion) return;
            
            if (window.showLoading) window.showLoading(true, 'Fetching STIX data for migration...');
            try {
                const url = `${window.RAW_BASE || 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data'}/${newVersion}/${state.currentDomain}/${state.currentDomain}.json`;
                const resp = await fetch(url);
                if (!resp.ok) throw new Error('STIX Fetch Failed');
                const bundle = await resp.json();
                
                const tempState = {
                    techniques: [], revokedTechniques: [], tactics: [], groups: [], software: [], mitigations: [], relationships: [], dataSources: [], dataComponents: []
                };
                const objects = bundle.objects || [];
                for (const obj of objects) {
                    if (obj.type === 'attack-pattern') {
                        if (!obj.deprecated && !obj.revoked) tempState.techniques.push(obj);
                        else tempState.revokedTechniques.push(obj);
                    } else if (obj.type === 'relationship') {
                        tempState.relationships.push(obj);
                    }
                }
                
                const changes = window.MigrationEngine.analyzeMigration(state.currentLayer, newVersion, tempState.techniques, tempState.relationships);
                if (window.showLoading) window.showLoading(false);
                
                window.MigrationEngine.showMigrationWizard(state.currentLayer, newVersion, changes, async (migratedLayer) => {
                    state.currentVersion = newVersion;
                    if (window.loadSTIX) await window.loadSTIX(state.currentDomain, newVersion, migratedLayer);
                    if (window.showToast) window.showToast(`Layer migrated to ATT&CK ${newVersion}`, 'success');
                }, () => {
                    document.getElementById('version-select').value = currentVer;
                    state.currentVersion = currentVer;
                    if (window.showToast) window.showToast('Migration cancelled', 'info');
                });
            } catch (err) {
                if (window.showLoading) window.showLoading(false);
                document.getElementById('version-select').value = currentVer;
                if (window.showToast) window.showToast('Failed to load version: ' + err.message, 'error');
            }
        });
    }
}

// Legacy Window Binding
window.LayerImportEngine = LayerImportEngine;
