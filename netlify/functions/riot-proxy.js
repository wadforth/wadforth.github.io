const fetch = require('node-fetch');
const Bottleneck = require('bottleneck');

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
        'oc1': 'sea' // Oceania is weird, often groups with americas or sea depending on endpoint, usually SEA for routing context or AMERICAS historically. MatchV5 uses clusters.
        // Riot docs say: "AMERICAS", "ASIA", "EUROPE", "SEA".
        // Let's default to mapping based on platform.
    };

    // Some APIs use platform (euw1), others use routing (europe).
    // MatchV5 and AccountV1 use Routing.
    // SummonerV4, LeagueV4, etc use Platform.

    let targetHost = `https://${region}.api.riotgames.com`; // Default to platform

    // Setup URL based on requested endpoint type
    let targetPath = '';

    // --- ENDPOINT ROUTING LOGIC ---

    // ACCOUNT-V1 (Get PUUID by Riot ID or name)
    // /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}
    if (endpoint === 'account-by-riot-id') {
        const routing = routingMap[region] || 'europe'; // Fallback
        targetHost = `https://${routing}.api.riotgames.com`;
        targetPath = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(params.gameName)}/${encodeURIComponent(params.tagLine)}`;
    }

    // SUMMONER-V4 (Get by PUUID)
    // /lol/summoner/v4/summoners/by-puuid/{encryptedPUUID}
    else if (endpoint === 'summoner-by-puuid') {
        targetPath = `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(params.puuid)}`;
    }

    // MATCH-V5 (Get Match List by PUUID)
    // /lol/match/v5/matches/by-puuid/{puuid}/ids
    else if (endpoint === 'match-list') {
        const routing = routingMap[region] || 'europe';
        targetHost = `https://${routing}.api.riotgames.com`;
        targetPath = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(params.puuid)}/ids`;
        // Optional params: start, count, startTime
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
    // /lol/match/v5/matches/{matchId}
    else if (endpoint === 'match-details') {
        const routing = routingMap[region] || 'europe';
        targetHost = `https://${routing}.api.riotgames.com`;
        targetPath = `/lol/match/v5/matches/${encodeURIComponent(params.matchId)}`;
    }

    // LEAGUE-V4 (Ranked stats by Summoner ID)
    // /lol/league/v4/entries/by-summoner/{encryptedSummonerId}
    else if (endpoint === 'league-entries') {
        targetPath = `/lol/league/v4/entries/by-summoner/${encodeURIComponent(params.summonerId)}`;
    }

    // CHAMPION-MASTERY-V4 (Top Champs)
    // /lol/champion-mastery/v4/champion-masteries/by-puuid/{encryptedPUUID}/top
    else if (endpoint === 'mastery-top') {
        targetPath = `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(params.puuid)}/top`;
    }

    // LOL-STATUS-V4 (Platform Data)
    // /lol/status/v4/platform-data
    else if (endpoint === 'status') {
        targetPath = `/lol/status/v4/platform-data`;
    }

    // SPECTATOR-V4 (Active Game)
    // /lol/spectator/v4/active-games/by-summoner/{encryptedSummonerId}
    else if (endpoint === 'spectator') {
        targetPath = `/lol/spectator/v4/active-games/by-summoner/${encodeURIComponent(params.summonerId)}`;
    }

    // CHALLENGES-V1 (Player Data)
    // /lol/challenges/v1/player-data/{puuid}
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

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*", // Allow from anywhere (or restrict to your domain)
                "Access-Control-Allow-Headers": "Content-Type",
                "Cache-Control": "public, max-age=60" // Cache success for 60s
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
