const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Game Logger API
 * Handles profiles, Steam linking, game tracking
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
};

// Parse session from cookie
function getSessionToken(event) {
    const cookies = event.headers.cookie || '';
    const match = cookies.match(/gl_session=([^;]+)/);
    return match ? match[1] : null;
}

// Validate session and get user
async function getAuthenticatedUser(event, store) {
    const token = getSessionToken(event);
    if (!token) return null;

    const session = await store.get(`session_${token}`, { type: 'json' });
    if (!session || Date.now() > session.expiresAt) return null;

    const user = await store.get(`user_${session.discordId}`, { type: 'json' });
    return user;
}

// Steam API helper
async function fetchSteamData(endpoint, params = {}) {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) throw new Error('Steam API key not configured');

    const url = new URL(`https://api.steampowered.com/${endpoint}`);
    url.searchParams.set('key', apiKey);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Steam API error: ${res.status}`);
    return res.json();
}

// Extract Steam ID from various URL formats
function extractSteamId(input) {
    // Direct ID (17 digits)
    if (/^\d{17}$/.test(input)) return { type: 'id', value: input };

    // URL formats
    const idMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
    if (idMatch) return { type: 'id', value: idMatch[1] };

    const vanityMatch = input.match(/steamcommunity\.com\/id\/([^\/]+)/);
    if (vanityMatch) return { type: 'vanity', value: vanityMatch[1] };

    // Just a vanity name
    if (/^[a-zA-Z0-9_-]+$/.test(input)) return { type: 'vanity', value: input };

    return null;
}

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    const params = event.queryStringParameters || {};
    const action = params.action;

    try {
        connectLambda(event);
        const store = getStore('game-logger');

        // === GET CURRENT USER (me) ===
        if (action === 'me') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return {
                    statusCode: 401,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Not logged in' })
                };
            }
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ user })
            };
        }

        // === GET PROFILE BY USERNAME ===
        if (action === 'profile') {
            const username = params.username?.toLowerCase();
            if (!username) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Username required' })
                };
            }

            // Lookup username -> discordId
            const lookup = await store.get(`username_${username}`, { type: 'json' });
            if (!lookup) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Profile not found' })
                };
            }

            const user = await store.get(`user_${lookup.discordId}`, { type: 'json' });
            if (!user) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Profile not found' })
                };
            }

            // Check if viewer is owner
            const viewer = await getAuthenticatedUser(event, store);
            const isOwner = viewer?.discordId === user.discordId;

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ user, isOwner })
            };
        }

        // === PROTECTED ACTIONS ===
        const user = await getAuthenticatedUser(event, store);
        if (!user) {
            return {
                statusCode: 401,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Not logged in' })
            };
        }

        // === SET CUSTOM USERNAME ===
        if (action === 'set-username' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const username = body.username?.toLowerCase().replace(/[^a-z0-9_-]/g, '');

            if (!username || username.length < 3 || username.length > 20) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Username must be 3-20 chars (letters, numbers, _ -)' })
                };
            }

            // Reserved words
            const reserved = ['me', 'admin', 'api', 'login', 'logout', 'profile', 'settings'];
            if (reserved.includes(username)) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Username not available' })
                };
            }

            // Check if taken
            const existing = await store.get(`username_${username}`, { type: 'json' });
            if (existing && existing.discordId !== user.discordId) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Username taken' })
                };
            }

            // Remove old username mapping if exists
            if (user.username && user.username !== username) {
                await store.delete(`username_${user.username}`);
            }

            // Set new username
            user.username = username;
            await store.setJSON(`user_${user.discordId}`, user);
            await store.setJSON(`username_${username}`, { discordId: user.discordId });

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, username })
            };
        }

        // === LINK STEAM ===
        if (action === 'link-steam' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const steamInput = body.steamId?.trim();

            if (!steamInput) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Steam ID or URL required' })
                };
            }

            const parsed = extractSteamId(steamInput);
            if (!parsed) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Invalid Steam ID or URL' })
                };
            }

            let steamId = parsed.value;

            // Resolve vanity URL to Steam ID
            if (parsed.type === 'vanity') {
                try {
                    const data = await fetchSteamData('ISteamUser/ResolveVanityURL/v1', { vanityurl: parsed.value });
                    if (data.response?.success !== 1) {
                        return {
                            statusCode: 400,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: 'Steam profile not found' })
                        };
                    }
                    steamId = data.response.steamid;
                } catch (e) {
                    return {
                        statusCode: 500,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Failed to resolve Steam URL' })
                    };
                }
            }

            // Verify profile exists and get info
            try {
                const data = await fetchSteamData('ISteamUser/GetPlayerSummaries/v2', { steamids: steamId });
                const player = data.response?.players?.[0];
                if (!player) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Steam profile not found' })
                    };
                }

                user.steam = {
                    id: steamId,
                    personaName: player.personaname,
                    avatar: player.avatarfull,
                    profileUrl: player.profileurl,
                    linkedAt: new Date().toISOString(),
                    lastSync: null
                };
                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true, steam: user.steam })
                };
            } catch (e) {
                console.error('Steam link error:', e);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Failed to link Steam' })
                };
            }
        }

        // === SYNC STEAM GAMES ===
        if (action === 'sync-steam' && event.httpMethod === 'POST') {
            if (!user.steam?.id) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Steam not linked' })
                };
            }

            try {
                // Get owned games
                const ownedData = await fetchSteamData('IPlayerService/GetOwnedGames/v1', {
                    steamid: user.steam.id,
                    include_appinfo: 'true',
                    include_played_free_games: 'true'
                });

                const steamGames = ownedData.response?.games || [];

                // Get recently played (last 2 weeks)
                const recentData = await fetchSteamData('IPlayerService/GetRecentlyPlayedGames/v1', {
                    steamid: user.steam.id
                });
                const recentGames = recentData.response?.games || [];

                // Build recent map for quick lookup
                const recentMap = {};
                recentGames.forEach(g => {
                    recentMap[g.appid] = g.playtime_2weeks || 0;
                });

                // Merge with existing games (preserve user data like ratings)
                const existingMap = {};
                (user.games || []).forEach(g => {
                    if (g.steamAppId) existingMap[g.steamAppId] = g;
                });

                // Fetch achievements for games with playtime (batch - top 100 by playtime to avoid rate limits)
                const gamesWithPlaytime = steamGames
                    .filter(g => g.playtime_forever > 0)
                    .sort((a, b) => b.playtime_forever - a.playtime_forever)
                    .slice(0, 100);

                const achievementMap = {};
                let achievementsFetched = 0;

                console.log(`Fetching achievements for ${gamesWithPlaytime.length} games...`);

                // Fetch achievements in parallel batches of 10
                for (let i = 0; i < gamesWithPlaytime.length; i += 10) {
                    const batch = gamesWithPlaytime.slice(i, i + 10);
                    const promises = batch.map(async (g) => {
                        try {
                            const achData = await fetchSteamData('ISteamUserStats/GetPlayerAchievements/v1', {
                                steamid: user.steam.id,
                                appid: g.appid.toString()
                            });
                            console.log(`Game ${g.appid} (${g.name}): success=${achData.playerstats?.success}, achievements=${achData.playerstats?.achievements?.length || 0}`);
                            if (achData.playerstats?.success && achData.playerstats?.achievements) {
                                const total = achData.playerstats.achievements.length;
                                const unlocked = achData.playerstats.achievements.filter(a => a.achieved === 1).length;
                                achievementMap[g.appid] = {
                                    total,
                                    unlocked,
                                    percent: total > 0 ? Math.round((unlocked / total) * 100) : 0
                                };
                                achievementsFetched++;
                            }
                        } catch (e) {
                            console.log(`Game ${g.appid} (${g.name}): error - ${e.message}`);
                        }
                    });
                    await Promise.all(promises);
                }

                console.log(`Achievements fetched for ${achievementsFetched} games`);

                // Build activity log entries
                const activityLog = user.activityLog || [];
                const today = new Date().toISOString().split('T')[0];

                const mergedGames = steamGames.map(sg => {
                    const existing = existingMap[sg.appid] || {};

                    // Skip hidden games - preserve their data exactly
                    if (existing.hidden) {
                        return existing;
                    }

                    // Prefer new achievements, but keep existing if we didn't fetch this time
                    const achievements = achievementMap[sg.appid] || existing.achievements || null;
                    const isRecentlyPlayed = recentMap[sg.appid] > 0;
                    const isPerfected = achievements?.percent === 100;

                    // Log playtime changes OR initial discovery of games with playtime
                    const oldPlaytime = existing.playtimeMinutes || 0;
                    const newPlaytime = sg.playtime_forever || 0;
                    const isNewGame = !existing.steamAppId;

                    // Log if playtime increased OR if it's a new game with significant playtime (first sync)
                    if (newPlaytime > oldPlaytime) {
                        activityLog.push({
                            date: today,
                            timestamp: new Date().toISOString(),
                            type: 'playtime',
                            steamAppId: sg.appid,
                            game: sg.name,
                            delta: newPlaytime - oldPlaytime,
                            total: newPlaytime,
                            isInitial: isNewGame
                        });
                    }

                    // Log recently played games (this week) - gives visibility into what's being played
                    if (isRecentlyPlayed && recentMap[sg.appid] > 0 && !isNewGame) {
                        const existingRecentEntry = activityLog.find(a =>
                            a.date === today &&
                            a.steamAppId === sg.appid &&
                            a.type === 'session'
                        );
                        if (!existingRecentEntry) {
                            activityLog.push({
                                date: today,
                                timestamp: new Date().toISOString(),
                                type: 'session',
                                steamAppId: sg.appid,
                                game: sg.name,
                                recentMinutes: recentMap[sg.appid]
                            });
                        }
                    }

                    // Log new achievements
                    if (achievements && existing.achievements) {
                        const newUnlocked = achievements.unlocked - (existing.achievements.unlocked || 0);
                        if (newUnlocked > 0) {
                            activityLog.push({
                                date: today,
                                timestamp: new Date().toISOString(),
                                type: 'achievement',
                                steamAppId: sg.appid,
                                game: sg.name,
                                count: newUnlocked,
                                total: achievements.unlocked,
                                percent: achievements.percent
                            });
                        }
                    }

                    // Smart status detection - use 'played' for games with playtime
                    let status = existing.status;

                    // Auto-set status based on playtime and achievements
                    if (isPerfected) {
                        status = 'perfected'; // Always upgrade to perfected if 100%
                    } else if (!status || status === 'unset' || status === 'playing') {
                        // New games or games needing migration
                        status = sg.playtime_forever > 0 ? 'played' : 'backlog';
                    } else if (status === 'backlog' && sg.playtime_forever > 0) {
                        // Migrate backlog games that have playtime
                        status = 'played';
                    }

                    return {
                        steamAppId: sg.appid,
                        name: sg.name,
                        // Use original Steam icon URL
                        icon: sg.img_icon_url
                            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${sg.appid}/${sg.img_icon_url}.jpg`
                            : `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/capsule_sm_120.jpg`,
                        headerImg: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/header.jpg`,
                        libraryImg: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/library_600x900.jpg`,
                        playtimeMinutes: sg.playtime_forever || 0,
                        playtimeRecent: recentMap[sg.appid] || 0,
                        lastPlayed: sg.rtime_last_played
                            ? new Date(sg.rtime_last_played * 1000).toISOString()
                            : null,
                        previousLastPlayed: existing.lastPlayed || null,
                        achievements,
                        status,
                        rating: existing.rating || null,
                        categoryRatings: existing.categoryRatings || null,
                        categoryEnabled: existing.categoryEnabled || null,
                        favorite: existing.favorite || false,
                        notes: existing.notes || '',
                        completedAt: existing.completedAt || null,
                        platforms: existing.platforms || [],
                        priority: existing.priority || null,
                        hidden: false,
                        // Sync tracking
                        newlySynced: isNewGame,
                        lastSyncAt: new Date().toISOString()
                    };
                });

                // Sort by playtime (non-hidden first)
                mergedGames.sort((a, b) => {
                    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
                    return b.playtimeMinutes - a.playtimeMinutes;
                });

                // IMPORTANT: Preserve non-Steam games (manual entries)
                const nonSteamGames = (user.games || []).filter(g => !g.steamAppId && g.id);
                console.log(`Preserving ${nonSteamGames.length} non-Steam games`);

                // Add non-Steam games to the merged list
                const allGames = [...mergedGames, ...nonSteamGames];

                // === AUTO-JOURNAL: Create entries for games that were played ===
                const journalEntries = user.journalEntries || [];

                for (const game of mergedGames) {
                    if (!game.lastPlayed) continue;

                    const lastPlayedDate = new Date(game.lastPlayed).toISOString().split('T')[0];
                    const previousDate = game.previousLastPlayed
                        ? new Date(game.previousLastPlayed).toISOString().split('T')[0]
                        : null;

                    // Only create entry if lastPlayed changed (game was played since last sync)
                    if (previousDate !== lastPlayedDate) {
                        const autoEntryId = `auto_${game.steamAppId}_${lastPlayedDate}`;

                        // Check if we already have an auto-entry for this game on this date
                        const existingAutoEntry = journalEntries.find(e =>
                            e.autoGenerated &&
                            e.gameId == game.steamAppId &&
                            e.date === lastPlayedDate
                        );

                        // Also check if this entry was previously deleted by user
                        const wasDeleted = (user.deletedAutoEntries || []).includes(autoEntryId);

                        if (!existingAutoEntry && !wasDeleted) {
                            // Calculate session time if possible
                            const oldPlaytime = existingMap[game.steamAppId]?.playtimeMinutes || 0;
                            const sessionMinutes = game.playtimeMinutes - oldPlaytime;

                            journalEntries.push({
                                id: autoEntryId,
                                gameId: game.steamAppId,
                                date: lastPlayedDate,
                                endTime: game.lastPlayed,
                                sessionStatus: 'playing',
                                sessionMinutes: sessionMinutes > 0 ? sessionMinutes : null,
                                notes: '',
                                ratings: {},
                                autoGenerated: true,
                                createdAt: new Date().toISOString()
                            });

                            console.log(`Auto-journal: ${game.name} played on ${lastPlayedDate}`);
                        }
                    }
                }

                // Keep most recent 1000 journal entries
                user.journalEntries = journalEntries.slice(-1000);

                // Compute stats (exclude hidden)
                const visibleGames = allGames.filter(g => !g.hidden);
                const perfectedCount = visibleGames.filter(g => g.status === 'perfected').length;
                const recentPlaytime = visibleGames.reduce((sum, g) => sum + (g.playtimeRecent || 0), 0);

                user.games = allGames;
                user.activityLog = activityLog.slice(-500); // Keep last 500 entries
                user.lastSync = new Date().toISOString();
                user.steam.lastSync = new Date().toISOString();
                user.steam.gameCount = visibleGames.length;
                user.steam.totalPlaytime = visibleGames.reduce((sum, g) => sum + g.playtimeMinutes, 0);
                user.steam.perfectedCount = perfectedCount;
                user.steam.recentPlaytime = recentPlaytime;

                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        gameCount: visibleGames.length,
                        totalPlaytime: user.steam.totalPlaytime,
                        perfectedCount,
                        recentPlaytime,
                        newActivity: activityLog.filter(a => a.date === today).length
                    })
                };
            } catch (e) {
                console.error('Steam sync error:', e);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Failed to sync Steam games. Is your profile public?' })
                };
            }
        }

        // === UPDATE GAME ===
        if (action === 'update-game' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { steamAppId, gameId, status, rating, favorite, notes, platforms, completedAt } = body;
            const id = steamAppId || gameId;

            if (!id) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'steamAppId or gameId required' })
                };
            }

            const gameIndex = user.games?.findIndex(g => String(g.steamAppId) === String(id) || String(g.id) === String(id));
            if (gameIndex === -1) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Game not found' })
                };
            }

            if (status !== undefined) user.games[gameIndex].status = status;
            if (rating !== undefined) user.games[gameIndex].rating = rating;
            if (favorite !== undefined) user.games[gameIndex].favorite = favorite;
            if (notes !== undefined) user.games[gameIndex].notes = notes;
            if (platforms !== undefined) user.games[gameIndex].platforms = platforms;
            if (completedAt !== undefined) user.games[gameIndex].completedAt = completedAt;
            if (body.priority !== undefined) user.games[gameIndex].priority = body.priority;
            if (body.categoryRatings !== undefined) user.games[gameIndex].categoryRatings = body.categoryRatings;
            if (body.categoryEnabled !== undefined) user.games[gameIndex].categoryEnabled = body.categoryEnabled;
            if (body.hidden !== undefined) user.games[gameIndex].hidden = body.hidden;

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, game: user.games[gameIndex] })
            };
        }

        // === BULK UPDATE GAMES ===
        if (action === 'bulk-update' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { steamAppIds, status, hidden } = body;

            if (!steamAppIds || !Array.isArray(steamAppIds)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'steamAppIds array required' }) };
            }

            steamAppIds.forEach(id => {
                const gameIndex = (user.games || []).findIndex(g =>
                    String(g.steamAppId) === String(id) || String(g.id) === String(id)
                );
                if (gameIndex > -1) {
                    if (status !== undefined) user.games[gameIndex].status = status;
                    if (hidden !== undefined) user.games[gameIndex].hidden = hidden;
                }
            });

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, updated: steamAppIds.length })
            };
        }

        // === ADD JOURNAL ENTRY ===
        if (action === 'add-journal-entry' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');

            user.journalEntries = user.journalEntries || [];
            user.journalEntries.push({
                ...body,
                id: `manual_${Date.now()}`,
                createdAt: new Date().toISOString()
            });

            // Keep only most recent 1000 entries
            if (user.journalEntries.length > 1000) {
                user.journalEntries = user.journalEntries.slice(-1000);
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true })
            };
        }

        // === UPDATE JOURNAL ENTRY ===
        if (action === 'update-journal-entry' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { index, entry } = body;

            if (typeof index !== 'number' || !entry) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Index and entry required' })
                };
            }

            user.journalEntries = user.journalEntries || [];

            if (index >= 0 && index < user.journalEntries.length) {
                user.journalEntries[index] = {
                    ...user.journalEntries[index],
                    ...entry,
                    updatedAt: new Date().toISOString()
                };

                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true })
                };
            }

            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Invalid entry index' })
            };
        }

        // === DELETE JOURNAL ENTRY ===
        if (action === 'delete-journal-entry' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { index } = body;

            if (typeof index !== 'number') {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Index required' })
                };
            }

            user.journalEntries = user.journalEntries || [];

            if (index >= 0 && index < user.journalEntries.length) {
                const deletedEntry = user.journalEntries[index];

                // If it's an auto-generated entry, track it so it doesn't get re-added on sync
                if (deletedEntry.autoGenerated && deletedEntry.id) {
                    user.deletedAutoEntries = user.deletedAutoEntries || [];
                    user.deletedAutoEntries.push(deletedEntry.id);
                    // Keep only last 500 to prevent indefinite growth
                    if (user.deletedAutoEntries.length > 500) {
                        user.deletedAutoEntries = user.deletedAutoEntries.slice(-500);
                    }
                }

                user.journalEntries.splice(index, 1);
                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true })
                };
            }

            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Invalid entry index' })
            };
        }

        // === DELETE JOURNAL MONTH ===
        if (action === 'delete-journal-month' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { monthKey } = body; // Format: "2024-12"

            if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Invalid month format. Use YYYY-MM.' })
                };
            }

            const originalCount = (user.journalEntries || []).length;

            // Filter out entries that DON'T match this month (keep the rest)
            user.journalEntries = (user.journalEntries || []).filter(entry => {
                const dateStr = entry.date || (entry.endTime ? new Date(entry.endTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
                const date = new Date(dateStr);
                const entryMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                return entryMonthKey !== monthKey;
            });

            const deleted = originalCount - user.journalEntries.length;
            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, deleted })
            };
        }

        // === DELETE JOURNAL ENTRIES BULK ===
        if (action === 'delete-journal-entries-bulk' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { indices } = body;

            if (!Array.isArray(indices) || !indices.length) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'indices array required' })
                };
            }

            // Sort descending so we can delete from end to start without shifting issues
            const sortedIndices = [...indices].sort((a, b) => b - a);

            let deleted = 0;
            sortedIndices.forEach(idx => {
                if (idx >= 0 && idx < (user.journalEntries || []).length) {
                    user.journalEntries.splice(idx, 1);
                    deleted++;
                }
            });

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, deleted })
            };
        }

        // === LINK RIOT ACCOUNT ===
        if (action === 'link-riot-account' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { riotId, region } = body;

            if (!riotId || !region) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'riotId (Name#Tag) and region required' })
                };
            }

            // Parse Name#Tag
            if (!riotId.includes('#')) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Invalid format. Use Name#Tag' })
                };
            }

            const [gameName, tagLine] = riotId.split('#');

            // Use riot-proxy to validate account
            const RIOT_PROXY = '/.netlify/functions/riot-proxy';
            const routingRegion = ['na1', 'br1', 'la1', 'la2', 'oc1'].includes(region) ? 'americas'
                : ['euw1', 'eun1', 'tr1', 'ru'].includes(region) ? 'europe'
                    : ['kr', 'jp1'].includes(region) ? 'asia' : 'sea';

            try {
                // Fetch account PUUID using Riot API (via proxy)
                const accountRes = await fetch(`https://kierxn.netlify.app${RIOT_PROXY}?endpoint=account-by-riot-id&region=${routingRegion}&gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`);

                if (!accountRes.ok) {
                    return {
                        statusCode: 404,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Riot account not found. Check Name#Tag and region.' })
                    };
                }

                const accountData = await accountRes.json();
                const puuid = accountData.puuid;

                // Fetch summoner data for level and icon
                const summRes = await fetch(`https://kierxn.netlify.app${RIOT_PROXY}?endpoint=summoner-by-puuid&region=${region}&puuid=${puuid}`);
                let summonerData = null;
                if (summRes.ok) {
                    summonerData = await summRes.json();
                }

                // Fetch rank data
                let rankData = null;
                if (summonerData?.id) {
                    const rankRes = await fetch(`https://kierxn.netlify.app${RIOT_PROXY}?endpoint=league-entries&region=${region}&summonerId=${summonerData.id}`);
                    if (rankRes.ok) {
                        const ranks = await rankRes.json();
                        // Get Solo/Duo rank preferably
                        rankData = ranks.find(r => r.queueType === 'RANKED_SOLO_5x5') || ranks[0] || null;
                    }
                }

                // Save to user - fetch latest DDragon version for icon URL
                let ddVersion = '15.1.1'; // fallback
                try {
                    const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
                    const versions = await versionRes.json();
                    if (versions && versions[0]) ddVersion = versions[0];
                } catch (e) { /* use fallback */ }

                const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${summonerData?.profileIconId || 29}.png`;

                user.riotAccount = {
                    gameName: accountData.gameName,
                    tagLine: accountData.tagLine,
                    region: region,
                    puuid: puuid,
                    summonerId: summonerData?.id || null,
                    summonerLevel: summonerData?.summonerLevel || null,
                    profileIconId: summonerData?.profileIconId || null,
                    profileIconUrl: profileIconUrl,
                    rank: rankData ? {
                        tier: rankData.tier,
                        division: rankData.rank,
                        lp: rankData.leaguePoints,
                        wins: rankData.wins,
                        losses: rankData.losses
                    } : null,
                    linkedAt: new Date().toISOString()
                };

                // Add LoL as a game in library if not exists
                const lolGame = user.games?.find(g => g.id === 'lol_riot_account');
                if (!lolGame) {
                    user.games = user.games || [];
                    user.games.unshift({
                        id: 'lol_riot_account',
                        steamAppId: null,
                        name: 'League of Legends',
                        icon: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/6.png`,
                        headerImg: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_0.jpg',
                        playtimeMinutes: 0,
                        lastPlayed: null,
                        status: 'endless',
                        platforms: ['pc'],
                        isLolIntegration: true
                    });
                }

                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true, riotAccount: user.riotAccount })
                };

            } catch (e) {
                console.error('Riot link error:', e);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Failed to verify Riot account: ' + e.message })
                };
            }
        }

        // === UNLINK RIOT ACCOUNT ===
        if (action === 'unlink-riot-account' && event.httpMethod === 'POST') {
            // Remove Riot account data but keep journal entries
            delete user.riotAccount;

            // Remove LoL game from library
            user.games = (user.games || []).filter(g => g.id !== 'lol_riot_account');

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true })
            };
        }

        // === SYNC LOL MATCHES ===
        if (action === 'sync-lol-matches' && event.httpMethod === 'POST') {
            if (!user.riotAccount) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'No Riot account linked' })
                };
            }

            const { puuid, region } = user.riotAccount;
            const RIOT_PROXY = '/.netlify/functions/riot-proxy';
            const routingRegion = ['na1', 'br1', 'la1', 'la2', 'oc1'].includes(region) ? 'americas'
                : ['euw1', 'eun1', 'tr1', 'ru'].includes(region) ? 'europe'
                    : ['kr', 'jp1'].includes(region) ? 'asia' : 'sea';

            try {
                // Fetch recent match IDs
                const matchListRes = await fetch(`https://kierxn.netlify.app${RIOT_PROXY}?endpoint=match-list&region=${routingRegion}&puuid=${puuid}&count=20`);
                if (!matchListRes.ok) throw new Error('Failed to fetch match list');

                const matchIds = await matchListRes.json();
                if (!Array.isArray(matchIds) || !matchIds.length) {
                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ success: true, entriesCreated: 0, message: 'No recent matches' })
                    };
                }

                // Fetch match details in batches
                const matches = [];
                for (let i = 0; i < Math.min(matchIds.length, 20); i += 5) {
                    const batch = matchIds.slice(i, i + 5);
                    const promises = batch.map(id =>
                        fetch(`https://kierxn.netlify.app${RIOT_PROXY}?endpoint=match-details&region=${routingRegion}&matchId=${id}`)
                            .then(r => r.ok ? r.json() : null)
                            .catch(() => null)
                    );
                    const results = await Promise.all(promises);
                    matches.push(...results.filter(m => m && m.info));

                    // Small delay between batches
                    if (i + 5 < matchIds.length) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                }

                // Group matches by date
                const matchesByDate = {};
                matches.forEach(m => {
                    const participant = m.info.participants.find(p => p.puuid === puuid);
                    if (!participant) return;

                    const date = new Date(m.info.gameEndTimestamp).toISOString().split('T')[0];
                    if (!matchesByDate[date]) {
                        matchesByDate[date] = {
                            matchCount: 0,
                            wins: 0,
                            losses: 0,
                            kills: 0,
                            deaths: 0,
                            assists: 0,
                            totalMinutes: 0,
                            champions: new Set(),
                            gameModes: new Set(),
                            arenaPlacements: [] // Track Arena placements specifically
                        };
                    }

                    const d = matchesByDate[date];
                    d.matchCount++;

                    // Check if Arena match - use placement for W/L
                    const isArena = m.info.gameMode === 'CHERRY' || m.info.queueId === 1700 || m.info.queueId === 1710;
                    if (isArena && participant.placement) {
                        const placement = participant.placement;
                        d.arenaPlacements.push(placement);
                        // 1st, 2nd, 3rd = win, 4th+ = loss
                        if (placement <= 3) {
                            d.wins++;
                        } else {
                            d.losses++;
                        }
                    } else {
                        // Regular match - use win property
                        d.wins += participant.win ? 1 : 0;
                        d.losses += participant.win ? 0 : 1;
                    }

                    d.kills += participant.kills;
                    d.deaths += participant.deaths;
                    d.assists += participant.assists;
                    d.totalMinutes += Math.round(m.info.gameDuration / 60);
                    d.champions.add(participant.championName);

                    // Game mode mapping
                    const queueId = m.info.queueId;
                    if (queueId === 420) d.gameModes.add('Ranked Solo');
                    else if (queueId === 440) d.gameModes.add('Ranked Flex');
                    else if (queueId === 450) d.gameModes.add('ARAM');
                    else if (isArena) d.gameModes.add('Arena');
                    else d.gameModes.add('Normal');
                });

                // Create journal entries for each day
                user.journalEntries = user.journalEntries || [];
                let entriesCreated = 0;
                let totalMinutes = 0;

                Object.entries(matchesByDate).forEach(([date, data]) => {
                    const entryId = `lol_auto_${date}`;

                    // Skip if entry already exists for this date
                    const existingIdx = user.journalEntries.findIndex(e => e.id === entryId);
                    if (existingIdx !== -1) {
                        // Update existing entry
                        user.journalEntries[existingIdx] = {
                            ...user.journalEntries[existingIdx],
                            sessionMinutes: data.totalMinutes,
                            lolData: {
                                matchCount: data.matchCount,
                                wins: data.wins,
                                losses: data.losses,
                                kills: data.kills,
                                deaths: data.deaths,
                                assists: data.assists,
                                kda: data.deaths > 0 ? ((data.kills + data.assists) / data.deaths).toFixed(2) : (data.kills + data.assists).toFixed(2),
                                champions: Array.from(data.champions),
                                gameModes: Array.from(data.gameModes),
                                arenaPlacements: data.arenaPlacements || []
                            }
                        };
                    } else {
                        // Create new entry
                        user.journalEntries.push({
                            id: entryId,
                            gameId: 'lol_riot_account',
                            date: date,
                            sessionMinutes: data.totalMinutes,
                            autoGenerated: true,
                            lolData: {
                                matchCount: data.matchCount,
                                wins: data.wins,
                                losses: data.losses,
                                kills: data.kills,
                                deaths: data.deaths,
                                assists: data.assists,
                                kda: data.deaths > 0 ? ((data.kills + data.assists) / data.deaths).toFixed(2) : (data.kills + data.assists).toFixed(2),
                                champions: Array.from(data.champions),
                                gameModes: Array.from(data.gameModes),
                                arenaPlacements: data.arenaPlacements || []
                            },
                            sessionStatus: 'playing'
                        });
                        entriesCreated++;
                    }
                    totalMinutes += data.totalMinutes;
                });

                // Update LoL game playtime
                const lolGame = user.games?.find(g => g.id === 'lol_riot_account');
                if (lolGame) {
                    lolGame.playtimeMinutes = (lolGame.playtimeMinutes || 0) + totalMinutes;
                    lolGame.lastPlayed = Object.keys(matchesByDate).sort().pop() + 'T12:00:00Z';
                }

                // Update last sync time
                user.riotAccount.lastSyncAt = new Date().toISOString();

                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        entriesCreated,
                        matchesSynced: matches.length,
                        riotAccount: user.riotAccount
                    })
                };

            } catch (e) {
                console.error('LoL sync error:', e);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Failed to sync matches: ' + e.message })
                };
            }
        }

        // === ADD MANUAL GAME (from search) ===
        if (action === 'add-manual-game' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { name, platform, status, playtimeMinutes, imageUrl } = body;

            if (!name) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Game name required' })
                };
            }

            // Generate unique ID for manual games
            const gameId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const newGame = {
                id: gameId,
                name,
                status: status || 'backlog',
                playtimeMinutes: playtimeMinutes || 0,
                platforms: platform ? [platform] : ['pc'],
                headerImg: imageUrl || '',
                icon: imageUrl || '',
                favorite: false,
                hidden: false,
                rating: null,
                notes: '',
                addedAt: new Date().toISOString()
            };

            user.games = user.games || [];
            user.games.push(newGame);

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, game: newGame })
            };
        }

        // === SAVE COLLECTIONS ===
        if (action === 'save-collections' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { collections } = body;

            if (!Array.isArray(collections)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'collections array required' }) };
            }

            user.collections = collections;
            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, count: collections.length })
            };
        }

        // === CUSTOM PLATFORMS ===
        if (action === 'custom-platforms') {
            // GET - List custom platforms
            if (event.httpMethod === 'GET') {
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ platforms: user.customPlatforms || [] })
                };
            }

            // POST - Add/Update custom platform
            if (event.httpMethod === 'POST') {
                const body = JSON.parse(event.body || '{}');
                const { name, icon } = body;

                if (!name) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Platform name required' })
                    };
                }

                if (!user.customPlatforms) user.customPlatforms = [];

                const id = 'custom_' + Date.now();
                user.customPlatforms.push({ id, name: name.trim(), icon: icon || '🎮' });

                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true, platform: { id, name, icon }, platforms: user.customPlatforms })
                };
            }

            // DELETE - Remove custom platform
            if (event.httpMethod === 'DELETE') {
                const body = JSON.parse(event.body || '{}');
                const { id } = body;

                if (!id) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Platform id required' })
                    };
                }

                user.customPlatforms = (user.customPlatforms || []).filter(p => p.id !== id);

                // Also remove from any games that had this platform
                (user.games || []).forEach(g => {
                    if (g.platforms) {
                        g.platforms = g.platforms.filter(p => p !== id);
                    }
                });

                await store.setJSON(`user_${user.discordId}`, user);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true, platforms: user.customPlatforms })
                };
            }
        }

        // === LOGOUT ===
        if (action === 'logout') {
            const token = getSessionToken(event);
            if (token) {
                await store.delete(`session_${token}`);
            }

            const host = event.headers.host;
            const protocol = host.includes('localhost') ? 'http' : 'https';

            return {
                statusCode: 302,
                headers: {
                    Location: `${protocol}://${host}/game-logger/`,
                    'Set-Cookie': `gl_session=; Path=/; Max-Age=0`,
                    'Cache-Control': 'no-cache'
                },
                body: ''
            };
        }

        // === HIDE/UNHIDE GAME ===
        if (action === 'toggle-hidden' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { steamAppId, hidden } = body;

            const gameIndex = user.games?.findIndex(g => g.steamAppId === steamAppId);
            if (gameIndex === -1) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Game not found' })
                };
            }

            user.games[gameIndex].hidden = hidden === true;

            // Recalculate stats
            const visibleGames = user.games.filter(g => !g.hidden);
            user.steam.gameCount = visibleGames.length;
            user.steam.totalPlaytime = visibleGames.reduce((sum, g) => sum + g.playtimeMinutes, 0);

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, hidden: user.games[gameIndex].hidden })
            };
        }

        // === GET ACTIVITY LOG ===
        if (action === 'activity') {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    activityLog: (user.activityLog || []).slice(-100).reverse()
                })
            };
        }

        // === GET HIDDEN GAMES ===
        if (action === 'hidden-games') {
            const hiddenGames = (user.games || []).filter(g => g.hidden);
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ games: hiddenGames })
            };
        }

        // === WIPE ALL DATA ===
        if (action === 'wipe-data' && event.httpMethod === 'POST') {
            // Delete username mapping
            if (user.username) {
                await store.delete(`username_${user.username}`);
            }
            // Delete user data
            await store.delete(`user_${user.discordId}`);
            // Delete session
            const token = getSessionToken(event);
            if (token) {
                await store.delete(`session_${token}`);
            }

            const host = event.headers.host;
            const protocol = host.includes('localhost') ? 'http' : 'https';

            return {
                statusCode: 200,
                headers: {
                    ...CORS_HEADERS,
                    'Set-Cookie': `gl_session=; Path=/; Max-Age=0`
                },
                body: JSON.stringify({ success: true, redirect: `${protocol}://${host}/game-logger/` })
            };
        }

        // === CHANGE STEAM ACCOUNT ===
        if (action === 'change-steam' && event.httpMethod === 'POST') {
            // Wipe games but keep profile
            user.games = [];
            user.activityLog = [];
            user.steam = null;

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true })
            };
        }

        // === EXPORT DATA ===
        if (action === 'export') {
            return {
                statusCode: 200,
                headers: {
                    ...CORS_HEADERS,
                    'Content-Disposition': 'attachment; filename="game-logger-export.json"'
                },
                body: JSON.stringify({
                    exportedAt: new Date().toISOString(),
                    profile: {
                        discordId: user.discordId,
                        username: user.username,
                        displayName: user.displayName
                    },
                    steam: user.steam,
                    games: user.games,
                    activityLog: user.activityLog
                }, null, 2)
            };
        }

        // === UNLINK STEAM ===
        if (action === 'unlink-steam' && event.httpMethod === 'POST') {
            // Wipe all Steam-related data but keep Discord auth
            user.steam = null;
            user.games = [];
            user.wishlist = [];
            user.journalEntries = [];
            user.activityLog = [];
            user.favoriteSlots = [null, null, null, null, null, null];
            user.lastSync = null;

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true })
            };
        }

        // === SEARCH STEAM STORE ===
        if (action === 'search-steam') {
            const query = params.query;
            if (!query) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Query required' })
                };
            }

            try {
                const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`);
                const data = await res.json();

                const games = (data.items || []).slice(0, 20).map(g => ({
                    appid: g.id,
                    name: g.name,
                    price: g.price?.final ? `$${(g.price.final / 100).toFixed(2)}` : 'Free'
                }));

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ games })
                };
            } catch (e) {
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Steam search failed' })
                };
            }
        }

        // === SEARCH ALL GAMES (RAWG API) ===
        if (action === 'search-games') {
            const query = params.query;
            const platform = params.platform || 'all';
            if (!query) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Query required' }) };
            }

            try {
                // Platform IDs: 4=PC, 18=PS4, 187=PS5, 1=Xbox One, 186=Xbox S/X, 7=Switch
                let platformParam = '';
                if (platform === 'pc') platformParam = '&platforms=4,5,6';
                else if (platform === 'playstation') platformParam = '&platforms=18,187,16,15,27';
                else if (platform === 'xbox') platformParam = '&platforms=1,186,14,80';
                else if (platform === 'nintendo') platformParam = '&platforms=7,8,9,13,10,11,105,83';

                const rawgKey = process.env.RAWG_API_KEY;
                if (!rawgKey) {
                    console.log('RAWG_API_KEY not found in environment');
                    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'RAWG API key not configured' }) };
                }

                const url = `https://api.rawg.io/api/games?key=${rawgKey}&search=${encodeURIComponent(query)}${platformParam}&page_size=24`;
                console.log('RAWG search URL:', url.replace(rawgKey, 'HIDDEN'));

                const res = await fetch(url);
                const data = await res.json();

                console.log('RAWG response status:', res.status, 'results:', data.results?.length || 0);

                if (data.error) {
                    console.log('RAWG error:', data.error);
                    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: data.error }) };
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        games: (data.results || []).map(g => ({
                            id: g.id,
                            name: g.name,
                            background_image: g.background_image,
                            released: g.released,
                            rating: g.rating,
                            metacritic: g.metacritic,
                            platforms: g.platforms || [],
                            genres: g.genres || [],
                            tags: g.tags || [],
                            developers: g.developers || [],
                            short_screenshots: g.short_screenshots || [],
                            description_raw: g.description_raw || ''
                        }))
                    })
                };
            } catch (e) {
                console.error('RAWG search error:', e.message);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Search failed: ' + e.message }) };
            }
        }

        // === GET RAWG GAME DETAILS ===
        if (action === 'rawg-details') {
            try {
                const gameId = params.id;
                if (!gameId) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Game ID required' }) };
                }

                const rawgKey = process.env.RAWG_API_KEY;
                if (!rawgKey) {
                    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'RAWG API key not configured' }) };
                }

                const url = `https://api.rawg.io/api/games/${gameId}?key=${rawgKey}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.detail) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Game not found' }) };
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        game: {
                            id: data.id,
                            name: data.name,
                            description_raw: data.description_raw || '',
                            released: data.released,
                            background_image: data.background_image,
                            metacritic: data.metacritic,
                            playtime: data.playtime,
                            genres: data.genres || [],
                            tags: data.tags || [],
                            developers: data.developers || [],
                            publishers: data.publishers || [],
                            platforms: data.platforms || [],
                            screenshots: data.screenshots || []
                        }
                    })
                };
            } catch (e) {
                console.error('RAWG details error:', e.message);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to fetch game details' }) };
            }
        }

        // === GET GAME DETAILS FROM STEAM ===
        if (action === 'game-details') {
            const appid = params.appid;
            if (!appid) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'App ID required' })
                };
            }

            try {
                const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}`);
                const data = await res.json();
                const game = data[appid]?.success ? data[appid].data : null;

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ game })
                };
            } catch (e) {
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Failed to get game details' })
                };
            }
        }

        // === GET ACHIEVEMENT LIST FOR A GAME ===
        if (action === 'achievements') {
            const user = await getAuthenticatedUser(event, store);
            const appid = params.appid;
            if (!user?.steam?.id || !appid) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing data' }) };
            }

            try {
                // Get user's achievements
                const userAchRes = await fetchSteamData('ISteamUserStats/GetPlayerAchievements/v1', {
                    steamid: user.steam.id,
                    appid: appid
                });

                // Get achievement schema (names/descriptions)
                const schemaRes = await fetchSteamData('ISteamUserStats/GetSchemaForGame/v2', { appid });

                const userAchs = userAchRes.playerstats?.achievements || [];
                const schema = schemaRes.game?.availableGameStats?.achievements || [];

                const achievements = schema.map(s => {
                    const userAch = userAchs.find(a => a.apiname === s.name);
                    return {
                        name: s.displayName,
                        description: s.description || 'Hidden achievement',
                        icon: s.icon,
                        iconGray: s.icongray,
                        unlocked: userAch?.achieved === 1,
                        unlockTime: userAch?.unlocktime ? new Date(userAch.unlocktime * 1000).toISOString() : null
                    };
                });

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        achievements,
                        unlocked: achievements.filter(a => a.unlocked).length,
                        total: achievements.length
                    })
                };
            } catch (e) {
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to fetch achievements' }) };
            }
        }

        // === ADD MANUAL GAME ===
        if (action === 'add-manual-game' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const body = JSON.parse(event.body || '{}');
            const { name, playtimeMinutes, status, rating, mastered, notes, imageUrl, platform } = body;

            if (!name) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Game name required' }) };

            const manualId = `manual_${Date.now()}`;
            const newGame = {
                id: manualId,
                name,
                isManual: true,
                platform: platform || 'manual',
                headerImg: imageUrl || `https://placehold.co/460x215/1a1a2e/6366f1?text=${encodeURIComponent(name)}`,
                icon: null,
                playtimeMinutes: playtimeMinutes || 0,
                status: status || (playtimeMinutes > 0 ? 'played' : 'backlog'),
                rating: rating || null,
                mastered: mastered || false,
                notes: notes || '',
                favorite: false,
                hidden: false,
                addedAt: new Date().toISOString()
            };

            user.games = user.games || [];
            user.games.push(newGame);

            // Log activity
            user.activityLog = user.activityLog || [];
            user.activityLog.push({
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                type: 'manual_add',
                id: manualId,
                game: name
            });

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, game: newGame }) };
        }

        // === ADD JOURNAL ENTRY (Detailed) ===
        if (action === 'add-journal-entry' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const body = JSON.parse(event.body || '{}');
            const { gameId, startTime, endTime, sessionStatus, thoughts, discoveries, ratings } = body;

            if (!gameId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Game required' }) };

            const game = user.games?.find(g => g.steamAppId == gameId || g.id == gameId);

            // Create journal entry
            user.journalEntries = user.journalEntries || [];
            user.journalEntries.push({
                id: `entry_${Date.now()}`,
                gameId,
                gameName: game?.name || 'Unknown',
                startTime: startTime || null,
                endTime: endTime || new Date().toISOString(),
                sessionStatus: sessionStatus || 'playing',
                thoughts: thoughts || '',
                discoveries: discoveries || '',
                ratings: ratings || {},
                createdAt: new Date().toISOString()
            });

            // Update game status if session indicates completion
            if (game && sessionStatus) {
                if (sessionStatus === 'finished') game.status = 'finished';
                else if (sessionStatus === 'perfected') game.status = 'perfected';
                else if (sessionStatus === 'dropped') game.status = 'dropped';
                else if (sessionStatus === 'on_hold') game.status = 'on_hold';
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === ADD TO WISHLIST ===
        if (action === 'add-to-wishlist' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const game = JSON.parse(event.body || '{}');
            user.wishlist = user.wishlist || [];

            if (!user.wishlist.find(g => g.id === game.id)) {
                user.wishlist.push({
                    id: game.id,
                    name: game.name,
                    background_image: game.background_image,
                    released: game.released,
                    rating: game.rating,
                    metacritic: game.metacritic,
                    platforms: game.platforms,
                    addedAt: new Date().toISOString()
                });
            }

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === REMOVE FROM WISHLIST ===
        if (action === 'remove-from-wishlist' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const { id } = JSON.parse(event.body || '{}');
            user.wishlist = (user.wishlist || []).filter(g => g.id != id);

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === UPDATE WISHLIST ITEM ===
        if (action === 'update-wishlist-item' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const { id, wishlistPriority, wishlistNotes } = JSON.parse(event.body || '{}');
            const idx = (user.wishlist || []).findIndex(g => String(g.id) === String(id));

            if (idx > -1) {
                if (wishlistPriority !== undefined) user.wishlist[idx].wishlistPriority = wishlistPriority;
                if (wishlistNotes !== undefined) user.wishlist[idx].wishlistNotes = wishlistNotes;
                await store.setJSON(`user_${user.discordId}`, user);
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === CLEAR WISHLIST ===
        if (action === 'clear-wishlist' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            user.wishlist = [];
            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === ADD RELEASE NOTIFICATION ===
        if (action === 'add-release-notification' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            user.releaseNotifications = user.releaseNotifications || [];

            // Check if already exists
            if (!user.releaseNotifications.some(n => n.id === body.id)) {
                user.releaseNotifications.push(body);
                await store.setJSON(`user_${user.discordId}`, user);
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === REMOVE RELEASE NOTIFICATION ===
        if (action === 'remove-release-notification' && event.httpMethod === 'POST') {
            const { id } = JSON.parse(event.body || '{}');
            user.releaseNotifications = (user.releaseNotifications || []).filter(n => n.id !== id);
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === SYNC STEAM WISHLIST ===
        if (action === 'sync-steam-wishlist' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };
            if (!user.steam?.id) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Steam not linked' }) };

            try {
                const steamId = user.steam.id;
                const apiKey = process.env.STEAM_API_KEY;
                console.log('Fetching Steam wishlist for:', steamId);

                let wishlistAppIds = [];

                // Try official IWishlistService API first (requires API key)
                if (apiKey) {
                    try {
                        const apiUrl = `https://api.steampowered.com/IWishlistService/GetWishlist/v1?key=${apiKey}&steamid=${steamId}`;
                        const apiRes = await fetch(apiUrl);
                        const apiData = await apiRes.json();
                        console.log('IWishlistService response:', JSON.stringify(apiData).substring(0, 200));

                        if (apiData.response?.items) {
                            wishlistAppIds = apiData.response.items.map(i => i.appid);
                            console.log('Got', wishlistAppIds.length, 'items from IWishlistService');
                        }
                    } catch (apiErr) {
                        console.log('IWishlistService failed:', apiErr.message);
                    }
                }

                // Fallback to store API if IWishlistService didn't work
                if (wishlistAppIds.length === 0) {
                    const storeUrl = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/?p=0`;
                    const storeRes = await fetch(storeUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    const text = await storeRes.text();
                    console.log('Store API response length:', text.length);

                    try {
                        const storeData = JSON.parse(text);
                        if (storeData && typeof storeData === 'object' && !storeData.success) {
                            wishlistAppIds = Object.keys(storeData).filter(k => k !== 'success').map(k => parseInt(k));
                        }
                    } catch (e) {
                        console.log('Store API parse failed');
                    }
                }

                if (wishlistAppIds.length === 0) {
                    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, count: 0, message: 'No wishlist items found or wishlist is private' }) };
                }

                // Get game details for each app
                user.wishlist = user.wishlist || [];
                let added = 0;

                for (const appId of wishlistAppIds.slice(0, 50)) { // Limit to 50 to avoid timeout
                    // Skip if already in wishlist
                    if (user.wishlist.find(w => w.steamAppId === String(appId))) continue;

                    user.wishlist.push({
                        id: `steam_${appId}`,
                        steamAppId: String(appId),
                        name: `Steam App ${appId}`, // Will be updated with actual name below
                        background_image: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
                        released: null,
                        rating: null,
                        platforms: [{ platform: { name: 'PC' } }],
                        addedAt: new Date().toISOString(),
                        source: 'steam'
                    });
                    added++;
                }

                // Try to get actual game names from Steam Store API
                for (const item of user.wishlist.filter(w => w.source === 'steam' && w.name.startsWith('Steam App'))) {
                    try {
                        const detailsRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${item.steamAppId}`);
                        const detailsData = await detailsRes.json();
                        if (detailsData[item.steamAppId]?.success) {
                            item.name = detailsData[item.steamAppId].data.name;
                            item.released = detailsData[item.steamAppId].data.release_date?.date || null;
                        }
                    } catch (e) { /* ignore */ }
                }

                await store.setJSON(`user_${user.discordId}`, user);
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, count: added }) };
            } catch (e) {
                console.error('Steam wishlist sync error:', e.message);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to sync: ' + e.message }) };
            }
        }

        // === GET HLTB DATA ===
        if (action === 'hltb') {
            const gameName = params.game;
            if (!gameName) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Game name required' }) };

            try {
                // Use HLTB API (unofficial)
                const res = await fetch('https://howlongtobeat.com/api/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Referer': 'https://howlongtobeat.com',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    body: JSON.stringify({
                        searchType: 'games',
                        searchTerms: gameName.split(' '),
                        searchPage: 1,
                        size: 1,
                        searchOptions: {
                            games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: 0, max: 0 }, gameplay: { perspective: '', flow: '', genre: '' }, modifier: '' },
                            users: { sortCategory: 'postcount' },
                            filter: '',
                            sort: 0,
                            randomizer: 0
                        }
                    })
                });

                const data = await res.json();
                const game = data.data?.[0];

                if (game) {
                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            found: true,
                            name: game.game_name,
                            main: Math.round(game.comp_main / 3600), // seconds to hours
                            mainExtra: Math.round(game.comp_plus / 3600),
                            completionist: Math.round(game.comp_100 / 3600),
                            imageUrl: game.game_image ? `https://howlongtobeat.com/games/${game.game_image}` : null
                        })
                    };
                }

                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ found: false }) };
            } catch (e) {
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ found: false, error: e.message }) };
            }
        }

        // === GET GAME RECOMMENDATIONS ===
        if (action === 'recommendations') {
            const user = await getAuthenticatedUser(event, store);
            if (!user?.games?.length) {
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ recommendations: [] }) };
            }

            // Get user's top rated or most played games for recommendations
            const topGames = user.games
                .filter(g => !g.hidden && (g.rating >= 7 || g.playtimeMinutes > 600))
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 5);

            if (!topGames.length) {
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ recommendations: [] }) };
            }

            // Get similar games from Steam
            const recommendations = [];
            for (const game of topGames.slice(0, 2)) {
                if (!game.steamAppId) continue;
                try {
                    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${game.steamAppId}`);
                    const data = await res.json();
                    const genres = data[game.steamAppId]?.data?.genres?.map(g => g.id) || [];

                    if (genres.length) {
                        const searchRes = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(data[game.steamAppId]?.data?.genres?.[0]?.description || '')}&l=english&cc=US`);
                        const searchData = await searchRes.json();
                        const filtered = (searchData.items || [])
                            .filter(g => !user.games.find(ug => ug.steamAppId === g.id))
                            .slice(0, 3);
                        recommendations.push(...filtered.map(g => ({
                            appid: g.id,
                            name: g.name,
                            because: game.name
                        })));
                    }
                } catch (e) { /* ignore */ }
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ recommendations: recommendations.slice(0, 10) })
            };
        }

        // === UPDATE FAVORITE SLOTS ===
        if (action === 'set-favorite-slots' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const body = JSON.parse(event.body || '{}');
            const { slots } = body; // array of steamAppId or null for empty slots

            user.favoriteSlots = slots || [null, null, null, null, null, null];
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // === LIST MEMBERS ===
        if (action === 'list-members') {
            try {
                // List all user keys from the store
                const { blobs } = await store.list({ prefix: 'user_' });
                const members = [];

                for (const blob of blobs.slice(0, 100)) { // Limit to 100 to avoid timeout
                    try {
                        const userData = await store.get(blob.key, { type: 'json' });
                        if (userData && userData.username) {
                            const games = (userData.games || []).filter(g => !g.hidden);
                            const ratedGames = games.filter(g => g.rating && g.rating > 0);
                            const avgRating = ratedGames.length > 0
                                ? (ratedGames.reduce((sum, g) => sum + g.rating, 0) / ratedGames.length).toFixed(1)
                                : null;

                            members.push({
                                username: userData.username,
                                avatar: userData.discordAvatar || null,
                                discordId: userData.discordId || null,
                                gameCount: games.length,
                                totalPlaytime: games.reduce((acc, g) => acc + (g.playtimeMinutes || 0), 0),
                                avgRating: avgRating,
                                perfectedCount: games.filter(g => g.status === 'perfected').length,
                                completedCount: games.filter(g => g.status === 'completed' || g.status === 'perfected').length,
                                joinedAt: userData.joinedAt || null
                            });
                        }
                    } catch (e) { /* ignore individual fetch errors */ }
                }

                // Sort by total playtime (most active first)
                members.sort((a, b) => b.totalPlaytime - a.totalPlaytime);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ members })
                };
            } catch (e) {
                console.error('List members error:', e);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to list members' }) };
            }
        }

        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid action' })
        };

    } catch (error) {
        console.error('Game Logger API error:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Server error' })
        };
    }
};
