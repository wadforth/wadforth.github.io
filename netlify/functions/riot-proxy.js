const fetch = require('node-fetch');
const Bottleneck = require('bottleneck');
const { getStore, connectLambda } = require('@netlify/blobs');

// Initialize Rate Limiter
// Riot Limits: 20 reqs / 1 sec, 100 reqs / 2 min
// We'll be slightly conservative to avoid hitting the edge.
const limiter = new Bottleneck({
    reservoir: 20, // Initial tokens
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 1000, // 1 second
    maxConcurrent: 5, // Avoid overloading locally
    minTime: 50 // Spacing requests slightly (20 reqs/1000ms = 50ms)
});

// Secondary limiter for the 2 minute window (100 reqs / 120s)
// We chain them.
const longLimiter = new Bottleneck({
    reservoir: 100,
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 120 * 1000,
    maxConcurrent: 5,
    minTime: 50
});

// Wrapper to Fetch with Rate Limits
const rateLimitedFetch = longLimiter.wrap(limiter.wrap(fetch));

// Cache TTLs (in milliseconds)
const CACHE_TTL = {
    'match-details': null,       // Forever - match data never changes
    'summoner-by-puuid': 3600000, // 1 hour
    'league-entries': 3600000,    // 1 hour
    'mastery-top': 3600000,       // 1 hour
    'challenges': 3600000,        // 1 hour
    'match-list': 300000,         // 5 minutes
    'account-by-riot-id': 86400000, // 24 hours (accounts rarely change)
};

// Helper: Generate cache key
function getCacheKey(endpoint, params) {
    switch (endpoint) {
        case 'match-details':
            return `match_${params.matchId}`;
        case 'summoner-by-puuid':
            return `summoner_${params.puuid}`;
        case 'league-entries':
            return `league_${params.summonerId}`;
        case 'mastery-top':
            return `mastery_${params.puuid}`;
        case 'challenges':
            return `challenges_${params.puuid}`;
        case 'match-list':
            return `matchlist_${params.puuid}_${params.start || 0}_${params.count || 10}`;
        case 'account-by-riot-id':
            return `account_${params.gameName}_${params.tagLine}`.toLowerCase();
        default:
            return null;
    }
}

// Helper: Check if cache is valid
function isCacheValid(cached, ttl) {
    if (!cached || !cached.data) return false;
    if (ttl === null) return true; // Forever cache
    return (Date.now() - cached.timestamp) < ttl;
}

exports.handler = async function (event, context) {
    const API_KEY = process.env.RIOT_API_KEY;

    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server Configuration Error: API Key missing." })
        };
    }

    const { endpoint, region, ...params } = event.queryStringParameters;

    if (!endpoint || !region) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing 'endpoint' or 'region' query parameters." })
        };
    }

    // --- CACHE CHECK ---
    const cacheKey = getCacheKey(endpoint, params);
    const ttl = CACHE_TTL[endpoint];
    let store = null;

    // Only use cache for supported endpoints
    if (cacheKey && ttl !== undefined) {
        try {
            // Connect Lambda environment for Blobs
            connectLambda(event);
            store = getStore('riot-cache');
            const cached = await store.get(cacheKey, { type: 'json' });

            if (isCacheValid(cached, ttl)) {
                console.log(`[Cache HIT] ${endpoint}: ${cacheKey}`);
                return {
                    statusCode: 200,
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Headers": "Content-Type",
                        "X-Cache": "HIT",
                        "X-Cache-Age": String(Math.round((Date.now() - cached.timestamp) / 1000))
                    },
                    body: JSON.stringify(cached.data)
                };
            }
            console.log(`[Cache MISS] ${endpoint}: ${cacheKey}`);
        } catch (e) {
            console.warn('[Cache Error]', e.message);
            // Continue without cache on error
        }
    }

    // Map "region" (e.g., euw1) to "routing" (americas, europe, asia) for Match V5
    const routingMap = {
        'na1': 'americas',
        'br1': 'americas',
        'la1': 'americas',
        'la2': 'americas',
        'euw1': 'europe',
        'eun1': 'europe',
        'tr1': 'europe',
        'ru': 'europe',
        'kr': 'asia',
        'jp1': 'asia',
        'ph2': 'sea',
        'sg2': 'sea',
        'th2': 'sea',
        'tw2': 'sea',
        'vn2': 'sea',
        'oc1': 'sea'
    };

    let targetHost = `https://${region}.api.riotgames.com`; // Default to platform
    let targetPath = '';

    // --- ENDPOINT ROUTING LOGIC ---

    // ACCOUNT-V1 (Get PUUID by Riot ID or name)
    if (endpoint === 'account-by-riot-id') {
        const routing = routingMap[region] || 'europe';
        targetHost = `https://${routing}.api.riotgames.com`;
        targetPath = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(params.gameName)}/${encodeURIComponent(params.tagLine)}`;
    }

    // SUMMONER-V4 (Get by PUUID)
    else if (endpoint === 'summoner-by-puuid') {
        targetPath = `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(params.puuid)}`;
    }

    // MATCH-V5 (Get Match List by PUUID)
    else if (endpoint === 'match-list') {
        const routing = routingMap[region] || 'europe';
        targetHost = `https://${routing}.api.riotgames.com`;
        targetPath = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(params.puuid)}/ids`;
        const count = params.count || 10;
        const start = params.start || 0;
        const startTime = params.startTime || '';

        let queryParams = `?start=${start}&count=${count}`;
        if (startTime) {
            queryParams += `&startTime=${startTime}`;
        }
        targetPath += queryParams;
    }

    // MATCH-V5 (Get Match Details by ID)
    else if (endpoint === 'match-details') {
        const routing = routingMap[region] || 'europe';
        targetHost = `https://${routing}.api.riotgames.com`;
        targetPath = `/lol/match/v5/matches/${encodeURIComponent(params.matchId)}`;
    }

    // LEAGUE-V4 (Ranked stats by Summoner ID)
    else if (endpoint === 'league-entries') {
        targetPath = `/lol/league/v4/entries/by-summoner/${encodeURIComponent(params.summonerId)}`;
    }

    // CHAMPION-MASTERY-V4 (Top Champs)
    else if (endpoint === 'mastery-top') {
        targetPath = `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(params.puuid)}/top`;
    }

    // LOL-STATUS-V4 (Platform Data)
    else if (endpoint === 'status') {
        targetPath = `/lol/status/v4/platform-data`;
    }

    // SPECTATOR-V4 (Active Game)
    else if (endpoint === 'spectator') {
        targetPath = `/lol/spectator/v4/active-games/by-summoner/${encodeURIComponent(params.summonerId)}`;
    }

    // CHALLENGES-V1 (Player Data)
    else if (endpoint === 'challenges') {
        targetPath = `/lol/challenges/v1/player-data/${encodeURIComponent(params.puuid)}`;
    }

    // Fallback
    else {
        return { statusCode: 400, body: JSON.stringify({ error: "Unknown endpoint type requested." }) };
    }

    const fullUrl = `${targetHost}${targetPath}`;
    console.log(`[Proxy] Requesting: ${fullUrl}`);

    try {
        const response = await rateLimitedFetch(fullUrl, {
            headers: {
                "X-Riot-Token": API_KEY
            }
        });

        const data = await response.json();

        // Pass through Riot's status code
        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: "Riot API Error", details: data })
            };
        }

        // --- SAVE TO CACHE ---
        if (store && cacheKey) {
            try {
                await store.setJSON(cacheKey, {
                    data: data,
                    timestamp: Date.now()
                });
                console.log(`[Cache SAVE] ${endpoint}: ${cacheKey}`);
            } catch (e) {
                console.warn('[Cache Save Error]', e.message);
            }
        }

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "X-Cache": "MISS",
                "Cache-Control": "public, max-age=60"
            },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 502,
            body: JSON.stringify({ error: "Failed to connect to Riot API" })
        };
    }
};
