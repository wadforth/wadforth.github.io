import { escapeHtml } from '../utils/format.js';

export async function generateChangelog() {
    const state = window.state;
    if (!state || !state.releases || state.releases.length === 0) return;

    const normalize = window.normalizeVersion || ((ver) => String(ver || '').replace(/[^0-9.]/g, ''));
    const currentRaw = state.currentVersion || 'master';
    const normalizedCurrent = normalize(currentRaw);
    const isMaster = currentRaw === 'master' || currentRaw === 'vmaster' || normalizedCurrent === '';
    const currentIndex = isMaster ? -1 : state.releases.findIndex(r => normalize(r.tag) === normalizedCurrent);
    
    let previousVer;
    
    // If we're on master/vmaster, diff against the latest stable release (index 0)
    if (isMaster) {
        previousVer = state.releases[0].tag;
    } else if (currentIndex === -1 || currentIndex >= state.releases.length - 1) {
        // No previous version known
        document.getElementById('btn-changelog')?.classList.add('hidden');
        state.changelogDiff = null;
        return;
    } else {
        previousVer = state.releases[currentIndex + 1].tag;
    }
    const currentVer = isMaster ? 'master' : state.releases[currentIndex].tag;
    
    const emptyCategorySets = () => ({
        techniques: new Set(),
        groups: new Set(),
        software: new Set(),
        mitigations: new Set(),
        tactics: new Set()
    });
    const emptyCategoryLists = () => ({
        techniques: [],
        groups: [],
        software: [],
        mitigations: [],
        tactics: []
    });

    // Initialize empty diff
    state.changelogDiff = {
        previousVersion: previousVer,
        currentVersion: currentVer,
        added: emptyCategorySets(),
        modified: emptyCategorySets(),
        moved: emptyCategorySets(),
        retired: emptyCategorySets(),
        details: emptyCategoryLists(),
        modifiedDetails: emptyCategoryLists(),
        movedDetails: emptyCategoryLists(),
        retiredDetails: emptyCategoryLists()
    };

    try {
        const url = `${window.RAW_BASE || 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data'}/${previousVer}/${state.currentDomain}/${state.currentDomain}.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to fetch previous STIX');
        
        const oldBundle = await resp.json();
        const oldObjects = oldBundle.objects || [];
        
        const getExternalId = (obj) => obj.external_references?.find(ref => ref.source_name === 'mitre-attack')?.external_id
            || obj.external_references?.[0]?.external_id
            || obj.id;
        const getCategoryKey = (obj) => {
            if (obj.type === 'attack-pattern') return 'techniques';
            if (obj.type === 'intrusion-set') return 'groups';
            if (obj.type === 'malware' || obj.type === 'tool') return 'software';
            if (obj.type === 'course-of-action') return 'mitigations';
            if (obj.type === 'x-mitre-tactic') return 'tactics';
            return null;
        };
        const getPhaseNames = (obj) => (obj.kill_chain_phases || [])
            .filter(phase => phase.kill_chain_name === 'mitre-attack')
            .map(phase => phase.phase_name)
            .sort()
            .join('|');
        const typeNames = {
            techniques: 'Technique',
            groups: 'Group',
            software: 'Software',
            mitigations: 'Mitigation',
            tactics: 'Tactic'
        };
        const oldIds = new Set();
        const oldById = new Map();
        const currentById = new Map();
        const currentRetiredById = new Map();
        
        oldObjects.forEach(obj => {
            const extId = getExternalId(obj);
            oldIds.add(extId);
            oldById.set(extId, obj);
        });

        [...state.techniques, ...state.groups, ...state.software, ...state.mitigations, ...state.tactics].forEach(obj => {
            currentById.set(getExternalId(obj), obj);
        });
        (state.revokedTechniques || []).forEach(obj => {
            currentRetiredById.set(getExternalId(obj), obj);
        });

        // Helper to check what's new in a specific array
        const processCategory = (currentArray, categoryKey, typeName) => {
            currentArray.forEach(obj => {
                const extId = getExternalId(obj);
                if (!oldIds.has(extId)) {
                    state.changelogDiff.added[categoryKey].add(extId);
                    state.changelogDiff.details[categoryKey].push({
                        id: extId,
                        name: obj.name,
                        type: typeName
                    });
                    return;
                }

                const oldObj = oldById.get(extId);
                if (!oldObj) return;

                if ((obj.modified || '') !== (oldObj.modified || '')) {
                    state.changelogDiff.modified[categoryKey].add(extId);
                    state.changelogDiff.modifiedDetails[categoryKey].push({
                        id: extId,
                        name: obj.name,
                        type: typeName,
                        from: oldObj.modified || 'unknown',
                        to: obj.modified || 'unknown'
                    });
                }

                if (categoryKey === 'techniques' && getPhaseNames(obj) !== getPhaseNames(oldObj)) {
                    state.changelogDiff.moved[categoryKey].add(extId);
                    state.changelogDiff.movedDetails[categoryKey].push({
                        id: extId,
                        name: obj.name,
                        type: typeName,
                        from: getPhaseNames(oldObj).replace(/\|/g, ', ') || 'Unmapped',
                        to: getPhaseNames(obj).replace(/\|/g, ', ') || 'Unmapped'
                    });
                }
            });
        };

        processCategory(state.techniques, 'techniques', 'Technique');
        processCategory(state.groups, 'groups', 'Group');
        processCategory(state.software, 'software', 'Software');
        processCategory(state.mitigations, 'mitigations', 'Mitigation');
        processCategory(state.tactics, 'tactics', 'Tactic');

        oldObjects.forEach(obj => {
            const categoryKey = getCategoryKey(obj);
            if (!categoryKey) return;
            const extId = getExternalId(obj);
            const wasAlreadyRetired = obj.revoked || obj.x_mitre_deprecated || obj.deprecated;
            if (wasAlreadyRetired) return;
            if (currentById.has(extId)) return;
            const retiredCurrent = currentRetiredById.get(extId);
            if (!retiredCurrent) return;
            const retired = retiredCurrent;
            if (!retired.revoked && !retired.x_mitre_deprecated && !retired.deprecated) return;

            state.changelogDiff.retired[categoryKey].add(extId);
            state.changelogDiff.retiredDetails[categoryKey].push({
                id: extId,
                name: retired.name || obj.name || extId,
                type: typeNames[categoryKey],
                status: retired.revoked ? 'Revoked' : 'Deprecated'
            });
        });

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

    const sectionConfigs = [
        ['Techniques', diff.details.techniques, 'bi-grid-3x3-gap-fill', 'NEW', 'bg-success'],
        ['Groups', diff.details.groups, 'bi-people-fill', 'NEW', 'bg-success'],
        ['Software', diff.details.software, 'bi-cpu-fill', 'NEW', 'bg-success'],
        ['Mitigations', diff.details.mitigations, 'bi-shield-fill-check', 'NEW', 'bg-success'],
        ['Tactics', diff.details.tactics, 'bi-layers-fill', 'NEW', 'bg-success'],
        ['Moved Techniques', diff.movedDetails.techniques, 'bi-arrow-left-right', 'MOVED', 'bg-warning'],
        ['Modified Techniques', diff.modifiedDetails.techniques, 'bi-pencil-square', 'MODIFIED', 'bg-info'],
        ['Modified Groups', diff.modifiedDetails.groups, 'bi-pencil-square', 'MODIFIED', 'bg-info'],
        ['Modified Software', diff.modifiedDetails.software, 'bi-pencil-square', 'MODIFIED', 'bg-info'],
        ['Modified Mitigations', diff.modifiedDetails.mitigations, 'bi-pencil-square', 'MODIFIED', 'bg-info'],
        ['Retired Techniques', diff.retiredDetails.techniques, 'bi-archive', 'RETIRED', 'bg-secondary'],
        ['Retired Groups', diff.retiredDetails.groups, 'bi-archive', 'RETIRED', 'bg-secondary'],
        ['Retired Software', diff.retiredDetails.software, 'bi-archive', 'RETIRED', 'bg-secondary'],
        ['Retired Mitigations', diff.retiredDetails.mitigations, 'bi-archive', 'RETIRED', 'bg-secondary']
    ];

    const totalsByLabel = sectionConfigs.reduce((acc, [, items, , label]) => {
        acc[label] = (acc[label] || 0) + items.length;
        return acc;
    }, {});
    const totalChanges = Object.values(totalsByLabel).reduce((sum, count) => sum + count, 0);
    const largestSection = sectionConfigs.reduce((largest, config) => config[1].length > largest[1].length ? config : largest, sectionConfigs[0]);

    if (totalChanges > 0) {
        html += `
            <div class="changelog-summary-grid">
                <div class="changelog-summary-card"><span>${totalChanges}</span><small>Total changes</small></div>
                <div class="changelog-summary-card"><span>${totalsByLabel.NEW || 0}</span><small>New</small></div>
                <div class="changelog-summary-card"><span>${totalsByLabel.MOVED || 0}</span><small>Moved</small></div>
                <div class="changelog-summary-card"><span>${totalsByLabel.MODIFIED || 0}</span><small>Modified</small></div>
                <div class="changelog-summary-card"><span>${totalsByLabel.RETIRED || 0}</span><small>Retired</small></div>
                <div class="changelog-summary-card changelog-summary-wide"><span>${largestSection[1].length}</span><small>Largest section: ${escapeHtml(largestSection[0])}</small></div>
            </div>
        `;
    }

    let openedFirst = false;

    const buildSection = (title, items, icon, label = 'NEW', className = 'bg-success') => {
        if (items.length === 0) return '';
        
        // Sort by ID
        items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        const shouldOpen = !openedFirst;
        openedFirst = true;
        
        return `
            <details class="changelog-framework-section" ${shouldOpen ? 'open' : ''}>
                <summary>
                    <span><i class="${icon} mr-1"></i>${escapeHtml(title)}</span>
                    <span class="changelog-section-meta"><strong>${items.length}</strong> ${escapeHtml(label.toLowerCase())}</span>
                </summary>
                <div class="changelog-framework-list">
                    ${items.map(item => `
                        <div class="changelog-framework-row">
                            <div class="changelog-framework-main">
                                <span class="changelog-framework-id">${escapeHtml(item.id)}</span>
                                <span class="changelog-framework-name">${escapeHtml(item.name)}</span>
                                ${item.from || item.to ? `<div class="changelog-framework-delta">${item.from ? `From: ${escapeHtml(item.from)}` : ''}${item.from && item.to ? ' -> ' : ''}${item.to ? `To: ${escapeHtml(item.to)}` : ''}</div>` : ''}
                            </div>
                            <span class="badge ${className} text-xxs changelog-framework-badge">${escapeHtml(item.status || label)}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        `;
    };

    html += sectionConfigs.map(config => buildSection(...config)).join('');

    if (html === '') {
        html = `
            <div class="text-center py-5">
                <i class="bi bi-check-circle text-success mb-3" style="font-size: 2.5rem;"></i>
                <h5 class="font-bold">No Framework Changes Detected</h5>
                <p class="text-on-surface-secondary text-sm">No added, moved, modified, retired, or deprecated ATT&CK entities were detected in ${diff.currentVersion} compared to ${diff.previousVersion}.</p>
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
