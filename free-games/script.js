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

    // Notification UI
    const notifBtn = document.getElementById('params-btn');
    const notifModal = document.getElementById('notif-modal');
    const closeNotif = document.getElementById('close-notif');
    const notifBackdrop = document.getElementById('notif-backdrop');
    const enableNotifsBtn = document.getElementById('enable-notifs-btn');
    const testNotifBtn = document.getElementById('test-notif-btn');
    const checkGames = document.getElementById('check-games');
    const checkDlc = document.getElementById('check-dlc');

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

    // Notification State
    let notifSettings = JSON.parse(localStorage.getItem('fg_notif_settings')) || {
        enabled: false,
        games: true,
        dlc: false,
        lastKnownId: 0
    };

    // Apply Saved Preferences
    if (typeFilter) typeFilter.value = currentType;
    if (sortFilter) sortFilter.value = currentSort;
    checkGames.checked = notifSettings.games;
    checkDlc.checked = notifSettings.dlc;

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
            // Mock Data Fallback
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
    }

    function renderGames(games) {
        grid.innerHTML = '';
        if (games.length === 0) { noResults.classList.remove('hidden'); return; }
        else { noResults.classList.add('hidden'); }

        games.forEach(game => {
            const card = document.createElement('div');
            card.className = 'group bg-card border border-white/5 rounded-xl overflow-hidden hover:border-accent/50 transition-all hover:-translate-y-1 hover:shadow-xl shadow-accent/5 flex flex-col h-full relative';

            // Platform Logic
            const pLower = game.platforms.toLowerCase();
            let pIcon = '<i class="fa-solid fa-desktop"></i>';
            let pStyle = 'text-white'; // default

            if (pLower.includes('steam')) { pIcon = '<i class="fa-brands fa-steam"></i>'; pStyle = PLATFORM_STYLES.steam; }
            else if (pLower.includes('epic')) { pIcon = '<i class="fa-solid fa-cube"></i>'; pStyle = PLATFORM_STYLES.epic; }
            else if (pLower.includes('gog')) { pIcon = '<i class="fa-solid fa-gamepad"></i>'; pStyle = PLATFORM_STYLES.gog; }
            else if (pLower.includes('ubisoft')) { pIcon = '<i class="fa-brands fa-ubisoft"></i>'; pStyle = PLATFORM_STYLES.ubisoft; }

            // Badges
            const isNew = (Date.now() - new Date(game.published_date).getTime()) < (3 * 86400000);
            const endDate = game.end_date && game.end_date !== 'N/A' ? new Date(game.end_date) : null;
            const isEndingSoon = endDate && endDate > new Date() && endDate < new Date(Date.now() + 86400000);

            let badgesHtml = '';
            if (isNew) badgesHtml += '<span class="px-2 py-0.5 bg-accent text-dark text-[10px] font-bold rounded uppercase tracking-wider shadow-lg shadow-accent/20">New</span>';
            if (isEndingSoon) badgesHtml += '<span class="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded uppercase tracking-wider animate-pulse ml-1">Ending Soon</span>';

            card.innerHTML = `
                <div class="relative h-40 overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-t from-dark/90 to-transparent z-10"></div>
                    <img src="${game.image}" alt="${game.title}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                    
                    <div class="absolute top-2 right-2 z-20 flex gap-2">${badgesHtml}</div>
                    
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
                    <div class="flex justify-between items-start mb-1 h-12">
                        <h3 class="text-lg font-bold text-white line-clamp-2 group-hover:text-accent transition-colors flex-1" title="${game.title}">${game.title}</h3>
                    </div>
                    
                    <p class="text-[10px] text-slate-500 mb-3 flex items-center gap-1 font-mono">
                        <i class="fa-regular fa-clock"></i> ${getRelativeTime(game.published_date)}
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
                            <span class="text-sm font-mono text-green-400 line-through decoration-white/30 decoration-2">${game.worth === 'N/A' ? 'Free' : game.worth}</span>
                        </div>
                        <a href="${game.open_giveaway_url}" target="_blank" 
                           class="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium hover:bg-accent hover:text-dark hover:border-accent transition-all flex items-center gap-2 group-hover:bg-white/10">
                            Claim <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                        </a>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // --- Interaction Functions (Global Scope for HTML access) ---
    window.showInstructions = (id) => {
        const game = allGames.find(g => g.id == id);
        if (!game) return;
        instrContent.innerHTML = game.instructions || "No instructions provided. Click 'Claim' to visit the site.";
        instrModal.classList.remove('hidden');
    };

    window.shareDeal = (url) => {
        navigator.clipboard.writeText(url).then(() => {
            alert("Link copied to clipboard!");
        });
    };

    // --- Filtering & Sorting ---

    function filterGames() {
        const searchTerm = searchInput.value.toLowerCase();
        const platformKey = PLATFORM_KEYWORDS[currentPlatform] || '';

        let filtered = allGames.filter(game => {
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

        // Save
        localStorage.setItem('fg_platform', currentPlatform);
        localStorage.setItem('fg_type', currentType);
        localStorage.setItem('fg_sort', currentSort);
    }

    // --- Notifications Logic ---

    function checkNotifications(games) {
        if (!notifSettings.enabled) return;

        // Find newest game
        const newest = games[0]; // Assuming API returns newest first, or we could sort.
        // Actually, we should iterate and find any ID > lastKnownId

        let newItemsCount = 0;
        let latestId = notifSettings.lastKnownId;

        games.forEach(game => {
            if (game.id > notifSettings.lastKnownId) {
                // Check filters
                if (game.type === 'Game' && notifSettings.games ||
                    game.type === 'DLC' && notifSettings.dlc) {

                    // Trigger Notif
                    spawnNotification(`New Freebie: ${game.title}`, game.description, game.open_giveaway_url);
                    newItemsCount++;
                }
                if (game.id > latestId) latestId = game.id;
            }
        });

        // Update stored ID
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

    // Filters
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

    // Modals
    notifBtn.addEventListener('click', () => notifModal.classList.remove('hidden'));
    closeNotif.addEventListener('click', () => notifModal.classList.add('hidden'));
    notifBackdrop.addEventListener('click', () => notifModal.classList.add('hidden'));

    closeInstr.addEventListener('click', () => instrModal.classList.add('hidden'));
    instrBackdrop.addEventListener('click', () => instrModal.classList.add('hidden'));

    // Notification Settings
    enableNotifsBtn.addEventListener('click', () => {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                notifSettings.enabled = true;
                notifSettings.games = checkGames.checked;
                notifSettings.dlc = checkDlc.checked;
                if (notifSettings.lastKnownId === 0 && allGames.length > 0) {
                    notifSettings.lastKnownId = allGames[0].id; // Prevent spam on first enable
                }
                saveNotifSettings();
                alert("Notifications Enabled! 🔔\n\nNote: You must keep this tab open (or pinned) to receive alerts.");
                notifModal.classList.add('hidden');

                // Spawn a welcome notification
                new Notification("Tracker Active", { body: "We'll let you know when new games arrive!", icon: '../favicon.png' });
            } else {
                alert(`Permission was ${perm}. Please check your browser settings (Lock icon in URL bar) to allow notifications.`);
            }
        });
    });

    testNotifBtn.addEventListener('click', () => {
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notifications.");
            return;
        }

        if (Notification.permission === "granted") {
            new Notification("Test Notification", { body: "If you see this, it works!", icon: '../favicon.png' });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(perm => {
                if (perm === "granted") {
                    new Notification("Test Notification", { body: "Success!", icon: '../favicon.png' });
                }
            });
        }
    });

    // Scroll Top
    const scrollTopBtn = document.getElementById('scroll-to-top');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) scrollTopBtn.classList.remove('opacity-0', 'invisible', 'translate-y-4');
            else scrollTopBtn.classList.add('opacity-0', 'invisible', 'translate-y-4');
        });
    }

    // Mock Data Generator
    function getMockData() {
        return [
            { id: 3399, title: "STALCRAFT: X (Mock)", worth: "N/A", image: "https://www.gamerpower.com/offers/1/6939a240ed23a.jpg", description: "Mock Data: 3rd Anniversary DLC pack.", published_date: new Date().toISOString(), type: "DLC", platforms: "PC, Steam", open_giveaway_url: "#", instructions: "1. Install Base Game.\n2. Claim DLC." },
            { id: 3396, title: "Jackbox Party Pack 4 (Epic Mock)", worth: "$24.99", image: "https://www.gamerpower.com/offers/1/6931b0e438ecd.jpg", description: "Mock Data: Party game collection.", published_date: new Date(Date.now() - 86400000 * 2).toISOString(), type: "Game", platforms: "PC, Epic Games Store", open_giveaway_url: "#", instructions: "Login to Epic and claim." },
            { id: 1294, title: "Die Young (IndieGala)", worth: "$19.99", image: "https://www.gamerpower.com/offers/1/61aa6ac241369.jpg", description: "First-person open-world survival.", published_date: "2025-12-05 15:05:51", type: "Game", platforms: "PC, DRM-Free", open_giveaway_url: "#", instructions: "Click Add to Library." }
        ];
    }
});
