const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Scheduled Trakt Sync
 * Runs periodically to sync Trakt history for all connected users
 */

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

exports.handler = async (event, context) => {
    // This function should only be triggered by scheduled events
    console.log('Trakt scheduled sync started');

    try {
        connectLambda(event);
        const store = getStore('cinetrack');

        // Get list of all users with Trakt connected
        // We'll need to iterate through users to find those with traktAuth
        // For now, we'll need a way to list users - let's use a simple approach

        // Get username map to find all users
        const usernameMap = await store.get('username_map', { type: 'json' }) || {};
        const userIds = Object.values(usernameMap);

        let syncedCount = 0;
        let errorCount = 0;
        const results = [];

        for (const discordId of userIds) {
            try {
                const user = await store.get(`user_${discordId}`, { type: 'json' });
                if (!user?.traktAuth?.accessToken) continue;

                // Check if token is expired
                const isExpired = user.traktAuth.expiresAt && new Date(user.traktAuth.expiresAt) < new Date();
                if (isExpired) {
                    console.log(`Skipping ${user.username}: token expired`);
                    continue;
                }

                // Check if auto-sync is enabled (users can opt out)
                if (user.traktAuth.autoSyncEnabled === false) continue;

                // Skip if synced recently (within last 30 minutes) to avoid rate limits
                const lastSync = user.traktAuth.lastAutoSyncAt;
                if (lastSync && new Date(lastSync) > new Date(Date.now() - 30 * 60 * 1000)) {
                    console.log(`Skipping ${user.username}: synced recently`);
                    continue;
                }

                console.log(`Syncing Trakt for user: ${user.username}`);

                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                    'trakt-api-version': '2',
                    'trakt-api-key': TRAKT_CLIENT_ID
                };

                // Fetch all data from Trakt
                const [moviesRes, showsRes, ratingsRes] = await Promise.all([
                    fetch('https://api.trakt.tv/sync/watched/movies?extended=full', { headers }),
                    fetch('https://api.trakt.tv/sync/watched/shows?extended=full', { headers }),
                    fetch('https://api.trakt.tv/users/me/ratings?extended=full', { headers })
                ]);

                const traktMovies = await moviesRes.json();
                const traktShows = await showsRes.json();
                const traktRatings = await ratingsRes.json();

                let moviesAdded = 0, episodesAdded = 0, ratingsAdded = 0;

                // Initialize user data
                user.watchedMovies = user.watchedMovies || [];
                user.showProgress = user.showProgress || {};
                user.ratings = user.ratings || [];
                user.stats = user.stats || { moviesWatched: 0, episodesWatched: 0 };

                // Process movies - only add new ones
                for (const tm of (Array.isArray(traktMovies) ? traktMovies : [])) {
                    const tmdbId = tm.movie?.ids?.tmdb;
                    if (!tmdbId) continue;
                    if (user.watchedMovies.some(m => m.id == tmdbId)) continue;

                    user.watchedMovies.push({
                        id: tmdbId,
                        type: 'movie',
                        title: tm.movie.title,
                        watchedAt: tm.last_watched_at,
                        importedFromTrakt: true
                    });
                    moviesAdded++;
                }

                // Process shows - only add new episodes
                for (const ts of (Array.isArray(traktShows) ? traktShows : [])) {
                    const tmdbId = ts.show?.ids?.tmdb;
                    if (!tmdbId) continue;

                    if (!user.showProgress[tmdbId]) {
                        user.showProgress[tmdbId] = {
                            id: tmdbId,
                            title: ts.show.title,
                            watchedEpisodes: [],
                            startedAt: new Date().toISOString(),
                            importedFromTrakt: true
                        };
                    }

                    const showProgress = user.showProgress[tmdbId];

                    for (const season of ts.seasons || []) {
                        for (const ep of season.episodes || []) {
                            const epKey = `S${season.number}E${ep.number}`;
                            if (!showProgress.watchedEpisodes.includes(epKey)) {
                                showProgress.watchedEpisodes.push(epKey);
                                episodesAdded++;
                            }
                        }
                    }

                    showProgress.lastWatchedAt = ts.last_watched_at || showProgress.lastWatchedAt;
                }

                // Process ratings - only add new ones
                for (const tr of (Array.isArray(traktRatings) ? traktRatings : [])) {
                    const tmdbId = tr.movie?.ids?.tmdb || tr.show?.ids?.tmdb;
                    const type = tr.movie ? 'movie' : 'show';
                    if (!tmdbId) continue;
                    if (user.ratings.some(r => r.id == tmdbId && r.type === type)) continue;

                    user.ratings.push({
                        id: tmdbId,
                        type,
                        title: tr.movie?.title || tr.show?.title,
                        rating: tr.rating,
                        ratedAt: tr.rated_at,
                        importedFromTrakt: true
                    });
                    ratingsAdded++;
                }

                // Update stats
                user.stats.moviesWatched = user.watchedMovies.length;
                user.stats.episodesWatched = Object.values(user.showProgress || {})
                    .reduce((sum, s) => sum + (s.watchedEpisodes?.length || 0), 0);

                // Update sync time
                user.traktAuth.lastAutoSyncAt = new Date().toISOString();

                await store.setJSON(`user_${discordId}`, user);

                results.push({
                    username: user.username,
                    moviesAdded,
                    episodesAdded,
                    ratingsAdded
                });
                syncedCount++;

                console.log(`Synced ${user.username}: ${moviesAdded} movies, ${episodesAdded} episodes, ${ratingsAdded} ratings`);

            } catch (err) {
                console.error(`Error syncing user ${discordId}:`, err);
                errorCount++;
            }
        }

        console.log(`Trakt sync complete: ${syncedCount} users synced, ${errorCount} errors`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                syncedCount,
                errorCount,
                results
            })
        };

    } catch (error) {
        console.error('Trakt scheduled sync error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Scheduled sync failed' })
        };
    }
};
