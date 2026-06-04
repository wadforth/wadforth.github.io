// Threat Intelligence Hub Controller
// Aggregates, parses, filters, and maps live threat data directly to MITRE ATT&CK elements.

export let intelArticles = [];
export let selectedArticleIdx = null;
export let intelSearchQuery = "";
export let searchDebounceTimeout = null;

export let intelFeeds = [
    { id: 'cisa', name: 'CISA Alerts', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', checked: true },
    { id: 'hackernews', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', checked: true },
    { id: 'bleepingcomputer', name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/', checked: true },
    { id: 'dfirreport', name: 'The DFIR Report', url: 'https://thedfirreport.com/feed/', checked: false },
    { id: 'cisacve', name: 'CISA Exploited Vulns', url: 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json', checked: false },
    { id: 'krebsonsecurity', name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', checked: false }
];

export let selectedSectors = new Set();
export let selectedFeeds = new Set(['cisa', 'hackernews', 'bleepingcomputer']);

export const SECTOR_KEYWORDS = {
    Finance: ['bank', 'payment', 'swipe', 'card', 'financial', 'swift', 'crypto', 'bitcoin', 'credit', 'ledger', 'atm', 'heist'],
    Healthcare: ['hospital', 'patient', 'clinical', 'medical', 'healthcare', 'pharma', 'vaccine', 'clinic', 'dentist'],
    Government: ['government', 'military', 'defense', 'federal', 'state', 'cisa', 'embassy', 'diplomatic', 'agency', 'senate', 'pentagon', 'white house'],
    Energy: ['energy', 'power', 'grid', 'electricity', 'utility', 'solar', 'wind', 'turbine', 'generator', 'oil', 'gas', 'pipeline', 'petroleum'],
    Nuclear: ['nuclear', 'uranium', 'radiation', 'nuke', 'rosatom', 'reactor'],
    Technology: ['cloud', 'software', 'saas', 'api', 'code', 'developer', 'firmware', 'router', 'database', 'cve', 'zero-day', 'cpu'],
    Aviation: ['aviation', 'airport', 'airline', 'flight', 'aerospace', 'aircraft', 'boeing', 'airbus']
};

export const ATTACK_KEYWORD_DICTIONARY = {
    'phishing': 'T1566',
    'spearphishing': 'T1566',
    'ransomware': 'T1486',
    'powershell': 'T1059.001',
    'cmd': 'T1059.003',
    'bash': 'T1059.004',
    'mimikatz': 'T1003',
    'credential dumping': 'T1003',
    'brute force': 'T1110',
    'zero-day': 'T1190',
    'exploit': 'T1203',
    'keylogger': 'T1056.001',
    'rdp': 'T1021.001',
    'phishing attachment': 'T1566.001',
    'phishing link': 'T1566.002',
    'credential access': 'T1003',
    'persistence': 'T1098',
    'lateral movement': 'T1021',
    'command and control': 'T1071',
    'exfiltration': 'T1041',
    'privilege escalation': 'T1068',
    'defense evasion': 'T1562'
};

// Load custom feeds from localStorage immediately on startup
export function loadCustomFeeds() {
    try {
        const stored = localStorage.getItem('attack-explorer-custom-feeds');
        if (stored) {
            const parsed = JSON.parse(stored);
            parsed.forEach(cf => {
                // Ensure no duplicate IDs
                if (!intelFeeds.some(f => f.id === cf.id)) {
                    intelFeeds.push(cf);
                    if (cf.checked) {
                        selectedFeeds.add(cf.id);
                    }
                }
            });
        }
    } catch (e) {
        console.error("Failed to load custom feeds from localStorage:", e);
    }
}
loadCustomFeeds();

export function saveCustomFeedsToLocalStorage() {
    const defaultIds = ['cisa', 'hackernews', 'bleepingcomputer', 'dfirreport', 'cisacve', 'krebsonsecurity'];
    const customFeeds = intelFeeds.filter(f => !defaultIds.includes(f.id));
    localStorage.setItem('attack-explorer-custom-feeds', JSON.stringify(customFeeds));
}

// Main routing load function
export async function renderIntelView() {
    // Hide nav alert notification dot when looking at this view
    const dot = document.getElementById('intel-nav-dot');
    if (dot) dot.classList.add('hidden');

    renderIntelFilters();
    renderCustomFeedsList();

    if (intelArticles.length === 0) {
        await refreshIntelFeed();
    } else {
        renderIntelGrid();
        renderIntelDetails();
    }
}

// Render the feed dropdown and sector filters
export function renderIntelFilters() {
    const feedContainer = document.getElementById('intel-feed-checkboxes');
    const sectorContainer = document.getElementById('intel-sector-filters');
    
    if (!feedContainer || !sectorContainer) return;
    
    // 1. Render default feed source checkboxes in dropdown
    const defaultIds = ['cisa', 'hackernews', 'bleepingcomputer', 'dfirreport', 'cisacve', 'krebsonsecurity'];
    const defaultFeeds = intelFeeds.filter(f => defaultIds.includes(f.id));

    feedContainer.innerHTML = defaultFeeds.map(f => `
        <label class="intel-checkbox-row d-flex align-items-center px-1 py-1" style="cursor: pointer; user-select: none;">
            <input type="checkbox" id="feed-check-${f.id}" value="${f.id}" ${selectedFeeds.has(f.id) ? 'checked' : ''} style="margin-right: 8px;">
            <span class="text-xs" style="color: var(--on-surface-secondary);">${escapeHtml(f.name)}</span>
        </label>
    `).join('');
    
    // Bind default feed checkbox events
    defaultFeeds.forEach(f => {
        const chk = document.getElementById(`feed-check-${f.id}`);
        chk?.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedFeeds.add(f.id);
                f.checked = true;
            } else {
                selectedFeeds.delete(f.id);
                f.checked = false;
            }
            updateActiveFeedCountBadge();
            saveCustomFeedsToLocalStorage();
            selectedArticleIdx = null; // Clear active card on filter change
            renderIntelGrid();
            renderIntelDetails();
        });
    });
    
    // 2. Render target industry sector filter badges
    const sectors = Object.keys(SECTOR_KEYWORDS);
    sectorContainer.innerHTML = sectors.map(s => `
        <span class="intel-sector-badge ${selectedSectors.has(s) ? 'active' : ''}" id="sector-badge-${s.replace(/\s+/g, '-')}">
            ${escapeHtml(s)}
        </span>
    `).join('');
    
    // Bind sector badge toggle events
    sectors.forEach(s => {
        const id = `sector-badge-${s.replace(/\s+/g, '-')}`;
        const badge = document.getElementById(id);
        badge?.addEventListener('click', () => {
            if (selectedSectors.has(s)) {
                selectedSectors.delete(s);
                badge.classList.remove('active');
            } else {
                selectedSectors.add(s);
                badge.classList.add('active');
            }
            selectedArticleIdx = null; // Clear active card on filter change
            renderIntelGrid();
            renderIntelDetails();
        });
    });
    
    updateActiveFeedCountBadge();
}

export function updateActiveFeedCountBadge() {
    const countEl = document.getElementById('active-feed-count');
    if (countEl) {
        countEl.textContent = selectedFeeds.size;
    }
}

// Render Custom RSS Feeds list in the dropdown
export function renderCustomFeedsList() {
    const listContainer = document.getElementById('intel-custom-feed-list');
    if (!listContainer) return;
    
    const defaultIds = ['cisa', 'hackernews', 'bleepingcomputer', 'dfirreport', 'cisacve', 'krebsonsecurity'];
    const customFeeds = intelFeeds.filter(f => !defaultIds.includes(f.id));
    
    if (customFeeds.length === 0) {
        listContainer.innerHTML = `<span class="text-xs text-on-surface-tertiary italic p-2 text-center d-block">No custom feeds added yet.</span>`;
        return;
    }
    
    listContainer.innerHTML = customFeeds.map(f => `
        <div class="intel-custom-feed-row mb-1 d-flex align-items-center justify-content-between px-1 py-1" style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: var(--radius-xs);">
            <div class="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                <input type="checkbox" id="feed-check-${f.id}" value="${f.id}" ${selectedFeeds.has(f.id) ? 'checked' : ''} style="cursor: pointer; margin-right: 6px;">
                <div class="intel-custom-feed-info" style="min-width: 0; flex-grow: 1;">
                    <span class="intel-custom-feed-name text-xs d-block" style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--on-surface-secondary);">${escapeHtml(f.name)}</span>
                    <span class="intel-custom-feed-url text-on-surface-tertiary d-block" title="${escapeHtml(f.url)}" style="font-size: 0.58rem; font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.url)}</span>
                </div>
            </div>
            <button class="intel-custom-feed-delete-btn" data-delete-feed-id="${f.id}" title="Delete Feed" style="margin-left: 6px; padding: 2px;">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `).join('');
    
    // Bind checkbox events for custom feeds
    customFeeds.forEach(f => {
        const chk = document.getElementById(`feed-check-${f.id}`);
        chk?.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedFeeds.add(f.id);
                f.checked = true;
            } else {
                selectedFeeds.delete(f.id);
                f.checked = false;
            }
            updateActiveFeedCountBadge();
            saveCustomFeedsToLocalStorage();
            selectedArticleIdx = null;
            renderIntelGrid();
            renderIntelDetails();
        });
    });
    
    // Bind delete button events
    listContainer.querySelectorAll('[data-delete-feed-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const feedId = btn.dataset.deleteFeedId;
            deleteCustomFeed(feedId);
        });
    });
}

export function deleteCustomFeed(feedId) {
    const feed = intelFeeds.find(f => f.id === feedId);
    const feedName = feed ? feed.name : "Custom Feed";
    
    intelFeeds = intelFeeds.filter(f => f.id !== feedId);
    selectedFeeds.delete(feedId);
    saveCustomFeedsToLocalStorage();
    
    // Refresh filters display
    renderIntelFilters();
    renderCustomFeedsList();
    
    // Remove custom feed source from articles and purge any articles with no sources left
    intelArticles.forEach(art => {
        if (art.sources) {
            art.sources = art.sources.filter(s => s.id !== feedId);
        }
    });
    intelArticles = intelArticles.filter(art => art.sources && art.sources.length > 0);
    selectedArticleIdx = null;
    renderIntelGrid();
    renderIntelDetails();
    
    if (typeof showToast === 'function') {
        showToast(`Feed "${feedName}" removed.`, 'success');
    }
}

// 250ms debounced search input handler
export function handleSearchInput(e) {
    if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        intelSearchQuery = e.target.value.trim().toLowerCase();
        selectedArticleIdx = null; // Reset selection on filter change
        renderIntelGrid();
        renderIntelDetails();
    }, 250);
}

// Robust multi-proxy fetch to bypass CORS limits seamlessly
export async function fetchViaProxy(url) {
    // Attempt direct native fetch first for CORS-friendly domains (e.g. GitHub Raw)
    if (url.includes('raw.githubusercontent.com') || url.includes('githubusercontent.com')) {
        try {
            console.log(`Attempting native direct fetch (CORS-friendly): ${url}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().length > 0) {
                    console.log(`Successfully fetched natively (CORS-friendly): ${url}`);
                    return text;
                }
            }
        } catch (err) {
            console.warn(`Direct native fetch failed for ${url}, falling back to CORS proxies: ${err.message}`);
        }
    }

    const proxies = [
        // 1. CORSProxy.org (Fastest robust proxy)
        target => `https://corsproxy.org/?${encodeURIComponent(target)}`,
        // 2. CodeTabs CORS Proxy (Stable backup proxy)
        target => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
        // 3. CORSProxy.io (Legacy fallback)
        target => `https://corsproxy.io/?${encodeURIComponent(target)}`,
        // 4. AllOrigins (JSON wrapper backup)
        target => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            const proxyUrl = proxies[i](url);
            console.log(`Attempting fetch via proxy ${i + 1}: ${proxyUrl}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
            
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!res.ok) throw new Error(`Proxy status ${res.status}`);
            
            if (proxyUrl.includes('allorigins')) {
                const json = await res.json();
                if (!json.contents) throw new Error('Empty AllOrigins response');
                return json.contents;
            } else {
                const text = await res.text();
                if (!text || text.trim().length === 0) throw new Error('Empty proxy response');
                return text;
            }
        } catch (err) {
            console.warn(`Proxy ${i + 1} failed for ${url}: ${err.message}`);
        }
    }
    throw new Error('All CORS proxies failed to retrieve resource.');
}

// Regex RSS & Atom Parser to parse malformed XML strictly avoided by DOMParser
export function parseRSSViaRegex(xmlContent) {
    const items = [];
    
    // Check if it looks like an Atom feed
    const isAtom = xmlContent.includes('<entry>') || xmlContent.includes('<feed>');
    
    if (isAtom) {
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
        let match;
        while ((match = entryRegex.exec(xmlContent)) !== null) {
            const entryContent = match[1];
            
            const getField = (tagName) => {
                const regex = new RegExp(`<${tagName}(?:\\s[^>]*?)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tagName}>`, 'i');
                const m = entryContent.match(regex);
                return m ? m[1].trim() : '';
            };
            
            const title = getField('title');
            
            let link = '';
            const linkMatch = entryContent.match(/<link(?:\s[^>]*?)?\shref=["']([^"']+)["']/i);
            if (linkMatch) {
                link = linkMatch[1];
            } else {
                link = getField('link');
            }
            
            let description = getField('content:encoded') || getField('content') || getField('summary');
            const pubDate = getField('published') || getField('updated') || getField('issued');
            
            // Extract categories from term attributes
            const categories = [];
            const catRegex = /<category(?:\s[^>]*?)?\sterm=["']([^"']+)["']/gi;
            let catMatch;
            while ((catMatch = catRegex.exec(entryContent)) !== null) {
                categories.push(catMatch[1]);
            }
            
            const author = getField('author name') || getField('author');
            
            if (title || description) {
                items.push({
                    title,
                    link,
                    description,
                    pubDate,
                    categories,
                    author
                });
            }
        }
    } else {
        // Standard RSS
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(xmlContent)) !== null) {
            const itemContent = match[1];
            
            const getField = (tagName) => {
                const regex = new RegExp(`<${tagName}(?:\\s[^>]*?)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tagName}>`, 'i');
                const m = itemContent.match(regex);
                return m ? m[1].trim() : '';
            };
            
            const title = getField('title');
            const link = getField('link');
            let description = getField('content:encoded') || getField('description');
            const pubDate = getField('pubDate');
            
            // Extract multiple categories
            const categories = [];
            const catRegex = /<category(?:\\s[^>]*?)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/category>/gi;
            let catMatch;
            while ((catMatch = catRegex.exec(itemContent)) !== null) {
                categories.push(catMatch[1].trim());
            }
            
            const author = getField('dc:creator') || getField('author');
            
            if (title || description) {
                items.push({
                    title,
                    link,
                    description,
                    pubDate,
                    categories,
                    author
                });
            }
        }
    }
    
    return items;
}

// Helper to identify if a description is a teaser summary (like Bleeping Computer)
export function checkIfTeaser(desc) {
    if (!desc) return false;
    const trimmed = desc.trim();
    return trimmed.includes('[...]') || trimmed.includes('…') || (trimmed.length > 0 && trimmed.length < 300);
}

// Extract text from elements, handling CDATA comments parsed under HTML5 DOMParser fallback
export function getElementTextWithCDATA(el) {
    if (!el) return '';
    // Look for CDATA comment child node (common in text/html parsing fallback)
    for (let child of el.childNodes) {
        if (child.nodeType === 8 && child.nodeValue.startsWith('[CDATA[')) {
            let content = child.nodeValue.substring(7);
            if (content.endsWith(']]')) {
                content = content.substring(0, content.length - 2);
            }
            return content.trim();
        }
    }
    return (el.textContent || el.innerText || '').trim();
}

// Fetch live XML feed from public RSS feeds using a CORS Proxy
export async function refreshIntelFeed() {
    const grid = document.getElementById('intel-feed-grid');
    const loading = document.getElementById('intel-feed-loading');
    
    if (grid) grid.innerHTML = '';
    if (loading) loading.classList.remove('hidden');
    
    intelArticles = [];
    selectedArticleIdx = null;
    
    const allItems = [];
    const fetchPromises = intelFeeds.map(async (feed) => {
        try {
            const xmlContent = await fetchViaProxy(feed.url);
            let items = [];
            
            if (feed.id === 'cisacve') {
                // Parse CISA KEV JSON catalog
                try {
                    const json = JSON.parse(xmlContent);
                    if (json && json.vulnerabilities) {
                        // Limit to top 40 most recent catalog vulnerabilities to prevent rendering lag
                        const recentVuls = json.vulnerabilities.slice(0, 40);
                        recentVuls.forEach(v => {
                            items.push({
                                title: `${v.cveID} - ${v.vendorProject} ${v.product}: ${v.vulnerabilityName}`,
                                link: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
                                description: `${v.shortDescription}\n\nRequired Action: ${v.requiredAction}\nKnown Ransomware Campaign Use: ${v.knownRansomwareCampaignUse}`,
                                pubDate: v.dateAdded,
                                author: 'CISA',
                                categories: ['Vulnerability', 'Exploited', v.vendorProject]
                            });
                        });
                    }
                } catch (jsonErr) {
                    console.error("Failed to parse CISA KEV JSON feed:", jsonErr);
                    throw jsonErr;
                }
            } else {
                // Try standard DOMParser to parse XML as strict XML context first.
                // This ensures CDATA sections and namespace-colon tags parse natively.
                // If it fails with a syntax/parser error, fall back to forgiving HTML context.
                try {
                    const parser = new DOMParser();
                    let doc = parser.parseFromString(xmlContent, 'text/xml');
                    
                    const hasError = doc.querySelector('parsererror');
                    if (hasError) {
                        console.warn(`XML parser error for ${feed.name}, falling back to HTML context:`, hasError.textContent);
                        doc = parser.parseFromString(xmlContent, 'text/html');
                    }
                    
                    // RSS elements
                    const xmlItems = doc.querySelectorAll('item');
                    if (xmlItems.length > 0) {
                        xmlItems.forEach(item => {
                            const title = getElementTextWithCDATA(item.querySelector('title')) || 'Untitled Threat Advisory';
                            
                            // Access content directly to avoid absolute URL normalization on <link> tags
                            const linkEl = item.querySelector('link');
                            const link = linkEl ? getElementTextWithCDATA(linkEl) || '#' : '#';
                            
                            let descEl = item.getElementsByTagName('content:encoded')[0] || 
                                         item.getElementsByTagName('encoded')[0] || 
                                         item.getElementsByTagNameNS('*', 'encoded')[0] ||
                                         item.getElementsByTagName('description')[0] || 
                                         item.querySelector('description');
                            let descText = getElementTextWithCDATA(descEl);
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = descText;
                            let desc = tempDiv.textContent || tempDiv.innerText || '';
                            
                            const dateText = getElementTextWithCDATA(item.querySelector('pubDate')) || 
                                             getElementTextWithCDATA(item.querySelector('pubdate')) || '';
                            
                            const categories = [];
                            item.querySelectorAll('category').forEach(cat => {
                                const val = getElementTextWithCDATA(cat);
                                if (val) categories.push(val.trim());
                            });
                            
                            const authorEl = item.getElementsByTagName('dc:creator')[0] || 
                                             item.getElementsByTagName('creator')[0] || 
                                             item.getElementsByTagNameNS('*', 'creator')[0] ||
                                             item.querySelector('creator') || 
                                             item.querySelector('author');
                            const author = getElementTextWithCDATA(authorEl);
                            
                            items.push({ title, link, description: desc, pubDate: dateText, categories, author });
                        });
                    } else {
                        // Atom entry nodes
                        const xmlEntries = doc.querySelectorAll('entry');
                        if (xmlEntries.length > 0) {
                            xmlEntries.forEach(entry => {
                                const title = getElementTextWithCDATA(entry.querySelector('title')) || 'Untitled Threat Advisory';
                                
                                let link = '#';
                                const linkEl = entry.querySelector('link');
                                if (linkEl) {
                                    link = linkEl.getAttribute('href') || getElementTextWithCDATA(linkEl) || '#';
                                }
                                
                                let descEl = entry.getElementsByTagName('content:encoded')[0] || 
                                             entry.getElementsByTagName('content')[0] || 
                                             entry.getElementsByTagNameNS('*', 'content')[0] ||
                                             entry.getElementsByTagName('summary')[0] || 
                                             entry.querySelector('content') || 
                                             entry.querySelector('summary');
                                let descText = getElementTextWithCDATA(descEl);
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = descText;
                                let desc = tempDiv.textContent || tempDiv.innerText || '';
                                
                                const dateText = getElementTextWithCDATA(entry.querySelector('published')) || 
                                                 getElementTextWithCDATA(entry.querySelector('updated')) || '';
                                
                                const categories = [];
                                entry.querySelectorAll('category').forEach(cat => {
                                    const term = cat.getAttribute('term') || getElementTextWithCDATA(cat);
                                    if (term) categories.push(term.trim());
                                });
                                
                                const author = getElementTextWithCDATA(entry.querySelector('author name')) || 
                                               getElementTextWithCDATA(entry.querySelector('author')) || '';
                                
                                items.push({ title, link, description: desc, pubDate: dateText, categories, author });
                            });
                        } else {
                            throw new Error('No items or entries matched in DOM XML/HTML tree.');
                        }
                    }
                } catch (domErr) {
                    console.warn(`DOM Parser failed for ${feed.name}. Attempting Regex parsing fallback.`, domErr);
                    const parsedItems = parseRSSViaRegex(xmlContent);
                    
                    parsedItems.forEach(item => {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = item.description;
                        item.description = tempDiv.textContent || tempDiv.innerText || '';
                        items.push(item);
                    });
                }
            }
            
            // Collect all items along with their source feed information
            items.forEach(item => {
                allItems.push({
                    ...item,
                    feedId: feed.id,
                    feedName: feed.name
                });
            });
        } catch (err) {
            console.error(`Failed to fetch RSS feed: ${feed.name}`, err);
        }
    });
    
    await Promise.all(fetchPromises);
    
    // Sequentially process and deduplicate/merge all items to form the final list
    allItems.forEach(item => {
        const title = item.title || 'Untitled Advisory';
        const link = item.link || '#';
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        const desc = item.description || '';
        
        const isTeaser = checkIfTeaser(desc);
        
        const normalizedTitle = title.toLowerCase().trim();
        const normalizedLink = link.toLowerCase().trim();
        
        // Match existing article by exact link or exact title (ignoring generic placeholders like '#' or empty/untitled titles)
        const existing = intelArticles.find(art => {
            const artTitle = art.title ? art.title.toLowerCase().trim() : '';
            const artLink = art.link ? art.link.toLowerCase().trim() : '';
            
            const hasValidLink = normalizedLink && normalizedLink !== '#' && normalizedLink !== '';
            const hasValidTitle = normalizedTitle && normalizedTitle !== 'untitled threat advisory' && normalizedTitle !== 'untitled advisory' && normalizedTitle !== '';
            
            const linkMatch = hasValidLink && artLink === normalizedLink;
            const titleMatch = hasValidTitle && artTitle === normalizedTitle;
            
            return linkMatch || titleMatch;
        });
        
        if (existing) {
            // Append source to sources list if it does not already exist
            if (!existing.sources.some(s => s.id === item.feedId)) {
                existing.sources.push({ id: item.feedId, name: item.feedName });
            }
            // Merge categories safely
            if (item.categories && item.categories.length > 0) {
                item.categories.forEach(c => {
                    if (!existing.categories.includes(c)) {
                        existing.categories.push(c);
                    }
                });
            }
            // If the new item has a longer description, keep it (merges teaser vs full content)
            if (desc.length > existing.description.length) {
                existing.description = desc;
                existing.isTeaser = isTeaser;
            }
            return;
        }
        
        const article = {
            title,
            link,
            description: desc,
            pubDate,
            sources: [{ id: item.feedId, name: item.feedName }],
            author: item.author || '',
            categories: item.categories || [],
            isTeaser,
            sectors: classifySectors(title + ' ' + desc),
            mappings: detectAttackMappings(title + ' ' + desc)
        };
        
        intelArticles.push(article);
    });
    
    // Sort articles chronological descending
    intelArticles.sort((a, b) => b.pubDate - a.pubDate);
    
    if (loading) loading.classList.add('hidden');
    
    renderIntelGrid();
    renderIntelDetails();

    // Trigger Nav alert pulsating dot and system toast alerts if they are not viewing the Intel view
    const activeLink = document.querySelector('.top-nav-pills a.active');
    const isIntelActive = activeLink && activeLink.getAttribute('data-view') === 'intel';
    
    if (!isIntelActive) {
        const dot = document.getElementById('intel-nav-dot');
        if (dot) dot.classList.remove('hidden');
        
        if (intelArticles.length > 0 && typeof showToast === 'function') {
            showToast(`Threat Intelligence feeds aggregated successfully!`, 'info');
        }
    }
}

// Classify sectors based on keyword matching
export function classifySectors(text) {
    const tags = [];
    const cleanText = text.toLowerCase();
    
    for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
        if (keywords.some(k => cleanText.includes(k))) {
            tags.push(sector);
        }
    }
    return tags;
}

// Scans titles & bodies to automatically map threat groups and technique IDs in MITRE database
export function detectAttackMappings(text) {
    const cleanText = text.toLowerCase();
    const mappings = {
        techniques: [],
        groups: []
    };
    
    // 1. Scan for Technique IDs (e.g. T1059, T1003.001)
    const techPattern = /\bT\d{4}(?:\.\d{3})?\b/gi;
    const matchedTechs = text.match(techPattern) || [];
    const uniqueTechs = [...new Set(matchedTechs.map(t => t.toUpperCase()))];
    
    // 2. Scan for Keyword Dictionary Mappings
    for (const [kw, tid] of Object.entries(ATTACK_KEYWORD_DICTIONARY)) {
        if (cleanText.includes(kw)) {
            uniqueTechs.push(tid);
        }
    }

    // Dedup and lookup in techniques database
    const dedupedTechs = [...new Set(uniqueTechs)];
    dedupedTechs.forEach(tid => {
        const tech = state.techniques.find(t => {
            const extId = t.external_references?.[0]?.external_id || '';
            return extId === tid;
        });
        if (tech) {
            if (!mappings.techniques.some(item => item.id === tid)) {
                mappings.techniques.push({ id: tid, name: tech.name });
            }
        }
    });
    
    // 3. Scan for Adversary Group Name Mentions (e.g., APT28, Lazarus, Volt Typhoon)
    state.groups.forEach(g => {
        const gName = g.name.toLowerCase();
        const aliases = (g.x_mitre_aliases || g.aliases || []).map(a => a.toLowerCase());
        
        // Exact name or alias match
        const matchesName = cleanText.includes(gName) || aliases.some(alias => cleanText.includes(alias));
        if (matchesName) {
            const extId = g.external_references?.[0]?.external_id || 'N/A';
            if (!mappings.groups.some(item => item.id === g.id)) {
                mappings.groups.push({ id: g.id, extId: extId, name: g.name });
            }
        }
    });
    
    return mappings;
}

// Get filtered articles list based on active filters
export function getFilteredArticles() {
    let filtered = intelArticles.filter(art => art.sources && art.sources.some(s => selectedFeeds.has(s.id)));
    
    if (selectedSectors.size > 0) {
        filtered = filtered.filter(art => art.sectors.some(s => selectedSectors.has(s)));
    }
    
    if (intelSearchQuery) {
        filtered = filtered.filter(art => 
            art.title.toLowerCase().includes(intelSearchQuery) || 
            art.description.toLowerCase().includes(intelSearchQuery) || 
            (art.sources && art.sources.some(s => s.name.toLowerCase().includes(intelSearchQuery)))
        );
    }
    
    return filtered;
}

// Map dates to clean chronological groups
export function getChronologicalGroup(date) {
    if (!date) return 'Earlier';
    
    const now = new Date();
    const articleDate = new Date(date);
    
    // Clear times for date comparisons
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - today.getDay()); // Sunday
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const compareDate = new Date(articleDate.getFullYear(), articleDate.getMonth(), articleDate.getDate());
    
    if (compareDate.getTime() === today.getTime()) {
        return 'Today';
    } else if (compareDate.getTime() === yesterday.getTime()) {
        return 'Yesterday';
    } else if (compareDate >= startOfWeek) {
        return 'Earlier this week';
    } else if (compareDate >= startOfMonth) {
        return 'Earlier this month';
    } else {
        return 'Earlier';
    }
}

// Render the vertical stream of compact article items inside Column 2
export function renderIntelGrid() {
    const grid = document.getElementById('intel-feed-grid');
    if (!grid) return;
    
    const filtered = getFilteredArticles();
    
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="intel-empty-state">
                <i class="bi bi-rss"></i>
                <h5>No advisories match active filters</h5>
                <p class="text-sm text-on-surface-tertiary">Select more feed sources or adjust filters.</p>
            </div>
        `;
        return;
    }
    
    let currentGroup = "";
    let html = "";
    
    filtered.forEach((art, idx) => {
        const group = getChronologicalGroup(art.pubDate);
        if (group !== currentGroup) {
            currentGroup = group;
            html += `<div class="intel-date-header"><span>${escapeHtml(group)}</span></div>`;
        }
        
        const dateStr = art.pubDate ? new Date(art.pubDate).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }) : '';
        
        const sectorTags = art.sectors.slice(0, 3).map(s => {
            const motifClass = `intel-tag-${s.toLowerCase().replace(/\s+/g, '')}`;
            return `<span class="intel-card-sector-tag ${motifClass}">${escapeHtml(s)}</span>`;
        }).join('');
        
        const isActive = selectedArticleIdx === idx;
        
        const sourceNameStr = art.sources ? art.sources.map(s => s.name).join(', ') : 'Unknown Feed';
        const teaserBadge = art.isTeaser ? `<span class="intel-card-teaser-badge" style="font-size: 0.58rem; background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); padding: 1px 4px; border-radius: 4px; margin-left: 6px;"><i class="bi bi-file-earmark-text"></i> Teaser</span>` : '';
        
        html += `
            <div class="intel-card ${isActive ? 'active' : ''}" data-article-idx="${idx}">
                <div class="intel-card-header">
                    <span class="intel-card-source">${escapeHtml(sourceNameStr)}</span>
                    <span class="intel-card-date">${dateStr}${teaserBadge}</span>
                </div>
                <h6 class="intel-card-title">${escapeHtml(art.title)}</h6>
                <p class="intel-card-desc">${escapeHtml(art.description)}</p>
                <div class="intel-card-sectors">${sectorTags}</div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
    
    // Bind news card selection
    grid.querySelectorAll('.intel-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedArticleIdx = parseInt(card.dataset.articleIdx, 10);
            
            // Highlight selected card active state
            grid.querySelectorAll('.intel-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            renderIntelDetails();
        });
    });
}

// Render the Right details pane based on selection state
export function renderIntelDetails() {
    const pane = document.getElementById('intel-details-panel');
    if (!pane) return;
    
    const filtered = getFilteredArticles();
    const article = filtered[selectedArticleIdx];
    
    if (!article) {
        pane.innerHTML = `
            <div class="intel-details-empty">
                <i class="bi bi-shield-radar"></i>
                <h5>Intelligence Workspace</h5>
                <p class="text-sm text-on-surface-tertiary">Select a threat advisory from the feed list to view active MITRE mappings, gaps, and custom pivots.</p>
            </div>
        `;
        return;
    }
    
    const dateStr = article.pubDate ? new Date(article.pubDate).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : 'Unknown date';
    
    const sectorTags = article.sectors.map(s => {
        const motifClass = `intel-tag-${s.toLowerCase().replace(/\s+/g, '')}`;
        return `<span class="intel-card-sector-tag ${motifClass}" style="font-size: 10px; padding: 2px 8px;">${escapeHtml(s)}</span>`;
    }).join('');
    
    const hasMappings = article.mappings.techniques.length > 0 || article.mappings.groups.length > 0;
    
    let mappingsHtml = '';
    if (!hasMappings) {
        mappingsHtml = `<div class="intel-mappings-empty">No MITRE ATT&CK elements identified in this advisory description.</div>`;
    } else {
        mappingsHtml += `<div class="intel-mapping-grid">`;
        
        // Renders threat group mappings with dynamic defensive scores
        article.mappings.groups.forEach(g => {
            const techRels = state.relationships.filter(r => r.relationship_type === 'uses' && r.source_ref === g.id);
            const techCount = techRels.length;
            const coveredCount = techRels.filter(r => {
                const tech = state.techniques.find(t => t.id === r.target_ref);
                const tid = tech?.external_references?.[0]?.external_id || '';
                const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === tid);
                return ann?.queries && ann.queries.length > 0;
            }).length;
            const scorePct = techCount > 0 ? Math.round((coveredCount / techCount) * 100) : 0;
            
            mappingsHtml += `
                <div class="intel-pivot-card pivot-actor">
                    <div>
                        <div class="intel-pivot-card-header">
                            <span class="intel-pivot-id">${g.extId}</span>
                            <span class="intel-pivot-status ${scorePct >= 70 ? 'covered' : 'gap'}">${scorePct}% Covered</span>
                        </div>
                        <h6 class="intel-pivot-name">${escapeHtml(g.name)}</h6>
                    </div>
                    <button class="btn btn-xs btn-outline-primary intel-pivot-action-btn" data-group-pivot="${g.id}">
                        <i class="bi bi-eye mr-1"></i>View Gap Map
                    </button>
                </div>
            `;
        });
        
        // Renders technique mappings showing active coverage vs gap blindspots
        article.mappings.techniques.forEach(t => {
            const ann = state.currentLayer?.techniques?.find(a => a.techniqueID === t.id);
            const hasQuery = ann?.queries && ann.queries.length > 0;
            
            mappingsHtml += `
                <div class="intel-pivot-card">
                    <div>
                        <div class="intel-pivot-card-header">
                            <span class="intel-pivot-id">${t.id}</span>
                            <span class="intel-pivot-status ${hasQuery ? 'covered' : 'gap'}">${hasQuery ? 'COVERED' : 'BLINDSPOT'}</span>
                        </div>
                        <h6 class="intel-pivot-name">${escapeHtml(t.name)}</h6>
                    </div>
                    <button class="btn btn-xs ${hasQuery ? 'btn-outline-success' : 'btn-outline-danger'} intel-pivot-action-btn" data-tech-pivot="${t.id}">
                        ${hasQuery ? '<i class="bi bi-shield-check mr-1"></i>View Hunt' : '<i class="bi bi-plus-lg mr-1"></i>Create Hunt'}
                    </button>
                </div>
            `;
        });
        
        mappingsHtml += `</div>`;
    }
    
    const categoryBadges = article.categories && article.categories.length > 0
        ? `<div class="intel-details-categories mt-2 flex-wrap d-flex gap-1">
            ${article.categories.map(c => `<span class="badge border px-2 py-1 text-xxs font-semibold uppercase tracking-wider" style="background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.1); color: var(--on-surface-secondary);">${escapeHtml(c)}</span>`).join('')}
           </div>`
        : '';

    const sourceBadges = article.sources && article.sources.length > 0
        ? article.sources.map(s => `<span class="intel-details-source-badge" style="display: inline-block; padding: 2px 6px; font-size: 0.72rem; font-weight: 600; border-radius: 4px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: var(--on-surface-primary);">${escapeHtml(s.name)}</span>`).join(' ')
        : `<span class="intel-details-source-badge">${escapeHtml(article.sourceName || 'Unknown')}</span>`;

    pane.innerHTML = `
        <div class="intel-details-header">
            <div class="intel-details-meta d-flex align-items-center gap-2 flex-wrap">
                <div class="d-flex gap-1 flex-wrap align-items-center mr-2">${sourceBadges}</div>
                <span><i class="bi bi-calendar-event mr-1"></i> ${dateStr}</span>
                ${article.author ? `<span><i class="bi bi-person mr-1"></i> By ${escapeHtml(article.author)}</span>` : ''}
            </div>
            <h4 class="intel-details-title mt-2">${escapeHtml(article.title)}</h4>
            ${article.sectors.length > 0 ? `<div class="intel-details-sectors mt-2">${sectorTags}</div>` : ''}
            ${categoryBadges}
            ${article.isTeaser ? `
            <div class="intel-teaser-alert mt-2 p-2 rounded border" style="background: rgba(245, 158, 11, 0.05); border-color: rgba(245, 158, 11, 0.15); color: #f59e0b; display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem;">
                <i class="bi bi-exclamation-circle-fill"></i>
                <span><strong>Notice:</strong> This is a short teaser summary. The full content can be viewed by clicking <strong>"Read Full Advisory"</strong> below.</span>
            </div>
            ` : ''}
        </div>
        
        <div class="intel-details-body mt-3">
            <div style="white-space: pre-wrap; line-height: 1.6; font-size: 0.88rem; color: var(--on-surface-secondary);">${escapeHtml(article.description)}</div>
        </div>
        
        <div class="intel-details-link-section mt-3">
            <button class="btn btn-sm btn-primary" onclick="window.open('${article.link}', '_blank')">
                <i class="bi bi-box-arrow-up-right mr-1"></i>Read Full Advisory
            </button>
        </div>
        
        <div class="intel-details-mappings-section mt-4">
            <div class="intel-details-mapping-heading mb-2">
                <i class="bi bi-shield-check mr-1" style="color: var(--primary);"></i> Active Mapped Threat Indicators
            </div>
            ${mappingsHtml}
        </div>
    `;
    
    // Bind pivots details modal triggers
    pane.querySelectorAll('[data-group-pivot]').forEach(el => {
        el.addEventListener('click', () => {
            showGroupModal(el.dataset.groupPivot);
        });
    });
    
    pane.querySelectorAll('[data-tech-pivot]').forEach(el => {
        el.addEventListener('click', () => {
            const tid = el.dataset.techPivot;
            const isCreate = el.classList.contains('btn-outline-danger');
            
            showTechniqueModal(tid);
            
            if (isCreate) {
                setTimeout(() => {
                    document.getElementById('btn-add-query-modal')?.click();
                }, 500);
            }
        });
    });
}

// Hook refresh button listener
document.getElementById('btn-refresh-intel')?.addEventListener('click', refreshIntelFeed);

// Initialize event listeners
export function initIntelView() {
    // 1. Add Custom Feed Button click -> Show Bootstrap Modal
    const btnAdd = document.getElementById('btn-add-custom-feed');
    btnAdd?.addEventListener('click', () => {
        const modalEl = document.getElementById('custom-feed-modal');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            // Clear input fields
            document.getElementById('custom-feed-name').value = '';
            document.getElementById('custom-feed-url').value = '';
            modal.show();
        }
    });

    // 2. Save Custom Feed Button click -> Save, Sync, Close, Refresh
    const btnSave = document.getElementById('btn-save-custom-feed');
    btnSave?.addEventListener('click', () => {
        const nameInput = document.getElementById('custom-feed-name');
        const urlInput = document.getElementById('custom-feed-url');
        
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        
        if (!name || !url) {
            if (typeof showToast === 'function') showToast("Please fill in both name and URL.", "warning");
            return;
        }
        
        // Simple URL validation
        try {
            new URL(url);
        } catch (_) {
            if (typeof showToast === 'function') showToast("Please enter a valid URL.", "warning");
            return;
        }
        
        const feedId = 'custom-' + Date.now();
        const newFeed = { id: feedId, name: name, url: url, checked: true };
        
        intelFeeds.push(newFeed);
        selectedFeeds.add(feedId);
        
        saveCustomFeedsToLocalStorage();
        
        // Close modal
        const modalEl = document.getElementById('custom-feed-modal');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
        }
        
        // Refresh display
        renderIntelFilters();
        renderCustomFeedsList();
        
        // Re-fetch feeds
        refreshIntelFeed();
        
        if (typeof showToast === 'function') showToast(`Feed "${name}" added successfully!`, "success");
    });
    
    // 3. Search feed input with 250ms debouncer
    const searchInput = document.getElementById('intel-search-input');
    searchInput?.addEventListener('input', handleSearchInput);
    
    // 4. Initial custom feed rendering
    renderCustomFeedsList();

    // 5. Dropdown Toggle Logic
    const btn = document.getElementById('intel-feed-dropdown-btn');
    if (btn) {
        const menu = btn.closest('.dropdown')?.querySelector('.intel-dropdown-menu') || btn.nextElementSibling;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (menu && !menu.contains(e.target) && e.target !== btn) {
                menu.classList.remove('show');
            }
        });
    }
}

// Call init immediately
initIntelView();

// Legacy Window Bindings
window.intelArticles = intelArticles;
window.selectedArticleIdx = selectedArticleIdx;
window.intelSearchQuery = intelSearchQuery;
window.searchDebounceTimeout = searchDebounceTimeout;
window.intelFeeds = intelFeeds;
window.selectedSectors = selectedSectors;
window.selectedFeeds = selectedFeeds;
window.SECTOR_KEYWORDS = SECTOR_KEYWORDS;
window.ATTACK_KEYWORD_DICTIONARY = ATTACK_KEYWORD_DICTIONARY;
window.loadCustomFeeds = loadCustomFeeds;
window.saveCustomFeedsToLocalStorage = saveCustomFeedsToLocalStorage;
window.renderIntelView = renderIntelView;
window.renderIntelFilters = renderIntelFilters;
window.updateActiveFeedCountBadge = updateActiveFeedCountBadge;
window.renderCustomFeedsList = renderCustomFeedsList;
window.deleteCustomFeed = deleteCustomFeed;
window.handleSearchInput = handleSearchInput;
window.fetchViaProxy = fetchViaProxy;
window.parseRSSViaRegex = parseRSSViaRegex;
window.checkIfTeaser = checkIfTeaser;
window.getElementTextWithCDATA = getElementTextWithCDATA;
window.refreshIntelFeed = refreshIntelFeed;
window.classifySectors = classifySectors;
window.detectAttackMappings = detectAttackMappings;
window.getFilteredArticles = getFilteredArticles;
window.getChronologicalGroup = getChronologicalGroup;
window.renderIntelGrid = renderIntelGrid;
window.renderIntelDetails = renderIntelDetails;
window.initIntelView = initIntelView;
