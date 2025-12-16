const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Scheduled Steam Sync
 * Runs hourly to sync all users with Steam linked
 */

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

exports.handler = async (event, context) => {
    console.log('Starting scheduled Steam sync...');

    try {
        connectLambda(event);
        const store = getStore('game-logger');

        // List all user keys
        const { blobs } = await store.list({ prefix: 'user_' });
        console.log(`Found ${blobs.length} users to check`);

        let synced = 0;
        let skipped = 0;

        for (const blob of blobs) {
            try {
                const user = await store.get(blob.key, { type: 'json' });
                if (!user?.steam?.id) {
                    skipped++;
                    continue;
                }

                console.log(`Syncing ${user.displayName} (${user.steam.id})...`);

                // Get owned games
                const ownedData = await fetchSteamData('IPlayerService/GetOwnedGames/v1', {
                    steamid: user.steam.id,
                    include_appinfo: 'true',
                    include_played_free_games: 'true'
                });

                const steamGames = ownedData.response?.games || [];

                // Get recently played
                const recentData = await fetchSteamData('IPlayerService/GetRecentlyPlayedGames/v1', {
                    steamid: user.steam.id
                });
                const recentGames = recentData.response?.games || [];

                const recentMap = {};
                recentGames.forEach(g => {
                    recentMap[g.appid] = g.playtime_2weeks || 0;
                });

                // Build existing map
                const existingMap = {};
                (user.games || []).forEach(g => {
                    if (g.steamAppId) existingMap[g.steamAppId] = g;
                });

                // Activity log
                const activityLog = user.activityLog || [];
                const today = new Date().toISOString().split('T')[0];

                const mergedGames = steamGames.map(sg => {
                    const existing = existingMap[sg.appid] || {};

                    // Skip hidden games
                    if (existing.hidden) return existing;

                    // Log playtime changes
                    const oldPlaytime = existing.playtimeMinutes || 0;
                    const newPlaytime = sg.playtime_forever || 0;
                    if (newPlaytime > oldPlaytime) {
                        activityLog.push({
                            date: today,
                            timestamp: new Date().toISOString(),
                            type: 'playtime',
                            steamAppId: sg.appid,
                            game: sg.name,
                            delta: newPlaytime - oldPlaytime,
                            total: newPlaytime
                        });
                    }

                    // Smart status
                    let status = existing.status;
                    if (!status || status === 'unset' || status === 'playing') {
                        if (sg.playtime_forever === 0) status = 'backlog';
                        else status = 'played';
                    }

                    return {
                        steamAppId: sg.appid,
                        name: sg.name,
                        // Use original Steam icon URL (with hash for proper resolution)
                        icon: sg.img_icon_url
                            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${sg.appid}/${sg.img_icon_url}.jpg`
                            : `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/capsule_sm_120.jpg`,
                        // Header image (460x215)
                        headerImg: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/header.jpg`,
                        // Library hero (600x900) for high-res vertical art
                        libraryImg: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/library_600x900.jpg`,
                        playtimeMinutes: sg.playtime_forever || 0,
                        playtimeRecent: recentMap[sg.appid] || 0,
                        lastPlayed: sg.rtime_last_played
                            ? new Date(sg.rtime_last_played * 1000).toISOString()
                            : null,
                        previousLastPlayed: existing.lastPlayed || null,
                        achievements: existing.achievements || null,
                        status,
                        rating: existing.rating || null,
                        categoryRatings: existing.categoryRatings || null,
                        categoryEnabled: existing.categoryEnabled || null,
                        favorite: existing.favorite || false,
                        notes: existing.notes || '',
                        completedAt: existing.completedAt || null,
                        platforms: existing.platforms || [],
                        priority: existing.priority || null,
                        hidden: false
                    };
                });

                // Sort and compute stats
                mergedGames.sort((a, b) => {
                    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
                    return b.playtimeMinutes - a.playtimeMinutes;
                });

                // IMPORTANT: Preserve non-Steam games (manual entries)
                const nonSteamGames = (user.games || []).filter(g => !g.steamAppId && g.id);
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

                // Keep most recent 1000 entries
                user.journalEntries = journalEntries.slice(-1000);

                const visibleGames = allGames.filter(g => !g.hidden);

                user.games = allGames;
                user.activityLog = activityLog.slice(-500);
                user.lastSync = new Date().toISOString();
                user.steam.lastSync = new Date().toISOString();
                user.steam.gameCount = visibleGames.length;
                user.steam.totalPlaytime = visibleGames.reduce((sum, g) => sum + g.playtimeMinutes, 0);
                user.steam.recentPlaytime = visibleGames.reduce((sum, g) => sum + (g.playtimeRecent || 0), 0);

                await store.setJSON(blob.key, user);
                synced++;

            } catch (e) {
                console.error(`Error syncing ${blob.key}:`, e.message);
            }
        }

        console.log(`Sync complete: ${synced} synced, ${skipped} skipped`);

        return {
            statusCode: 200,
            body: JSON.stringify({ synced, skipped })
        };

    } catch (error) {
        console.error('Scheduled sync error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
