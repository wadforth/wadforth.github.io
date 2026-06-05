import { escapeHtml } from '../utils/sanitize.js';

export async function generateChangelog() {
    const state = window.state;
    if (!state || !state.releases || state.releases.length === 0) return;

    const currentVer = (state.currentVersion || '').replace(/^v+/, 'v');
    const currentIndex = state.releases.findIndex(r => r.tag.replace(/^v+/, 'v') === currentVer);
    
    // No previous version known
    if (currentIndex === -1 || currentIndex >= state.releases.length - 1) {
        document.getElementById('btn-changelog')?.classList.add('hidden');
        state.changelogDiff = null;
        return;
    }

    const previousVer = state.releases[currentIndex + 1].tag.replace(/^v+/, 'v');
    
    // Initialize empty diff
    state.changelogDiff = {
        previousVersion: previousVer,
        currentVersion: currentVer,
        added: {
            techniques: new Set(),
            groups: new Set(),
            software: new Set(),
            mitigations: new Set(),
            tactics: new Set()
        },
        details: {
            techniques: [],
            groups: [],
            software: [],
            mitigations: [],
            tactics: []
        }
    };

    try {
        const url = `${window.RAW_BASE || 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data'}/${previousVer}/${state.currentDomain}/${state.currentDomain}.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to fetch previous STIX');
        
        const oldBundle = await resp.json();
        const oldObjects = oldBundle.objects || [];
        
        const oldIds = new Set();
        
        oldObjects.forEach(obj => {
            const extId = obj.external_references?.[0]?.external_id || obj.id;
            oldIds.add(extId);
        });

        // Helper to check what's new in a specific array
        const processCategory = (currentArray, categoryKey, typeName) => {
            currentArray.forEach(obj => {
                const extId = obj.external_references?.[0]?.external_id || obj.id;
                if (!oldIds.has(extId)) {
                    state.changelogDiff.added[categoryKey].add(extId);
                    state.changelogDiff.details[categoryKey].push({
                        id: extId,
                        name: obj.name,
                        type: typeName
                    });
                }
            });
        };

        processCategory(state.techniques, 'techniques', 'Technique');
        processCategory(state.groups, 'groups', 'Group');
        processCategory(state.software, 'software', 'Software');
        processCategory(state.mitigations, 'mitigations', 'Mitigation');
        processCategory(state.tactics, 'tactics', 'Tactic');

        // Show Changelog Button
        const btn = document.getElementById('btn-changelog');
        if (btn) btn.classList.remove('hidden');

        // Update Matrix / Views to show badges if they are currently loaded
        if (window.renderAll) {
            // Give the UI a tiny delay so it doesn't stutter the main load
            requestAnimationFrame(() => window.renderAll());
        }

    } catch (err) {
        console.warn('Changelog diff failed to generate:', err);
        state.changelogDiff = null;
    }
}

export function showChangelogModal() {
    const state = window.state;
    const diff = state.changelogDiff;
    if (!diff) return;

    document.getElementById('changelog-subtitle').textContent = `Comparing ${diff.currentVersion} against ${diff.previousVersion}`;
    
    const loading = document.getElementById('changelog-loading');
    const container = document.getElementById('changelog-details-list');
    
    loading.classList.add('hidden');
    container.classList.remove('hidden');

    let html = '';

    const buildSection = (title, items, icon) => {
        if (items.length === 0) return '';
        
        // Sort by ID
        items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        
        return `
            <div class="mb-4">
                <h6 class="font-bold text-sm mb-2"><i class="${icon} mr-1"></i> New ${title} (${items.length})</h6>
                <div class="list-group list-group-flush border rounded overflow-hidden shadow-sm">
                    ${items.map(item => `
                        <div class="list-group-item py-2 px-3 d-flex justify-content-between align-items-center bg-surface text-sm">
                            <div>
                                <span class="font-mono font-bold text-primary mr-2">${item.id}</span>
                                <span class="font-medium">${escapeHtml(item.name)}</span>
                            </div>
                            <span class="badge bg-success text-xxs">NEW</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };

    html += buildSection('Techniques', diff.details.techniques, 'bi-grid-3x3-gap-fill');
    html += buildSection('Groups', diff.details.groups, 'bi-people-fill');
    html += buildSection('Software', diff.details.software, 'bi-cpu-fill');
    html += buildSection('Mitigations', diff.details.mitigations, 'bi-shield-fill-check');
    html += buildSection('Tactics', diff.details.tactics, 'bi-layers-fill');

    if (html === '') {
        html = `
            <div class="text-center py-5">
                <i class="bi bi-check-circle text-success mb-3" style="font-size: 2.5rem;"></i>
                <h5 class="font-bold">No New Entities</h5>
                <p class="text-on-surface-secondary text-sm">There were no brand new techniques, groups, software, or mitigations added in ${diff.currentVersion} compared to ${diff.previousVersion}. Existing entities may have been modified or revoked.</p>
            </div>
        `;
    }

    container.innerHTML = html;
    
    const modal = new bootstrap.Modal(document.getElementById('changelog-modal'));
    modal.show();
}

// Bind Button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-changelog')?.addEventListener('click', showChangelogModal);
});

// Legacy window bindings
window.generateChangelog = generateChangelog;
window.showChangelogModal = showChangelogModal;
