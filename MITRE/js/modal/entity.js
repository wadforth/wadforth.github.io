function showGroupModal(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const techModal = bootstrap.Modal.getInstance(document.getElementById('technique-modal'));
    if (techModal) techModal.hide();
    
    setTimeout(() => {
        const groupModalHtml = `
            <div class="modal fade" id="group-detail-modal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content technique-modal">
                        <div class="tech-modal-header">
                            <button type="button" class="btn-close tech-modal-close" data-bs-dismiss="modal"></button>
                            <div class="tech-modal-header-content">
                                <div class="tech-modal-badges">
                                    <span class="tech-badge-id">${group.external_references?.[0]?.external_id || 'N/A'}</span>
                                    <span class="tech-badge-type">Threat Group</span>
                                </div>
                                <h3 class="tech-modal-title">${escapeHtml(group.name)}</h3>
                            </div>
                        </div>
                        <div class="tech-modal-body">
                            <div class="tech-modal-scroll">
                                <div class="tech-modal-desc">${parseDescription(group.description || '')}</div>
                                <div class="tech-tab-content">
                                    <h6 class="tech-detail-header" style="margin-bottom: 1rem;"><i class="bi bi-people"></i> Associated Techniques</h6>
                                    <div class="tech-entity-grid">
                                        ${state.relationships
                                            .filter(r => r.relationship_type === 'uses' && r.source_ref === group.id)
                                            .map(r => {
                                                const tech = state.techniques.find(t => t.id === r.target_ref);
                                                if (!tech) return '';
                                                const techId = tech.external_references?.[0]?.external_id || '';
                                                return `<div class="entity-chip entity-chip-clickable" data-tech-id="${techId}">
                                                    <span class="entity-name">${tech.name}</span>
                                                    <span class="entity-id">${techId}</span>
                                                </div>`;
                                            }).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const existing = document.getElementById('group-detail-modal');
        if (existing) existing.remove();
        
        document.body.insertAdjacentHTML('beforeend', groupModalHtml);
        
        const modal = new bootstrap.Modal(document.getElementById('group-detail-modal'));
        modal.show();
        
        document.getElementById('group-detail-modal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('group-detail-modal').remove();
            if (techModal) techModal.show();
        });
        
        document.querySelectorAll('#group-detail-modal .entity-chip-clickable').forEach(chip => {
            chip.addEventListener('click', () => {
                const gModal = bootstrap.Modal.getInstance(document.getElementById('group-detail-modal'));
                if (gModal) gModal.hide();
                setTimeout(() => showTechniqueModal(chip.dataset.techId), 300);
            });
        });
    }, 300);
}
