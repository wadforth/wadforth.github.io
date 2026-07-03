/* ============================================
   Landing Page Enhancements
   ============================================ */

export let landingEnhanced = false;
const RECENT_LAYERS_KEY = 'attack-explorer-recent';

function escapeLandingHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getLayerTechniqueRows() {
    return window.state?.currentLayer?.techniques || [];
}

function getTechniqueExternalId(technique) {
    return technique?.techniqueID || technique?.techniqueId || technique?.externalId || technique?.externalID || technique?.id || '';
}

function getStixExternalId(technique) {
    return technique?.external_references?.find(ref => ref?.source_name === 'mitre-attack')?.external_id
        || technique?.external_references?.[0]?.external_id
        || '';
}

function getTacticLabel(shortName) {
    const tactic = window.state?.tactics?.find(item => {
        const externalId = getStixExternalId(item);
        return item?.x_mitre_shortname === shortName || item?.name === shortName || externalId === shortName;
    });
    if (tactic?.name) return tactic.name;
    return String(shortName || 'Unmapped').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function readRecentLayers() {
    try {
        const recent = JSON.parse(localStorage.getItem(RECENT_LAYERS_KEY) || '[]');
        return Array.isArray(recent) ? recent : [];
    } catch {
        return [];
    }
}

function countUniqueQueries(techniques) {
    const seen = new Set();
    techniques.forEach(technique => {
        (technique.queries || []).forEach(query => {
            if (query?.id) seen.add(query.id);
            else if (query?.name || query?.query) seen.add(`${query.name || ''}:${query.query || ''}`);
        });
    });
    return seen.size;
}

function getLayerStats() {
    const state = window.state;
    const layer = state?.currentLayer;
    const techniques = layer ? getLayerTechniqueRows() : [];
    const annotatedIds = new Set(techniques.map(getTechniqueExternalId).filter(Boolean));
    const queries = countUniqueQueries(techniques);
    const totalTechniques = state?.techniques?.length || annotatedIds.size;
    const gaps = Math.max(totalTechniques - annotatedIds.size, 0);
    const coverageValue = totalTechniques ? (annotatedIds.size / totalTechniques) * 100 : 0;
    const topGaps = getTopTacticGaps(annotatedIds);

    return {
        layer,
        techniques,
        annotated: annotatedIds.size,
        queries,
        totalTechniques,
        gaps,
        coverage: totalTechniques ? `${coverageValue.toFixed(1)}%` : '0%',
        topGaps
    };
}

function getTopTacticGaps(annotatedIds) {
    const totals = new Map();
    const covered = new Map();
    const techniques = window.state?.techniques || [];

    techniques.forEach(technique => {
        const externalId = getStixExternalId(technique);
        const phases = technique?.kill_chain_phases || [];
        phases.forEach(phase => {
            if (phase?.kill_chain_name && phase.kill_chain_name !== 'mitre-attack') return;
            const tactic = phase?.phase_name;
            if (!tactic) return;
            totals.set(tactic, (totals.get(tactic) || 0) + 1);
            if (annotatedIds.has(externalId)) covered.set(tactic, (covered.get(tactic) || 0) + 1);
        });
    });

    return Array.from(totals.entries())
        .map(([tactic, total]) => ({
            tactic,
            label: getTacticLabel(tactic),
            total,
            covered: covered.get(tactic) || 0,
            gaps: Math.max(total - (covered.get(tactic) || 0), 0)
        }))
        .filter(item => item.gaps > 0)
        .sort((a, b) => b.gaps - a.gaps)
        .slice(0, 3);
}

function openContinueLayer() {
    if (window.state?.currentLayer) {
        if (window.showWorkspace) window.showWorkspace();
        return;
    }

    const firstRecent = document.querySelector('#recent-layers-list .recent-layer-card');
    if (firstRecent) firstRecent.click();
}

function updateContinueButton() {
    const continueBtn = document.getElementById('btn-continue-layer');
    if (!continueBtn) return;

    const layer = window.state?.currentLayer;
    const latestRecent = readRecentLayers()[0];
    const hasTarget = Boolean(layer || latestRecent);
    const layerName = layer?.name || latestRecent?.name || '';
    continueBtn.classList.toggle('hidden', !hasTarget);
    continueBtn.disabled = !hasTarget;
    continueBtn.innerHTML = `<i class="bi bi-arrow-return-right"></i><span class="landing-continue-copy"><span class="landing-continue-main">Continue Layer</span>${layerName ? `<span class="landing-continue-name">${escapeLandingHtml(layerName)}</span>` : ''}</span>`;
    continueBtn.title = hasTarget ? `Open ${layerName || 'the most recent working layer'}` : 'No recent layer available';
}

export function renderLandingWorkspaceSummary() {
    const container = document.getElementById('landing-workspace-summary');
    if (!container) return;

    const stats = getLayerStats();
    const latestRecent = readRecentLayers()[0];
    const layerLabel = stats.layer?.name || latestRecent?.name || 'No layer';
    const layerAction = stats.layer || latestRecent ? 'continue' : 'new';
    const versionLabel = window.state?.currentVersion || stats.layer?.versions?.attack || stats.layer?.attackVersion || latestRecent?.attackVersion || 'ready';

    container.className = 'landing-summary-grid landing-summary-compact';
    container.innerHTML = `
        <button type="button" class="landing-summary-card" data-landing-open-view="matrix">
            <span>Coverage</span><strong class="summary-risk">${escapeLandingHtml(stats.coverage)}</strong><em>${stats.annotated}/${stats.totalTechniques || 0} mapped</em>
        </button>
        <button type="button" class="landing-summary-card" data-landing-open-view="queries">
            <span>Queries</span><strong class="summary-good">${stats.queries}</strong><em>linked evidence</em>
        </button>
        <button type="button" class="landing-summary-card" data-landing-open-view="matrix">
            <span>Gaps</span><strong class="summary-warn">${stats.gaps}</strong><em>${escapeLandingHtml(stats.topGaps[0]?.label || 'Load ATT&CK data')}</em>
        </button>
        <button type="button" class="landing-summary-card" data-landing-action="${layerAction}" title="${escapeLandingHtml(layerLabel)}">
            <span>Layer</span><strong class="landing-layer-name">${escapeLandingHtml(layerLabel)}</strong><em>${escapeLandingHtml(versionLabel)}</em>
        </button>
    `;

    renderLandingNextSteps(stats);
    updateContinueButton();
}

function renderLandingNextSteps(stats = getLayerStats()) {
    const container = document.getElementById('landing-next-steps');
    if (!container) return;

    const primaryGap = stats.topGaps[0];
    const secondaryGap = stats.topGaps[1];

    if (!stats.layer) {
        const latestRecent = readRecentLayers()[0];
        const firstAction = latestRecent ? 'continue' : 'new';
        const firstTitle = latestRecent ? 'Continue saved coverage' : 'Start a clean Enterprise layer';
        const firstDetail = latestRecent ? `Open ${latestRecent.name || 'the latest layer'} from recent work.` : 'Create a new working layer using the selected ATT&CK version.';
        const firstStatus = latestRecent ? 'resume' : 'new';
        container.innerHTML = `
            <button type="button" class="landing-journey-item" data-landing-action="${firstAction}">
                <i>01</i>
                <div><strong>${escapeLandingHtml(firstTitle)}</strong><span>${escapeLandingHtml(firstDetail)}</span></div>
                <span class="status good">${escapeLandingHtml(firstStatus)}</span>
            </button>
            <button type="button" class="landing-journey-item" data-landing-action="import">
                <i>02</i>
                <div><strong>Import an ATT&amp;CK layer</strong><span>Bring in existing coverage, queries and report metadata.</span></div>
                <span class="status query">JSON</span>
            </button>
            <button type="button" class="landing-journey-item" data-landing-open-view="matrix">
                <i>03</i>
                <div><strong>Browse the matrix baseline</strong><span>Load Enterprise ATT&amp;CK and start mapping from the matrix.</span></div>
                <span class="status good">matrix</span>
            </button>
        `;
        return;
    }

    container.innerHTML = `
        <button type="button" class="landing-journey-item" data-landing-open-view="matrix">
            <i>01</i>
            <div><strong>${escapeLandingHtml(primaryGap ? `Review ${primaryGap.label}` : 'Review mapped coverage')}</strong><span>${primaryGap ? `${primaryGap.gaps} unmapped techniques in the largest tactic gap.` : `${stats.annotated} mapped techniques are ready for triage.`}</span></div>
            <span class="status bad">gap</span>
        </button>
        <button type="button" class="landing-journey-item" data-landing-open-view="queries">
            <i>02</i>
            <div><strong>Build query evidence</strong><span>${stats.queries ? `${stats.queries} unique queries linked. Validate and archive stale detections.` : 'No queries linked yet. Add detection evidence to mapped techniques.'}</span></div>
            <span class="status query">queries</span>
        </button>
        <button type="button" class="landing-journey-item" data-landing-open-view="reports">
            <i>03</i>
            <div><strong>Publish coverage narrative</strong><span>${secondaryGap ? `Include ${escapeLandingHtml(secondaryGap.label)} as a secondary gap in the report.` : 'Generate the current posture report from this layer.'}</span></div>
            <span class="status good">report</span>
        </button>
    `;
}

function openLandingView(view) {
    const hasLayer = Boolean(window.state?.currentLayer);
    if (!hasLayer) {
        const createNewBtn = document.getElementById('btn-create-new');
        if (createNewBtn) createNewBtn.click();
    } else if (window.showWorkspace) {
        window.showWorkspace();
    }

    const navigateWhenReady = () => {
        const target = document.querySelector(`[data-view="${view}"]`);
        if (target) target.click();
    };

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (window.state?.currentLayer || attempts > 30) {
            clearInterval(timer);
            navigateWhenReady();
        }
    }, 100);
}

function runLandingMatrixSearch(query) {
    openLandingView('matrix');

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        const matrixSearch = document.getElementById('matrix-search-input');
        if (matrixSearch || attempts > 30) {
            clearInterval(timer);
            if (matrixSearch) {
                matrixSearch.value = query;
                matrixSearch.dispatchEvent(new Event('input'));
            }
        }
    }, 100);
}

export function enhanceLandingPage() {
    if (landingEnhanced) {
        renderLandingWorkspaceSummary();
        updateContinueButton();
        return;
    }
    landingEnhanced = true;

    renderLandingWorkspaceSummary();

    const searchInput = document.getElementById('landing-universal-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                const query = searchInput.value.trim();
                runLandingMatrixSearch(query);
            }
        });
    }

    const landingView = document.getElementById('landing-view');
    landingView?.addEventListener('click', (e) => {
        const actionButton = e.target.closest('[data-landing-action]');
        if (actionButton) {
            const action = actionButton.dataset.landingAction;
            if (action === 'continue') openContinueLayer();
            if (action === 'import') document.getElementById('btn-import-layer')?.click();
            if (action === 'new') document.getElementById('btn-create-new')?.click();
            return;
        }

        const viewButton = e.target.closest('[data-landing-open-view]');
        if (viewButton) openLandingView(viewButton.dataset.landingOpenView || 'matrix');
    });

    document.addEventListener('stix-data-updated', renderLandingWorkspaceSummary);
}

// Legacy Window Bindings
window.landingEnhanced = landingEnhanced;
window.enhanceLandingPage = enhanceLandingPage;
window.renderLandingWorkspaceSummary = renderLandingWorkspaceSummary;
