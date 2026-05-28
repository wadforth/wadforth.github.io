function showVersionWarningModal(title, message, orphans, onProceed, onCancel) {
    const modalHtml = `
        <div class="modal fade" id="version-warning-modal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background: var(--surface-elevated); border: 1px solid var(--border);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border);">
                        <h5 class="modal-title" style="color: var(--on-surface);">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" style="filter: invert(1);"></button>
                    </div>
                    <div class="modal-body" style="color: var(--on-surface-secondary);">
                        <p>${message}</p>
                        ${orphans.length ? `
                            <div class="version-warning-list">
                                <h6 class="text-on-surface-tertiary mb-2" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Affected Techniques (${orphans.length})</h6>
                                <div class="version-warning-items">
                                    ${orphans.slice(0, 10).map(t => `
                                        <span class="version-warning-item">
                                            <span class="version-warning-id">${t.id}</span>
                                            <span class="version-warning-name">${t.name}</span>
                                        </span>
                                    `).join('')}
                                    ${orphans.length > 10 ? `<span class="version-warning-more">+${orphans.length - 10} more</span>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer" style="border-top: 1px solid var(--border);">
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="version-warning-cancel">Cancel</button>
                        <button type="button" class="btn btn-sm btn-primary" id="version-warning-proceed">Proceed</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const existing = document.getElementById('version-warning-modal');
    if (existing) existing.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modal = new bootstrap.Modal(document.getElementById('version-warning-modal'));
    modal.show();
    
    document.getElementById('version-warning-proceed').addEventListener('click', () => {
        modal.hide();
        if (onProceed) onProceed();
    });
    
    document.getElementById('version-warning-cancel').addEventListener('click', () => {
        modal.hide();
        if (onCancel) onCancel();
    });
    
    document.getElementById('version-warning-modal').addEventListener('hidden.bs.modal', () => {
        document.getElementById('version-warning-modal').remove();
    });
}

function findOrphanedTechniques(layer, availableTechniques) {
    if (!layer?.techniques) return [];
    
    const availableIds = new Set();
    const techMap = {};
    
    availableTechniques.forEach(t => {
        const id = (t.external_references?.[0]?.external_id || '').trim().toUpperCase();
        if (id) {
            availableIds.add(id);
            techMap[id] = t.name;
        }
    });
    
    return layer.techniques
        .filter(ann => {
            const tid = (ann.techniqueID || '').trim().toUpperCase();
            return !availableIds.has(tid);
        })
        .map(ann => ({
            id: ann.techniqueID,
            name: ann.name || techMap[(ann.techniqueID || '').trim().toUpperCase()] || 'Unknown',
            color: ann.color,
            hasQueries: ann.queries && ann.queries.length > 0
        }));
}

function normalizeVersion(ver) {
    return (ver || '').replace(/[^0-9.]/g, '');
}
