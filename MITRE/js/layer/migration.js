/**
 * MITRE ATT&CK Version Migration Engine
 * Handles upgrading and downgrading layer versions, mapping revoked/deprecated
 * techniques to their successors using STIX relationship data.
 */

export const MigrationEngine = {
    // Finds all deprecated or revoked techniques in a layer and maps them to successors
    analyzeMigration(layerData, targetVersion, targetTechniques, targetRelationships) {
        const changes = {
            upgraded: [],      // Techniques mapped to newer IDs
            deprecated: [],    // Techniques deprecated with no direct mapping
            unchanged: [],     // Techniques that still exist as-is
            added: []          // New techniques (if applicable)
        };

        const targetMap = new Map();
        targetTechniques.forEach(t => {
            const extId = t.external_references?.[0]?.external_id;
            if (extId) targetMap.set(extId, t);
        });

        // Loop over techniques currently defined in the layer
        const layerTechs = layerData.techniques || [];
        
        layerTechs.forEach(lt => {
            const techId = lt.techniqueID;
            const targetTech = targetMap.get(techId);

            if (targetTech) {
                // If it exists in target and is active
                changes.unchanged.push({
                    techniqueID: techId,
                    annotation: lt
                });
            } else {
                // Not found or deprecated/revoked. Check if it's revoked in target version's revokedTechniques cache
                const revokedTech = state.revokedTechniques.find(t => t.external_references?.[0]?.external_id === techId);
                
                // Let's trace revoked-by relationships
                let successorId = null;
                let successorName = '';

                if (revokedTech) {
                    const rel = targetRelationships.find(r => 
                        r.relationship_type === 'revoked-by' && 
                        r.source_ref === revokedTech.id
                    );
                    if (rel) {
                        const targetObj = targetTechniques.find(t => t.id === rel.target_ref);
                        if (targetObj) {
                            successorId = targetObj.external_references?.[0]?.external_id;
                            successorName = targetObj.name;
                        }
                    }
                }

                if (successorId) {
                    changes.upgraded.push({
                        oldId: techId,
                        newId: successorId,
                        newName: successorName,
                        annotation: lt
                    });
                } else {
                    changes.deprecated.push({
                        techniqueID: techId,
                        annotation: lt
                    });
                }
            }
        });

        return changes;
    },

    // Shows the migration modal wizard with dynamic details
    showMigrationWizard(layerData, targetVersion, changes, onConfirm, onCancel) {
        const modalEl = document.getElementById('migration-modal');
        if (!modalEl) {
            // Fallback to simple alert/confirm if modal is missing
            const proceed = confirm(`Upgrade layer to ATT&CK ${targetVersion}? This will automatically map revoked techniques.`);
            if (proceed) {
                const migratedLayer = this.applyMigration(layerData, targetVersion, changes);
                onConfirm(migratedLayer);
            } else {
                onCancel();
            }
            return;
        }

        // Populate Modal Details
        document.getElementById('migration-title').textContent = `Layer Version Migration Wizard`;
        const oldVer = layerData.versions?.attack || layerData.attackVersion || 'Legacy';
        document.getElementById('migration-subtitle').textContent = `Migrating from ${oldVer} to ${targetVersion}`;
        
        const detailsContainer = document.getElementById('migration-details-list');
        let html = '';

        if (changes.upgraded.length > 0) {
            html += `<div class="migration-section mb-3">
                <h6 class="text-success text-sm font-semibold mb-2"><i class="bi bi-arrow-up-circle mr-1"></i>Automatic Mappings (${changes.upgraded.length})</h6>
                <div class="migration-list p-2 rounded text-xs" style="max-height: 150px; overflow-y: auto; background: var(--surface-variant); border: 1px solid var(--border);">
                    ${changes.upgraded.map(c => `
                        <div class="d-flex justify-content-between border-bottom py-1" style="border-color: var(--border) !important;">
                            <span><strong class="text-danger">${c.oldId}</strong> <i class="bi bi-arrow-right mx-1"></i> <strong class="text-success">${c.newId}</strong> (${escapeHtml(c.newName)})</span>
                            <span class="text-on-surface-secondary">${c.annotation.queries?.length || 0} query(s)</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        if (changes.deprecated.length > 0) {
            html += `<div class="migration-section mb-3">
                <h6 class="text-warning text-sm font-semibold mb-2"><i class="bi bi-exclamation-triangle mr-1"></i>Deprecated with No Replacement (${changes.deprecated.length})</h6>
                <div class="migration-list p-2 rounded text-xs" style="max-height: 150px; overflow-y: auto; background: var(--surface-variant); border: 1px solid var(--border);">
                    ${changes.deprecated.map(c => `
                        <div class="d-flex justify-content-between border-bottom py-1" style="border-color: var(--border) !important;">
                            <span><strong class="text-warning">${c.techniqueID}</strong> (Removed from MITRE)</span>
                            <span class="text-on-surface-secondary">${c.annotation.queries?.length || 0} query(s) will be kept as legacy</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        if (changes.upgraded.length === 0 && changes.deprecated.length === 0) {
            html += `<div class="text-center py-4 text-on-surface-secondary">
                <i class="bi bi-check-circle text-success" style="font-size: 2rem;"></i>
                <p class="mt-2 text-sm">All techniques in this layer are 100% compatible with ATT&CK ${targetVersion}!</p>
            </div>`;
        }

        detailsContainer.innerHTML = html;

        const modal = new bootstrap.Modal(modalEl);

        const confirmBtn = document.getElementById('btn-confirm-migration');
        const cancelBtn = document.getElementById('btn-cancel-migration');

        // Remove old listeners
        const newConfirm = () => {
            const migratedLayer = this.applyMigration(layerData, targetVersion, changes);
            modal.hide();
            onConfirm(migratedLayer);
            cleanup();
        };

        const newCancel = () => {
            modal.hide();
            onCancel();
            cleanup();
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', newConfirm);
            cancelBtn.removeEventListener('click', newCancel);
            modalEl.removeEventListener('hidden.bs.modal', newCancel);
        };

        confirmBtn.addEventListener('click', newConfirm);
        cancelBtn.addEventListener('click', newCancel);
        modalEl.addEventListener('hidden.bs.modal', newCancel, { once: true });

        modal.show();
    },

    // Applies the calculated changes to target layer
    applyMigration(layerData, targetVersion, changes) {
        const migrated = JSON.parse(JSON.stringify(layerData));
        migrated.attackVersion = targetVersion;
        if (!migrated.versions) migrated.versions = {};
        migrated.versions.attack = targetVersion;

        const newTechList = [];

        // Add unchanged ones
        changes.unchanged.forEach(c => {
            newTechList.push(c.annotation);
        });

        // Add upgraded ones with merged annotations/queries
        changes.upgraded.forEach(c => {
            const existing = newTechList.find(t => t.techniqueID === c.newId);
            if (existing) {
                // Merge queries
                if (c.annotation.queries) {
                    existing.queries = existing.queries || [];
                    c.annotation.queries.forEach(q => {
                        q.techniqueID = c.newId;
                        if (q.techniqueIDs) {
                            q.techniqueIDs = q.techniqueIDs.map(id => id === c.oldId ? c.newId : id);
                        }
                        existing.queries.push(q);
                    });
                }
                // Merge comments/scores
                if (c.annotation.comment) {
                    existing.comment = (existing.comment ? existing.comment + ' | ' : '') + c.annotation.comment;
                }
                if (c.annotation.score !== undefined) {
                    existing.score = Math.max(existing.score || 0, c.annotation.score);
                }
            } else {
                const migratedAnn = { ...c.annotation, techniqueID: c.newId };
                if (migratedAnn.queries) {
                    migratedAnn.queries.forEach(q => {
                        q.techniqueID = c.newId;
                        if (q.techniqueIDs) {
                            q.techniqueIDs = q.techniqueIDs.map(id => id === c.oldId ? c.newId : id);
                        }
                    });
                }
                newTechList.push(migratedAnn);
            }
        });

        // Keep deprecated ones as-is (legacy)
        changes.deprecated.forEach(c => {
            newTechList.push(c.annotation);
        });

        migrated.techniques = newTechList;

        // Update metadata Split
        migrated.metadata = migrated.metadata || [];
        const verMeta = migrated.metadata.find(m => m.name === 'ATT&CK Version');
        if (verMeta) verMeta.value = targetVersion;
        else migrated.metadata.push({ name: 'ATT&CK Version', value: targetVersion });

        return migrated;
    }
};
window.MigrationEngine = MigrationEngine;

// Legacy Window Bindings
window.MigrationEngine = MigrationEngine;
