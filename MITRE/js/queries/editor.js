export function getTechniquesByTactic() {
    const map = {};
    const tacticOrder = state.tactics
        .filter(t => t.x_mitre_shortname)
        .sort((a, b) => (a.x_mitre_order || 0) - (b.x_mitre_order || 0));
    
    for (const tactic of tacticOrder) {
        const short = tactic.x_mitre_shortname;
        map[short] = [];
    }
    
    for (const t of state.techniques) {
        const phaseNames = t.kill_chain_phases?.filter(k => k.kill_chain_name === 'mitre-attack').map(k => k.phase_name) || [];
        for (const phase of phaseNames) {
            if (map[phase]) {
                map[phase].push(t);
            }
        }
    }
    
    return map;
}

export function renderTechniqueSelector(selectedIds = [], lockedIds = []) {
    const container = document.getElementById('technique-select-container');
    const byTactic = getTechniquesByTactic();
    
    let html = '<input type="text" class="technique-select-search" id="technique-search" placeholder="Search techniques...">';
    html += '<div class="technique-select-list" id="technique-list">';
    
    for (const [tactic, techs] of Object.entries(byTactic)) {
        if (techs.length === 0) continue;
        const tacticObj = state.tactics.find(t => t.x_mitre_shortname === tactic);
        const tacticName = tacticObj?.name || tactic;
        
        html += `<div class="technique-tactic-group" data-tactic="${escapeHtml(tactic)}">`;
        html += `<span class="technique-tactic-label">${escapeHtml(tacticName)}</span>`;
        
        const sorted = techs.sort((a, b) => {
            const idA = a.external_references?.[0]?.external_id || '';
            const idB = b.external_references?.[0]?.external_id || '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
        
        for (const t of sorted) {
            const id = t.external_references?.[0]?.external_id || '';
            const name = t.name;
            const isSelected = selectedIds.includes(id);
            const isLocked = lockedIds.includes(id);
            const checked = isSelected ? 'checked' : '';
            const disabled = isLocked ? 'disabled' : '';
            const lockedClass = isLocked ? 'technique-locked' : '';
            
            html += `<div class="technique-checkbox-item ${lockedClass}" data-id="${escapeHtml(id)}" data-name="${escapeHtml(name.toLowerCase())}">
                <label class="technique-checkbox-label">
                    <input type="checkbox" class="technique-cb" data-tech-id="${escapeHtml(id)}" value="${escapeHtml(id)}" ${checked} ${disabled}>
                    <span class="tech-id">${escapeHtml(id)}</span> ${escapeHtml(name)}
                    ${isLocked ? '<span class="technique-locked-badge" title="Locked by linked Sigma rule"><i class="bi bi-lock-fill"></i></span>' : ''}
                </label>
            </div>`;
        }
        html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.technique-cb:not([disabled])').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const techId = e.target.dataset.techId;
            container.querySelectorAll(`.technique-cb[data-tech-id="${techId}"]`).forEach(other => {
                other.checked = e.target.checked;
            });
        });
    });
    
    document.getElementById('technique-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.technique-checkbox-item').forEach(item => {
            const match = item.dataset.name.includes(q) || item.dataset.id.toLowerCase().includes(q);
            item.style.display = match ? '' : 'none';
        });
        document.querySelectorAll('.technique-tactic-group').forEach(group => {
            const items = group.querySelectorAll('.technique-checkbox-item');
            let hasVisible = false;
            items.forEach(item => {
                if (item.style.display !== 'none') hasVisible = true;
            });
            group.style.display = hasVisible ? '' : 'none';
        });
    });
}

export function getSelectedTechniques() {
    const ids = [...document.querySelectorAll('#technique-list .technique-cb:checked')].map(cb => cb.value);
    return [...new Set(ids)];
}

export function getTechniquesFromSigmaRules(sigmaRuleIds) {
    if (!sigmaRuleIds || sigmaRuleIds.length === 0) return [];
    const techIds = new Set();
    const rules = window.sigmaModule?.sigmaRules || window.sigmaRules || [];
    for (const ruleId of sigmaRuleIds) {
        const rule = rules.find(r => r.id === ruleId);
        if (rule && rule.technique_id && rule.technique_id !== 'N/A') {
            techIds.add(rule.technique_id);
        }
    }
    return [...techIds];
}

export async function openQueryEditor(queryData = null, techniqueId = null) {
    document.getElementById('query-modal-title').textContent = queryData ? 'Edit Query' : 'Add Query';
    document.getElementById('query-edit-id').value = queryData?.id || '';
    document.getElementById('query-name').value = queryData?.name || '';
    document.getElementById('query-language').value = queryData?.language || 'kql';
    document.getElementById('query-text').value = queryData?.query || '';
    document.getElementById('query-description').value = queryData?.description || '';
    document.getElementById('query-source').value = queryData?.source || '';
    
    document.getElementById('query-sentinel-candidate').checked = !!queryData?.sentinelCandidate;
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('query-month').value = queryData?.monthAdded || currentMonth;
    
    const selectGroup = document.getElementById('query-technique-select-group');
    const hiddenInput = document.getElementById('query-technique-id');
    
    state.currentModalTechniqueId = techniqueId || null;
    selectGroup.classList.remove('hidden');
    hiddenInput.value = '';
    
    // Parse Sigma rules (pipe-delimited for multiple)
    let sigmaRuleIds = [];
    if (queryData?.sigmaRuleId) {
        sigmaRuleIds = queryData.sigmaRuleId.split('|').filter(Boolean);
    }
    
    // Get technique IDs from Sigma rules (these will be locked)
    const lockedTechIds = getTechniquesFromSigmaRules(sigmaRuleIds);
    
    // Preselect techniques: from queryData or techniqueId parameter, plus locked ones
    const preselected = techniqueId ? [techniqueId] : (queryData ? (queryData.techniqueIDs || [queryData.techniqueID]) : []);
    const allSelected = [...new Set([...preselected, ...lockedTechIds])];
    
    renderTechniqueSelector(allSelected, lockedTechIds);
    
    // Load Sigma rule metadata if exists (restore multiple badges)
    if (sigmaRuleIds.length > 0) {
        const sigmaTitles = queryData?.sigmaRuleTitle ? queryData.sigmaRuleTitle.split('|').filter(Boolean) : [];
        const sigmaUrls = queryData?.sigmaRuleUrl ? queryData.sigmaRuleUrl.split('|').filter(Boolean) : [];

        document.getElementById('query-sigma-rule-id').value = queryData.sigmaRuleId || '';
        document.getElementById('query-sigma-rule-title').value = queryData.sigmaRuleTitle || '';
        document.getElementById('query-sigma-rule-url').value = queryData.sigmaRuleUrl || '';
        
        // Restore badges using sigma module
        if (window.sigmaModule && typeof window.sigmaModule.renderAttachedSigmaBadges === 'function') {
            window.sigmaModule.renderAttachedSigmaBadges(sigmaTitles, sigmaUrls);
        } else {
            // Fallback: set hidden fields and show both search and badges
            const badgeContainer = document.getElementById('query-sigma-attached-badge-container');
            const searchWrapper = document.getElementById('query-sigma-search')?.closest('.sigma-attach-wrapper');
            if (badgeContainer) badgeContainer.classList.remove('hidden');
            if (searchWrapper) searchWrapper.classList.remove('hidden');
        }
    } else {
        // No sigma rules - clear and show search
        if (window.sigmaModule && typeof window.sigmaModule.clearSigmaRuleFromModal === 'function') {
            window.sigmaModule.clearSigmaRuleFromModal();
        } else {
            // Fallback: clear fields and show search
            document.getElementById('query-sigma-rule-id').value = '';
            document.getElementById('query-sigma-rule-title').value = '';
            document.getElementById('query-sigma-rule-url').value = '';
            const badgeContainer = document.getElementById('query-sigma-attached-badge-container');
            const searchWrapper = document.getElementById('query-sigma-search')?.closest('.sigma-attach-wrapper');
            if (badgeContainer) badgeContainer.classList.add('hidden');
            if (searchWrapper) searchWrapper.classList.remove('hidden');
            const si = document.getElementById('query-sigma-search');
            if (si) { si.value = ''; }
        }
    }
    
    // Always ensure sigma search is visible when modal opens
    const searchWrapper = document.getElementById('query-sigma-search')?.closest('.sigma-attach-wrapper');
    if (searchWrapper) searchWrapper.classList.remove('hidden');
    
    // Always reinitialize Sigma Search bindings when modal opens
    if (window.sigmaModule && typeof window.sigmaModule.initQueryModalSigmaSearch === 'function') {
        window.sigmaModule.initQueryModalSigmaSearch();
    } else if (window.loadSigmaModule) {
        const sigmaSearch = document.getElementById('query-sigma-search');
        sigmaSearch?.addEventListener('focus', async () => {
            const sigma = await window.loadSigmaModule();
            if (sigma && typeof sigma.initQueryModalSigmaSearch === 'function') {
                sigma.initQueryModalSigmaSearch();
            }
        }, { once: true });
    }
    
    const queryModal = new bootstrap.Modal(document.getElementById('query-modal'));
    queryModal.show();
    
    document.getElementById('query-modal').addEventListener('shown.bs.modal', () => {
        document.getElementById('query-name').focus();
    }, { once: true });
}

export function saveQuery() {
    const editId = document.getElementById('query-edit-id').value;
    let techniqueIds = getSelectedTechniques();
    
    const name = document.getElementById('query-name').value.trim();
    const language = document.getElementById('query-language').value;
    const queryText = document.getElementById('query-text').value.trim();
    const description = document.getElementById('query-description').value.trim();
    const source = document.getElementById('query-source').value.trim();
    const monthAdded = document.getElementById('query-month').value || new Date().toISOString().slice(0, 7);
    const now = new Date().toISOString();
    
    // Parse multiple Sigma rules (pipe-delimited)
    const sigmaRuleIdRaw = document.getElementById('query-sigma-rule-id').value;
    const sigmaRuleTitleRaw = document.getElementById('query-sigma-rule-title').value;
    const sigmaRuleUrlRaw = document.getElementById('query-sigma-rule-url').value;
    
    const sigmaRuleId = sigmaRuleIdRaw || undefined;
    const sigmaRuleTitle = sigmaRuleTitleRaw || undefined;
    const sigmaRuleUrl = sigmaRuleUrlRaw || undefined;
    const sentinelCandidate = document.getElementById('query-sentinel-candidate').checked;
    
    if (techniqueIds.length === 0) {
        showToast('Please select at least one technique', 'error');
        return;
    }
    
    if (!name) {
        showToast('Query Name is required', 'error');
        return;
    }
    
    if (!state.currentLayer) return;
    
    // Generate one query ID for all techniques to avoid duplicates
    const queryId = editId || ('q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
    let existingQuery = null;
    
    // When editing, remove the query from ALL techniques first (it may have been on multiple)
    if (editId) {
        for (const tech of state.currentLayer.techniques) {
            if (tech.queries) {
                existingQuery = existingQuery || tech.queries.find(q => q.id === editId);
                tech.queries = tech.queries.filter(q => q.id !== editId);
            }
        }
    }
    
    // Add the query to all selected techniques with the SAME ID
    for (const tid of techniqueIds) {
        let ann = getTechniqueAnnotation(tid);
        if (!ann) {
            ann = { techniqueID: tid, enabled: true, queries: [], monthAdded };
            state.currentLayer.techniques.push(ann);
        }
        if (!ann.queries) ann.queries = [];
        if (!ann.monthAdded) ann.monthAdded = monthAdded;
        
        ann.queries.push({
            id: queryId,
            name, language, query: queryText, description, source,
            created: existingQuery?.created || now,
            lastModified: now,
            favorite: existingQuery?.favorite || false,
            archived: existingQuery?.archived || false,
            archivedAt: existingQuery?.archivedAt,
            archiveReason: existingQuery?.archiveReason,
            monthAdded,
            sigmaRuleId: sigmaRuleId,
            sigmaRuleTitle: sigmaRuleTitle,
            sigmaRuleUrl: sigmaRuleUrl,
            sentinelCandidate
        });
    }
    
    const queryModalInstance = bootstrap.Modal.getInstance(document.getElementById('query-modal'));
    if (queryModalInstance) queryModalInstance.hide();
    
    setTimeout(() => {
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        
        if (state.currentModalTechniqueId) {
            const techModal = new bootstrap.Modal(document.getElementById('technique-modal'));
            techModal.show();
            refreshTechniqueModalQueries();
        }
    }, 400);
    
    saveCurrentLayerNow();
    techniqueIds.forEach(tid => logActivity('query_add', tid, name));
    
    requestAnimationFrame(() => {
        renderMatrix();
        renderQueriesView();
    });
    
    showToast(editId ? 'Query updated' : `Query added to ${techniqueIds.length} technique${techniqueIds.length > 1 ? 's' : ''}`, 'success');
}

export function deleteQuery(techniqueId, queryId) {
    if (!state.currentLayer) return;
    let queryName = '';
    for (const tech of state.currentLayer.techniques) {
        if (tech.queries) {
            const q = tech.queries.find(q => q.id === queryId);
            if (q) queryName = q.name;
            tech.queries = tech.queries.filter(q => q.id !== queryId);
        }
    }
    autoSaveLayer();
    logActivity('query_delete', techniqueId, queryName || queryId);
    renderMatrix();
    renderQueriesView();
    refreshTechniqueModalQueries();
    showToast('Query deleted', 'success');
}

export function toggleFavorite(techniqueId, queryId) {
    if (!state.currentLayer) return;
    for (const tech of state.currentLayer.techniques) {
        if (tech.queries) {
            const q = tech.queries.find(q => q.id === queryId);
            if (q) {
                q.favorite = !q.favorite;
                q.lastModified = new Date().toISOString();
            }
        }
    }
    autoSaveLayer();
    renderQueriesView();
}

document.getElementById('btn-save-query').addEventListener('click', saveQuery);

export let archiveTargetQueryId = null;
export let archiveTargetTechniqueId = null;

window.openArchiveModal = function(queryId, techniqueId) {
    archiveTargetQueryId = queryId;
    archiveTargetTechniqueId = techniqueId;
    
    let queryName = '';
    if (state.currentLayer) {
        for (const tech of state.currentLayer.techniques) {
            if (tech.queries) {
                const q = tech.queries.find(q => q.id === queryId);
                if (q) {
                    queryName = q.name;
                    break;
                }
            }
        }
    }
    
    document.getElementById('archive-query-name').textContent = queryName || 'Unknown Query';
    document.getElementById('archive-reason').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('archive-query-modal'));
    modal.show();
};

window.confirmArchiveQuery = function() {
    const reason = document.getElementById('archive-reason').value.trim();
    if (!reason) {
        showToast('Please provide a reason for archiving', 'error');
        return;
    }
    
    if (!state.currentLayer || !archiveTargetQueryId) return;
    
    const now = new Date().toISOString();
    let queryName = '';
    
    for (const tech of state.currentLayer.techniques) {
        if (tech.queries) {
            const q = tech.queries.find(q => q.id === archiveTargetQueryId);
            if (q) {
                q.archived = true;
                q.archivedAt = now;
                q.archiveReason = reason;
                q.lastModified = now;
                queryName = q.name;
            }
        }
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('archive-query-modal'));
    if (modal) modal.hide();
    
    autoSaveLayer();
    logActivity('query_archive', archiveTargetTechniqueId, queryName || archiveTargetQueryId);
    
    renderMatrix();
    renderQueriesView();
    refreshTechniqueModalQueries();
    
    showToast('Query archived', 'success');
    
    archiveTargetQueryId = null;
    archiveTargetTechniqueId = null;
};

window.unarchiveQuery = function(queryId, techniqueId) {
    if (!state.currentLayer) return;
    
    const now = new Date().toISOString();
    let queryName = '';
    
    for (const tech of state.currentLayer.techniques) {
        if (tech.queries) {
            const q = tech.queries.find(q => q.id === queryId);
            if (q) {
                q.archived = false;
                q.unarchivedAt = now;
                q.archiveReason = null;
                q.lastModified = now;
                queryName = q.name;
            }
        }
    }
    
    autoSaveLayer();
    logActivity('query_unarchive', techniqueId, queryName || queryId);
    
    renderMatrix();
    renderQueriesView();
    refreshTechniqueModalQueries();
    
    showToast('Query restored', 'success');
};

document.getElementById('btn-confirm-archive').addEventListener('click', confirmArchiveQuery);

document.getElementById('btn-add-query-global').addEventListener('click', () => {
    if (!state.currentLayer) return;
    openQueryEditor(null, null);
});

// Legacy Window Bindings
window.getTechniquesByTactic = getTechniquesByTactic;
window.renderTechniqueSelector = renderTechniqueSelector;
window.getSelectedTechniques = getSelectedTechniques;
window.getTechniquesFromSigmaRules = getTechniquesFromSigmaRules;
window.openQueryEditor = openQueryEditor;
window.saveQuery = saveQuery;
window.deleteQuery = deleteQuery;
window.toggleFavorite = toggleFavorite;
window.archiveTargetQueryId = archiveTargetQueryId;
window.archiveTargetTechniqueId = archiveTargetTechniqueId;
