// ============================================
// SigmaHQ Rules Explorer Module - v3.0
// Persistent IndexedDB Cache + Auto-Sync
// Web Worker for heavy YAML parsing/filtering
// ============================================
// Architecture:
//   1. IndexedDB stores all 3,000+ rules persistently (survives refresh)
//   2. Auto-connects to GitHub on first visit, caches everything
//   3. Re-syncs every 24h, detecting new/modified rules
//   4. On-demand hydration caches YAML permanently
//   5. Linked Sigma rules always resolve (never lost on refresh)
//   6. Web Worker handles YAML parsing and filtering off main thread

// ---- Section 1: State & Constants ----

export let sigmaRules = [];
export let selectedSigmaIdx = null;
export let sigmaSearchQuery = "";
export let selectedSigmaLogsource = "all";
export let selectedSigmaTactic = "all";
export let selectedSigmaLevel = "all";
export let selectedSigmaCoverage = "all";
export let selectedSigmaProduct = "all";
export let selectedSigmaSort = "default";
export let selectedSigmaDate = "all";
export let isLiveSigmaConnected = false;

export const SIGMA_PAGINATION_CHUNK = 20;
export let currentVisibleCount = 20;

export let sigmaFilteredCache = [];
export let sigmaSearchDebounceTimer = null;

// Web Worker for heavy operations
export let sigmaWorker = null;
export let workerPendingParses = new Map(); // ruleId -> resolve/reject
export let workerPendingFilter = null;

export function initSigmaWorker() {
    try {
        sigmaWorker = new Worker(new URL('sigma-worker.js', import.meta.url));
        sigmaWorker.onmessage = function(e) {
            const { type, rule, ruleId, error, filtered, total, count } = e.data;
            
            switch (type) {
                case 'INIT_COMPLETE':
                    console.log(`Sigma Worker initialized with ${count} rules`);
                    break;
                    
                case 'PARSE_SUCCESS':
                    const parseResolve = workerPendingParses.get(rule.id);
                    if (parseResolve) {
                        workerPendingParses.delete(rule.id);
                        parseResolve(rule);
                    }
                    break;
                    
                case 'PARSE_ERROR':
                    const parseReject = workerPendingParses.get(ruleId);
                    if (parseReject) {
                        workerPendingParses.delete(ruleId);
                        parseReject(new Error(error));
                    }
                    break;
                    
                case 'FILTER_COMPLETE':
                    if (workerPendingFilter) {
                        const resolve = workerPendingFilter;
                        workerPendingFilter = null;
                        resolve({ filtered, total });
                    }
                    break;
            }
        };
        sigmaWorker.onerror = function(err) {
            console.warn('Sigma Worker error, falling back to main thread:', err);
            sigmaWorker = null;
        };
    } catch (err) {
        console.warn('Web Worker not available, falling back to main thread:', err);
        sigmaWorker = null;
    }
}

// ---- Section 2: IndexedDB Persistent Cache Layer ----
// (Moved to js/utils/db.js)

// ---- Section 3: Path/Title Helpers ----
// (Moved to js/intel/sigma-parser.js)

// ---- Section 4: Init & Cache Management ----

export async function initSigmaModule() {
    initSigmaWorker();
    
    try {
        await openSigmaDB();
    } catch (err) {
        console.warn("IndexedDB unavailable, running in memory-only mode:", err);
    }

    try {
        // 1. Try to restore from IndexedDB cache first
        const cachedRules = await idbGetAll('rules');
        const lastSync = await idbGetMeta('lastSyncTimestamp');

        // Purge any old offline baseline rules from cache
        const cleanRules = (cachedRules || []).filter(r => !r.isOfflineBaseline);
        if (cleanRules.length !== (cachedRules || []).length) {
            console.log(`Purged ${(cachedRules || []).length - cleanRules.length} offline baseline rules from cache.`);
            await idbBatchPut('rules', cleanRules);
        }

        if (cleanRules && cleanRules.length > 100) {
            // We have a substantial cache — restore it instantly
            sigmaRules = cleanRules;
            window.sigmaRules = sigmaRules;
            isLiveSigmaConnected = true;
            console.log(`Restored ${sigmaRules.length} Sigma rules from IndexedDB cache.`);
            syncRulesToWorker();
            updateSyncButton('synced');
            bindSigmaEvents();
            populateProductFilter();
            await refreshSigmaFilteredCache();
            renderSigmaStats();
            renderSigmaList();
            renderSigmaDetails();
            updateHydrationStatus();

            // Check if cache is stale (>24h) — if so, refresh in background
            if (lastSync && (Date.now() - lastSync) > SIGMA_CACHE_TTL) {
                console.log("Cache is stale (>24h), refreshing in background...");
                setTimeout(() => backgroundResync(), 2000);
            }
            startAutoSyncCountdown();

            // Auto-hydrate any remaining virtual rules from cache
            const remainingVirtual = sigmaRules.filter(r => r.isVirtual && (!r.hydratedAt || r.yaml === '')).length;
            if (remainingVirtual > 0) {
                setTimeout(() => autoHydrateAllVirtualRules(), 3000);
            }
            return;
        }

        // No cache — show empty state and auto-connect to GitHub
        bindSigmaEvents();
        await refreshSigmaFilteredCache();
        renderSigmaStats();
        renderSigmaList();
        renderSigmaDetails();

        // Auto-connect to GitHub to fetch all rules
        setTimeout(() => autoSyncFromGitHub(), 500);
        startAutoSyncCountdown();

    } catch (err) {
        console.error("Error initializing SigmaHQ explorer:", err);
        bindSigmaEvents();
    }
}

export function syncRulesToWorker() {
    if (sigmaWorker && sigmaRules.length > 0) {
        sigmaWorker.postMessage({
            type: 'INIT_RULES',
            payload: { rules: sigmaRules }
        });
    }
}

export function updateWorkerRule(rule) {
    if (sigmaWorker) {
        sigmaWorker.postMessage({
            type: 'UPDATE_RULE',
            payload: { rule }
        });
    }
}





// ---- Section 5: GitHub Sync Engine ----

export async function autoSyncFromGitHub() {
    const btn = document.getElementById('btn-load-live-sigma');
    if (isLiveSigmaConnected && btn && btn.classList.contains('btn-success')) {
        // Already connected and no forced resync — skip
        return;
    }
    await executeSyncFromGitHub(false);
}

export async function backgroundResync() {
    await executeSyncFromGitHub(true);
}

export async function executeSyncFromGitHub(isBackground) {
    const btn = document.getElementById('btn-load-live-sigma');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm mr-1" role="status"></span> ${isBackground ? 'Updating...' : 'Syncing...'}`;
    }

    showSigmaSyncProgress(true, 0, isBackground ? 'Checking for new SigmaHQ rules...' : 'Connecting to SigmaHQ GitHub repository...');

    try {
        showSigmaSyncProgress(true, 10, 'Fetching master git tree (recursive)...');

        const treeUrl = 'https://api.github.com/repos/SigmaHQ/sigma/git/trees/master?recursive=1';
        let data;

        // IMPORTANT: Always use native fetch for api.github.com (full CORS support).
        // Do NOT route through fetchViaProxy — CORS proxies mangle JSON API responses.
        const resp = await fetch(treeUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (resp.status === 403) {
            const rateLimitReset = resp.headers.get('X-RateLimit-Reset');
            const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString() : 'unknown';
            throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}. Try again later.`);
        }

        if (!resp.ok) throw new Error(`GitHub API returned HTTP ${resp.status}`);

        data = await resp.json();

        showSigmaSyncProgress(true, 40, 'Parsing tree structure...');

        if (!data || !Array.isArray(data.tree)) {
            console.error('Unexpected GitHub API response:', JSON.stringify(data).substring(0, 500));
            throw new Error('GitHub API returned unexpected format. May be rate-limited.');
        }

        let allRulePaths = [];

        // If the tree is truncated, we need to fetch sub-trees for rule directories
        if (data.truncated) {
            console.warn('GitHub tree response was truncated. Fetching sub-trees for rule directories...');
            showSigmaSyncProgress(true, 45, 'Tree truncated — fetching sub-trees...');

            // First, collect rule directory paths from the partial tree
            const ruleDirs = new Set();
            data.tree.forEach(item => {
                if (item.type === 'tree' && (item.path.startsWith('rules/') || item.path.startsWith('rules-'))) {
                    ruleDirs.add(item.path);
                }
            });

            // Fetch each sub-tree
            for (const dir of ruleDirs) {
                try {
                    const subResp = await fetch(`https://api.github.com/repos/SigmaHQ/sigma/git/trees/master:${dir}?recursive=1`, {
                        headers: { 'Accept': 'application/vnd.github.v3+json' }
                    });
                    if (subResp.ok) {
                        const subData = await subResp.json();
                        if (subData.tree) {
                            subData.tree.forEach(subItem => {
                                allRulePaths.push({
                                    path: `${dir}/${subItem.path}`,
                                    sha: subItem.sha,
                                    type: subItem.type
                                });
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to fetch sub-tree for ${dir}:`, e);
                }
            }

            // Also include any rules already in the main tree
            data.tree.forEach(item => {
                if ((item.path.startsWith('rules/') || item.path.startsWith('rules-')) &&
                    item.type === 'blob' &&
                    (item.path.endsWith('.yml') || item.path.endsWith('.yaml'))) {
                    allRulePaths.push({ path: item.path, sha: item.sha, type: item.type });
                }
            });
        } else {
            // Not truncated — filter directly
            allRulePaths = data.tree.filter(item =>
                (item.path.startsWith('rules/') || item.path.startsWith('rules-')) &&
                item.type === 'blob' &&
                (item.path.endsWith('.yml') || item.path.endsWith('.yaml'))
            ).map(item => ({ path: item.path, sha: item.sha, type: item.type }));
        }

        showSigmaSyncProgress(true, 55, `Indexing ${allRulePaths.length.toLocaleString()} rule paths...`);

        // Deduplicate allRulePaths by path to prevent duplicate Total rules
        const pathSet = new Map();
        allRulePaths.forEach(item => {
            if (!pathSet.has(item.path)) {
                pathSet.set(item.path, item);
            }
        });
        allRulePaths = [...pathSet.values()];

        // Purge any old offline baseline rules from memory
        sigmaRules = sigmaRules.filter(r => !r.isOfflineBaseline);
        window.sigmaRules = sigmaRules;

        // Build a lookup of existing rules by ID for fast merge
        const existingMap = new Map();
        sigmaRules.forEach(r => existingMap.set(r.id, r));

        // Also map by path for live rules
        sigmaRules.forEach(r => { if (r.path) existingMap.set(r.path, r); });

        let newCount = 0;
        let updatedCount = 0;
        const now = Date.now();
        const previousSyncTimestamp = await idbGetMeta('previousSyncTimestamp') || 0;

        const totalToProcess = allRulePaths.length;
        const batchSize = 300;

        for (let i = 0; i < allRulePaths.length; i += batchSize) {
            const batch = allRulePaths.slice(i, i + batchSize);

            batch.forEach(item => {
                const existing = existingMap.get(item.path);

                if (!existing) {
                    // New rule
                    const logsrc = parseLogsourceFromPath(item.path);
                    const newRule = {
                        id: item.path,
                        path: item.path,
                        sha: item.sha,
                        title: cleanTitleFromPath(item.path),
                        description: "Live rule from SigmaHQ. Click to fetch detection contents.",
                        logsource: logsrc,
                        technique_id: '',
                        tactic: '',
                        yaml: '',
                        isVirtual: true,
                        url: `https://github.com/SigmaHQ/sigma/blob/master/${item.path}`,
                        firstSeenAt: now,
                        hydratedAt: null,
                        level: '',
                        ruleDate: '',
                        ruleModified: '',
                        ruleStatus: '',
                        detectedAt: now,
                        detectedType: 'new'
                    };
                    sigmaRules.push(newRule);
                    existingMap.set(item.path, newRule);
                    newCount++;
                } else {
                    // Existing rule — check if SHA changed (modified upstream)
                    if (existing.sha && item.sha !== existing.sha) {
                        existing.sha = item.sha;
                        existing.isVirtual = true; // needs re-hydration
                        existing.yaml = '';
                        existing.hydratedAt = null;
                        existing.isUpdated = true;
                        existing.detectedAt = now;
                        existing.detectedType = 'modified';
                        updatedCount++;
                    } else if (!existing.sha) {
                        existing.sha = item.sha;
                    }
                }
            });

            const pct = 55 + Math.round(((i + batch.length) / totalToProcess) * 35);
            showSigmaSyncProgress(true, Math.min(pct, 92), `Indexed ${Math.min(i + batch.length, totalToProcess).toLocaleString()} / ${totalToProcess.toLocaleString()} rules...`);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        showSigmaSyncProgress(true, 95, 'Persisting to local cache...');

        // Track which Sigma directories were found
        const sigmaDirs = new Set();
        allRulePaths.forEach(item => {
            const parts = item.path.split('/');
            if (parts.length > 1) {
                sigmaDirs.add(parts[0] + '/');
            }
        });
        const sortedDirs = [...sigmaDirs].sort();
        console.log(`SigmaHQ directories indexed: ${sortedDirs.join(', ')}`);
        await idbSetMeta('sigmaDirectories', sortedDirs);

        // Save all rules to IndexedDB
        await idbBatchPut('rules', sigmaRules);
        await idbSetMeta('lastSyncTimestamp', now);
        await idbSetMeta('previousSyncTimestamp', previousSyncTimestamp);
        await idbSetMeta('totalRulesCount', sigmaRules.length);

        showSigmaSyncProgress(true, 100, `Synced! ${newCount > 0 ? newCount + ' new rules' : 'Up to date'}${updatedCount > 0 ? ', ' + updatedCount + ' modified' : ''}`);

        isLiveSigmaConnected = true;
        window.sigmaRules = sigmaRules;
        updateSyncButton('synced');
        populateProductFilter();
        syncRulesToWorker();

        if (!isBackground) {
            showToast(`SigmaHQ synced! ${sigmaRules.length.toLocaleString()} rules cached from ${sortedDirs.length} directories.${newCount > 0 ? ' ' + newCount + ' new.' : ''}`, 'success');
        } else if (newCount > 0) {
            showToast(`SigmaHQ updated: ${newCount} new rule${newCount > 1 ? 's' : ''} found.`, 'info');
        }

        setTimeout(() => showSigmaSyncProgress(false), 3000);

        selectedSigmaIdx = null;
        currentVisibleCount = SIGMA_PAGINATION_CHUNK;
        await refreshSigmaFilteredCache();
        renderSigmaStats();
        renderSigmaList();
        renderSigmaDetails();
        updateHydrationStatus();

        // Start auto-sync countdown
        startAutoSyncCountdown();

        // Auto-hydrate all virtual rules in background
        setTimeout(() => autoHydrateAllVirtualRules(), 3000);

    } catch (err) {
        console.error("Failed to sync SigmaHQ:", err);
        showSigmaSyncProgress(false);

        if (sigmaRules.length > 100) {
            // We have cached data, just warn
            updateSyncButton('cached');
            if (!isBackground) showToast("GitHub API unavailable. Using cached rules.", "warning");
        } else {
            updateSyncButton('error');
            if (!isBackground) showToast("Failed to connect to GitHub. Please try again.", "error");
        }
    }
}

export function updateSyncButton(state) {
    const btn = document.getElementById('btn-load-live-sigma');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('btn-outline-primary', 'btn-success', 'btn-warning', 'btn-danger');

    switch (state) {
        case 'synced':
            btn.classList.add('btn-success');
            btn.innerHTML = `<i class="bi bi-cloud-check-fill mr-1"></i> Synced · ${sigmaRules.length.toLocaleString()} Rules`;
            btn.title = `Last synced: ${new Date().toLocaleString()}. Click to force refresh.`;
            break;
        case 'cached':
            btn.classList.add('btn-warning');
            btn.innerHTML = `<i class="bi bi-cloud-slash mr-1"></i> Offline · ${sigmaRules.length.toLocaleString()} Cached`;
            btn.title = 'Using cached rules. Click to retry sync.';
            break;
        case 'error':
            btn.classList.add('btn-outline-primary');
            btn.innerHTML = `<i class="bi bi-exclamation-triangle mr-1"></i> Retry Sync`;
            btn.title = 'Connection failed. Click to retry.';
            break;
    }
}

// ---- Section 5b: Auto-Sync Countdown (1st of every month) ----

export let sigmaAutoSyncTimer = null;

export function getNextMonthFirst() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return nextMonth;
}

export function formatCountdown(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export function startAutoSyncCountdown() {
    stopAutoSyncCountdown();

    const nextFirst = getNextMonthFirst();
    const now = new Date();
    const diff = nextFirst - now;

    if (diff <= 0) {
        // It's the 1st — trigger auto-sync
        console.log('Auto-sync: 1st of month detected, triggering background sync...');
        backgroundResync();
        return;
    }

    const countdownEl = document.getElementById('sigma-autosync-countdown');
    if (countdownEl) {
        countdownEl.innerHTML = `<i class="bi bi-clock"></i> Next auto-sync: ${formatCountdown(diff)}`;
        countdownEl.classList.remove('hidden');
    }

    sigmaAutoSyncTimer = setInterval(() => {
        const remaining = getNextMonthFirst() - new Date();
        if (remaining <= 0) {
            stopAutoSyncCountdown();
            console.log('Auto-sync: 1st of month detected, triggering background sync...');
            backgroundResync();
            if (countdownEl) countdownEl.classList.add('hidden');
            return;
        }
        if (countdownEl) {
            countdownEl.innerHTML = `<i class="bi bi-clock"></i> Next auto-sync: ${formatCountdown(remaining)}`;
        }
    }, 60000); // Update every minute
}

export function stopAutoSyncCountdown() {
    if (sigmaAutoSyncTimer) {
        clearInterval(sigmaAutoSyncTimer);
        sigmaAutoSyncTimer = null;
    }
}

// ---- Section 6: Sync Progress Bar ----

export function showSigmaSyncProgress(visible, percent, message) {
    const container = document.getElementById('sigma-sync-container');
    if (!container) return;

    if (!visible) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    const bar = container.querySelector('.sigma-sync-bar-inner');
    const statusText = container.querySelector('.sigma-sync-status-text');
    const pctText = container.querySelector('.sigma-sync-pct');

    if (bar) bar.style.width = `${percent}%`;
    if (statusText) statusText.textContent = message || '';
    if (pctText) pctText.textContent = `${percent}%`;
}

// ---- Section 6b: Lazy On-Demand Hydration ----

// Hydration is now fully lazy - only fetches YAML when a rule is clicked or linked.
// This eliminates thousands of unnecessary API requests and keeps the page fast.
// Rules show minimal metadata (path, title, technique_id) from the tree fetch,
// and full YAML is loaded only on interaction.

export function updateHydrationStatus() {
    const el = document.getElementById('sigma-hydrate-status');
    if (!el) return;

    const hydratedCount = sigmaRules.filter(r => r.isVirtual === false && r.yaml && r.yaml.length > 50).length;
    const total = sigmaRules.length;

    if (hydratedCount === total) {
        el.innerHTML = `<i class="bi bi-check-circle-fill"></i> All ${hydratedCount.toLocaleString()} rules fully hydrated`;
        el.className = 'sigma-hydrate-status sigma-hydrate-complete';
    } else {
        el.innerHTML = `<i class="bi bi-database"></i> ${hydratedCount.toLocaleString()} / ${total.toLocaleString()} hydrated (click rules to load details)`;
        el.className = 'sigma-hydrate-status sigma-hydrate-partial';
    }
}

// ---- Section 7: On-Demand Hydration (with cache persistence) ----

export async function fetchVirtualRuleContent(rule) {
    if (!rule || !rule.isVirtual) return;

    try {
        const rawUrl = `https://raw.githubusercontent.com/SigmaHQ/sigma/master/${rule.path}`;
        let rawContent;

        if (typeof fetchViaProxy === 'function') {
            rawContent = await fetchViaProxy(rawUrl);
        } else {
            const resp = await fetch(rawUrl);
            if (!resp.ok) throw new Error('Raw fetch failed');
            rawContent = await resp.text();
        }

        if (!rawContent || rawContent.trim().length === 0) throw new Error('Empty content');

        rule.yaml = rawContent;

        // Use Web Worker for parsing if available
        if (sigmaWorker) {
            return new Promise((resolve, reject) => {
                workerPendingParses.set(rule.id, (parsedRule) => {
                    // Apply parsed results back to original rule object
                    Object.assign(rule, parsedRule);
                    idbPut('rules', rule).then(() => resolve());
                });
                
                sigmaWorker.postMessage({
                    type: 'PARSE_YAML',
                    payload: { rule: JSON.parse(JSON.stringify(rule)) }
                });
                
                // Timeout fallback after 10 seconds
                setTimeout(() => {
                    if (workerPendingParses.has(rule.id)) {
                        workerPendingParses.delete(rule.id);
                        parseYAMLInMainThread(rule);
                        idbPut('rules', rule).then(() => resolve());
                    }
                }, 10000);
            });
        } else {
            // Fallback to main thread parsing
            parseYAMLInMainThread(rule);
            await idbPut('rules', rule);
        }

    } catch (err) {
        console.error(`Failed to hydrate "${rule.title}":`, err);
        rule.yaml = `error: Failed to load YAML.\nurl: ${rule.url}`;
        rule.description = "Connection error. The API may be rate-limited.";
        rule.technique_id = "N/A";
        rule.tactic = "Unknown";
        rule.isVirtual = false;
        rule.hydratedAt = Date.now();
    }
}



export async function autoHydrateAllVirtualRules() {
    const virtualRules = sigmaRules.filter(r => r.isVirtual && (!r.hydratedAt || r.yaml === ''));
    if (virtualRules.length === 0) return;

    console.log(`Auto-hydrating ${virtualRules.length} virtual Sigma rules in background...`);

    const batchSize = 10;
    const delayBetweenBatches = 2000;
    let hydratedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < virtualRules.length; i += batchSize) {
        const batch = virtualRules.slice(i, i + batchSize);
        const promises = batch.map(async (rule) => {
            try {
                const rawUrl = `https://raw.githubusercontent.com/SigmaHQ/sigma/master/${rule.path}`;
                let rawContent;

                if (typeof fetchViaProxy === 'function') {
                    rawContent = await fetchViaProxy(rawUrl);
                } else {
                    const resp = await fetch(rawUrl);
                    if (!resp.ok) throw new Error('Raw fetch failed');
                    rawContent = await resp.text();
                }

                if (!rawContent || rawContent.trim().length === 0) throw new Error('Empty content');

                rule.yaml = rawContent;

                if (sigmaWorker) {
                    await new Promise((resolve) => {
                        workerPendingParses.set(rule.id, (parsedRule) => {
                            Object.assign(rule, parsedRule);
                            idbPut('rules', rule).then(() => resolve());
                        });
                        sigmaWorker.postMessage({
                            type: 'PARSE_YAML',
                            payload: { rule: JSON.parse(JSON.stringify(rule)) }
                        });
                        setTimeout(() => {
                            if (workerPendingParses.has(rule.id)) {
                                workerPendingParses.delete(rule.id);
                                parseYAMLInMainThread(rule);
                                idbPut('rules', rule).then(() => resolve());
                            }
                        }, 10000);
                    });
                } else {
                    parseYAMLInMainThread(rule);
                    await idbPut('rules', rule);
                }

                hydratedCount++;
            } catch (err) {
                console.warn(`Auto-hydrate failed for ${rule.path}:`, err.message);
                rule.yaml = `error: Auto-hydrate failed.\nurl: ${rule.url}`;
                rule.isVirtual = false;
                rule.hydratedAt = Date.now();
                await idbPut('rules', rule);
                failedCount++;
            }
        });

        await Promise.allSettled(promises);

        if (i + batchSize < virtualRules.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }

    console.log(`Auto-hydrate complete: ${hydratedCount} hydrated, ${failedCount} failed.`);
    refreshSigmaFilteredCache();
    renderSigmaStats();
    renderSigmaList();
    updateHydrationStatus();
}

export async function manualHydrateAll() {
    const btn = document.getElementById('btn-hydrate-all-sigma');
    const virtualRules = sigmaRules.filter(r => r.isVirtual && (!r.hydratedAt || r.yaml === ''));

    if (virtualRules.length === 0) {
        showToast('All rules are already hydrated and indexed.', 'success');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="bi bi-hourglass-split mr-1"></i> Hydrating... (0/${virtualRules.length})`;
    }

    showSigmaSyncProgress(true, 0, `Hydrating ${virtualRules.length.toLocaleString()} rules...`);

    const batchSize = 10;
    const delayBetweenBatches = 2000;
    let hydratedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < virtualRules.length; i += batchSize) {
        const batch = virtualRules.slice(i, i + batchSize);
        const promises = batch.map(async (rule) => {
            try {
                const rawUrl = `https://raw.githubusercontent.com/SigmaHQ/sigma/master/${rule.path}`;
                let rawContent;

                if (typeof fetchViaProxy === 'function') {
                    rawContent = await fetchViaProxy(rawUrl);
                } else {
                    const resp = await fetch(rawUrl);
                    if (!resp.ok) throw new Error('Raw fetch failed');
                    rawContent = await resp.text();
                }

                if (!rawContent || rawContent.trim().length === 0) throw new Error('Empty content');

                rule.yaml = rawContent;

                if (sigmaWorker) {
                    await new Promise((resolve) => {
                        workerPendingParses.set(rule.id, (parsedRule) => {
                            Object.assign(rule, parsedRule);
                            idbPut('rules', rule).then(() => resolve());
                        });
                        sigmaWorker.postMessage({
                            type: 'PARSE_YAML',
                            payload: { rule: JSON.parse(JSON.stringify(rule)) }
                        });
                        setTimeout(() => {
                            if (workerPendingParses.has(rule.id)) {
                                workerPendingParses.delete(rule.id);
                                parseYAMLInMainThread(rule);
                                idbPut('rules', rule).then(() => resolve());
                            }
                        }, 10000);
                    });
                } else {
                    parseYAMLInMainThread(rule);
                    await idbPut('rules', rule);
                }

                hydratedCount++;
            } catch (err) {
                console.warn(`Hydrate failed for ${rule.path}:`, err.message);
                rule.yaml = `error: Hydrate failed.\nurl: ${rule.url}`;
                rule.isVirtual = false;
                rule.hydratedAt = Date.now();
                await idbPut('rules', rule);
                failedCount++;
            }
        });

        await Promise.allSettled(promises);

        const pct = Math.round(((i + batch.length) / virtualRules.length) * 100);
        if (btn) btn.innerHTML = `<i class="bi bi-cloud-arrow-down mr-1"></i> Hydrating... (${hydratedCount}/${virtualRules.length})`;
        showSigmaSyncProgress(true, pct, `Hydrated ${hydratedCount.toLocaleString()} / ${virtualRules.length.toLocaleString()}...`);

        if (i + batchSize < virtualRules.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }

    showSigmaSyncProgress(true, 100, `Hydrated! ${hydratedCount} rules indexed${failedCount > 0 ? ', ' + failedCount + ' failed' : ''}`);
    refreshSigmaFilteredCache();
    renderSigmaStats();
    renderSigmaList();
    updateHydrationStatus();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-cloud-arrow-down mr-1"></i> Hydrate & Index All`;
    }

    setTimeout(() => showSigmaSyncProgress(false), 3000);
    showToast(`Hydration complete: ${hydratedCount} rules indexed.`, 'success');
}

// ---- Section 8: Coverage Engine ----

export function getSigmaCoverageStatus(rule) {
    if (!state || !state.currentLayer || !state.currentLayer.techniques) return 'gap';
    for (const tech of state.currentLayer.techniques) {
        if (!tech.queries) continue;
        for (const q of tech.queries) {
            if (q.sigmaRuleId) {
                const ids = q.sigmaRuleId.split('|').filter(Boolean);
                if (ids.includes(rule.id)) return 'active';
            }
            if (q.sigmaRuleTitle && q.sigmaRuleTitle === rule.title) return 'active';
        }
    }
    return 'gap';
}

export function getSigmaCoverageStats() {
    let active = 0, gap = 0;
    for (const rule of sigmaRules) {
        if (getSigmaCoverageStatus(rule) === 'active') active++; else gap++;
    }
    return { active, gap, total: sigmaRules.length };
}

// ---- Section 9: Dynamic Filter Helpers ----

export function getUniqueProducts() {
    const products = new Set();
    for (const r of sigmaRules) {
        if (r.logsource && r.logsource.product) products.add(r.logsource.product);
    }
    return [...products].sort();
}

export function populateProductFilter() {
    const sel = document.getElementById('sigma-product-filter');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="all">All Products</option>';
    getUniqueProducts().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        sel.appendChild(opt);
    });
    sel.value = current || 'all';
}

// ---- Section 10: Filtering & Sorting ----

export async function refreshSigmaFilteredCache() {
    // Build coverage map for worker
    const coverageMap = {};
    for (const rule of sigmaRules) {
        coverageMap[rule.id] = getSigmaCoverageStatus(rule);
    }
    
    if (sigmaWorker && sigmaRules.length > 500) {
        // Use worker for large rule sets
        return new Promise((resolve) => {
            workerPendingFilter = (result) => {
                sigmaFilteredCache = result.filtered;
                applySigmaSort(); // Sort is fast, keep on main thread for responsiveness
                resolve();
            };
            
            sigmaWorker.postMessage({
                type: 'FILTER_AND_SORT',
                payload: {
                    rules: sigmaRules,
                    filters: {
                        searchQuery: sigmaSearchQuery,
                        logsource: selectedSigmaLogsource,
                        tactic: selectedSigmaTactic,
                        level: selectedSigmaLevel,
                        coverage: selectedSigmaCoverage,
                        product: selectedSigmaProduct,
                        date: selectedSigmaDate
                    },
                    coverageMap,
                    sort: selectedSigmaSort
                }
            });
            
            // Timeout fallback after 5 seconds
            setTimeout(() => {
                if (workerPendingFilter) {
                    workerPendingFilter = null;
                    refreshSigmaFilteredCacheSync(coverageMap);
                    resolve();
                }
            }, 5000);
        });
    } else {
        // Main thread for smaller rule sets
        refreshSigmaFilteredCacheSync(coverageMap);
    }
}

export function refreshSigmaFilteredCacheSync(coverageMap) {
    sigmaFilteredCache = sigmaRules.filter(rule => {
        // Text search
        const q = sigmaSearchQuery;
        const matchText = !q ||
            rule.title.toLowerCase().includes(q) ||
            rule.description.toLowerCase().includes(q) ||
            (rule.technique_id && rule.technique_id.toLowerCase().includes(q)) ||
            (rule.tactic && rule.tactic.toLowerCase().includes(q)) ||
            (rule.yaml && rule.yaml.toLowerCase().includes(q));

        // Logsource
        const matchLog = selectedSigmaLogsource === 'all' ||
            (rule.logsource && rule.logsource.category === selectedSigmaLogsource);

        // Tactic
        const matchTactic = selectedSigmaTactic === 'all' ||
            (rule.tactic && rule.tactic.toLowerCase() === selectedSigmaTactic.toLowerCase());

        // Level
        const rLevel = rule.level || (rule.isVirtual ? '' : extractLevelFromYaml(rule.yaml));
        const matchLevel = selectedSigmaLevel === 'all' || rLevel === selectedSigmaLevel;

        // Coverage
        const cov = coverageMap[rule.id] || 'gap';
        const matchCov = selectedSigmaCoverage === 'all' || cov === selectedSigmaCoverage;

        // Product
        const matchProd = selectedSigmaProduct === 'all' ||
            (rule.logsource && rule.logsource.product === selectedSigmaProduct);

        // Date filter
        let matchDate = true;
        if (selectedSigmaDate === 'new') {
            matchDate = rule.detectedType === 'new' || rule.detectedType === 'modified';
        }

        return matchText && matchLog && matchTactic && matchLevel && matchCov && matchProd && matchDate;
    });

    // Apply sorting
    applySigmaSort();
}

export function getEffectiveDate(rule) {
    // Use the latest of modified or date
    const modified = rule.ruleModified ? parseSigmaDate(rule.ruleModified) : 0;
    const created = rule.ruleDate ? parseSigmaDate(rule.ruleDate) : 0;
    const latest = Math.max(modified, created);
    if (latest > 0) return latest;
    // Unhydrated rules have no date — return 0 so they go to "Unindexed"
    return 0;
}

export function getSeverityRank(rule) {
    const level = rule.level || extractLevelFromYaml(rule.yaml);
    const ranks = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 };
    return ranks[level] || 0;
}

export function applySigmaSort() {
    switch (selectedSigmaSort) {
        case 'az':
            sigmaFilteredCache.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'za':
            sigmaFilteredCache.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'severity-desc':
            sigmaFilteredCache.sort((a, b) => getSeverityRank(b) - getSeverityRank(a));
            break;
        case 'severity-asc':
            sigmaFilteredCache.sort((a, b) => getSeverityRank(a) - getSeverityRank(b));
            break;
        case 'date-desc':
            sigmaFilteredCache.sort((a, b) => getEffectiveDate(b) - getEffectiveDate(a));
            break;
    }
}

// ---- Section 11: Rendering - Sigma View Entry ----

export async function renderSigmaView() {
    if (sigmaRules.length === 0) {
        await initSigmaModule();
        await refreshSigmaFilteredCache();
        renderSigmaStats();
        renderSigmaList();
        renderSigmaDetails();
        updateHydrationStatus();
        return;
    }
    await refreshSigmaFilteredCache();
    renderSigmaStats();
    renderSigmaList();
    renderSigmaDetails();
    updateHydrationStatus();
}

// ---- Section 12: Rendering - Stats Dashboard ----

export function renderSigmaStats() {
    const container = document.getElementById('sigma-stats-dashboard');
    if (!container) return;

    const coverage = getSigmaCoverageStats();
    const hydratedCount = sigmaRules.filter(r => r.isVirtual === false && r.yaml && r.yaml.length > 50).length;
    const filteredCount = sigmaFilteredCache.length;
    const newCount = sigmaRules.filter(r => r.detectedType === 'new' || r.detectedType === 'modified').length;

    container.innerHTML = `
        <div class="sigma-stat-card">
            <div class="sigma-stat-icon"><i class="bi bi-database"></i></div>
            <div class="sigma-stat-content">
                <span class="sigma-stat-value">${sigmaRules.length.toLocaleString()}</span>
                <span class="sigma-stat-label">Total Rules</span>
            </div>
        </div>
        <div class="sigma-stat-card sigma-stat-active">
            <div class="sigma-stat-icon"><i class="bi bi-shield-check"></i></div>
            <div class="sigma-stat-content">
                <span class="sigma-stat-value">${coverage.active}</span>
                <span class="sigma-stat-label">Active Coverage</span>
            </div>
        </div>
        <div class="sigma-stat-card sigma-stat-gap">
            <div class="sigma-stat-icon"><i class="bi bi-exclamation-triangle"></i></div>
            <div class="sigma-stat-content">
                <span class="sigma-stat-value">${coverage.gap.toLocaleString()}</span>
                <span class="sigma-stat-label">Defensive Gaps</span>
            </div>
        </div>
        <div class="sigma-stat-card">
            <div class="sigma-stat-icon"><i class="bi bi-funnel"></i></div>
            <div class="sigma-stat-content">
                <span class="sigma-stat-value">${filteredCount.toLocaleString()}</span>
                <span class="sigma-stat-label">Filtered View</span>
            </div>
        </div>
        <div class="sigma-stat-card">
            <div class="sigma-stat-icon"><i class="bi bi-lightning-charge"></i></div>
            <div class="sigma-stat-content">
                <span class="sigma-stat-value">${hydratedCount.toLocaleString()}</span>
                <span class="sigma-stat-label">Hydrated / Cached</span>
            </div>
        </div>
        ${newCount > 0 ? `
        <div class="sigma-stat-card sigma-stat-new">
            <div class="sigma-stat-icon"><i class="bi bi-stars"></i></div>
            <div class="sigma-stat-content">
                <span class="sigma-stat-value">${newCount}</span>
                <span class="sigma-stat-label">New Since Sync</span>
            </div>
        </div>` : ''}
    `;
}

// ---- Section 13: Rendering - Virtual Scrolled Rule List ----

export const SIGMA_CARD_HEIGHT = 180; // Approximate height of a card in px


export function getRuleFolderName(rule) {
    if (!rule.path) return '';
    const parts = rule.path.split('/');
    if (parts.length >= 2) return parts[0];
    return '';
}

export function getRuleFileName(rule) {
    if (!rule.path) return '';
    const parts = rule.path.split('/');
    return parts[parts.length - 1];
}

export function getMonthKey(timestamp) {
    if (!timestamp || timestamp === 0) return null;
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey) {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
}

export function buildVirtualGroupedData(filtered) {
    const groups = [];
    const monthGroups = {};
    const noDate = [];

    filtered.forEach((rule, idx) => {
        const effectiveDate = getEffectiveDate(rule);
        const mKey = getMonthKey(effectiveDate);
        if (mKey) {
            if (!monthGroups[mKey]) monthGroups[mKey] = [];
            monthGroups[mKey].push({ rule, idx });
        } else {
            noDate.push({ rule, idx });
        }
    });

    const sortedMonths = Object.keys(monthGroups).sort((a, b) => b.localeCompare(a));

    for (const mKey of sortedMonths) {
        const items = monthGroups[mKey];
        groups.push({ type: 'header', label: formatMonthLabel(mKey), count: items.length, icon: 'bi-calendar-month' });
        for (const { rule, idx } of items) {
            groups.push({ type: 'card', rule, idx });
        }
    }

    if (noDate.length > 0) {
        groups.push({ type: 'header', label: 'Unindexed (awaiting hydration)', count: noDate.length, icon: 'bi-clock-history' });
        for (const { rule, idx } of noDate) {
            groups.push({ type: 'card', rule, idx });
        }
    }

    return groups;
}

export function buildGroupedData(filtered) {
    const groups = [];
    const monthGroups = {};
    const noDate = [];

    filtered.forEach((rule, idx) => {
        const effectiveDate = getEffectiveDate(rule);
        const mKey = getMonthKey(effectiveDate);
        if (mKey) {
            if (!monthGroups[mKey]) monthGroups[mKey] = [];
            monthGroups[mKey].push({ rule, idx });
        } else {
            noDate.push({ rule, idx });
        }
    });

    const sortedMonths = Object.keys(monthGroups).sort((a, b) => b.localeCompare(a));

    for (const mKey of sortedMonths) {
        const items = monthGroups[mKey];
        groups.push({ type: 'header', label: formatMonthLabel(mKey), count: items.length, icon: 'bi-calendar-month' });
        for (const { rule, idx } of items) {
            groups.push({ type: 'card', rule, idx });
        }
    }

    if (noDate.length > 0) {
        groups.push({ type: 'header', label: 'Unindexed (awaiting hydration)', count: noDate.length, icon: 'bi-clock-history' });
        for (const { rule, idx } of noDate) {
            groups.push({ type: 'card', rule, idx });
        }
    }

    return groups;
}

export function renderSigmaList() {
    const grid = document.getElementById('sigma-feed-grid');
    const countBadge = document.getElementById('sigma-rules-count');
    if (!grid) return;

    const filtered = sigmaFilteredCache;

    if (countBadge) countBadge.textContent = `Rules: ${filtered.length.toLocaleString()}`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="text-center py-5 text-on-surface-tertiary">
                <i class="bi bi-search text-2xl mb-2 d-block"></i>
                <span class="text-xs">No matching Sigma rules found.</span>
            </div>`;
        return;
    }

    const groupedData = buildGroupedData(filtered);
    let html = '';
    
    // Determine how many items to show based on pagination
    const itemsToShow = Math.min(currentVisibleCount, groupedData.length);
    
    for (let i = 0; i < itemsToShow; i++) {
        const item = groupedData[i];
        if (item.type === 'header') {
            html += `<div class="sigma-date-group">
                <div class="sigma-date-group-header">
                    <i class="bi ${item.icon}"></i>
                    <span>${item.label}</span>
                    <span class="sigma-date-group-count">${item.count}</span>
                </div>
            </div>`;
        } else {
            html += renderSigmaCard(item.rule, item.idx);
        }
    }
    
    // Add Load More button if there are more items
    if (currentVisibleCount < groupedData.length) {
        html += `
            <div class="text-center mt-4 mb-6">
                <button onclick="loadMoreSigmaRules()" class="btn btn-outline-primary btn-sm px-4 rounded-pill" style="border-color: rgba(168,85,247,0.4); color: #a855f7;">
                    <i class="bi bi-arrow-down-circle me-1"></i> Load More Rules... (${groupedData.length - currentVisibleCount} remaining)
                </button>
            </div>
        `;
    }

    grid.style.overflowY = 'auto';
    grid.style.height = '100%';
    grid.innerHTML = html;

    // Bind card click handlers
    grid.querySelectorAll('.sigma-card').forEach(card => {
        card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.idx, 10);
            selectedSigmaIdx = idx;
            grid.querySelectorAll('.sigma-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            renderSigmaDetails();
        });
    });
}

export function loadMoreSigmaRules() {
    currentVisibleCount += SIGMA_PAGINATION_CHUNK;
    renderSigmaList();
}

export function renderSigmaCard(rule, idx) {
    const level = rule.level || (rule.isVirtual ? '' : extractLevelFromYaml(rule.yaml));
    const isActive = selectedSigmaIdx === idx;
    const coverage = getSigmaCoverageStatus(rule);
    const dateStr = formatRuleDate(rule);
    const folder = getRuleFolderName(rule);
    const fileName = getRuleFileName(rule);
    const isCandidate = isRuleCandidate(rule.id);

    // Determine badge state (expire after 30 days)
    let statusBadge = '';
    if (rule.detectedAt && (Date.now() - rule.detectedAt) < 30 * 24 * 60 * 60 * 1000) {
        if (rule.detectedType === 'new') {
            statusBadge = `<span class="sigma-card-status-badge badge-new"><i class="bi bi-stars"></i> NEW</span>`;
        } else if (rule.detectedType === 'modified') {
            statusBadge = `<span class="sigma-card-status-badge badge-modified"><i class="bi bi-pencil-square"></i> MODIFIED</span>`;
        }
    }

    return `
        <div class="sigma-card ${isActive ? 'active' : ''}" data-idx="${idx}" data-rule-id="${rule.id}">
            <div class="sigma-card-header">
                <div class="sigma-card-header-left">
                    ${rule.technique_id ? `<span class="sigma-card-tech">${escapeHtml(rule.technique_id)}</span>` : ''}
                    ${rule.isVirtual ? `<span class="sigma-card-virtual-badge" title="Live GitHub Rule – click to hydrate"><i class="bi bi-cloud-arrow-down-fill"></i></span>` : ''}
                    ${statusBadge}
                </div>
                <div class="sigma-card-header-right">
                    ${coverage === 'active' ? '<span class="sigma-badge-coverage active-coverage"><i class="bi bi-shield-fill-check"></i> Active</span>' : '<span class="sigma-badge-coverage defensive-gap"><i class="bi bi-shield-fill-exclamation"></i> Gap</span>'}
                    ${level ? `<span class="sigma-card-level level-${level}">${level}</span>` : ''}
                    <button class="sigma-bookmark-btn ${isCandidate ? 'active' : ''}" onclick="event.stopPropagation(); toggleRuleCandidate(sigmaRules[${idx}])" data-tooltip="${isCandidate ? 'Remove from candidates' : 'Add to candidates'}">
                        <i class="bi ${isCandidate ? 'bi-bookmark-fill' : 'bi-bookmark'}"></i>
                    </button>
                </div>
            </div>
            <h5 class="sigma-card-title">${escapeHtml(rule.title)}</h5>
            <p class="sigma-card-desc">${escapeHtml(rule.description)}</p>
            <div class="sigma-card-footer">
                <div class="sigma-card-footer-top">
                    <div class="sigma-card-logsource">
                        <i class="bi bi-terminal"></i>
                        <span>${rule.logsource.product}/${rule.logsource.category}</span>
                    </div>
                    ${dateStr ? `<span class="sigma-card-date" title="Rule date">${dateStr}</span>` : ''}
                </div>
                <div class="sigma-card-footer-bottom">
                    ${folder ? `<span class="sigma-card-folder" title="SigmaHQ/${folder}"><i class="bi bi-folder2"></i> ${escapeHtml(folder)}</span>` : ''}
                    ${fileName ? `<span class="sigma-card-file" title="${escapeHtml(fileName)}"><i class="bi bi-file-earmark-code"></i> ${escapeHtml(fileName)}</span>` : ''}
                </div>
            </div>
        </div>`;
}

export function formatRuleDate(rule) {
    // Show the latest of modified or date
    const d = rule.ruleModified && rule.ruleDate
        ? (parseSigmaDate(rule.ruleModified) >= parseSigmaDate(rule.ruleDate) ? rule.ruleModified : rule.ruleDate)
        : (rule.ruleModified || rule.ruleDate);
    if (!d) return '';
    // Sigma dates are YYYY/MM/DD or YYYY-MM-DD
    const parts = d.replace(/-/g, '/').split('/');
    if (parts.length === 3) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
    }
    return d;
}

// ---- Section 14: Rendering - Details Panel ----

export function renderSigmaDetails() {
    const panel = document.getElementById('sigma-details-panel');
    if (!panel) return;

    const filtered = sigmaFilteredCache;

    if (selectedSigmaIdx === null || !filtered[selectedSigmaIdx]) {
        panel.innerHTML = `
            <div class="sigma-details-empty">
                <i class="bi bi-terminal"></i>
                <h5>Sigma Rules Explorer</h5>
                <p class="text-sm text-on-surface-tertiary">Select a Sigma detection rule to inspect details, check coverage mappings, and copy YAML definitions.</p>
                ${sigmaRules.length > 0 ? `<div class="sigma-details-empty-stats">
                    <span><i class="bi bi-database mr-1"></i>${sigmaRules.length.toLocaleString()} rules cached</span>
                    ${isLiveSigmaConnected ? '<span class="text-success"><i class="bi bi-cloud-check-fill mr-1"></i>Synced</span>' : '<span class="text-warning"><i class="bi bi-cloud-slash mr-1"></i>Offline</span>'}
                </div>` : ''}
            </div>`;
        return;
    }

    const rule = filtered[selectedSigmaIdx];

    // On-demand hydration for virtual rules
    if (rule.isVirtual) {
        panel.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center py-5 text-on-surface-secondary text-center" style="min-height: 300px;">
                <span class="spinner-border text-primary mb-3" style="width: 2.5rem; height: 2.5rem;" role="status"></span>
                <h5 class="font-semibold text-sm">Fetching Live Contents from GitHub...</h5>
                <p class="text-xs text-on-surface-tertiary mt-1" style="max-width: 300px;">Retrieving YAML for "${escapeHtml(rule.title)}"</p>
            </div>`;

        fetchVirtualRuleContent(rule).then(() => {
            refreshSigmaFilteredCache();
            renderSigmaList();
            renderSigmaDetails();
            renderSigmaStats();
        });
        return;
    }

    const level = rule.level || extractLevelFromYaml(rule.yaml);
    const coverage = getSigmaCoverageStatus(rule);
    const dateStr = formatRuleDate(rule);
    const statusLabel = rule.ruleStatus ? rule.ruleStatus.charAt(0).toUpperCase() + rule.ruleStatus.slice(1) : '';

    panel.innerHTML = `
        <div class="sigma-details-header">
            <div class="sigma-details-meta">
                ${level ? `<span class="sigma-card-level level-${level}">${level}</span>` : ''}
                ${coverage === 'active'
                    ? '<span class="sigma-badge-coverage active-coverage"><i class="bi bi-shield-fill-check"></i> Active Coverage</span>'
                    : '<span class="sigma-badge-coverage defensive-gap"><i class="bi bi-shield-fill-exclamation"></i> Defensive Gap</span>'}
                ${statusLabel ? `<span class="sigma-details-status-badge status-${rule.ruleStatus}">${statusLabel}</span>` : ''}
                ${rule.isOfflineBaseline ? '<span class="sigma-details-status-badge" style="background: rgba(99,102,241,0.1); color: #818cf8; border-color: rgba(99,102,241,0.2);">Offline Baseline</span>' : ''}
                <span>UUID: ${rule.id.includes('/') ? 'GitHub Index' : rule.id}</span>
            </div>
            <h3 class="sigma-details-title">${escapeHtml(rule.title)}</h3>
            <div class="sigma-details-tags">
                ${rule.technique_id && rule.technique_id !== 'N/A' ? `<span class="sigma-details-tag"><i class="bi bi-shield-check mr-1 text-primary"></i> ${rule.technique_id}</span>` : ''}
                ${rule.tactic && rule.tactic !== 'Unknown' ? `<span class="sigma-details-tag"><i class="bi bi-tag-fill mr-1 text-primary"></i> ${rule.tactic}</span>` : ''}
                <span class="sigma-details-tag"><i class="bi bi-hdd-network mr-1 text-primary"></i> ${rule.logsource.product}/${rule.logsource.category}</span>
                ${dateStr ? `<span class="sigma-details-tag"><i class="bi bi-calendar3 mr-1 text-primary"></i> ${dateStr}</span>` : ''}
            </div>
        </div>

        <div class="sigma-details-body">
            <h6 class="text-on-surface font-semibold text-sm mb-2">Description</h6>
            <p class="text-sm text-on-surface-secondary mb-4" style="line-height: 1.6;">${escapeHtml(rule.description)}</p>

            <div class="sigma-yaml-section">
                <div class="sigma-yaml-header-row">
                    <span class="sigma-yaml-title"><i class="bi bi-code-square mr-1"></i> Sigma YAML Definition</span>
                </div>
                <div class="sigma-yaml-container">
                    <button class="sigma-copy-btn" id="btn-copy-sigma-yaml"><i class="bi bi-clipboard mr-1"></i> Copy YAML</button>
                    <pre class="sigma-yaml-code"><code>${escapeHtml(rule.yaml)}</code></pre>
                </div>
            </div>

            <div class="sigma-pivot-row">
                ${rule.isOfflineBaseline
                    ? `<button class="btn btn-outline-secondary sigma-pivot-btn" id="btn-view-sigma-github"><i class="bi bi-search mr-1"></i> Search on GitHub</button>`
                    : `<button class="btn btn-outline-primary sigma-pivot-btn" id="btn-view-sigma-github"><i class="bi bi-github mr-1"></i> View on GitHub</button>`
                }
                ${rule.detectedType === 'modified' && rule.yaml && rule.yaml.length > 50
                    ? `<button class="btn btn-outline-info sigma-pivot-btn" id="btn-view-sigma-diff"><i class="bi bi-diff mr-1"></i> View Changes</button>`
                    : ''
                }
                <button class="btn btn-primary sigma-pivot-btn" id="btn-pivot-create-query"><i class="bi bi-plus-lg mr-1"></i> Deploy Associated Query</button>
            </div>
        </div>`;

    // Event bindings
    document.getElementById('btn-copy-sigma-yaml')?.addEventListener('click', (e) => {
        navigator.clipboard.writeText(rule.yaml).then(() => {
            const btn = e.currentTarget;
            const orig = btn.innerHTML;
            btn.innerHTML = `<i class="bi bi-check-lg mr-1"></i> Copied!`;
            btn.style.color = "var(--accent-green)";
            btn.style.borderColor = "var(--accent-green)";
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; btn.style.borderColor = ""; }, 1800);
        });
    });

    document.getElementById('btn-view-sigma-github')?.addEventListener('click', () => {
        if (rule.isOfflineBaseline) {
            const searchQuery = encodeURIComponent(rule.title);
            window.open(`https://github.com/SigmaHQ/sigma/search?q=${searchQuery}&type=code`, '_blank');
        } else if (rule.url) {
            window.open(rule.url, '_blank');
        }
    });

    document.getElementById('btn-view-sigma-diff')?.addEventListener('click', () => {
        // Open GitHub commit comparison for this file
        const commitsUrl = `https://github.com/SigmaHQ/sigma/commits/master/${rule.path}`;
        window.open(commitsUrl, '_blank');
    });

    document.getElementById('btn-pivot-create-query')?.addEventListener('click', () => {
        openQueryEditor({
            id: '', name: `[Sigma] ${rule.title}`, language: 'sigma'
        }, rule.technique_id);
        setTimeout(() => attachSigmaRuleToModal(rule.id, rule.title, rule.url), 150);
    });
}

// ---- Section 15: Event Bindings ----

export let sigmaFilterDebounceTimer = null;

export function bindSigmaEvents() {
    const ids = {
        'sigma-search-input': null,
        'sigma-logsource-filter': null,
        'sigma-tactic-filter': null,
        'sigma-level-filter': null,
        'sigma-coverage-filter': null,
        'sigma-product-filter': null,
        'sigma-sort-select': null,
        'sigma-date-filter': null,
        'btn-load-live-sigma': null
    };

    // Resolve elements
    for (const id of Object.keys(ids)) ids[id] = document.getElementById(id);

    // Search with debounce (200ms)
    ids['sigma-search-input']?.addEventListener('input', (e) => {
        clearTimeout(sigmaSearchDebounceTimer);
        sigmaSearchDebounceTimer = setTimeout(async () => {
            sigmaSearchQuery = e.target.value.toLowerCase().trim();
            await resetSigmaView();
        }, 200);
    });

    // Dropdown filters with shared debounce (150ms) - coalesces rapid filter changes
    const filterBindings = [
        ['sigma-logsource-filter', v => selectedSigmaLogsource = v],
        ['sigma-tactic-filter', v => selectedSigmaTactic = v],
        ['sigma-level-filter', v => selectedSigmaLevel = v],
        ['sigma-coverage-filter', v => selectedSigmaCoverage = v],
        ['sigma-product-filter', v => selectedSigmaProduct = v],
        ['sigma-sort-select', v => selectedSigmaSort = v],
        ['sigma-date-filter', v => selectedSigmaDate = v]
    ];

    filterBindings.forEach(([id, setter]) => {
        ids[id]?.addEventListener('change', (e) => {
            setter(e.target.value);
            clearTimeout(sigmaFilterDebounceTimer);
            sigmaFilterDebounceTimer = setTimeout(async () => {
                await resetSigmaView();
            }, 150);
        });
    });

    // Force sync button
    ids['btn-load-live-sigma']?.addEventListener('click', () => {
        executeSyncFromGitHub(false);
    });
}

export async function resetSigmaView() {
    selectedSigmaIdx = null;
    currentVisibleCount = SIGMA_PAGINATION_CHUNK;
    await refreshSigmaFilteredCache();
    renderSigmaStats();
    renderSigmaList();
    renderSigmaDetails();
}

// ---- Section 16: Query Modal Autocomplete ----

export function initQueryModalSigmaSearch() {
    const searchInput = document.getElementById('query-sigma-search');
    const resultsContainer = document.getElementById('query-sigma-search-results');
    const removeBtn = document.getElementById('btn-remove-attached-sigma');
    let modalSearchTimer = null;

    if (!searchInput || !resultsContainer) return;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(modalSearchTimer);
        modalSearchTimer = setTimeout(() => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('show');
                return;
            }

            const matches = sigmaRules.filter(r => {
                const fileName = getRuleFileName(r).toLowerCase();
                return r.title.toLowerCase().includes(query) ||
                    (r.technique_id && r.technique_id.toLowerCase().includes(query)) ||
                    (r.tactic && r.tactic.toLowerCase().includes(query)) ||
                    fileName.includes(query);
            }).slice(0, 8);

            if (matches.length === 0) {
                resultsContainer.innerHTML = `<div class="text-xs text-on-surface-tertiary p-3 text-center">No matching Sigma rules.</div>`;
                resultsContainer.classList.add('show');
                return;
            }

            resultsContainer.innerHTML = matches.map(rule => `
                <div class="sigma-attach-item" data-id="${rule.id}" data-title="${escapeHtml(rule.title)}" data-url="${rule.url}">
                    <div class="sigma-attach-item-title">${escapeHtml(rule.title)}</div>
                    <div class="sigma-attach-item-meta">
                        <span>${rule.technique_id || ''}</span>
                        <span>•</span>
                        <span>${rule.logsource.product}/${rule.logsource.category}</span>
                        ${rule.isVirtual ? `<span class="ms-auto text-primary text-xs"><i class="bi bi-cloud-arrow-down-fill"></i> GitHub</span>` : ''}
                    </div>
                </div>`).join('');
            resultsContainer.classList.add('show');

            resultsContainer.querySelectorAll('.sigma-attach-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.dataset.id;
                    const rule = sigmaRules.find(r => r.id === id);
                    if (rule) {
                        if (rule.isVirtual || !rule.yaml) {
                            showToast(`Fetching YAML from GitHub...`, 'info');
                            fetchVirtualRuleContent(rule).then(() => {
                                attachSigmaRuleToModal(rule.id, rule.title, rule.url);
                                showToast(`Linked: "${rule.title}"`, 'success');
                            });
                        } else {
                            attachSigmaRuleToModal(rule.id, rule.title, rule.url);
                        }
                    }
                    resultsContainer.classList.remove('show');
                    searchInput.value = '';
                });
            });
        }, 150);
    });

    removeBtn?.addEventListener('click', () => clearSigmaRuleFromModal());

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.remove('show');
        }
    });
}

export function attachSigmaRuleToModal(id, title, url) {
    // Get existing linked rules
    const existingIds = document.getElementById('query-sigma-rule-id').value;
    const existingTitles = document.getElementById('query-sigma-rule-title').value;
    const existingUrls = document.getElementById('query-sigma-rule-url').value;

    // Parse existing (pipe-delimited)
    const ids = existingIds ? existingIds.split('|').filter(Boolean) : [];
    const titles = existingTitles ? existingTitles.split('|').filter(Boolean) : [];
    const urls = existingUrls ? existingUrls.split('|').filter(Boolean) : [];

    // Skip if already linked
    if (ids.includes(id)) return;

    ids.push(id);
    titles.push(title);
    urls.push(url || '');

    document.getElementById('query-sigma-rule-id').value = ids.join('|');
    document.getElementById('query-sigma-rule-title').value = titles.join('|');
    document.getElementById('query-sigma-rule-url').value = urls.join('|');

    // Update the source/reference field with all Sigma URLs (comma-separated)
    const sourceInput = document.getElementById('query-source');
    if (sourceInput) {
        const sigmaUrls = urls.filter(Boolean);
        if (sigmaUrls.length > 0) {
            // Preserve any existing source text, append Sigma URLs
            const existingSource = sourceInput.value.trim();
            const urlList = sigmaUrls.join(', ');
            sourceInput.value = existingSource ? `${existingSource}, ${urlList}` : urlList;
        }
    }

    renderAttachedSigmaBadges(titles, urls);
}

export function renderAttachedSigmaBadges(titles, urls) {
    const badgeContainer = document.getElementById('query-sigma-attached-badge-container');
    const badgeList = document.getElementById('query-sigma-attached-list');
    const searchWrapper = document.getElementById('query-sigma-search').closest('.sigma-attach-wrapper');

    if (!badgeContainer || !badgeList) return;

    if (titles.length === 0) {
        badgeContainer.classList.add('hidden');
        if (searchWrapper) searchWrapper.classList.remove('hidden');
        return;
    }

    // Always keep search visible for adding more rules
    if (searchWrapper) searchWrapper.classList.remove('hidden');
    badgeContainer.classList.remove('hidden');

    badgeList.innerHTML = titles.map((t, i) => `
        <span class="sigma-attached-badge">
            <i class="bi bi-shield-check"></i>
            <span class="sigma-attached-badge-title">${escapeHtml(t)}</span>
            <button type="button" class="sigma-attached-remove" data-idx="${i}" title="Remove">
                <i class="bi bi-x"></i>
            </button>
        </span>
    `).join('');

    badgeList.querySelectorAll('.sigma-attached-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            removeSigmaRuleAtIndex(idx);
        });
    });
}

export function removeSigmaRuleAtIndex(idx) {
    const ids = document.getElementById('query-sigma-rule-id').value.split('|').filter(Boolean);
    const titles = document.getElementById('query-sigma-rule-title').value.split('|').filter(Boolean);
    const urls = document.getElementById('query-sigma-rule-url').value.split('|').filter(Boolean);

    ids.splice(idx, 1);
    titles.splice(idx, 1);
    urls.splice(idx, 1);

    document.getElementById('query-sigma-rule-id').value = ids.join('|');
    document.getElementById('query-sigma-rule-title').value = titles.join('|');
    document.getElementById('query-sigma-rule-url').value = urls.join('|');

    // Rebuild source field with remaining Sigma URLs
    const sourceInput = document.getElementById('query-source');
    if (sourceInput) {
        const sigmaUrls = urls.filter(Boolean);
        sourceInput.value = sigmaUrls.join(', ');
    }

    renderAttachedSigmaBadges(titles, urls);

    if (ids.length === 0) {
        const searchWrapper = document.getElementById('query-sigma-search').closest('.sigma-attach-wrapper');
        if (searchWrapper) searchWrapper.classList.remove('hidden');
    }
}

export function clearSigmaRuleFromModal() {
    document.getElementById('query-sigma-rule-id').value = '';
    document.getElementById('query-sigma-rule-title').value = '';
    document.getElementById('query-sigma-rule-url').value = '';

    const badgeContainer = document.getElementById('query-sigma-attached-badge-container');
    const searchWrapper = document.getElementById('query-sigma-search').closest('.sigma-attach-wrapper');

    if (badgeContainer) badgeContainer.classList.add('hidden');
    if (searchWrapper) searchWrapper.classList.remove('hidden');

    const si = document.getElementById('query-sigma-search');
    if (si) { si.value = ''; si.focus(); }
}

// ---- Section: Rule Candidates ----

export let sigmaCandidates = [];

export function loadCandidates() {
    try {
        const stored = localStorage.getItem('sigma_candidates');
        sigmaCandidates = stored ? JSON.parse(stored) : [];
    } catch (e) {
        sigmaCandidates = [];
    }
    updateCandidatesBadge();
}

export function saveCandidates() {
    localStorage.setItem('sigma_candidates', JSON.stringify(sigmaCandidates));
    updateCandidatesBadge();
}

export function isRuleCandidate(ruleId) {
    return sigmaCandidates.some(c => c.id === ruleId);
}

export function toggleRuleCandidate(rule) {
    if (!rule || !rule.id) return;
    const idx = sigmaCandidates.findIndex(c => c.id === rule.id);
    if (idx >= 0) {
        sigmaCandidates.splice(idx, 1);
    } else {
        sigmaCandidates.push({
            id: rule.id,
            title: rule.title || '',
            technique: rule.technique_id || '',
            severity: rule.level || '',
            addedAt: new Date().toISOString()
        });
    }
    saveCandidates();
    renderCandidatesList();
    // Re-render the card to update bookmark icon
    const card = document.querySelector(`.sigma-card[data-rule-id="${rule.id}"]`);
    if (card) {
        const btn = card.querySelector('.sigma-bookmark-btn');
        if (btn) {
            btn.classList.toggle('active', isRuleCandidate(rule.id));
            btn.innerHTML = isRuleCandidate(rule.id)
                ? '<i class="bi bi-bookmark-fill"></i>'
                : '<i class="bi bi-bookmark"></i>';
        }
    }
}

export function toggleCandidatesView() {
    const grid = document.getElementById('sigma-feed-grid');
    const candidatesSection = document.getElementById('sigma-candidates-section');
    const btn = document.getElementById('btn-toggle-candidates');
    
    if (candidatesSection.classList.contains('hidden')) {
        grid.classList.add('hidden');
        candidatesSection.classList.remove('hidden');
        btn.classList.add('active');
        renderCandidatesList();
    } else {
        grid.classList.remove('hidden');
        candidatesSection.classList.add('hidden');
        btn.classList.remove('active');
    }
}

export function renderCandidatesList() {
    const grid = document.getElementById('sigma-candidates-grid');
    const empty = document.getElementById('sigma-candidates-empty');
    
    if (!grid) return;
    
    if (sigmaCandidates.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    
    let html = '<div class="candidates-grid">';
    sigmaCandidates.forEach(c => {
        const severityClass = c.severity ? `severity-${c.severity.toLowerCase()}` : '';
        html += `
            <div class="candidate-card" data-candidate-id="${c.id}">
                <div class="candidate-card-header">
                    <span class="candidate-severity ${severityClass}">${c.severity || 'N/A'}</span>
                    <button class="candidate-remove-btn" onclick="removeCandidate('${c.id}')" data-tooltip="Remove from candidates">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                <h6 class="candidate-title">${escapeHtml(c.title || 'Untitled Rule')}</h6>
                ${c.technique ? `<div class="candidate-tech"><i class="bi bi-crosshair"></i> ${escapeHtml(c.technique)}</div>` : ''}
                <div class="candidate-meta">
                    <span class="candidate-date">Added: ${formatCandidateDate(c.addedAt)}</span>
                </div>
                <div class="candidate-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="deployCandidate('${c.id}')">
                        <i class="bi bi-play-fill"></i> Deploy
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="viewCandidateDetails('${c.id}')">
                        <i class="bi bi-eye"></i> View
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    grid.innerHTML = html;
}

export function removeCandidate(ruleId) {
    sigmaCandidates = sigmaCandidates.filter(c => c.id !== ruleId);
    saveCandidates();
    renderCandidatesList();
    // Update card bookmark if visible
    const card = document.querySelector(`.sigma-card[data-rule-id="${ruleId}"]`);
    if (card) {
        const btn = card.querySelector('.sigma-bookmark-btn');
        if (btn) {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="bi bi-bookmark"></i>';
        }
    }
}

export function clearAllCandidates() {
    if (sigmaCandidates.length === 0) return;
    showConfirm('Clear All Candidates', 'Are you sure you want to remove all rules from your candidate list?').then(confirmed => {
        if (confirmed) {
            sigmaCandidates = [];
            saveCandidates();
            renderCandidatesList();
            // Update all visible card bookmarks
            document.querySelectorAll('.sigma-bookmark-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.innerHTML = '<i class="bi bi-bookmark"></i>';
            });
        }
    });
}

export function exportCandidatesList() {
    if (sigmaCandidates.length === 0) return;
    const csv = [
        ['Rule ID', 'Title', 'Technique', 'Severity', 'Date Added'].join(','),
        ...sigmaCandidates.map(c => [
            c.id,
            `"${(c.title || '').replace(/"/g, '""')}"`,
            c.technique || '',
            c.severity || '',
            c.addedAt || ''
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sigma_candidates_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function deployCandidate(ruleId) {
    const rule = sigmaCandidates.find(c => c.id === ruleId);
    if (!rule) return;
    // Navigate to the rule in the main feed
    toggleCandidatesView();
    setTimeout(() => {
        const card = document.querySelector(`.sigma-card[data-rule-id="${ruleId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-pulse');
            setTimeout(() => card.classList.remove('highlight-pulse'), 2000);
        }
    }, 300);
}

export function viewCandidateDetails(ruleId) {
    const rule = sigmaCandidates.find(c => c.id === ruleId);
    if (!rule) return;
    toggleCandidatesView();
    setTimeout(() => {
        const card = document.querySelector(`.sigma-card[data-rule-id="${ruleId}"]`);
        if (card) {
            card.click();
        }
    }, 300);
}

export function updateCandidatesBadge() {
    const badge = document.getElementById('candidates-count-badge');
    if (badge) {
        badge.textContent = sigmaCandidates.length;
        badge.style.display = sigmaCandidates.length > 0 ? 'inline' : 'none';
    }
}

export function formatCandidateDate(isoStr) {
    if (!isoStr) return 'Unknown';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
}

// Initialize candidates on module load
loadCandidates();

// ES Module exports for dynamic import() code splitting
// Expose sigmaRules globally for onclick handlers in rendered HTML
window.sigmaRules = sigmaRules;
window.manualHydrateAll = manualHydrateAll;

// Legacy Window Bindings
window.sigmaRules = sigmaRules;
window.selectedSigmaIdx = selectedSigmaIdx;
window.sigmaSearchQuery = sigmaSearchQuery;
window.selectedSigmaLogsource = selectedSigmaLogsource;
window.selectedSigmaTactic = selectedSigmaTactic;
window.selectedSigmaLevel = selectedSigmaLevel;
window.selectedSigmaCoverage = selectedSigmaCoverage;
window.selectedSigmaProduct = selectedSigmaProduct;
window.selectedSigmaSort = selectedSigmaSort;
window.selectedSigmaDate = selectedSigmaDate;
window.isLiveSigmaConnected = isLiveSigmaConnected;
window.SIGMA_PAGINATION_CHUNK = SIGMA_PAGINATION_CHUNK;
window.currentVisibleCount = currentVisibleCount;
window.sigmaFilteredCache = sigmaFilteredCache;
window.sigmaSearchDebounceTimer = sigmaSearchDebounceTimer;
window.sigmaWorker = sigmaWorker;
window.workerPendingParses = workerPendingParses;
window.workerPendingFilter = workerPendingFilter;
window.initSigmaWorker = initSigmaWorker;
window.initSigmaModule = initSigmaModule;
window.syncRulesToWorker = syncRulesToWorker;
window.updateWorkerRule = updateWorkerRule;
window.autoSyncFromGitHub = autoSyncFromGitHub;
window.backgroundResync = backgroundResync;
window.executeSyncFromGitHub = executeSyncFromGitHub;
window.updateSyncButton = updateSyncButton;
window.sigmaAutoSyncTimer = sigmaAutoSyncTimer;
window.getNextMonthFirst = getNextMonthFirst;
window.formatCountdown = formatCountdown;
window.startAutoSyncCountdown = startAutoSyncCountdown;
window.stopAutoSyncCountdown = stopAutoSyncCountdown;
window.showSigmaSyncProgress = showSigmaSyncProgress;
window.updateHydrationStatus = updateHydrationStatus;
window.fetchVirtualRuleContent = fetchVirtualRuleContent;
window.autoHydrateAllVirtualRules = autoHydrateAllVirtualRules;
window.manualHydrateAll = manualHydrateAll;
window.getSigmaCoverageStatus = getSigmaCoverageStatus;
window.getSigmaCoverageStats = getSigmaCoverageStats;
window.getUniqueProducts = getUniqueProducts;
window.populateProductFilter = populateProductFilter;
window.refreshSigmaFilteredCache = refreshSigmaFilteredCache;
window.refreshSigmaFilteredCacheSync = refreshSigmaFilteredCacheSync;
window.getEffectiveDate = getEffectiveDate;
window.getSeverityRank = getSeverityRank;
window.applySigmaSort = applySigmaSort;
window.renderSigmaView = renderSigmaView;
window.renderSigmaStats = renderSigmaStats;

window.getRuleFolderName = getRuleFolderName;
window.getRuleFileName = getRuleFileName;
window.getMonthKey = getMonthKey;
window.formatMonthLabel = formatMonthLabel;
window.renderSigmaList = renderSigmaList;
window.renderSigmaCard = renderSigmaCard;
window.formatRuleDate = formatRuleDate;
window.formatRuleDate = formatRuleDate;
window.renderSigmaDetails = renderSigmaDetails;
window.sigmaFilterDebounceTimer = sigmaFilterDebounceTimer;
window.bindSigmaEvents = bindSigmaEvents;
window.resetSigmaView = resetSigmaView;
window.initQueryModalSigmaSearch = initQueryModalSigmaSearch;
window.attachSigmaRuleToModal = attachSigmaRuleToModal;
window.renderAttachedSigmaBadges = renderAttachedSigmaBadges;
window.removeSigmaRuleAtIndex = removeSigmaRuleAtIndex;
window.clearSigmaRuleFromModal = clearSigmaRuleFromModal;
window.sigmaCandidates = sigmaCandidates;
window.loadCandidates = loadCandidates;
window.saveCandidates = saveCandidates;
window.isRuleCandidate = isRuleCandidate;
window.toggleRuleCandidate = toggleRuleCandidate;
window.toggleCandidatesView = toggleCandidatesView;
window.renderCandidatesList = renderCandidatesList;
window.removeCandidate = removeCandidate;
window.clearAllCandidates = clearAllCandidates;
window.exportCandidatesList = exportCandidatesList;
window.deployCandidate = deployCandidate;
window.viewCandidateDetails = viewCandidateDetails;
window.updateCandidatesBadge = updateCandidatesBadge;
window.formatCandidateDate = formatCandidateDate;
