function getTechniquesByTactic() {
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

function renderTechniqueSelector(selectedIds = []) {
    const container = document.getElementById('technique-select-container');
    const byTactic = getTechniquesByTactic();
    
    let html = '<input type="text" class="technique-select-search" id="technique-search" placeholder="Search techniques...">';
    html += '<div class="technique-select-list" id="technique-list">';
    
    for (const [tactic, techs] of Object.entries(byTactic)) {
        if (techs.length === 0) continue;
        const tacticObj = state.tactics.find(t => t.x_mitre_shortname === tactic);
        const tacticName = tacticObj?.name || tactic;
        
        html += `<div class="technique-tactic-group" data-tactic="${tactic}">`;
        html += `<span class="technique-tactic-label">${tacticName}</span>`;
        
        const sorted = techs.sort((a, b) => {
            const idA = a.external_references?.[0]?.external_id || '';
            const idB = b.external_references?.[0]?.external_id || '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
        
        for (const t of sorted) {
            const id = t.external_references?.[0]?.external_id || '';
            const name = t.name;
            const checked = selectedIds.includes(id) ? 'checked' : '';
            html += `<div class="technique-checkbox-item" data-id="${id}" data-name="${name.toLowerCase()}">
                <label class="technique-checkbox-label">
                    <input type="checkbox" class="technique-cb" data-tech-id="${id}" value="${id}" ${checked}>
                    <span class="tech-id">${id}</span> ${escapeHtml(name)}
                </label>
            </div>`;
        }
        html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.technique-cb').forEach(cb => {
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

function getSelectedTechniques() {
    const ids = [...document.querySelectorAll('#technique-list .technique-cb:checked')].map(cb => cb.value);
    return [...new Set(ids)];
}

function openQueryEditor(queryData = null, techniqueId = null) {
    document.getElementById('query-modal-title').textContent = queryData ? 'Edit Query' : 'Add Query';
    document.getElementById('query-edit-id').value = queryData?.id || '';
    document.getElementById('query-name').value = queryData?.name || '';
    document.getElementById('query-language').value = queryData?.language || 'kql';
    document.getElementById('query-text').value = queryData?.query || '';
    document.getElementById('query-description').value = queryData?.description || '';
    document.getElementById('query-source').value = queryData?.source || '';
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('query-month').value = queryData?.monthAdded || currentMonth;
    
    const selectGroup = document.getElementById('query-technique-select-group');
    const hiddenInput = document.getElementById('query-technique-id');
    
    state.currentModalTechniqueId = null;
    selectGroup.classList.remove('hidden');
    hiddenInput.value = '';
    
    const preselected = techniqueId || null;
    const selected = preselected ? [preselected] : (queryData ? (queryData.techniqueIDs || [queryData.techniqueID]) : []);
    renderTechniqueSelector(selected);
    
    const queryModal = new bootstrap.Modal(document.getElementById('query-modal'));
    queryModal.show();
    
    document.getElementById('query-modal').addEventListener('shown.bs.modal', () => {
        document.getElementById('query-name').focus();
    }, { once: true });
}

function saveQuery() {
    const editId = document.getElementById('query-edit-id').value;
    let techniqueIds = getSelectedTechniques();
    
    const name = document.getElementById('query-name').value.trim();
    const language = document.getElementById('query-language').value;
    const queryText = document.getElementById('query-text').value.trim();
    const description = document.getElementById('query-description').value.trim();
    const source = document.getElementById('query-source').value.trim();
    const monthAdded = document.getElementById('query-month').value || new Date().toISOString().slice(0, 7);
    const now = new Date().toISOString();
    
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
    
    // When editing, remove the query from ALL techniques first (it may have been on multiple)
    if (editId) {
        for (const tech of state.currentLayer.techniques) {
            if (tech.queries) {
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
            created: now, lastModified: now, favorite: false,
            monthAdded,
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
    
    saveCurrentLayer();
    techniqueIds.forEach(tid => logActivity('query_add', tid, name));
    
    requestAnimationFrame(() => {
        renderMatrix();
        renderQueriesView();
    });
    
    showToast(editId ? 'Query updated' : `Query added to ${techniqueIds.length} technique${techniqueIds.length > 1 ? 's' : ''}`, 'success');
}

function deleteQuery(techniqueId, queryId) {
    if (!state.currentLayer) return;
    let queryName = '';
    for (const tech of state.currentLayer.techniques) {
        if (tech.queries) {
            const q = tech.queries.find(q => q.id === queryId);
            if (q) queryName = q.name;
            tech.queries = tech.queries.filter(q => q.id !== queryId);
        }
    }
    saveCurrentLayer();
    logActivity('query_delete', techniqueId, queryName || queryId);
    renderMatrix();
    renderQueriesView();
    refreshTechniqueModalQueries();
    showToast('Query deleted', 'success');
}

function toggleFavorite(techniqueId, queryId) {
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
    saveCurrentLayer();
    renderQueriesView();
}

document.getElementById('btn-save-query').addEventListener('click', saveQuery);

document.getElementById('btn-add-query-global').addEventListener('click', () => {
    if (!state.currentLayer) return;
    openQueryEditor(null, null);
});
