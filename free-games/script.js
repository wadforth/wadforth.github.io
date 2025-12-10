document.addEventListener('DOMContentLoaded', () => {
    // Method 1: CORS Proxy
    const PROXY_URL = 'https://corsproxy.io/?';
    const API_URL = PROXY_URL + encodeURIComponent('https://www.gamerpower.com/api/giveaways?platform=pc');

    // DOM Elements
    const grid = document.getElementById('games-grid');
    const skeletons = document.querySelectorAll('.skeleton-card');
    const searchInput = document.getElementById('game-search');
    const noResults = document.getElementById('no-results');
    const filterChips = document.querySelectorAll('.filter-chip');
    const typeFilter = document.getElementById('type-filter');
    const sortFilter = document.getElementById('sort-filter');

    // View Toggles
    const viewGridBtn = document.getElementById('view-grid');
    const viewListBtn = document.getElementById('view-list');

    // Notification UI
    const notifBtn = document.getElementById('params-btn');
    const notifModal = document.getElementById('notif-modal');
    const closeNotif = document.getElementById('close-notif');
    const notifBackdrop = document.getElementById('notif-backdrop');
    const enableNotifsBtn = document.getElementById('enable-notifs-btn');
    const testNotifBtn = document.getElementById('test-notif-btn');
    const checkGames = document.getElementById('check-games');
    const checkDlc = document.getElementById('check-dlc');

    // Keyword UI
    const keywordInput = document.getElementById('keyword-input');
    const addKeywordBtn = document.getElementById('add-keyword-btn');
    const keywordList = document.getElementById('keyword-list');

    // Instructions UI
    const instrModal = document.getElementById('instructions-modal');
    const closeInstr = document.getElementById('close-instr');
    const instrBackdrop = document.getElementById('instr-backdrop');
    const instrContent = document.getElementById('instr-content');

    // State
    let allGames = [];
    let currentPlatform = localStorage.getItem('fg_platform') || 'all';
    let currentType = localStorage.getItem('fg_type') || 'all';
    let currentSort = localStorage.getItem('fg_sort') || 'newest';
    let currentView = localStorage.getItem('fg_view') || 'grid';
    let hiddenGames = JSON.parse(localStorage.getItem('fg_hidden')) || [];

    // Notification State
    let notifSettings = JSON.parse(localStorage.getItem('fg_notif_settings')) || {
        enabled: false,
        games: true,
        dlc: false,
        keywords: [],
        lastKnownId: 0
    };

    // Apply Saved Preferences
    if (typeFilter) typeFilter.value = currentType;
    if (sortFilter) sortFilter.value = currentSort;
    checkGames.checked = notifSettings.games;
    checkDlc.checked = notifSettings.dlc;
    updateViewButtons();
    renderKeywords();

    // --- Helpers ---

    const PLATFORM_KEYWORDS = { 'steam': 'steam', 'epic-games-store': 'epic', 'gog': 'gog', 'ubisoft': 'ubisoft', 'all': '' };
    const PLATFORM_STYLES = {
        'steam': 'text-[#66c0f4]',
        'epic': 'text-white',
        'gog': 'text-[#af58fd]',
        'ubisoft': 'text-[#0070c9]'
    };

    function getRelativeTime(dateStr) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Unknown date';
        const diffMs = Date.now() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 24) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 30) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    function parseValue(worthStr) {
        if (!worthStr || worthStr === 'N/A') return 0;
        return parseFloat(worthStr.replace(/[^0-9.]/g, '')) || 0;
    }

    function getValueColor(worthStr) {
        const val = parseValue(worthStr);
        if (val > 20) return 'text-[#ffd700] drop-shadow-md font-bold'; // Gold
        if (val > 10) return 'text-green-400 font-bold';
        return 'text-slate-400 line-through';
    }

    function updateViewButtons() {
        if (currentView === 'grid') {
            viewGridBtn.className = 'p-1.5 rounded text-accent bg-white/10 hover:text-white transition-colors';
            viewListBtn.className = 'p-1.5 rounded text-slate-500 hover:text-white transition-colors';
            grid.classList.remove('grid-cols-1');
            grid.classList.add('md:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4');
        } else {
            viewGridBtn.className = 'p-1.5 rounded text-slate-500 hover:text-white transition-colors';
            viewListBtn.className = 'p-1.5 rounded text-accent bg-white/10 hover:text-white transition-colors';
            grid.classList.remove('md:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4');
            grid.classList.add('grid-cols-1');
        }
    }

    // --- Core Logic ---

    // Fetch Games
    fetch(API_URL)
        .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.json();
        })
        .then(data => {
            allGames = data;
            finishLoading(allGames);
            checkNotifications(allGames);
        })
        .catch(err => {
            console.warn('API Fetch failed, using Mock Data:', err);
            allGames = getMockData();
            finishLoading(allGames, true);
        });

    function finishLoading(data, isMock = false) {
        skeletons.forEach(s => s.remove());
        if (isMock) {
            const warning = document.createElement('div');
            warning.className = 'col-span-full mb-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs text-center font-mono';
            warning.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Displaying Demo Data (API blocked by browser)';
            grid.parentElement.insertBefore(warning, grid);
        }
        filterGames();
        startCountdownTimer();
        updatePageTitle(data);
    }

    function updatePageTitle(games) {
        // Count "New" games (last 3 days)
        const newCount = games.filter(g => (Date.now() - new Date(g.published_date).getTime()) < (3 * 86400000)).length;
        if (newCount > 0) {
            document.title = `(${newCount}) Free Games Tracker | Kieran`;
        }
    }

    function renderGames(games) {
        grid.innerHTML = '';
        if (games.length === 0) { noResults.classList.remove('hidden'); return; }
        else { noResults.classList.add('hidden'); }

        const isList = currentView === 'list';

        games.forEach(game => {
            const card = document.createElement('div');
            // List View vs Grid View Classes
            card.className = isList
                ? 'group bg-card border border-white/5 rounded-xl overflow-hidden hover:border-accent/50 transition-all hover:translate-x-1 flex relative items-center gap-4 p-2'
                : 'group bg-card border border-white/5 rounded-xl overflow-hidden hover:border-accent/50 transition-all hover:-translate-y-1 hover:shadow-xl shadow-accent/5 flex flex-col h-full relative';

            // Platform Logic
            const pLower = game.platforms.toLowerCase();
            let pIcon = '<i class="fa-solid fa-desktop"></i>';
            let pStyle = 'text-white';

            if (pLower.includes('steam')) { pIcon = '<i class="fa-brands fa-steam"></i>'; pStyle = PLATFORM_STYLES.steam; }
            else if (pLower.includes('epic')) { pIcon = '<i class="fa-solid fa-cube"></i>'; pStyle = PLATFORM_STYLES.epic; }
            else if (pLower.includes('gog')) { pIcon = '<i class="fa-solid fa-gamepad"></i>'; pStyle = PLATFORM_STYLES.gog; }
            else if (pLower.includes('ubisoft')) { pIcon = '<i class="fa-brands fa-ubisoft"></i>'; pStyle = PLATFORM_STYLES.ubisoft; }

            // Badges & Timer
            const isNew = (Date.now() - new Date(game.published_date).getTime()) < (3 * 86400000);
            const validEndDate = game.end_date && game.end_date !== 'N/A';
            const endDateObj = validEndDate ? new Date(game.end_date) : null;
            const isEndingSoon = endDateObj && endDateObj > new Date() && endDateObj < new Date(Date.now() + 86400000);

            let badgesHtml = '';
            let timerHtml = '';

            if (isNew) badgesHtml += '<span class="px-2 py-0.5 bg-accent text-dark text-[10px] font-bold rounded uppercase tracking-wider shadow-lg shadow-accent/20">New</span>';

            if (validEndDate && endDateObj > new Date()) {
                const timeLeft = endDateObj - new Date();
                const isUrgent = timeLeft < 86400000;
                // High Visibility Logic
                timerHtml = `
                     <span class="countdown-timer px-2 py-1 ${isUrgent ? 'bg-red-600 text-white shadow-lg shadow-red-500/40 animate-pulse' : 'bg-black/80 text-slate-300 border border-white/20'} text-xs font-bold rounded uppercase tracking-wider font-mono backdrop-blur flex items-center gap-2" data-end="${game.end_date}">
                        <i class="fa-regular fa-clock"></i> <span>--:--</span>
                     </span>`;
            }

            // --- HTML Construction ---
            if (isList) {
                // LIST VIEW
                card.innerHTML = `
                    <div class="h-16 w-28 flex-shrink-0 relative overflow-hidden rounded-lg">
                        <img src="${game.image}" alt="${game.title}" class="w-full h-full object-cover">
                        ${isEndingSoon ? `<div class="absolute bottom-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>` : ''}
                    </div>
                    
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] ${pStyle}">${pIcon}</span>
                            <h3 class="text-sm font-bold text-white truncate group-hover:text-accent transition-colors" title="${game.title}">${game.title}</h3>
                            ${badgesHtml}
                        </div>
                        <div class="flex items-center gap-3 text-xs text-slate-500 font-mono">
                            <span class="${game.type === 'Game' ? 'text-accent' : 'text-blue-400'}">${game.type}</span>
                            <span>•</span>
                            <span>${getRelativeTime(game.published_date)}</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 pr-2">
                        ${timerHtml ? `<div class="hidden sm:block">${timerHtml}</div>` : ''}
                        <div class="text-right">
                             <div class="${getValueColor(game.worth)} text-sm font-mono">${game.worth === 'N/A' ? 'Free' : game.worth}</div>
                        </div>
                        
                        <div class="flex gap-1 opactiy-0 group-hover:opacity-100 transition-opacity">
                             <button onclick="shareDeal('${game.open_giveaway_url}')" class="p-2 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
                             <button onclick="hideGame(${game.id})" class="p-2 bg-white/5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-500" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
                             <a href="${game.open_giveaway_url}" target="_blank" class="p-2 bg-white/5 border border-white/10 rounded text-accent hover:bg-accent hover:text-black hover:border-accent text-sm font-bold">Claim</a>
                        </div>
                    </div>
                `;
            } else {
                // GRID VIEW
                card.innerHTML = `
                <div class="relative h-40 overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-t from-dark/90 to-transparent z-10"></div>
                    <img src="${game.image}" alt="${game.title}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                    
                    <div class="absolute top-2 right-2 z-20 flex flex-col items-end gap-2">
                         ${timerHtml}
                         ${badgesHtml ? `<div class="flex gap-1">${badgesHtml}</div>` : ''}
                    </div>
                    
                    <div class="absolute top-2 left-2 z-20">
                         <span class="px-2 py-0.5 bg-black/60 backdrop-blur ${pStyle} text-[10px] font-bold rounded border border-white/10 flex items-center gap-1">
                            ${pIcon} ${game.platforms.split(',')[0]}
                        </span>
                    </div>

                    <div class="absolute bottom-2 left-2 z-20">
                        <span class="text-[10px] font-mono uppercase tracking-wider ${game.type === 'Game' ? 'text-accent bg-accent/10 border-accent/20' : 'text-blue-400 bg-blue-400/10 border-blue-400/20'} px-2 py-0.5 rounded backdrop-blur border">
                            ${game.type}
                        </span>
                    </div>
                </div>
                
                <div class="p-4 flex flex-col flex-1">
                    <div class="flex justify-between items-start mb-1 h-12 gap-2">
                        <h3 class="text-lg font-bold text-white line-clamp-2 group-hover:text-accent transition-colors flex-1" title="${game.title}">${game.title}</h3>
                        <button onclick="hideGame(${game.id})" class="text-slate-600 hover:text-red-500 transition-colors pt-1" title="Hide this game">
                            <i class="fa-solid fa-eye-slash"></i>
                        </button>
                    </div>
                    
                    <p class="text-[10px] text-slate-500 mb-3 flex items-center gap-1 font-mono">
                        <i class="fa-regular fa-calendar"></i> ${getRelativeTime(game.published_date)}
                    </p>

                    <div class="grid grid-cols-2 gap-2 mb-4">
                        <button onclick="showInstructions('${game.id}')" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-slate-300 transition-colors flex items-center justify-center gap-2">
                             <i class="fa-solid fa-circle-info"></i> Info
                        </button>
                         <button onclick="shareDeal('${game.open_giveaway_url}')" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-slate-300 transition-colors flex items-center justify-center gap-2">
                             <i class="fa-solid fa-share-nodes"></i> Share
                        </button>
                    </div>
                    
                    <div class="mt-auto flex items-center justify-between">
                         <div class="flex flex-col">
                            <span class="text-[10px] text-slate-500 uppercase tracking-widest">Worth</span>
                            <span class="text-sm font-mono ${getValueColor(game.worth)} decoration-white/30 decoration-2">${game.worth === 'N/A' ? 'Free' : game.worth}</span>
                        </div>
                        <a href="${game.open_giveaway_url}" target="_blank" 
                           class="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium hover:bg-accent hover:text-dark hover:border-accent transition-all flex items-center gap-2 group-hover:bg-white/10">
                            Claim <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                        </a>
                    </div>
                </div>
                `;
            }
            grid.appendChild(card);
        });
    }

    // --- Timers ---
    function startCountdownTimer() {
        setInterval(() => {
            document.querySelectorAll('.countdown-timer').forEach(el => {
                const end = new Date(el.getAttribute('data-end'));
                const now = new Date();
                const diff = end - now;

                if (diff <= 0) {
                    el.innerHTML = 'Ended';
                    el.classList.add('bg-slate-700', 'text-slate-400');
                    el.classList.remove('bg-red-600', 'animate-pulse', 'shadow-lg');
                    return;
                }

                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);

                let text = '';
                if (d > 0) text = `${d}d ${h}h`;
                else text = `${h}h ${m}m ${s}s`; // Added seconds for urgency

                el.innerHTML = `<i class="fa-regular fa-clock"></i> ${text}`;
            });
        }, 1000);
    }

    // --- Interaction Functions ---
    window.showInstructions = (id) => {
        const game = allGames.find(g => g.id == id);
        if (!game) return;
        instrContent.innerHTML = game.instructions || "No instructions provided. Click 'Claim' to visit the site.";
        instrModal.classList.remove('hidden');
    };

    window.shareDeal = (url) => {
        navigator.clipboard.writeText(url).then(() => { alert("Link copied to clipboard!"); });
    };

    window.hideGame = (id) => {
        if (confirm("Hide this game? You won't see it again.")) {
            hiddenGames.push(id);
            localStorage.setItem('fg_hidden', JSON.stringify(hiddenGames));
            filterGames();
        }
    };

    // --- Keywords Logic ---
    function renderKeywords() {
        keywordList.innerHTML = '';
        (notifSettings.keywords || []).forEach(kw => {
            const tag = document.createElement('span');
            tag.className = 'px-2 py-1 bg-accent/10 border border-accent/20 text-accent rounded text-xs flex items-center gap-1';
            tag.innerHTML = `${kw} <button onclick="removeKeyword('${kw}')" class="hover:text-white"><i class="fa-solid fa-xmark"></i></button>`;
            keywordList.appendChild(tag);
        });
    }

    addKeywordBtn.addEventListener('click', () => {
        const val = keywordInput.value.trim();
        if (val && !notifSettings.keywords.includes(val)) {
            notifSettings.keywords.push(val);
            saveNotifSettings();
            renderKeywords();
            keywordInput.value = '';
        }
    });

    window.removeKeyword = (kw) => {
        notifSettings.keywords = notifSettings.keywords.filter(k => k !== kw);
        saveNotifSettings();
        renderKeywords();
    };

    // --- Filtering & Sorting ---

    function filterGames() {
        const searchTerm = searchInput.value.toLowerCase();
        const platformKey = PLATFORM_KEYWORDS[currentPlatform] || '';

        let filtered = allGames.filter(game => {
            if (hiddenGames.includes(game.id)) return false;

            const matchesSearch = game.title.toLowerCase().includes(searchTerm);
            const pLower = game.platforms.toLowerCase();
            const matchesPlatform = currentPlatform === 'all' || pLower.includes(platformKey);
            const matchesType = currentType === 'all' || game.type.toLowerCase() === currentType.toLowerCase();
            return matchesSearch && matchesPlatform && matchesType;
        });

        filtered.sort((a, b) => {
            if (currentSort === 'newest') return new Date(b.published_date) - new Date(a.published_date);
            if (currentSort === 'value-high') return parseValue(b.worth) - parseValue(a.worth);
            return 0;
        });

        renderGames(filtered);

        localStorage.setItem('fg_platform', currentPlatform);
        localStorage.setItem('fg_type', currentType);
        localStorage.setItem('fg_sort', currentSort);
    }

    // --- Notifications Logic ---

    function checkNotifications(games) {
        if (!notifSettings.enabled) return;

        let latestId = notifSettings.lastKnownId;

        games.forEach(game => {
            if (game.id > notifSettings.lastKnownId) {
                let shouldNotify = false;

                const titleLower = game.title.toLowerCase();
                const hasKeyword = (notifSettings.keywords || []).some(kw => titleLower.includes(kw.toLowerCase()));

                if (hasKeyword) shouldNotify = true;
                else if (game.type === 'Game' && notifSettings.games ||
                    game.type === 'DLC' && notifSettings.dlc) {
                    shouldNotify = true;
                }

                if (shouldNotify) {
                    spawnNotification(`New Freebie: ${game.title}`, game.description, game.open_giveaway_url);
                }

                if (game.id > latestId) latestId = game.id;
            }
        });

        if (latestId > notifSettings.lastKnownId) {
            notifSettings.lastKnownId = latestId;
            saveNotifSettings();
        }
    }

    function spawnNotification(title, body, url) {
        if (Notification.permission === 'granted') {
            const n = new Notification(title, { body: body, icon: '../favicon.png' });
            n.onclick = () => { window.open(url, '_blank'); };
        }
    }

    function saveNotifSettings() {
        localStorage.setItem('fg_notif_settings', JSON.stringify(notifSettings));
    }

    // --- Event Listeners ---

    // View Switchers
    viewGridBtn.addEventListener('click', () => { currentView = 'grid'; localStorage.setItem('fg_view', 'grid'); updateViewButtons(); filterGames(); });
    viewListBtn.addEventListener('click', () => { currentView = 'list'; localStorage.setItem('fg_view', 'list'); updateViewButtons(); filterGames(); });

    searchInput.addEventListener('input', filterGames);
    if (typeFilter) typeFilter.addEventListener('change', (e) => { currentType = e.target.value; filterGames(); });
    if (sortFilter) sortFilter.addEventListener('change', (e) => { currentSort = e.target.value; filterGames(); });

    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => {
                c.classList.remove('active', 'bg-accent/10', 'border-accent/20', 'text-accent');
                c.classList.add('bg-white/5', 'border-white/10', 'text-slate-400');
            });
            chip.classList.add('active', 'bg-accent/10', 'border-accent/20', 'text-accent');
            chip.classList.remove('bg-white/5', 'border-white/10', 'text-slate-400');
            currentPlatform = chip.getAttribute('data-platform');
            filterGames();
        });
    });

    notifBtn.addEventListener('click', () => notifModal.classList.remove('hidden'));
    closeNotif.addEventListener('click', () => notifModal.classList.add('hidden'));
    notifBackdrop.addEventListener('click', () => notifModal.classList.add('hidden'));
    closeInstr.addEventListener('click', () => instrModal.classList.add('hidden'));
    instrBackdrop.addEventListener('click', () => instrModal.classList.add('hidden'));

    enableNotifsBtn.addEventListener('click', () => {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                notifSettings.enabled = true;
                notifSettings.games = checkGames.checked;
                notifSettings.dlc = checkDlc.checked;
                if (notifSettings.lastKnownId === 0 && allGames.length > 0) notifSettings.lastKnownId = allGames[0].id;
                saveNotifSettings();
                alert("Notifications Enabled! 🔔\n\nNote: You must keep this tab open (or pinned) to receive alerts.");
                notifModal.classList.add('hidden');
                new Notification("Tracker Active", { body: "We'll let you know when new games arrive!", icon: '../favicon.png' });
            } else {
                alert(`Permission was ${perm}. Please check your browser settings (Lock icon in URL bar) to allow notifications.`);
            }
        });
    });

    testNotifBtn.addEventListener('click', () => {
        if (!("Notification" in window)) { alert("This browser does not support desktop notifications."); return; }
        if (Notification.permission === "granted") {
            new Notification("Test Notification", { body: "If you see this, it works!", icon: '../favicon.png' });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(perm => {
                if (perm === "granted") new Notification("Test Notification", { body: "Success!", icon: '../favicon.png' });
            });
        }
    });

    const resetHiddenBtn = document.getElementById('reset-hidden-btn');
    if (resetHiddenBtn) {
        resetHiddenBtn.addEventListener('click', () => {
            if (confirm("Unhide all games?")) {
                hiddenGames = [];
                localStorage.removeItem('fg_hidden');
                filterGames();
                alert("All hidden games have been restored.");
            }
        });
    }

    const scrollTopBtn = document.getElementById('scroll-to-top');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) scrollTopBtn.classList.remove('opacity-0', 'invisible', 'translate-y-4');
            else scrollTopBtn.classList.add('opacity-0', 'invisible', 'translate-y-4');
        });
    }

    function getMockData() {
        return [
            { id: 3399, title: "STALCRAFT: X (Mock)", worth: "N/A", image: "https://www.gamerpower.com/offers/1/6939a240ed23a.jpg", description: "Mock Data: 3rd Anniversary DLC pack.", published_date: new Date().toISOString(), type: "DLC", platforms: "PC, Steam", open_giveaway_url: "#", instructions: "1. Install Base Game.\n2. Claim DLC." },
            { id: 3396, title: "Jackbox Party Pack 4 (Epic Mock)", worth: "$24.99", image: "https://www.gamerpower.com/offers/1/6931b0e438ecd.jpg", description: "Mock Data: Party game collection.", published_date: new Date(Date.now() - 86400000 * 2).toISOString(), type: "Game", platforms: "PC, Epic Games Store", open_giveaway_url: "#", instructions: "Login to Epic and claim.", end_date: new Date(Date.now() + 3600000 * 2).toISOString() },
            { id: 1294, title: "Die Young (IndieGala)", worth: "$19.99", image: "https://www.gamerpower.com/offers/1/61aa6ac241369.jpg", description: "First-person open-world survival.", published_date: "2025-12-05 15:05:51", type: "Game", platforms: "PC, DRM-Free", open_giveaway_url: "#", instructions: "Click Add to Library." }
        ];
    }
});
