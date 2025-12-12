document.addEventListener('DOMContentLoaded', () => {
    // --- Config ---
    let ddragonVer = '13.24.1';
    const PROXY_BASE = '/.netlify/functions/riot-proxy';

    // --- DOM Elements ---
    // Views
    const homeView = document.getElementById('home-view');
    const profileView = document.getElementById('profile-view');
    const navSearchContainer = document.getElementById('nav-search-container');
    const homeLink = document.getElementById('home-link');

    // Inputs
    const searchBtn = document.getElementById('search-btn');
    const summonerInput = document.getElementById('summoner-input');
    const regionSelect = document.getElementById('region-select');
    const navInput = document.getElementById('nav-summ-input');

    // Feedback
    const loading = document.getElementById('loading');
    const profileContent = document.getElementById('profile-content');
    const errorDiv = document.getElementById('search-error');

    // Profile Elements
    const elIcon = document.getElementById('profile-icon');
    const elLevel = document.getElementById('profile-level');
    const elName = document.getElementById('profile-name');
    const elRankTier = document.getElementById('tier-text');
    const elRankLP = document.getElementById('lp-text');
    const elWinrate = document.getElementById('winrate-text');
    const matchList = document.getElementById('match-list');
    const favBtn = document.getElementById('favorite-btn');

    // Lists
    const favoritesGrid = document.getElementById('favorites-grid');
    const recentGrid = document.getElementById('recent-grid');

    // State
    let currentProfile = null; // {name, tag, region, icon}
    let currentMatches = []; // Store matches for filtering
    let currentPuuid = null;
    let currentRegion = null;
    let filtersInitialized = false;
    let filterCooldownEnd = 0; // Timestamp when heavy filter cooldown ends
    let cachedHeavyMatches = null; // Cache for 50-match fetches
    let matchesLoadedCount = 20; // Track how many matches are loaded for pagination

    // --- Load More Matches ---
    async function loadMoreMatches() {
        const loadMoreBtn = document.getElementById('load-more-btn');
        const loadMoreSpinner = document.getElementById('load-more-spinner');
        const matchList = document.getElementById('match-list');

        if (!currentPuuid || !currentRegion) return;

        // Show loading state
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        if (loadMoreSpinner) loadMoreSpinner.classList.remove('hidden');

        try {
            // Fetch next batch of 20 matches
            const matchIdsRes = await fetch(`${PROXY_BASE}?endpoint=match-list&region=${currentRegion}&puuid=${currentPuuid}&count=20&start=${matchesLoadedCount}`);
            if (!matchIdsRes.ok) throw new Error('Failed to fetch more matches');

            const newMatchIds = await matchIdsRes.json();

            if (!Array.isArray(newMatchIds) || newMatchIds.length === 0) {
                // No more matches
                document.getElementById('load-more-container').innerHTML = '<div class="text-sm text-muted italic">No more matches to load</div>';
                return;
            }

            // Fetch match details
            const promises = newMatchIds.map(id =>
                fetch(`${PROXY_BASE}?endpoint=match-details&region=${currentRegion}&matchId=${id}`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            );

            const newMatches = (await Promise.all(promises)).filter(m => m && m.info);

            // Add to current matches and render
            currentMatches = [...currentMatches, ...newMatches];
            matchesLoadedCount += newMatchIds.length;

            // Render new matches
            newMatches.forEach(m => renderMatchCard(m, currentPuuid));

            // Hide load more if less than 20 returned
            if (newMatchIds.length < 20) {
                document.getElementById('load-more-container').innerHTML = '<div class="text-sm text-muted italic">All matches loaded</div>';
            }

        } catch (e) {
            console.error('Load more error:', e);
        } finally {
            if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
            if (loadMoreSpinner) loadMoreSpinner.classList.add('hidden');
        }
    }

    // --- Match Filter Functions ---
    function setupMatchFilters() {
        if (filtersInitialized) return;
        filtersInitialized = true;

        const filterBtns = document.querySelectorAll('.match-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                handleFilterClick(btn.dataset.filter);
            });
        });
    }

    async function handleFilterClick(filter) {
        const heavyFilters = ['arena-1st', 'best-kda'];

        if (heavyFilters.includes(filter)) {
            // Check cooldown
            const now = Date.now();
            if (now < filterCooldownEnd) {
                showFilterCooldown(filter);
                return;
            }
            // Fetch 50 matches
            await fetchHeavyFilterMatches(filter);
        } else {
            // Regular filter - fetch 20 matches for that type
            await fetchFilterMatches(filter);
        }
    }

    async function fetchFilterMatches(filter) {
        if (!currentPuuid || !currentRegion) return;

        matchList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 gap-3">
                <i class="fa-solid fa-spinner fa-spin text-lolPurple text-2xl"></i>
                <div class="text-sm text-muted">Loading ${filter} matches...</div>
            </div>
        `;

        try {
            // For "all", use cached matches if available
            if (filter === 'all' && currentMatches.length > 0) {
                matchList.innerHTML = '';
                currentMatches.forEach(m => renderMatchCard(m, currentPuuid));
                return;
            }

            // Fetch more matches to ensure we get enough filtered results
            const count = (filter === 'aram' || filter === 'arena') ? 50 : 20;
            const matchesUrl = `${PROXY_BASE}?endpoint=match-list&region=${currentRegion}&puuid=${currentPuuid}&count=${count}`;
            const matchesRes = await fetch(matchesUrl);

            if (!matchesRes.ok) throw new Error('Failed to fetch matches');

            const matchIds = await matchesRes.json();

            if (!Array.isArray(matchIds) || matchIds.length === 0) {
                matchList.innerHTML = '<div class="text-center text-slate-500 py-8 italic">No matches found.</div>';
                return;
            }

            // Fetch match details in batches
            const BATCH_SIZE = 10;
            let allMatches = [];

            for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
                const chunk = matchIds.slice(i, i + BATCH_SIZE);
                const promises = chunk.map(id =>
                    fetch(`${PROXY_BASE}?endpoint=match-details&region=${currentRegion}&matchId=${id}`)
                        .then(r => r.ok ? r.json() : null)
                        .catch(() => null)
                );
                const results = await Promise.all(promises);
                allMatches = allMatches.concat(results.filter(m => m && m.info));

                if (i + BATCH_SIZE < matchIds.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            // Apply client-side filtering
            let filtered = allMatches;

            switch (filter) {
                case 'ranked':
                    filtered = allMatches.filter(m => {
                        const queueId = m.info?.queueId;
                        return queueId === 420 || queueId === 440;
                    });
                    break;
                case 'aram':
                    filtered = allMatches.filter(m => m.info?.queueId === 450);
                    break;
                case 'arena':
                    filtered = allMatches.filter(m =>
                        m.info?.gameMode === 'CHERRY' || m.info?.gameMode === 'ARENA'
                    );
                    break;
                default:
                    break;
            }

            // Limit to 20 results
            filtered = filtered.slice(0, 20);

            if (filtered.length === 0) {
                matchList.innerHTML = `<div class="text-center text-slate-500 py-8 italic">No ${filter} matches found in recent games.</div>`;
                return;
            }

            matchList.innerHTML = '';
            filtered.forEach(m => renderMatchCard(m, currentPuuid));

        } catch (e) {
            console.error('Filter fetch error:', e);
            matchList.innerHTML = '<div class="text-center text-lolRed py-8">Error loading matches. Try again.</div>';
        }
    }

    async function fetchHeavyFilterMatches(filter) {
        if (!currentPuuid || !currentRegion) return;

        matchList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 gap-3">
                <i class="fa-solid fa-spinner fa-spin text-lolPurple text-2xl"></i>
                <div class="text-sm text-muted">Searching last 50 matches...</div>
                <div class="text-[10px] text-yellow-400">
                    <i class="fa-solid fa-exclamation-triangle mr-1"></i>
                    This may take a moment due to API rate limits
                </div>
            </div>
        `;

        try {
            // Fetch 50 match IDs
            const matchesUrl = `${PROXY_BASE}?endpoint=match-list&region=${currentRegion}&puuid=${currentPuuid}&count=50`;
            const matchesRes = await fetch(matchesUrl);

            if (!matchesRes.ok) throw new Error('Failed to fetch matches');

            const matchIds = await matchesRes.json();

            if (!Array.isArray(matchIds) || matchIds.length === 0) {
                matchList.innerHTML = '<div class="text-center text-slate-500 py-8 italic">No matches found.</div>';
                return;
            }

            // Fetch match details in batches to avoid rate limits
            const BATCH_SIZE = 10;
            let allMatches = [];

            for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
                const chunk = matchIds.slice(i, i + BATCH_SIZE);
                const promises = chunk.map(id =>
                    fetch(`${PROXY_BASE}?endpoint=match-details&region=${currentRegion}&matchId=${id}`)
                        .then(r => r.ok ? r.json() : null)
                        .catch(() => null)
                );
                const results = await Promise.all(promises);
                allMatches = allMatches.concat(results.filter(m => m && m.info));

                // Small delay between batches
                if (i + BATCH_SIZE < matchIds.length) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            // Cache and set cooldown
            cachedHeavyMatches = allMatches;
            filterCooldownEnd = Date.now() + 120000; // 2 minute cooldown

            // Apply filter
            let filtered = [];

            if (filter === 'arena-1st') {
                filtered = allMatches.filter(m => {
                    if (m.info?.gameMode !== 'CHERRY' && m.info?.gameMode !== 'ARENA') return false;
                    const p = m.info.participants.find(x => x.puuid === currentPuuid);
                    return p && p.placement === 1;
                });
            } else if (filter === 'best-kda') {
                filtered = allMatches
                    .map(m => {
                        const p = m.info?.participants?.find(x => x.puuid === currentPuuid);
                        const kda = p ? ((p.kills + p.assists) / Math.max(1, p.deaths)) : 0;
                        return { match: m, kda };
                    })
                    .sort((a, b) => b.kda - a.kda)
                    .slice(0, 20) // Top 20 by KDA
                    .map(x => x.match);
            }

            if (filtered.length === 0) {
                matchList.innerHTML = `<div class="text-center text-slate-500 py-8 italic">No ${filter === 'arena-1st' ? 'Arena 1st place victories' : 'matches'} found in last 50 games.</div>`;
                return;
            }

            matchList.innerHTML = '';
            filtered.forEach(m => renderMatchCard(m, currentPuuid));

        } catch (e) {
            console.error('Heavy filter fetch error:', e);
            matchList.innerHTML = '<div class="text-center text-lolRed py-8">Error loading matches. Try again later.</div>';
        }
    }

    function showFilterCooldown(filter) {
        const remaining = Math.ceil((filterCooldownEnd - Date.now()) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;

        matchList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 gap-4">
                <div class="text-yellow-400 text-sm font-semibold">
                    <i class="fa-solid fa-clock mr-2"></i>
                    Rate Limit Cooldown
                </div>
                <div class="text-3xl font-black text-white" id="filter-cooldown-timer">
                    ${mins}:${String(secs).padStart(2, '0')}
                </div>
                <div class="text-[10px] text-muted text-center max-w-xs">
                    Heavy filters search 50 matches and require a 2 minute cooldown to respect API rate limits.
                </div>
                <button id="filter-load-btn" class="hidden mt-4 bg-lolPurple/20 hover:bg-lolPurple/30 text-lolPurple font-semibold py-2 px-6 rounded-lg transition-all text-sm">
                    <i class="fa-solid fa-search mr-2"></i>Load Matches
                </button>
            </div>
        `;

        // Update timer
        const timerEl = document.getElementById('filter-cooldown-timer');
        const loadBtn = document.getElementById('filter-load-btn');

        const interval = setInterval(() => {
            const rem = Math.max(0, Math.ceil((filterCooldownEnd - Date.now()) / 1000));
            const m = Math.floor(rem / 60);
            const s = rem % 60;

            if (timerEl) timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;

            if (rem <= 0) {
                clearInterval(interval);
                if (timerEl) timerEl.textContent = '0:00';
                if (loadBtn) {
                    loadBtn.classList.remove('hidden');
                    loadBtn.onclick = () => fetchHeavyFilterMatches(filter);
                }
            }
        }, 1000);
    }

    function renderFilteredMatches(filter) {
        // Legacy function - now use handleFilterClick
        handleFilterClick(filter);
    }

    // --- Init ---
    // Fetch latest DDragon version
    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
        .then(r => r.json())
        .then(v => { ddragonVer = v[0]; refreshLists(); })
        .catch(e => console.warn('Utils: Failed to fetch patch', e));

    renderLists();

    // --- Event Listeners ---

    // Navigation
    homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        showHome();
    });

    // Search Triggers
    searchBtn.addEventListener('click', () => triggerSearch(summonerInput.value, regionSelect.value));
    summonerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerSearch(summonerInput.value, regionSelect.value); });

    navInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // Use current region or default? For now use the main selector's value as default if not visible
            triggerSearch(navInput.value, regionSelect.value);
            navInput.blur();
        }
    });

    // Region Button Selector
    const regionButtons = document.getElementById('region-buttons');
    if (regionButtons) {
        regionButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.region-btn');
            if (!btn) return;

            // Update active state
            regionButtons.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Sync with hidden select
            regionSelect.value = btn.dataset.region;
        });
    }

    // Favorite Toggle
    favBtn.addEventListener('click', () => {
        if (currentProfile) {
            toggleFavorite(currentProfile);
            updateFavIcon();
        }
    });

    // --- Core Logic ---

    function showHome() {
        homeView.classList.remove('hidden');
        profileView.classList.add('hidden');
        navSearchContainer.classList.add('hidden', 'opacity-0');
        navSearchContainer.classList.remove('flex', 'opacity-100');
        renderLists(); // Refresh lists just in case
    }

    function showProfile() {
        homeView.classList.add('hidden');
        profileView.classList.remove('hidden');
        navSearchContainer.classList.remove('hidden');
        // Small delay for fade in
        setTimeout(() => {
            navSearchContainer.classList.add('opacity-100');
            navSearchContainer.classList.remove('opacity-0');
        }, 50);
    }

    function triggerSearch(fullInput, region) {
        if (!fullInput.includes('#')) {
            showError("Please include the tag! format: Name #Tag");
            return;
        }

        // Sync inputs
        summonerInput.value = fullInput;
        navInput.value = fullInput;
        regionSelect.value = region;

        handleSearch(fullInput, region);
    }

    async function handleSearch(fullInput, region) {
        const [gameName, tagLine] = fullInput.split('#');

        // UI Reset
        showError(null);
        showProfile();
        loading.classList.remove('hidden');
        profileContent.classList.add('hidden');
        matchList.innerHTML = '';
        navSearchContainer.classList.add('opacity-50', 'pointer-events-none'); // Disable nav search while loading

        try {
            // 1. Get PUUID (Account V1)
            const accountUrl = `${PROXY_BASE}?endpoint=account-by-riot-id&region=${region}&gameName=${gameName}&tagLine=${tagLine}`;
            const accountRes = await fetch(accountUrl);
            if (!accountRes.ok) throw new Error('Account not found. Check Name#Tag.');
            const accountData = await accountRes.json();

            const puuid = accountData.puuid;

            // 2. Get Summoner Details (Summoner V4 needs PUUID)
            const summUrl = `${PROXY_BASE}?endpoint=summoner-by-puuid&region=${region}&puuid=${puuid}`;
            const summRes = await fetch(summUrl);

            if (!summRes.ok) {
                throw new Error(`Summoner not found in ${region.toUpperCase()}. Are they in a different region?`);
            }

            const summData = await summRes.json();

            // Success! We have a profile.
            // Update current profile state for History/Favorites
            currentProfile = {
                name: accountData.gameName,
                tag: accountData.tagLine,
                region: region,
                icon: summData.profileIconId,
                puuid: puuid
            };
            addToHistory(currentProfile);
            updateFavIcon();

            // 3. Get Rank (League V4)
            let rankData = [];
            if (summData.id) {
                const rankUrl = `${PROXY_BASE}?endpoint=league-entries&region=${region}&summonerId=${summData.id}`;
                const rankRes = await fetch(rankUrl);
                if (rankRes.ok) {
                    rankData = await rankRes.json();
                } else {
                    console.warn("Rank fetch failed:", await rankRes.text());
                }
            }

            // 4. Get Mastery (Top 3 for Banner)
            let masteryData = [];
            if (puuid) {
                // Fetch top 10 just in case, use top 3
                const masteryUrl = `${PROXY_BASE}?endpoint=mastery-top&region=${region}&puuid=${puuid}&count=6`; // Endpoint might default to all or top X
                const masteryRes = await fetch(masteryUrl);
                if (masteryRes.ok) {
                    const data = await masteryRes.json();
                    if (Array.isArray(data)) {
                        masteryData = data;
                    }
                }
            }

            // Render Profile Header (Pass full mastery list)
            await renderProfile(summData, accountData, rankData, masteryData);

            // 5. Get Match History (Match V5)
            const matchesUrl = `${PROXY_BASE}?endpoint=match-list&region=${region}&puuid=${puuid}&count=20`; // Fetch 20 for better stats
            const matchesRes = await fetch(matchesUrl);

            if (!matchesRes.ok) {
                console.warn("Match history fetch failed");
                matchList.innerHTML = '<div class="text-center text-slate-500 py-4">Could not load match history.</div>';
                loading.classList.add('hidden');
                profileContent.classList.remove('hidden');
                navSearchContainer.classList.remove('opacity-50', 'pointer-events-none');
                return;
            }

            const matchIds = await matchesRes.json();

            // Load Matches & Calc Stats
            if (Array.isArray(matchIds) && matchIds.length > 0) {
                // We need to fetch details to calc stats, so we do it in parallel or batch
                // For UX, we render cards one by one, but for the "Stats Box", we need all data.
                // Approach: Fetch first 5 for quick render, then fetch rest for stats? 
                // Let's fetch all 20 in parallel but limit concurrency if needed. For now, Promise.all on chunks.

                const matchPromises = matchIds.map(id => fetch(`${PROXY_BASE}?endpoint=match-details&region=${region}&matchId=${id}`).then(r => r.json()));
                const matchesData = await Promise.all(matchPromises);

                // Filter valid
                const validMatches = matchesData.filter(m => m && m.info);

                // Calculate Aggregated Stats (Pass Mastery Data)
                calculateStats(validMatches, puuid, masteryData);

                // Calculate win streak
                calculateWinStreak(validMatches, puuid);

                // Detect friends before rendering matches
                detectedFriends = detectFriends(validMatches, puuid);
                renderFriendsSidebar(detectedFriends, validMatches);

                // Initialize Penta Tracker (don't auto-scan)
                initPentaTracker(region, puuid);

                // Fetch Arena God challenge progress from Challenges API
                fetchArenaGodChallenge(region, puuid);

                // Fetch game data (items and augments) before rendering
                await fetchGameData();

                // Store matches for filtering
                currentMatches = validMatches;
                currentPuuid = puuid;
                currentRegion = region;

                // Setup filter buttons
                setupMatchFilters();

                // Render Matches (default: all)
                renderFilteredMatches('all');

                // Show Load More button and wire up click
                matchesLoadedCount = 20; // Reset count for new profile
                const loadMoreContainer = document.getElementById('load-more-container');
                const loadMoreBtn = document.getElementById('load-more-btn');
                if (loadMoreContainer) {
                    loadMoreContainer.classList.remove('hidden');
                    loadMoreContainer.innerHTML = `
                        <button id="load-more-btn" class="bg-lolPurple/20 hover:bg-lolPurple/30 text-lolPurple font-semibold text-sm px-6 py-2.5 rounded-xl transition-all border border-lolPurple/30 flex items-center gap-2 mx-auto">
                            <i class="fa-solid fa-plus"></i>
                            Load More Matches
                        </button>
                        <div id="load-more-spinner" class="hidden py-2">
                            <i class="fa-solid fa-spinner fa-spin text-lolPurple text-lg"></i>
                        </div>
                    `;
                    document.getElementById('load-more-btn').onclick = loadMoreMatches;
                }

            } else {
                console.warn("No matches found", matchIds);
                matchList.innerHTML = '<div class="text-center text-slate-500 py-4">No recent matches found.</div>';
            }

        } catch (err) {
            console.error(err);
            showError(err.message || "An unexpected error occurred.");
        } finally {
            loading.classList.add('hidden');
            profileContent.classList.remove('hidden');
            navSearchContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    // --- Rendering Logic ---

    // --- Stats Calculation (Calls after matches load) ---
    async function calculateStats(matches, puuid, masteryData) {
        let totalKills = 0, totalDeaths = 0, totalAssists = 0;
        const champStats = {}; // { ChampName: { count, wins, k, d, a } }

        matches.forEach(m => {
            const p = m.info.participants.find(p => p.puuid === puuid);
            if (!p) return;

            totalKills += p.kills;
            totalDeaths += p.deaths;
            totalAssists += p.assists;

            // Champ Stats
            if (!champStats[p.championName]) {
                champStats[p.championName] = { count: 0, wins: 0, k: 0, d: 0, a: 0 };
            }
            const c = champStats[p.championName];
            c.count++;
            if (p.win) c.wins++;
            c.k += p.kills;
            c.d += p.deaths;
            c.a += p.assists;
        });

        // Update Avg KDA UI (Banner)
        const avgKda = (totalDeaths === 0) ? (totalKills + totalAssists) : ((totalKills + totalAssists) / totalDeaths);
        const kdaEl = document.getElementById('banner-kda-val');
        const kdaBar = document.getElementById('banner-kda-bar');

        if (kdaEl) {
            kdaEl.textContent = avgKda.toFixed(2);
            if (avgKda >= 4) kdaEl.className = "text-xl font-black text-lolGold";
            else if (avgKda >= 3) kdaEl.className = "text-xl font-black text-lolBlue";
            else kdaEl.className = "text-xl font-black text-white";
        }

        if (kdaBar) {
            // Max bar at like 6 KDA?
            const pct = Math.min((avgKda / 6) * 100, 100);
            setTimeout(() => { kdaBar.style.width = `${pct}%`; }, 200);
        }

        // Update Top Champs UI (Banner) - USE MASTERY DATA IF AVAILABLE
        const topChampsList = document.getElementById('banner-top-champs');
        if (topChampsList) {
            topChampsList.innerHTML = '';

            // Helper to get champ key/name map if needed, or rely on ddragon cdn with ID if possible?
            // DDragon requires Name (e.g. Aatrox) not ID. We need to map ID -> Name.
            // We likely already fetched champ data in renderProfile or can fetch it here.

            let champsToRender = [];

            if (masteryData && masteryData.length > 0) {
                // Use Mastery Data
                // Need to map ID to Name.
                // Let's fetch champ json if not cached
                try {
                    const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/data/en_US/champion.json`);
                    const cData = await cRes.json();
                    const map = cData.data;

                    // Filter top 3
                    champsToRender = masteryData.slice(0, 3).map((m, idx) => {
                        const found = Object.values(map).find(c => c.key == m.championId);
                        return {
                            name: found ? found.id : 'Unknown', // .id is the name key for images
                            points: m.championPoints,
                            rank: idx + 1
                        };
                    });
                } catch (e) { console.warn("Champ map fail", e); }
            } else {
                // Fallback to recent history stats
                champsToRender = Object.entries(champStats)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .slice(0, 3)
                    .map(([name, stats]) => ({ name, points: `${stats.count} Games` }));
            }

            champsToRender.forEach(item => {
                const wrapper = document.createElement('div');
                wrapper.className = "relative";

                // Icon container
                const img = document.createElement('img');
                img.src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${item.name}.png`;
                img.className = "w-8 h-8 rounded-lg border-2 object-cover shadow-md";

                // Border color based on rank
                if (item.rank === 1) {
                    img.classList.add('border-lolGold');
                } else if (item.rank === 2) {
                    img.classList.add('border-slate-400');
                } else {
                    img.classList.add('border-amber-700');
                }

                wrapper.appendChild(img);
                topChampsList.appendChild(wrapper);
            });

            if (champsToRender.length === 0) topChampsList.innerHTML = '<span class="text-[10px] text-muted italic">No Data</span>';
        }
    }

    // --- Win Streak Calculator ---
    function calculateWinStreak(matches, puuid) {
        const section = document.getElementById('win-streak-section');
        const valEl = document.getElementById('win-streak-val');
        const typeEl = document.getElementById('win-streak-type');

        if (!section || !matches.length) return;

        // Filter out remakes (5 min or less) and Arena (placement-based)
        const validMatches = matches.filter(m => {
            if (m.info.gameDuration <= 300) return false;
            if (m.info.gameMode === 'CHERRY' || m.info.gameMode === 'ARENA') return false;
            return true;
        });

        if (validMatches.length === 0) return;

        // Sort by timestamp (newest first)
        validMatches.sort((a, b) => b.info.gameEndTimestamp - a.info.gameEndTimestamp);

        // Calculate streak from most recent game
        const firstResult = validMatches[0].info.participants.find(p => p.puuid === puuid)?.win;
        let streak = 0;

        for (const m of validMatches) {
            const p = m.info.participants.find(x => x.puuid === puuid);
            if (!p) continue;

            if (p.win === firstResult) {
                streak++;
            } else {
                break;
            }
        }

        // Update UI
        section.classList.remove('hidden');

        if (firstResult) {
            valEl.textContent = `${streak}W`;
            valEl.className = "text-xl font-black leading-none text-green-400";
            typeEl.textContent = streak >= 3 ? "🔥 Hot Streak" : "Winning";
            typeEl.className = "text-[9px] text-green-400 mt-0.5";
        } else {
            valEl.textContent = `${streak}L`;
            valEl.className = "text-xl font-black leading-none text-red-400";
            typeEl.textContent = streak >= 3 ? "❄️ Cold Streak" : "Losing";
            typeEl.className = "text-[9px] text-red-400 mt-0.5";
        }
    }

    // --- Arena God Challenge Tracker (using Challenges API) ---
    // Possible Arena challenge IDs:
    // 602001 = Arena total wins (not what we want)
    // 602002 = Arena unique champion wins? (Arena God)
    const ARENA_GOD_CHALLENGE_ID = 602002; // Try this for unique champs

    async function fetchArenaGodChallenge(region, puuid) {
        const tracker = document.getElementById('arena-god-tracker');
        const countEl = document.getElementById('arena-god-count');
        const barEl = document.getElementById('arena-god-bar');
        const champsEl = document.getElementById('arena-god-champs');

        if (!tracker) return;

        try {
            const res = await fetch(`${PROXY_BASE}?endpoint=challenges&region=${region}&puuid=${puuid}`);
            if (!res.ok) {
                console.warn('Failed to fetch challenges data');
                return;
            }

            const data = await res.json();

            // Debug: Log all arena challenges (602xxx range)
            const arenaChallenges = data.challenges?.filter(c =>
                c.challengeId >= 602000 && c.challengeId < 603000
            );
            console.log('Arena challenges:', arenaChallenges);

            // Find the Arena Champion challenge
            const arenaChallenge = data.challenges?.find(c => c.challengeId === ARENA_GOD_CHALLENGE_ID);

            if (!arenaChallenge) {
                console.warn('Arena God challenge not found, trying fallback...');
                // Try to find any arena challenge with value <= 60 (likely the unique champs one)
                const fallback = arenaChallenges?.find(c => c.value <= 60);
                if (!fallback) return;
                displayArenaGodProgress(tracker, countEl, barEl, champsEl, fallback.value, fallback.level);
                return;
            }

            displayArenaGodProgress(tracker, countEl, barEl, champsEl, arenaChallenge.value, arenaChallenge.level);

        } catch (e) {
            console.warn('Arena God fetch error:', e);
        }
    }

    function displayArenaGodProgress(tracker, countEl, barEl, champsEl, currentValue, level) {
        const target = 60; // Arena God requires 60 unique champions
        const progress = Math.min(100, (currentValue / target) * 100);

        // Show the tracker
        tracker.classList.remove('hidden');
        countEl.textContent = `${currentValue}/${target}`;
        barEl.style.width = `${progress}%`;

        // Level-based styling
        const levelColors = {
            'NONE': 'text-slate-400',
            'IRON': 'text-slate-400',
            'BRONZE': 'text-amber-700',
            'SILVER': 'text-slate-300',
            'GOLD': 'text-lolGold',
            'PLATINUM': 'text-cyan-400',
            'DIAMOND': 'text-blue-400',
            'MASTER': 'text-purple-400',
            'GRANDMASTER': 'text-red-400',
            'CHALLENGER': 'text-yellow-400'
        };

        countEl.className = `text-[10px] font-bold ${levelColors[level] || 'text-lolGold'}`;

        // Show level badge if progressed
        if (champsEl) {
            champsEl.innerHTML = '';
            if (level && level !== 'NONE') {
                const badge = document.createElement('span');
                badge.className = `text-[8px] ${levelColors[level]} uppercase font-bold`;
                badge.textContent = level;
                champsEl.appendChild(badge);
            }
        }
    }

    async function renderProfile(summ, acc, leagues, masteryList) {
        // Headers
        document.getElementById('profile-name').textContent = acc.gameName;
        document.getElementById('profile-tag').textContent = `#${acc.tagLine}`;
        document.getElementById('profile-level').textContent = `Lvl ${summ.summonerLevel}`;
        document.getElementById('profile-icon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/profileicon/${summ.profileIconId}.png`;

        // Dynamic Splash Art
        const headerSplash = document.getElementById('header-splash');

        if (masteryList && masteryList.length > 0) {
            const champId = masteryList[0].championId;
            try {
                // Ensure champsData is fetched or cached
                // We rely on the request in calculateStats or here. 
                // Ideally we should cache champsData globally.
                const champsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/data/en_US/champion.json`);
                const champsData = await champsRes.json();
                const champKey = Object.keys(champsData.data).find(key => champsData.data[key].key == champId);

                if (champKey) {
                    headerSplash.style.backgroundImage = "url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/" + champKey + "_0.jpg')";
                }
            } catch (e) {
                console.warn("Champ map fail", e);
                headerSplash.style.backgroundImage = 'none';
            }
        } else {
            headerSplash.style.backgroundImage = 'none';
        }

        // Rank Logic
        const soloQ = Array.isArray(leagues) ? leagues.find(l => l.queueType === 'RANKED_SOLO_5x5') : null;
        const flexQ = Array.isArray(leagues) ? leagues.find(l => l.queueType === 'RANKED_FLEX_SR') : null;

        // --- Populate Banner Stats ---

        // Rank Solo
        const elRankIcon = document.getElementById('banner-rank-icon');
        const elRankTier = document.getElementById('banner-rank-tier');
        const elRankLP = document.getElementById('banner-rank-lp');

        if (soloQ) {
            elRankTier.textContent = `${soloQ.tier} ${soloQ.rank}`;
            const tierColor = getTierColor(soloQ.tier);
            elRankTier.className = `text-sm font-black tracking-wide text-${tierColor}`;
            elRankLP.textContent = `${soloQ.leaguePoints} LP · ${Math.round((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100)}% WR`;
            elRankIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${soloQ.tier.toLowerCase()}.png`;
        } else {
            elRankTier.textContent = "UNRANKED";
            elRankTier.className = "text-sm font-black tracking-wide text-muted";
            elRankLP.textContent = "0 LP";
            elRankIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-unranked.png`;
            elRankIcon.onerror = () => { elRankIcon.src = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-iron.png"; };
        }

        // Rank Flex (New dedicated card)
        const elFlexIcon = document.getElementById('banner-flex-icon');
        const elFlexTier = document.getElementById('banner-flex-tier');
        const elFlexLP = document.getElementById('banner-flex-lp');

        if (flexQ) {
            elFlexTier.textContent = `${flexQ.tier} ${flexQ.rank}`;
            const tierColor = getTierColor(flexQ.tier);
            elFlexTier.className = `text-sm font-black tracking-wide text-${tierColor}`;
            elFlexLP.textContent = `${flexQ.leaguePoints} LP · ${Math.round((flexQ.wins / (flexQ.wins + flexQ.losses)) * 100)}% WR`;
            elFlexIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${flexQ.tier.toLowerCase()}.png`;
        } else {
            elFlexTier.textContent = "UNRANKED";
            elFlexTier.className = "text-sm font-black tracking-wide text-muted";
            elFlexLP.textContent = "0 LP";
            elFlexIcon.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-unranked.png`;
            elFlexIcon.onerror = () => { elFlexIcon.src = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-iron.png"; };
        }
    }

    function loadMatchDetails(matchId, region, myPuuid) {
        // Deprecated single loader in favor of batch loader above
    }

    // --- Tooltip System ---
    const tooltipEl = document.getElementById('global-tooltip');

    // Cache for item/augment data
    let itemDataCache = null;
    let augmentDataCache = null;

    async function fetchGameData() {
        if (!itemDataCache) {
            try {
                const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/data/en_US/item.json`);
                const json = await res.json();
                itemDataCache = json.data;
            } catch (e) { console.warn("Failed to fetch item data:", e); }
        }

        if (!augmentDataCache) {
            try {
                // CommunityDragon for Augments
                const res = await fetch('https://raw.communitydragon.org/latest/cdragon/arena/en_us.json');
                const json = await res.json();

                // Process into a map for easy lookup: { id: { name, desc, icon } }
                augmentDataCache = {};
                if (json && json.augments) {
                    json.augments.forEach(aug => {
                        augmentDataCache[aug.id] = aug;
                    });
                }
            } catch (e) {
                console.warn("Failed to fetch augment data:", e);
                augmentDataCache = {}; // Empty fallback
            }
        }
    }

    // Basic Tooltip
    function attachTooltip(el, title, body, cost) {
        el.addEventListener('mouseenter', (e) => {
            tooltipEl.innerHTML = `
                ${title ? `<h4 class="text-lolGold text-sm font-bold">${title}</h4>` : ''}
                ${body ? `<p class="text-xs text-slate-300">${body}</p>` : ''}
                ${cost ? `<div class="text-xs text-slate-400 mt-1">Cost: ${cost}</div>` : ''}
            `;
            tooltipEl.classList.remove('hidden');
            setTimeout(() => tooltipEl.classList.add('visible'), 10);
            updateTooltipPos(e);
        });
        el.addEventListener('mousemove', updateTooltipPos);
        el.addEventListener('mouseleave', () => {
            tooltipEl.classList.remove('visible');
            setTimeout(() => tooltipEl.classList.add('hidden'), 150);
        });
    }

    function updateTooltipPos(e) {
        const x = e.clientX;
        const y = e.clientY;

        // Prevent overflow
        const rect = tooltipEl.getBoundingClientRect();
        let left = x + 15;
        let top = y + 15;

        if (left + rect.width > window.innerWidth) left = x - rect.width - 15;
        if (top + rect.height > window.innerHeight) top = y - rect.height - 15;

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    }

    // --- Friend Detection Logic ---
    function detectFriends(matches, myPuuid) {
        const counts = {};
        matches.forEach(m => {
            const myTeam = m.info.participants.find(p => p.puuid === myPuuid)?.teamId;
            m.info.participants.forEach(p => {
                if (p.puuid !== myPuuid && p.teamId === myTeam) {
                    counts[p.puuid] = (counts[p.puuid] || 0) + 1;
                }
            });
        });

        // Return Set of PUUIDs played with > 1 time (2+ games together = friendish)
        const friends = new Set();
        for (const [pid, count] of Object.entries(counts)) {
            if (count > 1) friends.add(pid);
        }
        return friends;
    }

    // GLOBAL friends set
    let detectedFriends = new Set();

    function renderFriendsSidebar(friendsSet, matches) {
        const container = document.getElementById('friends-sidebar');
        if (!container) return;

        const friendDetails = {}; // puuid -> { name, icon, count }

        matches.forEach(m => {
            m.info.participants.forEach(p => {
                if (friendsSet.has(p.puuid)) {
                    if (!friendDetails[p.puuid]) {
                        friendDetails[p.puuid] = {
                            name: p.riotIdGameName || p.summonerName,
                            icon: p.profileIcon,
                            champ: p.championName,
                            count: 0
                        };
                    }
                    friendDetails[p.puuid].count++;
                }
            });
        });

        // Clear and Render
        const listDiv = document.createElement('div');
        listDiv.className = "flex flex-col gap-1 px-2";

        const entries = Object.values(friendDetails).sort((a, b) => b.count - a.count);
        if (entries.length === 0) {
            container.innerHTML = '<div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2 border-b border-white/5 mb-2">Recent Allies</div><div class="text-xs text-slate-500 italic px-4 pb-2">No frequent duos.</div>';
            return;
        }

        container.innerHTML = '<div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2 border-b border-white/5 mb-2">Recent Allies</div>';

        entries.forEach(f => {
            const div = document.createElement('div');
            div.className = "flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group";
            div.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-lolBlue/20 flex items-center justify-center text-lolBlue font-bold text-xs border border-lolBlue/30 overflow-hidden">
                    <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${f.champ}.png" class="w-full h-full object-cover opacity-80 group-hover:opacity-100">
                </div>
                <div class="overflow-hidden">
                    <div class="text-xs font-bold text-slate-300 group-hover:text-white truncate">${f.name}</div>
                    <div class="text-[10px] text-slate-500">${f.count} Games Together</div>
                </div>
             `;
            listDiv.appendChild(div);
        });
        container.appendChild(listDiv);
    }

    // Initialize Penta Tracker UI (show cached or scan button)
    function initPentaTracker(region, puuid) {
        const pentaContent = document.getElementById('penta-content');
        if (!pentaContent) return;

        const cacheKey = `penta_cache_${puuid}`;
        const cache = JSON.parse(localStorage.getItem(cacheKey) || 'null');

        if (cache && cache.pentas) {
            // Show cached data with rescan option
            renderPentaUI(pentaContent, cache.pentas, cache.total, cache.scanned, true);

            // Add rescan button
            const rescanBtn = document.createElement('button');
            rescanBtn.className = 'mt-3 w-full text-[9px] uppercase tracking-widest text-muted hover:text-white bg-white/5 hover:bg-white/10 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5';
            rescanBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Rescan';
            rescanBtn.onclick = () => showPentaScanConfirmation(region, puuid, true);
            pentaContent.appendChild(rescanBtn);
        } else {
            // Show scan button
            pentaContent.innerHTML = `
                <div class="flex flex-col items-center gap-3 py-2">
                    <i class="fa-solid fa-skull text-lolRed/30 text-2xl"></i>
                    <div class="text-[10px] text-muted text-center">Scan your match history to find penta kills</div>
                    <button id="penta-scan-btn" class="text-[10px] uppercase tracking-widest bg-lolRed/20 hover:bg-lolRed/30 text-lolRed font-semibold py-2 px-4 rounded-lg transition-all flex items-center gap-2">
                        <i class="fa-solid fa-search"></i> Scan Matches
                    </button>
                </div>
            `;
            document.getElementById('penta-scan-btn').onclick = () => showPentaScanConfirmation(region, puuid, false);
        }

        // Store region/puuid for later use
        pentaContent.dataset.region = region;
        pentaContent.dataset.puuid = puuid;
    }

    // Show confirmation modal before scanning
    function showPentaScanConfirmation(region, puuid, isRescan) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'penta-confirm-modal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-enter';
        modal.innerHTML = `
            <div class="glass-card p-6 rounded-2xl max-w-md mx-4 text-center">
                <i class="fa-solid fa-skull text-lolRed text-4xl mb-4"></i>
                <h3 class="text-lg font-bold text-white mb-2">${isRescan ? 'Rescan Matches?' : 'Scan for Penta Kills?'}</h3>
                <p class="text-sm text-muted mb-4">
                    This will scan <span class="text-white font-semibold">all your matches from this year</span> to find penta kills.
                </p>
                <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 text-left">
                    <p class="text-xs text-yellow-400 mb-2">
                        <i class="fa-solid fa-exclamation-triangle mr-1"></i>
                        <strong>Slow Process Warning</strong>
                    </p>
                    <ul class="text-[10px] text-yellow-400/80 space-y-1 ml-4 list-disc">
                        <li>API rate limit: 70 matches every 2 minutes</li>
                        <li>For 300 matches: ~10-12 minutes</li>
                        <li>Timer shown during cooldown periods</li>
                        <li>Progress saved if you leave the page</li>
                    </ul>
                </div>
                <div class="flex gap-3">
                    <button id="penta-cancel-btn" class="flex-1 py-2 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-muted hover:text-white text-sm font-semibold transition-all">
                        Cancel
                    </button>
                    <button id="penta-confirm-btn" class="flex-1 py-2 px-4 rounded-lg bg-lolRed/20 hover:bg-lolRed/30 text-lolRed text-sm font-semibold transition-all">
                        ${isRescan ? 'Rescan' : 'Start Scan'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Cancel button
        document.getElementById('penta-cancel-btn').onclick = () => {
            modal.remove();
        };

        // Confirm button
        document.getElementById('penta-confirm-btn').onclick = () => {
            modal.remove();
            if (isRescan) {
                // Clear cache before rescan
                localStorage.removeItem(`penta_cache_${puuid}`);
            }
            calculatePentaStats(region, puuid);
        };

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }


    async function calculatePentaStats(region, puuid) {
        try {
            const pentaContent = document.getElementById('penta-content');
            if (!pentaContent) return;

            const cacheKey = `penta_cache_${puuid}`;
            const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;

            // Rate limiting: 100 requests per 2 minutes = 70 to be safe
            const MATCHES_PER_WINDOW = 70;
            const WINDOW_COOLDOWN = 125000; // 2 min 5 sec cooldown
            const BATCH_SIZE = 5; // Fetch 5 at once
            const BATCH_DELAY = 600; // 600ms between batches
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            // Show loading state
            pentaContent.innerHTML = `
                <div class="flex flex-col items-center gap-2">
                    <i class="fa-solid fa-skull text-lolRed/50 text-xl animate-pulse"></i>
                    <div class="text-xs text-muted">Finding matches...</div>
                    <div id="penta-progress" class="text-[9px] text-muted/50">0 / ? games</div>
                    <div id="penta-eta" class="text-[9px] text-lolPurple hidden"></div>
                    <div id="penta-timer" class="text-[10px] text-yellow-400 hidden"></div>
                </div>
            `;

            // Fetch all match IDs for the year
            let allMatchIds = [];
            let startIndex = 0;
            let hasMore = true;

            while (hasMore) {
                try {
                    const matchesUrl = `${PROXY_BASE}?endpoint=match-list&region=${region}&puuid=${puuid}&count=100&start=${startIndex}&startTime=${Math.floor(startOfYear)}`;
                    const matchesRes = await fetch(matchesUrl);

                    if (!matchesRes.ok) {
                        if (matchesRes.status === 429) {
                            updatePentaStatus('Rate limited, waiting...', 'Rate limit hit on match list');
                            await sleep(10000);
                            continue;
                        }
                        hasMore = false;
                        continue;
                    }

                    const ids = await matchesRes.json();

                    if (!Array.isArray(ids) || ids.length === 0) {
                        hasMore = false;
                    } else {
                        allMatchIds = allMatchIds.concat(ids);
                        startIndex += 100;

                        updatePentaProgress(`Found ${allMatchIds.length} matches...`);

                        if (ids.length < 100) hasMore = false;
                        await sleep(500);
                    }
                } catch (e) {
                    console.warn('Error fetching match list', e);
                    hasMore = false;
                }
            }

            if (allMatchIds.length === 0) {
                pentaContent.innerHTML = '<div class="text-xs text-muted italic">No matches found this year</div>';
                return;
            }

            // Calculate estimated time
            const totalWindows = Math.ceil(allMatchIds.length / MATCHES_PER_WINDOW);
            const estimatedMinutes = Math.ceil((totalWindows - 1) * 2 + (allMatchIds.length % MATCHES_PER_WINDOW || MATCHES_PER_WINDOW) * (BATCH_DELAY / 1000 / 60));

            // Initialize fresh stats
            let pentas = {};
            let totalPentas = 0;
            let requestsInWindow = 0;
            const scanStartTime = Date.now();

            // ETA update function
            const updatePentaETA = (processedCount, totalCount) => {
                const etaEl = document.getElementById('penta-eta');
                if (!etaEl) return;

                const remainingMatches = totalCount - processedCount;
                if (remainingMatches <= 0) {
                    etaEl.classList.add('hidden');
                    return;
                }

                // Calculate remaining windows needed
                const remainingInCurrentWindow = MATCHES_PER_WINDOW - requestsInWindow;
                const matchesAfterCurrentWindow = Math.max(0, remainingMatches - remainingInCurrentWindow);
                const additionalWindowsNeeded = Math.ceil(matchesAfterCurrentWindow / MATCHES_PER_WINDOW);

                // Time: cooldowns + batch processing time
                const cooldownTime = additionalWindowsNeeded * (WINDOW_COOLDOWN / 1000 / 60); // in minutes
                const processingTime = (remainingMatches / BATCH_SIZE) * (BATCH_DELAY / 1000 / 60); // in minutes
                const totalMinutes = Math.ceil(cooldownTime + processingTime);

                if (totalMinutes > 0) {
                    etaEl.classList.remove('hidden');
                    if (totalMinutes >= 60) {
                        const hours = Math.floor(totalMinutes / 60);
                        const mins = totalMinutes % 60;
                        etaEl.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>~${hours}h ${mins}m remaining`;
                    } else {
                        etaEl.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>~${totalMinutes}m remaining`;
                    }
                } else {
                    etaEl.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>Almost done...`;
                }
            };

            updatePentaProgress(`0 / ${allMatchIds.length} games`);
            updatePentaETA(0, allMatchIds.length);

            // Process matches in batches with rate limiting
            for (let i = 0; i < allMatchIds.length; i += BATCH_SIZE) {
                const chunk = allMatchIds.slice(i, i + BATCH_SIZE);

                // Check if we need to cooldown (approaching rate limit)
                if (requestsInWindow >= MATCHES_PER_WINDOW) {
                    await showCooldownTimer(WINDOW_COOLDOWN);
                    requestsInWindow = 0;
                }

                try {
                    const promises = chunk.map(id =>
                        fetch(`${PROXY_BASE}?endpoint=match-details&region=${region}&matchId=${id}`)
                            .then(r => {
                                if (r.status === 429) throw new Error('RATE_LIMITED');
                                if (!r.ok) return null;
                                return r.json();
                            })
                            .catch(e => {
                                if (e.message === 'RATE_LIMITED') throw e;
                                return null;
                            })
                    );

                    const results = await Promise.all(promises);

                    results.forEach(m => {
                        if (!m || !m.info) return;

                        const p = m.info.participants.find(x => x.puuid === puuid);
                        if (!p) return;

                        // Track Pentas (non-Arena)
                        if (m.info.gameMode !== 'ARENA' && m.info.gameMode !== 'CHERRY') {
                            if (p.pentaKills > 0) {
                                totalPentas += p.pentaKills;
                                pentas[p.championName] = (pentas[p.championName] || 0) + p.pentaKills;
                            }
                        }
                    });

                    requestsInWindow += chunk.length;
                    updatePentaProgress(`${Math.min(i + chunk.length, allMatchIds.length)} / ${allMatchIds.length} games`);
                    updatePentaETA(Math.min(i + chunk.length, allMatchIds.length), allMatchIds.length);

                } catch (e) {
                    if (e.message === 'RATE_LIMITED') {
                        updatePentaStatus('Rate limit hit! Cooling down...', 'yellow');
                        await showCooldownTimer(WINDOW_COOLDOWN);
                        requestsInWindow = 0;
                        i -= BATCH_SIZE; // Retry this batch
                    } else {
                        console.warn('Batch error', e);
                    }
                }

                if (i + BATCH_SIZE < allMatchIds.length) await sleep(BATCH_DELAY);
            }

            // Save to cache
            localStorage.setItem(cacheKey, JSON.stringify({
                pentas,
                total: totalPentas,
                scanned: allMatchIds.length,
                matchIds: allMatchIds,
                timestamp: Date.now()
            }));

            // Final UI update
            renderPentaUI(pentaContent, pentas, totalPentas, allMatchIds.length, false);

        } catch (e) {
            console.warn("Penta fetch error", e);
            const pentaContent = document.getElementById('penta-content');
            if (pentaContent) pentaContent.innerHTML = '<div class="text-xs text-lolRed">Error loading stats</div>';
        }
    }

    function updatePentaProgress(text) {
        const el = document.getElementById('penta-progress');
        if (el) el.textContent = text;
    }

    function updatePentaStatus(text) {
        const el = document.getElementById('penta-timer');
        if (el) {
            el.textContent = text;
            el.classList.remove('hidden');
        }
    }

    async function showCooldownTimer(ms) {
        const timerEl = document.getElementById('penta-timer');
        if (!timerEl) return new Promise(r => setTimeout(r, ms));

        timerEl.classList.remove('hidden');

        const endTime = Date.now() + ms;

        return new Promise(resolve => {
            const interval = setInterval(() => {
                const remaining = Math.max(0, endTime - Date.now());
                const secs = Math.ceil(remaining / 1000);
                const mins = Math.floor(secs / 60);
                const remainingSecs = secs % 60;

                timerEl.innerHTML = `<i class="fa-solid fa-clock mr-1"></i> Cooldown: ${mins}:${String(remainingSecs).padStart(2, '0')}`;

                if (remaining <= 0) {
                    clearInterval(interval);
                    timerEl.classList.add('hidden');
                    resolve();
                }
            }, 1000);
        });
    }

    function arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    function renderPentaUI(container, pentas, totalPentas, scanned, isCached) {
        const sortedPentas = Object.entries(pentas).sort((a, b) => b[1] - a[1]);

        container.innerHTML = `
            <div class="text-center mb-3">
                <div class="text-3xl font-black ${totalPentas > 0 ? 'text-lolRed' : 'text-white'}">${totalPentas}</div>
                <div class="text-[9px] text-muted uppercase tracking-widest">Total Pentas</div>
            </div>
            ${sortedPentas.length > 0 ? `
                <div class="w-full space-y-1">
                    ${sortedPentas.map(([name, count]) => `
                        <div class="flex items-center justify-between text-xs bg-white/5 rounded-lg px-2 py-1">
                            <div class="flex items-center gap-1.5">
                                <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${name}.png" class="w-4 h-4 rounded-full border border-white/20">
                                <span class="text-white text-[10px]">${name}</span>
                            </div>
                            <span class="text-lolGold font-bold text-[10px]">${count}</span>
                        </div>
                    `).join('')}
                </div>
            ` : `<div class="text-[9px] text-muted italic mt-1">No pentas this year</div>`}
            <div class="text-[8px] text-muted/50 mt-2">${scanned} games ${isCached ? '(cached)' : ''}</div>
        `;
    }

    function renderMatchCard(match, myPuuid) {
        if (!match.info) return;
        if (!itemDataCache) fetchGameData();

        const template = document.getElementById('match-card-template');
        const clone = template.content.cloneNode(true);
        const cardContainer = clone.querySelector('.match-card');

        // --- Populate Basic Data ---
        const participants = match.info.participants;
        const p = participants.find(p => p.puuid === myPuuid);
        if (!p) return;

        const isArena = (match.info.gameMode === 'CHERRY' || match.info.gameMode === 'ARENA');

        // Basic Stats
        const isWin = p.win;

        if (isArena) {
            handleArenaCard(clone, match, p, myPuuid);
            matchList.appendChild(cardContainer);
            return;
        }

        const indicator = clone.querySelector('.result-indicator');
        const resultText = clone.querySelector('.result-text');

        if (isWin) {
            indicator.classList.remove('bg-slate-700');
            indicator.classList.add('bg-lolBlue');
            resultText.textContent = "VICTORY";
            resultText.className = "font-black text-sm uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500 mb-0.5";
            cardContainer.classList.add('hover:border-lolBlue/40', 'border-l-lolBlue', 'hover:shadow-lolBlue/10');
        } else {
            indicator.classList.remove('bg-slate-700');
            indicator.classList.add('bg-red-500');
            resultText.textContent = "DEFEAT";
            resultText.className = "font-black text-sm uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-700 mb-0.5";
            cardContainer.classList.add('hover:border-red-500/40', 'border-l-red-500', 'hover:shadow-red-500/10');
        }

        clone.querySelector('.game-mode').textContent = getQueueName(match.info.queueId, match.info.gameMode);
        clone.querySelector('.game-duration').textContent = formatDuration(match.info.gameDuration);
        clone.querySelector('.game-time').textContent = timeAgo(match.info.gameEndTimestamp);

        // Check for remake (5 minutes or less)
        const isRemake = match.info.gameDuration <= 300;
        if (isRemake) {
            indicator.classList.remove('bg-gradient-to-b', 'from-lolBlue', 'to-lolBlue/60', 'bg-red-500');
            indicator.classList.add('bg-slate-500');
            resultText.textContent = "REMAKE";
            resultText.className = "font-black text-sm uppercase tracking-widest text-slate-400 mb-0.5";
            cardContainer.classList.remove('hover:border-lolBlue/40', 'hover:border-red-500/40', 'border-l-lolBlue', 'border-l-red-500');
            cardContainer.classList.add('hover:border-slate-500/40', 'border-l-slate-500', 'opacity-60');
        }

        clone.querySelector('.champ-icon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${p.championName}.png`;
        clone.querySelector('.champ-level').textContent = p.champLevel;

        // KDA
        const kdaBlock = clone.querySelector('.kda-block');
        kdaBlock.innerHTML = `<span class="text-white">${p.kills}</span><span class="text-slate-600 text-sm mx-1">/</span><span class="deaths text-red-400">${p.deaths}</span><span class="text-slate-600 text-sm mx-1">/</span><span class="text-white">${p.assists}</span>`;
        const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
        const kdaEl = clone.querySelector('.kda-ratio');
        kdaEl.textContent = `${kda} KDA`;
        if (kda >= 4) kdaEl.classList.add('text-lolGold', 'font-bold');

        // Badges
        const badgeContainer = clone.querySelector('.badges');

        // Remake badge takes priority
        if (isRemake) {
            const remakeBadge = document.createElement('div');
            remakeBadge.className = "bg-slate-500/20 text-slate-400 text-[9px] px-1.5 py-0.5 rounded border border-slate-500/30 font-bold uppercase tracking-wider";
            remakeBadge.textContent = "ABANDONED";
            badgeContainer.appendChild(remakeBadge);
        } else if (p.pentaKills > 0) addBadge(badgeContainer, 'PENTA');
        else if (p.quadraKills > 0) addBadge(badgeContainer, 'QUADRA');
        else if (p.tripleKills > 0) addBadge(badgeContainer, 'TRIPLE');

        // Friends Badge
        const myTeamId = p.teamId;
        const friendsCount = participants.filter(x => x.teamId === myTeamId && x.puuid !== myPuuid && detectedFriends.has(x.puuid)).length;
        if (friendsCount > 0) {
            const fBadge = document.createElement('div');
            fBadge.className = "bg-lolBlue/20 text-lolBlue text-[9px] px-1.5 py-0.5 rounded border border-lolBlue/30 font-bold uppercase tracking-wider items-center flex gap-1";
            fBadge.innerHTML = `<i class="fa-solid fa-user-group"></i> ${friendsCount > 1 ? 'Party' : 'Duo'}`;
            badgeContainer.appendChild(fBadge);
        }

        // --- Advanced Stats (New) ---
        // CS
        const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
        clone.querySelector('.cs-score').textContent = cs;

        // Dmg
        clone.querySelector('.dmg-total').textContent = formatK(p.totalDamageDealtToChampions);

        // Vision
        const vision = p.visionScore || 0;
        clone.querySelector('.vision-score').textContent = vision;

        // KP
        const myTeam = participants.filter(x => x.teamId === p.teamId);
        const teamKills = myTeam.reduce((acc, curr) => acc + curr.kills, 0);
        const kp = teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
        clone.querySelector('.kp-score').textContent = `${kp}%`;


        // Items & Tooltips
        fillItems(clone, p, true);


        // --- EXPAND BUTTON & DETAILS ---
        const expandBtn = clone.querySelector('.expand-btn');

        const detailsSection = document.createElement('div');
        detailsSection.className = "hidden border-t border-white/5 bg-black/40 p-4 animate-enter mt-2 backdrop-blur-sm rounded-b-xl";

        // Teams Grid Logic
        const team1 = participants.filter(x => x.teamId === 100);
        const team2 = participants.filter(x => x.teamId === 200);
        const allyTeam = myTeamId === 100 ? team1 : team2;
        const enemyTeam = myTeamId === 100 ? team2 : team1;

        // Calculate highlights across both teams
        const allPlayers = [...team1, ...team2];
        const sortedByDamage = [...allPlayers].sort((a, b) => b.totalDamageDealtToChampions - a.totalDamageDealtToChampions);
        const topDamage = sortedByDamage[0]?.puuid;
        const secondDamage = sortedByDamage[1]?.puuid;
        const lowestDeaths = [...allPlayers].sort((a, b) => a.deaths - b.deaths)[0]?.puuid;

        const renderTeamList = (team, title, isAlly) => {
            const col = document.createElement('div');
            col.className = "space-y-1";
            col.innerHTML = `
                <div class="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                    <span class="text-[10px] font-bold ${isAlly ? 'text-lolBlue' : 'text-lolRed'} uppercase tracking-widest">${title}</span>
                    <div class="flex gap-3 text-[8px] text-muted uppercase tracking-wider">
                        <span class="w-14 text-center">KDA</span>
                        <span class="w-12 text-center">DMG</span>
                    </div>
                </div>
            `;

            team.forEach(tm => {
                const row = document.createElement('div');
                const isMe = tm.puuid === myPuuid;
                const isFriend = detectedFriends.has(tm.puuid);
                const isTopDmg = tm.puuid === topDamage;
                const isSecondDmg = tm.puuid === secondDamage;
                const isLowDeaths = tm.puuid === lowestDeaths && tm.deaths <= 3;

                row.className = `flex items-center justify-between text-xs p-1.5 rounded transition-colors ${isMe ? 'bg-lolPurple/10 border border-lolPurple/20' : 'hover:bg-white/5'}`;
                const tmName = tm.riotIdGameName || tm.summonerName || 'Unknown';
                const kda = ((tm.kills + tm.assists) / Math.max(1, tm.deaths)).toFixed(1);
                const dmg = tm.totalDamageDealtToChampions;

                // Build badges
                let badges = '';
                if (isMe) badges += '<span class="text-[8px] bg-lolPurple/30 text-lolPurple px-1 rounded font-bold">YOU</span>';
                if (isFriend && !isMe) badges += '<span class="text-[8px] bg-lolBlue/20 text-lolBlue px-1 rounded font-bold ml-1" title="Played 3+ games together"><i class="fa-solid fa-user-group text-[6px]"></i></span>';
                if (isTopDmg) badges += '<span class="text-[8px] bg-orange-500/20 text-orange-400 px-1 rounded font-bold ml-1" title="Most Damage">🔥</span>';
                if (isSecondDmg && !isTopDmg) badges += '<span class="text-[8px] bg-orange-500/10 text-orange-400/70 px-1 rounded font-bold ml-1" title="2nd Damage">🔸</span>';
                if (isLowDeaths) badges += '<span class="text-[8px] bg-green-500/20 text-green-400 px-1 rounded font-bold ml-1" title="Lowest Deaths">🛡️</span>';

                // KDA color
                let kdaColor = 'text-slate-400';
                if (kda >= 5) kdaColor = 'text-lolGold font-bold';
                else if (kda >= 3) kdaColor = 'text-green-400';
                else if (kda < 1) kdaColor = 'text-red-400';

                // Damage styling
                let dmgClass = 'text-slate-400';
                if (isTopDmg) dmgClass = 'text-orange-400 font-bold';
                else if (isSecondDmg) dmgClass = 'text-orange-400/70';

                row.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${tm.championName}.png" class="w-7 h-7 rounded-lg border ${isMe ? 'border-lolPurple/50' : 'border-white/10'} shrink-0">
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1">
                                <span class="${isMe ? 'text-lolPurple font-bold' : 'text-slate-300'} truncate text-[11px]" title="${tmName}">${tmName}</span>
                                ${badges}
                            </div>
                            <span class="text-[9px] text-muted">${tm.kills}/${tm.deaths}/${tm.assists}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <div class="w-14 text-center ${kdaColor} text-[11px]">${kda}</div>
                        <div class="w-12 text-center ${dmgClass} text-[10px]">${formatK(dmg)}</div>
                    </div>
                `;
                col.appendChild(row);
            });
            return col;
        };

        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 md:grid-cols-2 gap-6";
        grid.appendChild(renderTeamList(allyTeam, "Ally Team", true));
        grid.appendChild(renderTeamList(enemyTeam, "Enemy Team", false));
        detailsSection.appendChild(grid);
        cardContainer.appendChild(detailsSection);

        // Toggle Logic
        let expanded = false;
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            expanded = !expanded;
            if (expanded) {
                detailsSection.classList.remove('hidden');
                expandBtn.innerHTML = '<i class="fa-solid fa-chevron-up transition-transform duration-300"></i>';
                expandBtn.classList.add('bg-white/10', 'text-white');
                cardContainer.classList.add('ring-1', 'ring-white/10');
            } else {
                detailsSection.classList.add('hidden');
                expandBtn.innerHTML = '<i class="fa-solid fa-chevron-down transition-transform duration-300"></i>';
                expandBtn.classList.remove('bg-white/10', 'text-white');
                cardContainer.classList.remove('ring-1', 'ring-white/10');
            }
        });

        matchList.appendChild(cardContainer);
    }


    // --- Arena Specific Logic ---
    function handleArenaCard(clone, match, p, myPuuid) {
        const placement = p.placement;
        const isWin = placement <= 4; // Top 4 is considered a "win" in Arena
        const isTop2 = placement <= 2;

        const indicator = clone.querySelector('.result-indicator');
        const resultText = clone.querySelector('.result-text');
        const card = clone.querySelector('.match-card');

        // Placement-specific styling
        let placeClass = '';
        let stripColor = 'bg-slate-600';
        let borderHover = 'hover:border-slate-500/40';

        if (placement === 1) {
            placeClass = 'text-lolGold drop-shadow-[0_0_8px_rgba(201,180,103,0.5)]';
            stripColor = 'bg-gradient-to-b from-lolGold to-yellow-600';
            borderHover = 'hover:border-lolGold/40';
            card.classList.add('border-l-2', 'border-l-lolGold');
        } else if (placement === 2) {
            placeClass = 'text-slate-300';
            stripColor = 'bg-gradient-to-b from-slate-300 to-slate-500';
            borderHover = 'hover:border-slate-300/40';
            card.classList.add('border-l-slate-400');
        } else if (placement === 3) {
            placeClass = 'text-amber-600';
            stripColor = 'bg-gradient-to-b from-amber-600 to-amber-800';
            borderHover = 'hover:border-amber-600/40';
        } else if (placement === 4) {
            placeClass = 'text-teal-400';
            stripColor = 'bg-teal-500';
            borderHover = 'hover:border-teal-400/40';
        } else {
            placeClass = 'text-red-400';
            stripColor = 'bg-red-500';
            borderHover = 'hover:border-red-500/40';
        }

        // Build result display
        if (placement === 1) {
            resultText.innerHTML = `
                <div class="flex items-center gap-1">
                    <i class="fa-solid fa-trophy text-lolGold text-xs"></i>
                    <span class="${placeClass} text-xl font-black">1st</span>
                </div>
                <div class="text-[9px] text-lolGold/80 font-semibold uppercase tracking-wider">Champion</div>
            `;
        } else {
            resultText.innerHTML = `
                <div class="${placeClass} text-xl font-black">${placement}${getOrdinal(placement)}</div>
                <div class="text-[9px] ${isTop2 ? 'text-white/60' : 'text-red-400/80'} font-semibold uppercase tracking-wider">${isTop2 ? 'Victory' : 'Defeat'}</div>
            `;
        }

        indicator.className = `absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${stripColor}`;
        card.classList.add(borderHover);

        // Game info
        clone.querySelector('.game-mode').textContent = "ARENA";
        clone.querySelector('.game-mode').className = "font-semibold text-[10px] text-purple-400/80 uppercase tracking-wide";
        clone.querySelector('.game-time').textContent = timeAgo(match.info.gameEndTimestamp);
        clone.querySelector('.game-duration').textContent = formatDuration(match.info.gameDuration);

        // Champion
        clone.querySelector('.champ-icon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${p.championName}.png`;
        clone.querySelector('.champ-level').textContent = p.champLevel;

        // KDA
        const kdaBlock = clone.querySelector('.kda-block');
        kdaBlock.innerHTML = `<span class="text-white">${p.kills}</span><span class="text-muted/50 mx-0.5">/</span><span class="text-lolRed">${p.deaths}</span><span class="text-muted/50 mx-0.5">/</span><span class="text-white">${p.assists}</span>`;
        clone.querySelector('.kda-ratio').textContent = `${((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2)} KDA`;

        // Arena-specific stats (replace CS/VIS/KP with arena-relevant)
        const statsGrid = clone.querySelector('.md\\:flex.items-center.gap-4');
        if (statsGrid) {
            const dmg = p.totalDamageDealtToChampions || 0;
            const healed = p.totalHeal || 0;
            const goldEarned = p.goldEarned || 0;

            statsGrid.innerHTML = `
                <!-- Damage -->
                <div class="flex flex-col items-center">
                    <div class="text-sm font-bold text-orange-400">${formatK(dmg)}</div>
                    <div class="text-[8px] text-muted uppercase tracking-wide">DMG</div>
                </div>
                <!-- Healing -->
                <div class="flex flex-col items-center">
                    <div class="text-sm font-bold text-green-400">${formatK(healed)}</div>
                    <div class="text-[8px] text-muted uppercase tracking-wide">HEAL</div>
                </div>
                <!-- Gold -->
                <div class="flex flex-col items-center">
                    <div class="text-sm font-bold text-lolGold">${formatK(goldEarned)}</div>
                    <div class="text-[8px] text-muted uppercase tracking-wide">GOLD</div>
                </div>
            `;
        }

        // Partner (clickable to their profile)
        const partner = match.info.participants.find(x => x.playerSubteamId === p.playerSubteamId && x.puuid !== myPuuid);
        const badgesContainer = clone.querySelector('.badges');
        badgesContainer.innerHTML = '';

        if (partner) {
            const partnerName = partner.riotIdGameName || partner.summonerName || 'Partner';
            const partnerTag = partner.riotIdTagline || '';
            const partnerDiv = document.createElement('div');
            partnerDiv.className = "flex items-center gap-2 bg-white/5 p-1.5 rounded-lg border border-white/5 hover:bg-lolPurple/20 hover:border-lolPurple/30 transition-all cursor-pointer group";
            partnerDiv.innerHTML = `
                <div class="text-[9px] text-slate-500 font-bold uppercase">DUO</div>
                <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${partner.championName}.png" class="w-5 h-5 rounded border border-white/10 group-hover:border-lolPurple/50">
                <span class="text-[10px] text-slate-300 font-semibold truncate max-w-[70px] group-hover:text-lolPurple transition-colors">${partnerName}</span>
                <i class="fa-solid fa-external-link text-[8px] text-muted opacity-0 group-hover:opacity-100 transition-opacity"></i>
            `;
            partnerDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const region = document.getElementById('region-select')?.value || 'euw1';
                if (partnerName && partnerTag) {
                    triggerSearch(`${partnerName}#${partnerTag}`, region);
                }
            });
            badgesContainer.appendChild(partnerDiv);
        }

        // Augments Row with proper icons and tooltips
        if (p.playerAugment1) {
            const augDiv = document.createElement('div');
            augDiv.className = "flex gap-1.5 mt-2";

            for (let i = 1; i <= 4; i++) {
                const augId = p[`playerAugment${i}`];
                if (augId) {
                    const augData = augmentDataCache[augId];
                    const span = document.createElement('div');
                    span.className = "w-7 h-7 rounded-lg border overflow-hidden cursor-help transition-all hover:scale-110 hover:z-10";

                    if (augData && augData.iconSmall) {
                        // Use CommunityDragon icon
                        const iconPath = augData.iconSmall.toLowerCase().replace('/lol-game-data/assets/', '');
                        span.innerHTML = `<img src="https://raw.communitydragon.org/latest/game/${iconPath}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-lolGold/20 flex items-center justify-center text-[8px] text-lolGold font-bold\\'>A</div>'">`;
                        span.classList.add('border-lolGold/30', 'bg-lolGold/10');
                    } else {
                        span.innerHTML = `<div class="w-full h-full bg-lolGold/20 flex items-center justify-center text-[9px] text-lolGold font-bold">A</div>`;
                        span.classList.add('border-lolGold/30');
                    }

                    // Tooltip
                    const augName = augData?.name || `Augment ${augId}`;
                    const augDesc = augData?.desc?.replace(/<[^>]*>/g, '') || '';
                    attachTooltip(span, augName, augDesc);

                    augDiv.appendChild(span);
                }
            }
            badgesContainer.parentNode.appendChild(augDiv);
        }

        // Fill items with tooltips
        fillItems(clone, p, true);

        // Setup expand button for Arena (show all participants)
        const expandBtn = clone.querySelector('.expand-btn');
        if (expandBtn) {
            const detailsSection = document.createElement('div');
            detailsSection.className = "hidden border-t border-white/5 bg-black/40 p-4 mt-2 backdrop-blur-sm rounded-b-xl";

            // Build teams by placement
            const teams = {};
            match.info.participants.forEach(part => {
                const teamId = part.playerSubteamId;
                if (!teams[teamId]) teams[teamId] = [];
                teams[teamId].push(part);
            });

            // Sort teams by best placement
            const sortedTeams = Object.values(teams).sort((a, b) => a[0].placement - b[0].placement);

            detailsSection.innerHTML = `
                <div class="text-[10px] font-bold text-muted uppercase tracking-widest mb-3">Match Results</div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    ${sortedTeams.map(team => {
                const teamPlacement = team[0].placement;
                let teamColor = 'text-slate-400';
                let bgColor = 'bg-white/5';
                if (teamPlacement === 1) { teamColor = 'text-lolGold'; bgColor = 'bg-lolGold/10'; }
                else if (teamPlacement === 2) { teamColor = 'text-slate-300'; bgColor = 'bg-white/10'; }
                else if (teamPlacement === 3) { teamColor = 'text-amber-600'; bgColor = 'bg-amber-900/20'; }
                else if (teamPlacement === 4) { teamColor = 'text-teal-400'; bgColor = 'bg-teal-900/20'; }

                return `
                            <div class="${bgColor} rounded-lg p-2 border border-white/5">
                                <div class="${teamColor} font-black text-sm mb-1">${teamPlacement}${getOrdinal(teamPlacement)}</div>
                                ${team.map(t => `
                                    <div class="flex items-center gap-1.5 mb-1">
                                        <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/champion/${t.championName}.png" class="w-5 h-5 rounded border border-white/10">
                                        <span class="text-[10px] ${t.puuid === myPuuid ? 'text-lolPurple font-bold' : 'text-slate-400'} truncate">${t.riotIdGameName || t.championName}</span>
                                    </div>
                                `).join('')}
                            </div>
                        `;
            }).join('')}
                </div>
            `;

            card.appendChild(detailsSection);

            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                detailsSection.classList.toggle('hidden');
                expandBtn.querySelector('i').classList.toggle('rotate-180');
            });
        }
    }

    function fillItems(clone, p, addTooltips) {
        for (let i = 0; i < 6; i++) {
            const itemId = p[`item${i}`];
            const slot = clone.querySelector(`.item-${i}`);
            if (slot) {
                slot.innerHTML = ''; // Clear existing
                if (itemId > 0) {
                    const img = document.createElement('img');
                    img.src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/item/${itemId}.png`;
                    img.className = "w-full h-full rounded";
                    if (addTooltips && itemDataCache && itemDataCache[itemId]) {
                        const data = itemDataCache[itemId];
                        attachTooltip(img, data.name, data.description, data.gold.total);
                    }
                    slot.appendChild(img);
                }
            }
        }

        const trinketId = p.item6;
        if (trinketId > 0) {
            const slot = clone.querySelector(`.item-6`);
            if (slot) {
                slot.innerHTML = '';
                const img = document.createElement('img');
                img.src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/item/${trinketId}.png`;
                img.className = "w-full h-full rounded-full";
                if (addTooltips && itemDataCache && itemDataCache[trinketId]) {
                    const data = itemDataCache[trinketId];
                    attachTooltip(img, data.name, data.description, data.gold.total);
                }
                slot.appendChild(img);
            }
        }
    }

    function getOrdinal(n) {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }

    function getQueueName(queueId, gameMode) {
        if (gameMode === 'CHERRY') return 'Arena';
        if (gameMode === 'ARAM') return 'ARAM';

        const map = {
            420: 'Ranked Solo',
            440: 'Ranked Flex',
            400: 'Normal Draft',
            430: 'Blind Pick',
            450: 'ARAM',
            1700: 'Arena',
            1900: 'URF',
            900: 'URF'
        };
        return map[queueId] || gameMode;
    }

    // --- History & Favorites Logic ---

    function getKey(type) { return `lol-tracker-${type}`; }

    function getList(type) {
        return JSON.parse(localStorage.getItem(getKey(type)) || '[]');
    }

    function saveList(type, list) {
        localStorage.setItem(getKey(type), JSON.stringify(list));
    }

    function addToHistory(profile) {
        let history = getList('history');
        // Remove duplicates (based on name+tag+region)
        history = history.filter(p => !(p.name === profile.name && p.tag === profile.tag && p.region === profile.region));
        // Add to front
        history.unshift(profile);
        // Limit to 5
        if (history.length > 5) history.pop();
        saveList('history', history);
        renderLists();
    }

    function toggleFavorite(profile) {
        let favs = getList('favorites');
        const idx = favs.findIndex(p => p.name === profile.name && p.tag === profile.tag && p.region === profile.region);

        if (idx >= 0) {
            // Remove
            favs.splice(idx, 1);
        } else {
            // Add
            favs.push(profile);
        }
        saveList('favorites', favs);
        renderLists();
    }

    function isFav(profile) {
        if (!profile) return false;
        let favs = getList('favorites');
        return favs.some(p => p.name === profile.name && p.tag === profile.tag && p.region === profile.region);
    }

    function updateFavIcon() {
        if (!currentProfile) return;
        const icon = favBtn.querySelector('i');
        if (isFav(currentProfile)) {
            icon.classList.remove('far'); // Outline
            icon.classList.add('fas', 'text-lolGold'); // Solid
        } else {
            icon.classList.remove('fas', 'text-lolGold');
            icon.classList.add('far');
        }
    }

    function renderLists() {
        const history = getList('history');
        const favs = getList('favorites');

        // Render History
        recentGrid.innerHTML = '';
        if (history.length === 0) {
            recentGrid.innerHTML = '<div class="text-slate-500 text-sm italic py-4 text-center">No search history yet.</div>';
        } else {
            const tmpl = document.getElementById('history-card-template');
            history.forEach(p => {
                const clone = tmpl.content.cloneNode(true);
                clone.querySelector('.h-name').textContent = `${p.name} #${p.tag}`;
                clone.querySelector('.h-region').textContent = p.region.toUpperCase();
                clone.querySelector('.h-icon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/profileicon/${p.icon}.png`;

                clone.firstElementChild.addEventListener('click', () => {
                    triggerSearch(`${p.name}#${p.tag}`, p.region);
                });
                recentGrid.appendChild(clone);
            });
        }

        // Render Favorites
        favoritesGrid.innerHTML = '';
        if (favs.length === 0) {
            favoritesGrid.innerHTML = '<div class="col-span-full text-slate-500 text-sm italic py-4 border border-dashed border-white/10 rounded-xl text-center">Star a profile to pin it here.</div>';
        } else {
            const tmpl = document.getElementById('favorite-card-template');
            favs.forEach(p => {
                const clone = tmpl.content.cloneNode(true);
                clone.querySelector('.f-name').textContent = p.name;
                // clone.querySelector('.f-tag').textContent = `#${p.tag}`; // Tag structure might differ
                clone.querySelector('.f-region').textContent = p.region.toUpperCase();
                clone.querySelector('.f-icon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/profileicon/${p.icon}.png`;

                clone.firstElementChild.addEventListener('click', () => {
                    triggerSearch(`${p.name}#${p.tag}`, p.region);
                });
                favoritesGrid.appendChild(clone);
            });
        }
    }

    function refreshLists() {
        renderLists();
    }

    // --- Helpers ---
    function showError(msg) {
        if (!msg) {
            errorDiv.classList.add('hidden');
            errorDiv.textContent = '';
        } else {
            errorDiv.classList.remove('hidden');
            errorDiv.textContent = msg;
        }
    }

    function addBadge(container, text) {
        const span = document.createElement('span');
        span.className = 'kill-badge';
        span.textContent = text;
        container.appendChild(span);
    }

    function formatK(num) {
        return num > 999 ? (num / 1000).toFixed(1) + 'k' : num;
    }

    function timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        const interval = Math.floor(seconds / 31536000);
        if (interval > 1) return interval + "y ago";
        if (Math.floor(seconds / 2592000) > 1) return Math.floor(seconds / 2592000) + "mo ago";
        if (Math.floor(seconds / 86400) > 1) return Math.floor(seconds / 86400) + "d ago";
        if (Math.floor(seconds / 3600) > 1) return Math.floor(seconds / 3600) + "h ago";
        if (Math.floor(seconds / 60) > 1) return Math.floor(seconds / 60) + "m ago";
        return "Just now";
    }

    function getTierColor(tier) {
        const colors = { 'IRON': 'slate-500', 'BRONZE': 'orange-700', 'SILVER': 'slate-300', 'GOLD': 'lolGold', 'PLATINUM': 'teal-400', 'EMERALD': 'emerald-400', 'DIAMOND': 'blue-400', 'MASTER': 'purple-400', 'GRANDMASTER': 'red-400', 'CHALLENGER': 'yellow-300' };
        return colors[tier] || 'white';
    }

    function formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
});
