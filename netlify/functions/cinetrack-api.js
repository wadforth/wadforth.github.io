const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Cinetrack API
 * Movie & TV show tracker with TMDB integration
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
};

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

// Parse session from cookie
function getSessionToken(event) {
    const cookies = event.headers.cookie || '';
    const match = cookies.match(/cinetrack_session=([^;]+)/);
    return match ? match[1] : null;
}

// Validate session and get user
async function getAuthenticatedUser(event, store) {
    const token = getSessionToken(event);
    if (!token) return null;

    const session = await store.get(`session_${token}`, { type: 'json' });
    if (!session) return null;

    const user = await store.get(`user_${session.discordId}`, { type: 'json' });
    return user;
}

// Get session object for a user (lightweight - doesn't load full user)
async function getSession(event, store) {
    const token = getSessionToken(event);
    if (!token) return null;

    const session = await store.get(`session_${token}`, { type: 'json' });
    if (!session) return null;

    // Get user to get username
    const user = await store.get(`user_${session.discordId}`, { type: 'json' });
    return user ? { username: user.username, discordId: session.discordId } : null;
}

// TMDB API helper
async function tmdbFetch(endpoint, params = {}) {
    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const res = await fetch(url.toString());
    return res.json();
}

exports.handler = async (event, context) => {
    console.log('Handler called, action:', event.queryStringParameters?.action);

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    try {
        connectLambda(event);
        const store = getStore('cinetrack');
        const action = event.queryStringParameters?.action;
        const method = event.httpMethod;

        let requestBody = {};
        if (event.body) {
            try { requestBody = JSON.parse(event.body); } catch (e) { requestBody = {}; }
        }

        // =====================
        // TMDB PROXY ENDPOINTS
        // =====================

        // Search movies and TV shows
        if (action === 'search') {
            const query = event.queryStringParameters?.query;
            const type = event.queryStringParameters?.type || 'multi'; // movie, tv, multi

            if (!query) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Query required' }) };
            }

            const data = await tmdbFetch(`/search/${type}`, { query, include_adult: 'false' });
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // Get trending content
        if (action === 'trending') {
            const type = event.queryStringParameters?.type || 'all'; // all, movie, tv
            const timeWindow = event.queryStringParameters?.window || 'week'; // day, week

            const data = await tmdbFetch(`/trending/${type}/${timeWindow}`);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // Get genres list
        if (action === 'genres') {
            const type = event.queryStringParameters?.type || 'movie'; // movie, tv
            const data = await tmdbFetch(`/genre/${type}/list`);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // Discover movies/shows with filters
        if (action === 'discover') {
            const type = event.queryStringParameters?.type || 'movie'; // movie, tv
            const params = {};

            // Pagination
            if (event.queryStringParameters?.page) params.page = event.queryStringParameters.page;

            // Sort
            params.sort_by = event.queryStringParameters?.sort_by || 'popularity.desc';

            // Year filter
            if (event.queryStringParameters?.year) {
                if (type === 'movie') {
                    params.primary_release_year = event.queryStringParameters.year;
                } else {
                    params.first_air_date_year = event.queryStringParameters.year;
                }
            }

            // Genre filter
            if (event.queryStringParameters?.genre) {
                params.with_genres = event.queryStringParameters.genre;
            }

            // Rating filter (minimum)
            if (event.queryStringParameters?.min_rating) {
                params['vote_average.gte'] = event.queryStringParameters.min_rating;
            }

            // Vote count filter (minimum)
            if (event.queryStringParameters?.min_votes) {
                params['vote_count.gte'] = event.queryStringParameters.min_votes;
            }

            const data = await tmdbFetch(`/discover/${type}`, params);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }


        // Get movie details
        if (action === 'movie') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Movie ID required' }) };
            }

            const [details, credits, videos, reviews] = await Promise.all([
                tmdbFetch(`/movie/${id}`, { append_to_response: 'external_ids,similar,watch/providers' }),
                tmdbFetch(`/movie/${id}/credits`),
                tmdbFetch(`/movie/${id}/videos`),
                tmdbFetch(`/movie/${id}/reviews`)
            ]);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ ...details, credits, videos: videos.results, reviews: reviews.results })
            };
        }

        // Get TV show details
        if (action === 'show') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID required' }) };
            }

            const [details, credits, videos, reviews] = await Promise.all([
                tmdbFetch(`/tv/${id}`, { append_to_response: 'external_ids,similar' }),
                tmdbFetch(`/tv/${id}/credits`),
                tmdbFetch(`/tv/${id}/videos`),
                tmdbFetch(`/tv/${id}/reviews`)
            ]);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ ...details, credits, videos: videos.results, reviews: reviews.results })
            };
        }

        // Get TV season episodes
        if (action === 'season') {
            const showId = event.queryStringParameters?.showId;
            const seasonNumber = event.queryStringParameters?.season;

            if (!showId || !seasonNumber) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID and season required' }) };
            }

            const data = await tmdbFetch(`/tv/${showId}/season/${seasonNumber}`);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // Get specific episode details
        if (action === 'episode') {
            const showId = event.queryStringParameters?.showId;
            const season = event.queryStringParameters?.season;
            const episode = event.queryStringParameters?.episode;

            if (!showId || !season || !episode) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID, season, and episode required' }) };
            }

            const data = await tmdbFetch(`/tv/${showId}/season/${season}/episode/${episode}`);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // Get person details (actor, director, etc)
        if (action === 'person') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Person ID required' }) };
            }

            const data = await tmdbFetch(`/person/${id}?append_to_response=combined_credits`);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // =====================
        // USER PROFILE ENDPOINTS
        // =====================

        // Get user profile (public or own)
        if (action === 'profile') {
            const username = event.queryStringParameters?.username;

            if (username) {
                // Look up by username (public view)
                const usernameMap = await store.get('username_map', { type: 'json' }) || {};
                const discordId = usernameMap[username.toLowerCase()];

                if (!discordId) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User not found' }) };
                }

                const user = await store.get(`user_${discordId}`, { type: 'json' });
                if (!user) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User not found' }) };
                }

                // Return public profile data
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        username: user.username,
                        displayName: user.displayName,
                        avatar: user.avatar,
                        joinedAt: user.createdAt,
                        stats: user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 },
                        favorites: user.favorites || [],
                        recentlyWatched: user.recentlyWatched || [],
                        ratings: user.ratings || [],
                        watchlist: user.watchlist || []
                    })
                };
            }

            // Get own profile (authenticated)
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(user) };
        }

        // Check if logged in
        if (action === 'me') {
            const user = await getAuthenticatedUser(event, store);
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ user: user || null })
            };
        }

        // Set username (first-time setup)
        if (action === 'set-username' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { username } = requestBody;
            if (!username || username.length < 3 || username.length > 20) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Username must be 3-20 characters' }) };
            }

            // Check if alphanumeric
            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Username can only contain letters, numbers, and underscores' }) };
            }

            // Check if taken
            const usernameMap = await store.get('username_map', { type: 'json' }) || {};
            if (usernameMap[username.toLowerCase()] && usernameMap[username.toLowerCase()] !== user.discordId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Username already taken' }) };
            }

            // Remove old username mapping if exists
            if (user.username) {
                delete usernameMap[user.username.toLowerCase()];
            }

            // Set new username
            usernameMap[username.toLowerCase()] = user.discordId;
            await store.setJSON('username_map', usernameMap);

            user.username = username;
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, username }) };
        }

        // Clear all user data (keep account)
        if (action === 'clear-data' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            // Clear all tracking data but keep account info
            user.watchedMovies = [];
            user.showProgress = {};
            user.ratings = [];
            user.favorites = [];
            user.watchlist = [];
            user.recentlyWatched = [];
            user.hiddenShows = [];
            user.stats = { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };

            // Keep Trakt connection but reset sync times
            if (user.traktAuth) {
                user.traktAuth.lastSyncedAt = null;
                user.traktAuth.lastAutoSyncAt = null;
                user.traktAuth.lastImportedAt = null;
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // =====================
        // UP NEXT (for dashboard)
        // =====================

        if (action === 'up-next') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            // Return all shows from showProgress with calculated lastEpisode
            const shows = Object.values(user.showProgress || {}).map(show => {
                const watchedEpisodes = show.watchedEpisodes || [];

                // Parse last watched episode from the array (format: "S1E5")
                let lastEpisode = null;
                if (watchedEpisodes.length > 0) {
                    // Sort by season then episode to find the highest
                    const parsed = watchedEpisodes.map(ep => {
                        const match = ep.match(/S(\d+)E(\d+)/i);
                        if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
                        return null;
                    }).filter(Boolean);

                    if (parsed.length > 0) {
                        // Find the last episode (highest season, then highest episode)
                        parsed.sort((a, b) => {
                            if (a.season !== b.season) return b.season - a.season;
                            return b.episode - a.episode;
                        });
                        lastEpisode = parsed[0];
                    }
                }

                return {
                    id: show.id,
                    title: show.title,
                    poster: show.poster,
                    watchedEpisodes: watchedEpisodes,
                    lastEpisode: lastEpisode, // { season: X, episode: Y }
                    lastWatchedAt: show.lastWatchedAt
                };
            });

            // Sort by last watched date
            shows.sort((a, b) => new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0));

            // Filter out hidden shows
            const hiddenShows = user.hiddenShows || [];
            const visibleShows = shows.filter(s => !hiddenShows.includes(s.id));

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ shows: visibleShows }) };
        }

        // Hide show from Up Next
        if (action === 'hide-show' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId } = requestBody;
            user.hiddenShows = user.hiddenShows || [];
            if (!user.hiddenShows.includes(showId)) {
                user.hiddenShows.push(showId);
            }
            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Unhide show
        if (action === 'unhide-show' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId } = requestBody;
            user.hiddenShows = (user.hiddenShows || []).filter(id => id !== showId);
            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // =====================
        // WATCH TRACKING
        // =====================

        // Mark movie as watched
        if (action === 'watch-movie' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { movieId, title, poster, rating } = requestBody;
            if (!movieId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Movie ID required' }) };
            }

            // Initialize user data if needed
            user.watchedMovies = user.watchedMovies || [];
            user.recentlyWatched = user.recentlyWatched || [];
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };

            // Add to watched movies
            const watchEntry = {
                id: movieId,
                type: 'movie',
                title,
                poster,
                rating: rating || null,
                watchedAt: new Date().toISOString()
            };

            // Check if already watched
            const existingIndex = user.watchedMovies.findIndex(m => m.id === movieId);
            if (existingIndex >= 0) {
                user.watchedMovies[existingIndex] = watchEntry;
            } else {
                user.watchedMovies.push(watchEntry);
                user.stats.moviesWatched++;
            }

            // Update recently watched (keep last 20)
            user.recentlyWatched = [watchEntry, ...user.recentlyWatched.filter(w => !(w.id === movieId && w.type === 'movie'))].slice(0, 20);

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Mark movie as watched with custom date
        if (action === 'watch-movie-dated' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { movieId, title, poster, watchedAt } = requestBody;
            if (!movieId || !watchedAt) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Movie ID and watch date required' }) };
            }

            user.watchedMovies = user.watchedMovies || [];
            user.recentlyWatched = user.recentlyWatched || [];
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };

            const watchEntry = {
                id: movieId,
                type: 'movie',
                title,
                poster,
                watchedAt
            };

            const existingIndex = user.watchedMovies.findIndex(m => m.id === movieId);
            if (existingIndex >= 0) {
                user.watchedMovies[existingIndex] = watchEntry;
            } else {
                user.watchedMovies.push(watchEntry);
                user.stats.moviesWatched++;
            }

            user.recentlyWatched = [watchEntry, ...user.recentlyWatched.filter(w => !(w.id === movieId && w.type === 'movie'))].slice(0, 20);

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Unwatch movie
        if (action === 'unwatch-movie' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { movieId } = requestBody;
            if (!movieId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Movie ID required' }) };
            }

            const wasWatched = user.watchedMovies?.some(m => m.id === movieId);
            user.watchedMovies = (user.watchedMovies || []).filter(m => m.id !== movieId);
            user.recentlyWatched = (user.recentlyWatched || []).filter(w => !(w.id === movieId && w.type === 'movie'));

            if (wasWatched && user.stats?.moviesWatched > 0) {
                user.stats.moviesWatched--;
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Mark episode as watched
        if (action === 'watch-episode' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId, showTitle, showPoster, seasonNumber, episodeNumber, episodeTitle, episodeStill } = requestBody;
            if (!showId || seasonNumber === undefined || episodeNumber === undefined) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID, season, and episode required' }) };
            }

            // Initialize user data
            user.showProgress = user.showProgress || {};
            user.recentlyWatched = user.recentlyWatched || [];
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };

            // Initialize show progress
            if (!user.showProgress[showId]) {
                user.showProgress[showId] = {
                    id: showId,
                    title: showTitle,
                    poster: showPoster,
                    watchedEpisodes: [],
                    startedAt: new Date().toISOString()
                };
            }

            const show = user.showProgress[showId];
            const episodeKey = `S${seasonNumber}E${episodeNumber}`;

            // Add episode if not already watched
            if (!show.watchedEpisodes.includes(episodeKey)) {
                show.watchedEpisodes.push(episodeKey);
                user.stats.episodesWatched++;
            }

            show.lastWatchedAt = new Date().toISOString();
            show.lastEpisode = { season: seasonNumber, episode: episodeNumber, title: episodeTitle };

            // Update recently watched
            const watchEntry = {
                id: showId,
                type: 'episode',
                title: showTitle,
                poster: showPoster,
                still: episodeStill,
                episode: episodeKey,
                episodeTitle,
                watchedAt: new Date().toISOString()
            };
            user.recentlyWatched = [watchEntry, ...user.recentlyWatched.filter(w => !(w.id === showId && w.episode === episodeKey))].slice(0, 20);

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, watchedEpisodes: show.watchedEpisodes }) };
        }

        // Unwatch episode
        if (action === 'unwatch-episode' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId, seasonNumber, episodeNumber } = requestBody;
            if (!showId || !seasonNumber || !episodeNumber) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID, season, and episode required' }) };
            }

            const show = user.showProgress?.[showId];
            if (!show) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No progress for this show' }) };
            }

            const episodeKey = `S${seasonNumber}E${episodeNumber}`;
            const wasWatched = show.watchedEpisodes?.includes(episodeKey);

            if (wasWatched) {
                show.watchedEpisodes = show.watchedEpisodes.filter(e => e !== episodeKey);
                if (user.stats?.episodesWatched > 0) {
                    user.stats.episodesWatched--;
                }

                // Update last episode to previous one if we unwatched the current last
                if (show.lastEpisode?.season === seasonNumber && show.lastEpisode?.episode === episodeNumber) {
                    // Find the highest remaining watched episode
                    if (show.watchedEpisodes.length > 0) {
                        const sorted = show.watchedEpisodes.sort((a, b) => {
                            const [, sA, eA] = a.match(/S(\d+)E(\d+)/);
                            const [, sB, eB] = b.match(/S(\d+)E(\d+)/);
                            return (parseInt(sB) * 1000 + parseInt(eB)) - (parseInt(sA) * 1000 + parseInt(eA));
                        });
                        const [, lastS, lastE] = sorted[0].match(/S(\d+)E(\d+)/);
                        show.lastEpisode = { season: parseInt(lastS), episode: parseInt(lastE) };
                    } else {
                        show.lastEpisode = null;
                    }
                }

                // Remove from recently watched
                user.recentlyWatched = (user.recentlyWatched || []).filter(w => !(w.id === showId && w.episode === episodeKey));
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, watchedEpisodes: show.watchedEpisodes }) };
        }

        // Get show progress
        if (action === 'show-progress') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const showId = event.queryStringParameters?.showId;
            if (!showId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID required' }) };
            }

            const progress = user.showProgress?.[showId] || null;
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ progress }) };
        }

        // =====================
        // RATINGS
        // =====================

        // Rate movie or show (0-10 scale, 0 = remove rating)
        if (action === 'rate' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { id, type, rating, title, poster, breakdown } = requestBody;
            if (!id || !type || rating === undefined) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ID, type, and rating required' }) };
            }

            user.ratings = user.ratings || [];

            if (rating === 0) {
                // Remove rating
                user.ratings = user.ratings.filter(r => !(r.id === id && r.type === type));
            } else {
                if (rating < 1 || rating > 10) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Rating must be 1-10' }) };
                }

                const ratingEntry = { id, type, rating, title, poster, ratedAt: new Date().toISOString(), breakdown: breakdown || null };

                const existingIndex = user.ratings.findIndex(r => r.id === id && r.type === type);
                if (existingIndex >= 0) {
                    user.ratings[existingIndex] = ratingEntry;
                } else {
                    user.ratings.push(ratingEntry);
                }
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Rewatch show (reset progress, preserve history)
        if (action === 'rewatch-show' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId } = requestBody;
            if (!showId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID required' }) };
            }

            user.showProgress = user.showProgress || {};
            const show = user.showProgress[showId];

            if (!show) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No progress found for this show' }) };
            }

            // Archive current watch session
            show.watchHistory = show.watchHistory || [];
            show.watchHistory.push({
                watchedEpisodes: [...show.watchedEpisodes],
                completedAt: new Date().toISOString(),
                sessionNumber: show.rewatchCount || 0
            });

            // Reset progress
            show.watchedEpisodes = [];
            show.lastEpisode = null;
            show.lastWatchedAt = null;
            show.rewatchCount = (show.rewatchCount || 0) + 1;

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, progress: show }) };
        }

        // =====================
        // WATCHLIST & FAVORITES
        // =====================

        // Toggle watchlist
        if (action === 'watchlist' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { id, type, title, poster, add } = requestBody;
            if (!id || !type) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ID and type required' }) };
            }

            user.watchlist = user.watchlist || [];

            if (add) {
                // Add to watchlist if not exists
                if (!user.watchlist.find(w => w.id === id && w.type === type)) {
                    user.watchlist.push({ id, type, title, poster, addedAt: new Date().toISOString() });
                }
            } else {
                // Remove from watchlist
                user.watchlist = user.watchlist.filter(w => !(w.id === id && w.type === type));
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, inWatchlist: add }) };
        }

        // Toggle favorite
        if (action === 'favorite' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { id, type, title, poster, add } = requestBody;
            if (!id || !type) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ID and type required' }) };
            }

            user.favorites = user.favorites || [];

            if (add) {
                if (!user.favorites.find(f => f.id === id && f.type === type)) {
                    user.favorites.push({ id, type, title, poster, addedAt: new Date().toISOString() });
                }
            } else {
                user.favorites = user.favorites.filter(f => !(f.id === id && f.type === type));
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, isFavorite: add }) };
        }

        // Unwatch last episode (go back)
        if (action === 'unwatch-episode' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId } = requestBody;
            if (!showId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID required' }) };
            }

            const show = user.showProgress?.[showId];
            if (!show || !show.watchedEpisodes?.length) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No episodes to unwatch' }) };
            }

            // Remove last watched episode
            const lastEp = show.watchedEpisodes.pop();
            user.stats.episodesWatched = Math.max(0, (user.stats.episodesWatched || 0) - 1);

            // Update lastEpisode to previous one
            if (show.watchedEpisodes.length > 0) {
                const prev = show.watchedEpisodes[show.watchedEpisodes.length - 1];
                const match = prev.match(/S(\d+)E(\d+)/);
                if (match) {
                    show.lastEpisode = { season: parseInt(match[1]), episode: parseInt(match[2]) };
                }
            } else {
                show.lastEpisode = null;
            }

            // Remove from recently watched
            user.recentlyWatched = (user.recentlyWatched || []).filter(w =>
                !(w.id === showId && w.episode === lastEp)
            );

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({
                    success: true,
                    unwatched: lastEp,
                    watchedEpisodes: show.watchedEpisodes
                })
            };
        }

        // Hide show from up next
        if (action === 'hide-show' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId } = requestBody;
            if (!showId) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID required' }) };
            }

            user.hiddenShows = user.hiddenShows || [];
            if (!user.hiddenShows.includes(String(showId))) {
                user.hiddenShows.push(String(showId));
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Unhide show
        if (action === 'unhide-show' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId } = requestBody;
            user.hiddenShows = (user.hiddenShows || []).filter(id => id !== String(showId));

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Get hidden shows
        if (action === 'hidden-shows') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const hiddenShows = (user.hiddenShows || []).map(id => user.showProgress?.[id]).filter(Boolean);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ shows: hiddenShows }) };
        }

        // Watch episode with custom date
        if (action === 'watch-episode-dated' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { showId, showTitle, showPoster, seasonNumber, episodeNumber, episodeTitle, watchedAt } = requestBody;
            if (!showId || seasonNumber === undefined || episodeNumber === undefined) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Show ID, season, and episode required' }) };
            }

            user.showProgress = user.showProgress || {};
            user.recentlyWatched = user.recentlyWatched || [];
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };

            if (!user.showProgress[showId]) {
                user.showProgress[showId] = {
                    id: showId,
                    title: showTitle,
                    poster: showPoster,
                    watchedEpisodes: [],
                    startedAt: watchedAt || new Date().toISOString()
                };
            }

            const show = user.showProgress[showId];
            const episodeKey = `S${seasonNumber}E${episodeNumber}`;
            const timestamp = watchedAt || new Date().toISOString();

            if (!show.watchedEpisodes.includes(episodeKey)) {
                show.watchedEpisodes.push(episodeKey);
                user.stats.episodesWatched++;
            }

            show.lastWatchedAt = timestamp;
            show.lastEpisode = { season: seasonNumber, episode: episodeNumber, title: episodeTitle };

            const watchEntry = {
                id: showId,
                type: 'episode',
                title: showTitle,
                poster: showPoster,
                episode: episodeKey,
                episodeTitle,
                watchedAt: timestamp
            };
            user.recentlyWatched = [watchEntry, ...user.recentlyWatched.filter(w => !(w.id === showId && w.episode === episodeKey))].slice(0, 20);

            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, watchedEpisodes: show.watchedEpisodes }) };
        }

        // =====================
        // LISTS
        // =====================

        // Get user's watched movies
        if (action === 'watched-movies') {
            const username = event.queryStringParameters?.username;
            let user;

            if (username) {
                const usernameMap = await store.get('username_map', { type: 'json' }) || {};
                const discordId = usernameMap[username.toLowerCase()];
                if (discordId) {
                    user = await store.get(`user_${discordId}`, { type: 'json' });
                }
            } else {
                user = await getAuthenticatedUser(event, store);
            }

            if (!user) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User not found' }) };
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ movies: user.watchedMovies || [] }) };
        }

        // Get user's shows in progress
        if (action === 'watched-shows') {
            const username = event.queryStringParameters?.username;
            let user;

            if (username) {
                const usernameMap = await store.get('username_map', { type: 'json' }) || {};
                const discordId = usernameMap[username.toLowerCase()];
                if (discordId) {
                    user = await store.get(`user_${discordId}`, { type: 'json' });
                }
            } else {
                user = await getAuthenticatedUser(event, store);
            }

            if (!user) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User not found' }) };
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ shows: Object.values(user.showProgress || {}) }) };
        }

        // =====================
        // SETTINGS
        // =====================

        // Update profile (display name, avatar)
        if (action === 'update-profile' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { displayName, avatar } = requestBody;
            if (displayName !== undefined) user.displayName = displayName?.trim() || null;
            if (avatar !== undefined) user.avatar = avatar;

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Delete profile
        if (action === 'delete-profile' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            // Remove from username map
            const usernameMap = await store.get('username_map', { type: 'json' }) || {};
            if (user.username) delete usernameMap[user.username.toLowerCase()];
            await store.setJSON('username_map', usernameMap);

            // Delete user data
            await store.delete(`user_${user.discordId}`);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Clear all watch data (keep account)
        if (action === 'clear-data' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            // Reset all watch/rating data
            user.watchedMovies = [];
            user.showProgress = {};
            user.ratings = [];
            user.recentlyWatched = [];
            user.favorites = [];
            user.watchlist = [];
            user.stats = { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Get full history for timeline
        if (action === 'history') {
            const username = event.queryStringParameters?.username;
            let user;

            if (username) {
                const usernameMap = await store.get('username_map', { type: 'json' }) || {};
                const discordId = usernameMap[username.toLowerCase()];
                if (discordId) user = await store.get(`user_${discordId}`, { type: 'json' });
            } else {
                user = await getAuthenticatedUser(event, store);
            }

            if (!user) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User not found' }) };
            }

            // Combine all watch history
            const history = [];
            const seenMovieDates = new Map(); // Track movie+date combinations to count rewatches

            // Movies - handle array dates (rewatches) but deduplicate same-day entries
            (user.watchedMovies || []).forEach(m => {
                const watchedAt = m.watchedAt;
                const dates = Array.isArray(watchedAt) ? watchedAt : [watchedAt];

                // Group by date (day only, not time) to deduplicate same-day watches
                const uniqueDates = new Map();
                dates.forEach(date => {
                    if (!date) return;
                    const dayKey = new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
                    if (!uniqueDates.has(dayKey)) {
                        uniqueDates.set(dayKey, { date, count: 1 });
                    } else {
                        uniqueDates.get(dayKey).count++;
                    }
                });

                // Create history entries for each unique date
                uniqueDates.forEach(({ date, count }, dayKey) => {
                    history.push({
                        type: 'movie',
                        id: m.id,
                        title: m.title,
                        poster: m.poster,
                        date: date || new Date().toISOString(),
                        playCount: count,
                        isRewatch: dates.length > 1
                    });
                });
            });

            // Episodes from recentlyWatched (has dates)
            (user.recentlyWatched || []).filter(w => w.type === 'episode').forEach(e => {
                const date = Array.isArray(e.watchedAt) ? e.watchedAt[e.watchedAt.length - 1] : (e.watchedAt || new Date().toISOString());
                history.push({ type: 'episode', id: e.id, title: e.title, poster: e.poster, episode: e.episode, date });
            });

            // Sort by date descending
            history.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ history }) };
        }

        // =====================
        // TRAKT IMPORT
        // =====================

        // Import Trakt ratings
        if (action === 'import-trakt-ratings' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { items } = requestBody; // Array of Trakt rating items
            if (!Array.isArray(items)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Items array required' }) };
            }

            user.ratings = user.ratings || [];
            const results = { imported: 0, skipped: 0, duplicates: [] };

            for (const item of items) {
                const isMovie = item.type === 'movie';
                const media = isMovie ? item.movie : item.show;
                const tmdbId = media?.ids?.tmdb;

                if (!tmdbId) { results.skipped++; continue; }

                // Check for duplicate
                const existing = user.ratings.find(r => r.id === tmdbId && r.type === (isMovie ? 'movie' : 'show'));
                if (existing) {
                    results.duplicates.push({
                        existing: { ...existing },
                        incoming: { id: tmdbId, type: isMovie ? 'movie' : 'show', rating: item.rating, title: media.title, ratedAt: item.rated_at }
                    });
                    continue;
                }

                // Fetch poster from TMDB (optional - don't fail if can't get it)
                let poster = null;
                let title = media.title;
                try {
                    const details = await tmdbFetch(`/${isMovie ? 'movie' : 'tv'}/${tmdbId}`);
                    if (details?.poster_path) {
                        poster = details.poster_path;
                        title = details.title || details.name || media.title;
                    }
                } catch (e) {
                    // TMDB failed, use Trakt data
                    console.log('TMDB fetch failed for', tmdbId, e.message);
                }

                user.ratings.push({
                    id: tmdbId,
                    type: isMovie ? 'movie' : 'show',
                    rating: item.rating,
                    title: title,
                    poster: poster,
                    ratedAt: item.rated_at
                });
                results.imported++;
            }

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(results) };
        }

        // Import Trakt watched movies
        if (action === 'import-trakt-movies' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { items } = requestBody;
            if (!Array.isArray(items)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Items array required' }) };
            }

            user.watchedMovies = user.watchedMovies || [];
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };
            const results = { imported: 0, skipped: 0, duplicates: [] };

            for (const item of items) {
                const tmdbId = item.movie?.ids?.tmdb;
                if (!tmdbId) { results.skipped++; continue; }

                const existing = user.watchedMovies.find(m => m.id === tmdbId);
                if (existing) {
                    results.duplicates.push({
                        existing: { ...existing },
                        incoming: { id: tmdbId, title: item.movie.title, watchedAt: item.last_watched_at }
                    });
                    continue;
                }

                // Fetch details from TMDB (optional - don't fail if can't get it)
                let poster = null;
                let title = item.movie.title;
                let year = item.movie.year;
                let genres = [];
                try {
                    const details = await tmdbFetch(`/movie/${tmdbId}`);
                    if (details && details.id) {
                        poster = details.poster_path || null;
                        title = details.title || item.movie.title;
                        year = details.release_date?.split('-')[0] || item.movie.year;
                        genres = details.genres?.map(g => g.name) || [];
                    }
                } catch (e) {
                    console.log('TMDB fetch failed for movie', tmdbId, e.message);
                }

                user.watchedMovies.push({
                    id: tmdbId,
                    title: title,
                    poster: poster,
                    year: year,
                    genres: genres,
                    watchedAt: item.last_watched_at
                });
                user.stats.moviesWatched++;
                results.imported++;
            }

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(results) };
        }

        // Import Trakt watched shows
        if (action === 'import-trakt-shows' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { items } = requestBody;
            if (!Array.isArray(items)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Items array required' }) };
            }

            user.showProgress = user.showProgress || {};
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };
            const results = { imported: 0, episodes: 0, skipped: 0, duplicates: [] };

            for (const item of items) {
                const tmdbId = item.show?.ids?.tmdb;
                if (!tmdbId) { results.skipped++; continue; }

                const existing = user.showProgress[tmdbId];
                if (existing) {
                    results.duplicates.push({
                        existing: { id: tmdbId, title: existing.title, episodes: existing.watchedEpisodes?.length || 0 },
                        incoming: { id: tmdbId, title: item.show.title, episodes: item.seasons?.reduce((t, s) => t + (s.episodes?.length || 0), 0) || 0 }
                    });
                    continue;
                }

                // Parse watched episodes from Trakt data
                const watchedEpisodes = [];
                (item.seasons || []).forEach(season => {
                    (season.episodes || []).forEach(ep => {
                        watchedEpisodes.push(`S${season.number}E${ep.number}`);
                    });
                });

                // Fetch details from TMDB (optional)
                let poster = null;
                let title = item.show.title;
                try {
                    const details = await tmdbFetch(`/tv/${tmdbId}`);
                    if (details && details.id) {
                        poster = details.poster_path || null;
                        title = details.name || item.show.title;
                    }
                } catch (e) {
                    console.log('TMDB fetch failed for show', tmdbId, e.message);
                }

                user.showProgress[tmdbId] = {
                    id: tmdbId,
                    title: title,
                    poster: poster,
                    watchedEpisodes: watchedEpisodes,
                    startedAt: item.seasons?.[0]?.episodes?.[0]?.last_watched_at,
                    lastWatchedAt: item.last_watched_at
                };

                user.stats.showsWatched++;
                user.stats.episodesWatched += watchedEpisodes.length;
                results.imported++;
                results.episodes += watchedEpisodes.length;
            }

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(results) };
        }

        // Resolve import duplicate (keep existing or replace with incoming)
        if (action === 'resolve-duplicate' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { dataType, id, keepIncoming, incoming } = requestBody;

            if (keepIncoming && incoming) {
                if (dataType === 'rating') {
                    user.ratings = user.ratings || [];
                    const idx = user.ratings.findIndex(r => r.id === id);
                    if (idx >= 0) user.ratings[idx] = incoming;
                    else user.ratings.push(incoming);
                } else if (dataType === 'movie') {
                    user.watchedMovies = user.watchedMovies || [];
                    const idx = user.watchedMovies.findIndex(m => m.id === id);
                    if (idx >= 0) user.watchedMovies[idx] = incoming;
                    else user.watchedMovies.push(incoming);
                } else if (dataType === 'show') {
                    user.showProgress = user.showProgress || {};
                    user.showProgress[id] = incoming;
                }
                await store.setJSON(`user_${user.discordId}`, user);
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Import Trakt history (with watch dates for movies and episodes)
        // NOTE: Skips TMDB fetches for speed - posters will be null but titles come from Trakt
        if (action === 'import-trakt-history' && event.httpMethod === 'POST') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const { items } = requestBody;
            if (!Array.isArray(items)) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Items array required' }) };
            }

            user.watchedMovies = user.watchedMovies || [];
            user.showProgress = user.showProgress || {};
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };
            const results = { imported: 0, skipped: 0, movies: 0, episodes: 0 };

            for (const item of items) {
                try {
                    if (item.type === 'movie' && item.movie) {
                        const tmdbId = item.movie.ids?.tmdb;
                        if (!tmdbId) { results.skipped++; continue; }

                        const watchedAt = item.watched_at || new Date().toISOString();

                        // Check if movie already exists
                        const existing = user.watchedMovies.find(m => m.id == tmdbId);
                        if (existing) {
                            // Update watch date if not set or if this is earlier
                            if (!existing.watchedAt || new Date(watchedAt) < new Date(existing.watchedAt)) {
                                existing.watchedAt = watchedAt;
                            }
                            results.skipped++;
                            continue;
                        }

                        // Use Trakt data directly - no TMDB fetch for speed
                        user.watchedMovies.push({
                            id: tmdbId,
                            type: 'movie',
                            title: item.movie.title || `Movie ${tmdbId}`,
                            poster: null, // Will be fetched when viewing the movie page
                            watchedAt
                        });
                        user.stats.moviesWatched++;
                        results.movies++;
                        results.imported++;

                    } else if (item.type === 'episode' && item.episode && item.show) {
                        const showTmdbId = item.show.ids?.tmdb;
                        if (!showTmdbId) { results.skipped++; continue; }

                        const season = item.episode.season;
                        const episode = item.episode.number;
                        const watchedAt = item.watched_at || new Date().toISOString();
                        const epKey = `S${season}E${episode}`;

                        // Initialize show progress if needed - use Trakt data directly
                        if (!user.showProgress[showTmdbId]) {
                            user.showProgress[showTmdbId] = {
                                title: item.show.title || `Show ${showTmdbId}`,
                                poster: null, // Will be fetched when viewing the show page
                                watchedEpisodes: [],
                                episodeWatchTimes: {}
                            };
                            user.stats.showsWatched++;
                        }

                        const progress = user.showProgress[showTmdbId];
                        progress.episodeWatchTimes = progress.episodeWatchTimes || {};

                        // Add episode if not already watched
                        if (!progress.watchedEpisodes.includes(epKey)) {
                            progress.watchedEpisodes.push(epKey);
                            progress.episodeWatchTimes[epKey] = watchedAt;
                            user.stats.episodesWatched++;
                            results.episodes++;
                            results.imported++;
                        } else {
                            // Update watch time if this is earlier
                            if (!progress.episodeWatchTimes[epKey] ||
                                new Date(watchedAt) < new Date(progress.episodeWatchTimes[epKey])) {
                                progress.episodeWatchTimes[epKey] = watchedAt;
                            }
                            results.skipped++;
                        }
                    } else {
                        results.skipped++;
                    }
                } catch (e) {
                    console.error('Error processing history item:', e);
                    results.skipped++;
                }
            }

            await store.setJSON(`user_${user.discordId}`, user);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(results) };
        }

        // =====================
        // EXPORT FOR TRAKT.TV
        // =====================
        if (action === 'export-trakt') {
            const user = await getAuthenticatedUser(event, store);
            if (!user) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };
            }

            const traktExport = [];

            // Export watched movies
            (user.watchedMovies || []).forEach(movie => {
                const entry = {
                    tmdb_id: String(movie.id),
                    type: 'movie',
                    watched_at: movie.watchedAt || 'unknown'
                };

                // Check if this movie is in watchlist
                const inWatchlist = (user.watchlist || []).find(w => w.id == movie.id && w.type === 'movie');
                if (inWatchlist?.addedAt) {
                    entry.watchlisted_at = inWatchlist.addedAt;
                }

                // Check if this movie has a rating
                const rating = (user.ratings || []).find(r => r.id == movie.id && r.type === 'movie');
                if (rating?.rating) {
                    entry.rating = rating.rating;
                    entry.rated_at = rating.ratedAt || movie.watchedAt || new Date().toISOString();
                }

                traktExport.push(entry);
            });

            // Export shows with episode progress
            const showProgress = user.showProgress || {};
            for (const [showId, progress] of Object.entries(showProgress)) {
                const watchedEpisodes = progress.watchedEpisodes || [];

                // Get episode watch times if available
                const episodeTimes = progress.episodeWatchTimes || {};

                // Export each watched episode
                watchedEpisodes.forEach(epKey => {
                    // Parse S1E5 format
                    const match = epKey.match(/S(\d+)E(\d+)/);
                    if (match) {
                        const season = parseInt(match[1]);
                        const episode = parseInt(match[2]);

                        traktExport.push({
                            tmdb_id: String(showId),
                            type: 'episode',
                            watched_at: episodeTimes[epKey] || 'unknown',
                            season: season,
                            episode: episode
                        });
                    }
                });

                // Check if show has a rating
                const rating = (user.ratings || []).find(r => r.id == showId && r.type === 'tv');
                if (rating?.rating) {
                    traktExport.push({
                        tmdb_id: String(showId),
                        type: 'show',
                        rating: rating.rating,
                        rated_at: rating.ratedAt || new Date().toISOString()
                    });
                }
            }

            // Export watchlist items (not already watched)
            (user.watchlist || []).forEach(item => {
                // Check if already exported as watched
                const alreadyExported = traktExport.some(e =>
                    e.tmdb_id === String(item.id) &&
                    (e.type === 'movie' || e.type === 'show')
                );

                if (!alreadyExported) {
                    traktExport.push({
                        tmdb_id: String(item.id),
                        type: item.type === 'tv' ? 'show' : 'movie',
                        watchlisted_at: item.addedAt || new Date().toISOString()
                    });
                }
            });

            // Export ratings for unwatched items
            (user.ratings || []).forEach(rating => {
                const alreadyExported = traktExport.some(e =>
                    e.tmdb_id === String(rating.id) &&
                    (e.type === 'movie' || e.type === 'show') &&
                    e.rating
                );

                if (!alreadyExported && rating.rating) {
                    traktExport.push({
                        tmdb_id: String(rating.id),
                        type: rating.type === 'tv' ? 'show' : 'movie',
                        rating: rating.rating,
                        rated_at: rating.ratedAt || new Date().toISOString()
                    });
                }
            });

            return {
                statusCode: 200,
                headers: {
                    ...CORS_HEADERS,
                    'Content-Disposition': 'attachment; filename="cinetrack-trakt-export.json"'
                },
                body: JSON.stringify(traktExport, null, 2)
            };
        }

        // ==================== TRAKT.TV INTEGRATION ====================

        // Get Trakt OAuth URL
        if (action === 'trakt-auth-url') {
            const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
            // Use localhost for dev, production URL otherwise
            const host = event.headers.host || event.headers.Host || '';
            const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
            const redirectUri = isLocal
                ? 'http://localhost:8888/cinetrack/trakt-callback'
                : 'https://kierxn.netlify.com/cinetrack/trakt-callback';
            const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ authUrl }) };
        }

        // Handle Trakt OAuth callback
        if (action === 'trakt-callback' && method === 'POST') {
            console.log('Trakt callback endpoint hit');
            try {
                console.log('Body:', requestBody);
                const code = requestBody.code;
                if (!code) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No code provided' }) };

                const session = await getSession(event, store);
                if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

                const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
                const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;
                // Use localhost for dev, production URL otherwise
                const host = event.headers.host || event.headers.Host || '';
                const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
                const redirectUri = isLocal
                    ? 'http://localhost:8888/cinetrack/trakt-callback'
                    : 'https://kierxn.netlify.com/cinetrack/trakt-callback';

                console.log('Trakt callback - exchanging code for tokens with redirect:', redirectUri);

                // Exchange code for tokens
                const tokenRes = await fetch('https://api.trakt.tv/oauth/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code,
                        client_id: TRAKT_CLIENT_ID,
                        client_secret: TRAKT_CLIENT_SECRET,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code'
                    })
                });

                if (!tokenRes.ok) {
                    const err = await tokenRes.text();
                    console.error('Trakt token error:', err);
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to get Trakt tokens: ' + err }) };
                }

                const tokens = await tokenRes.json();
                console.log('Trakt tokens received successfully');

                // Get Trakt user info
                const userRes = await fetch('https://api.trakt.tv/users/me', {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tokens.access_token}`,
                        'trakt-api-version': '2',
                        'trakt-api-key': TRAKT_CLIENT_ID
                    }
                });

                let traktUsername = '';
                if (userRes.ok) {
                    const userData = await userRes.json();
                    traktUsername = userData.username;
                    console.log('Trakt user info retrieved:', traktUsername);
                }

                // Store tokens in user profile
                const user = await getAuthenticatedUser(event, store);
                user.traktAuth = {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                    traktUsername,
                    connectedAt: new Date().toISOString(),
                    lastSyncedAt: null
                };
                await store.setJSON(`user_${user.discordId}`, user);
                console.log('Trakt auth saved for user:', session.username);

                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, traktUsername }) };
            } catch (err) {
                console.error('Trakt callback error:', err);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Trakt callback failed: ' + err.message }) };
            }
        }

        // Check Trakt connection status
        if (action === 'trakt-status') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            const traktAuth = user.traktAuth;

            // Check if token is expired
            const isExpired = traktAuth?.expiresAt && new Date(traktAuth.expiresAt) < new Date();

            if (!traktAuth || !traktAuth.accessToken || isExpired) {
                return {
                    statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({
                        connected: false,
                        wasConnected: !!traktAuth?.traktUsername,
                        reason: isExpired ? 'Token expired' : 'Not connected'
                    })
                };
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    connected: true,
                    traktUsername: traktAuth.traktUsername,
                    connectedAt: traktAuth.connectedAt,
                    lastSyncedAt: traktAuth.lastSyncedAt,
                    lastAutoSyncAt: traktAuth.lastAutoSyncAt,
                    lastImportedAt: traktAuth.lastImportedAt
                })
            };
        }

        // Disconnect Trakt
        if (action === 'trakt-disconnect' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);

            // Revoke token on Trakt side
            if (user.traktAuth?.accessToken) {
                const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
                const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;

                await fetch('https://api.trakt.tv/oauth/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: user.traktAuth.accessToken,
                        client_id: TRAKT_CLIENT_ID,
                        client_secret: TRAKT_CLIENT_SECRET
                    })
                }).catch(() => { }); // Ignore revoke errors
            }

            delete user.traktAuth;
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Sync to Trakt (push watch history)
        if (action === 'trakt-sync-history' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            if (!user.traktAuth?.accessToken) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not connected to Trakt' }) };
            }

            const { items } = JSON.parse(event.body); // [{ type: 'movie'|'episode', tmdbId, watchedAt, season?, episode? }]
            if (!items || !items.length) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No items to sync' }) };
            }

            const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

            // Format items for Trakt API
            const movies = items.filter(i => i.type === 'movie').map(i => ({
                watched_at: i.watchedAt,
                ids: { tmdb: i.tmdbId }
            }));

            const episodes = items.filter(i => i.type === 'episode').map(i => ({
                watched_at: i.watchedAt,
                ids: { tmdb: i.showTmdbId },
                seasons: [{ number: i.season, episodes: [{ number: i.episode }] }]
            }));

            // Sync movies
            if (movies.length) {
                await fetch('https://api.trakt.tv/sync/history', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                        'trakt-api-version': '2',
                        'trakt-api-key': TRAKT_CLIENT_ID
                    },
                    body: JSON.stringify({ movies })
                });
            }

            // Sync episodes (need to restructure for Trakt's format)
            if (episodes.length) {
                // Group by show
                const showsMap = {};
                items.filter(i => i.type === 'episode').forEach(i => {
                    if (!showsMap[i.showTmdbId]) {
                        showsMap[i.showTmdbId] = { ids: { tmdb: i.showTmdbId }, seasons: {} };
                    }
                    if (!showsMap[i.showTmdbId].seasons[i.season]) {
                        showsMap[i.showTmdbId].seasons[i.season] = [];
                    }
                    showsMap[i.showTmdbId].seasons[i.season].push({
                        number: i.episode,
                        watched_at: i.watchedAt
                    });
                });

                const shows = Object.values(showsMap).map(show => ({
                    ids: show.ids,
                    seasons: Object.entries(show.seasons).map(([num, eps]) => ({
                        number: parseInt(num),
                        episodes: eps
                    }))
                }));

                await fetch('https://api.trakt.tv/sync/history', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                        'trakt-api-version': '2',
                        'trakt-api-key': TRAKT_CLIENT_ID
                    },
                    body: JSON.stringify({ shows })
                });
            }

            // Update last synced time
            user.traktAuth.lastSyncedAt = new Date().toISOString();
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, synced: items.length }) };
        }

        // Sync rating to Trakt
        if (action === 'trakt-sync-rating' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            if (!user.traktAuth?.accessToken) {
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ skipped: true, reason: 'Not connected to Trakt' }) };
            }

            const { type, tmdbId, rating } = JSON.parse(event.body);
            const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

            const payload = type === 'movie'
                ? { movies: [{ ids: { tmdb: tmdbId }, rating }] }
                : { shows: [{ ids: { tmdb: tmdbId }, rating }] };

            await fetch('https://api.trakt.tv/sync/ratings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                    'trakt-api-version': '2',
                    'trakt-api-key': TRAKT_CLIENT_ID
                },
                body: JSON.stringify(payload)
            });

            user.traktAuth.lastSyncedAt = new Date().toISOString();
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Remove from Trakt history (unwatch)
        if (action === 'trakt-unwatch' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            if (!user.traktAuth?.accessToken) {
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ skipped: true, reason: 'Not connected to Trakt' }) };
            }

            const { type, tmdbId, showTmdbId, season, episode } = requestBody;
            const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

            let payload;
            if (type === 'movie') {
                payload = { movies: [{ ids: { tmdb: tmdbId } }] };
            } else if (type === 'episode') {
                payload = {
                    shows: [{
                        ids: { tmdb: showTmdbId },
                        seasons: [{
                            number: season,
                            episodes: [{ number: episode }]
                        }]
                    }]
                };
            }

            await fetch('https://api.trakt.tv/sync/history/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                    'trakt-api-version': '2',
                    'trakt-api-key': TRAKT_CLIENT_ID
                },
                body: JSON.stringify(payload)
            });

            user.traktAuth.lastSyncedAt = new Date().toISOString();
            await store.setJSON(`user_${user.discordId}`, user);

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
        }

        // Import from Trakt (pull history)
        if (action === 'trakt-import' && method === 'GET') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            if (!user.traktAuth?.accessToken) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not connected to Trakt' }) };
            }

            const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                'trakt-api-version': '2',
                'trakt-api-key': TRAKT_CLIENT_ID
            };

            try {
                // Fetch watched movies, shows, ratings AND watchlist from Trakt
                const [moviesRes, showsRes, ratingsRes, watchlistRes] = await Promise.all([
                    fetch('https://api.trakt.tv/sync/watched/movies?extended=full', { headers }),
                    fetch('https://api.trakt.tv/sync/watched/shows?extended=full', { headers }),
                    fetch('https://api.trakt.tv/users/me/ratings?extended=full', { headers }),
                    fetch('https://api.trakt.tv/users/me/watchlist?extended=full', { headers })
                ]);

                const traktMovies = await moviesRes.json();
                const traktShows = await showsRes.json();
                const traktRatings = await ratingsRes.json();
                const traktWatchlist = await watchlistRes.json();

                // Process movies - check for conflicts
                const movieImports = [];
                for (const tm of traktMovies) {
                    const tmdbId = tm.movie?.ids?.tmdb;
                    if (!tmdbId) continue;

                    const existingWatch = user.watchedMovies?.find(m => m.id == tmdbId);
                    const traktWatchedAt = tm.last_watched_at;
                    const traktPlays = tm.plays || 1;

                    if (existingWatch) {
                        // Conflict - movie already in Cinetrack
                        const existingDates = Array.isArray(existingWatch.watchedAt)
                            ? existingWatch.watchedAt
                            : [existingWatch.watchedAt];

                        movieImports.push({
                            type: 'movie',
                            tmdbId,
                            title: tm.movie.title,
                            year: tm.movie.year,
                            traktWatchedAt,
                            traktPlays,
                            existingDates,
                            hasConflict: true,
                            isRewatch: traktPlays > 1 || existingDates.length > 0
                        });
                    } else {
                        // No conflict - new movie
                        movieImports.push({
                            type: 'movie',
                            tmdbId,
                            title: tm.movie.title,
                            year: tm.movie.year,
                            traktWatchedAt,
                            traktPlays,
                            hasConflict: false,
                            isRewatch: traktPlays > 1
                        });
                    }
                }

                // Process shows - check for conflicts
                const showImports = [];
                for (const ts of traktShows) {
                    const tmdbId = ts.show?.ids?.tmdb;
                    if (!tmdbId) continue;

                    const existingProgress = user.showProgress?.[tmdbId];
                    const existingEpisodes = existingProgress?.watchedEpisodes || [];

                    // Count total episodes from Trakt
                    let traktEpisodeCount = 0;
                    const traktEpisodes = [];
                    for (const season of ts.seasons || []) {
                        for (const ep of season.episodes || []) {
                            traktEpisodeCount++;
                            traktEpisodes.push({
                                season: season.number,
                                episode: ep.number,
                                watchedAt: ep.last_watched_at
                            });
                        }
                    }

                    const hasConflict = existingEpisodes.length > 0;

                    showImports.push({
                        type: 'show',
                        tmdbId,
                        title: ts.show.title,
                        year: ts.show.year,
                        traktEpisodeCount,
                        traktEpisodes,
                        existingEpisodeCount: existingEpisodes.length,
                        hasConflict,
                        traktLastWatched: ts.last_watched_at
                    });
                }

                // Process ratings from Trakt
                const ratingImports = [];
                for (const tr of (Array.isArray(traktRatings) ? traktRatings : [])) {
                    const tmdbId = tr.movie?.ids?.tmdb || tr.show?.ids?.tmdb;
                    const type = tr.movie ? 'movie' : 'show';
                    if (!tmdbId) continue;

                    const existingRating = user.ratings?.find(r => r.id == tmdbId && r.type === type);

                    ratingImports.push({
                        type,
                        tmdbId,
                        title: tr.movie?.title || tr.show?.title,
                        year: tr.movie?.year || tr.show?.year,
                        traktRating: tr.rating,
                        existingRating: existingRating?.rating || null,
                        hasConflict: !!existingRating,
                        ratedAt: tr.rated_at
                    });
                }

                // Process watchlist from Trakt
                const watchlistImports = [];
                user.watchlist = user.watchlist || [];
                for (const tw of (Array.isArray(traktWatchlist) ? traktWatchlist : [])) {
                    const traktType = tw.type;
                    const media = tw.movie || tw.show;
                    const tmdbId = media?.ids?.tmdb;
                    if (!tmdbId) continue;

                    const type = traktType === 'movie' ? 'movie' : 'show';
                    const existsInWatchlist = user.watchlist.some(w => w.id == tmdbId && w.type === type);

                    if (!existsInWatchlist) {
                        watchlistImports.push({
                            type,
                            tmdbId,
                            title: media.title,
                            year: media.year,
                            addedAt: tw.listed_at
                        });
                    }
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        movies: movieImports,
                        shows: showImports,
                        ratings: ratingImports,
                        watchlist: watchlistImports,
                        summary: {
                            totalMovies: movieImports.length,
                            conflictMovies: movieImports.filter(m => m.hasConflict).length,
                            totalShows: showImports.length,
                            conflictShows: showImports.filter(s => s.hasConflict).length,
                            totalRatings: ratingImports.length,
                            conflictRatings: ratingImports.filter(r => r.hasConflict).length,
                            totalWatchlist: watchlistImports.length
                        }
                    })
                };
            } catch (err) {
                console.error('Trakt import error:', err);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to fetch from Trakt' }) };
            }
        }

        // Apply Trakt import (actually save the data)
        if (action === 'trakt-import-apply' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            const { movies, shows, ratings, conflictResolution } = requestBody;
            // conflictResolution: 'keep_existing' | 'use_trakt' | 'merge_rewatches'

            let moviesAdded = 0, moviesUpdated = 0;
            let episodesAdded = 0;

            // Initialize arrays if needed
            user.watchedMovies = user.watchedMovies || [];
            user.showProgress = user.showProgress || {};
            user.recentlyWatched = user.recentlyWatched || [];

            // Process ALL movies - skip poster fetching for speed
            for (const movie of (movies || [])) {
                const existingIdx = user.watchedMovies.findIndex(m => m.id == movie.tmdbId);

                if (existingIdx === -1) {
                    const watchedAt = movie.traktWatchedAt || new Date().toISOString();

                    // New movie - add it
                    const movieEntry = {
                        id: movie.tmdbId,
                        type: 'movie',
                        title: movie.title,
                        poster: null, // Skip poster for speed
                        year: movie.year,
                        watchedAt: movie.isRewatch && movie.traktPlays > 1
                            ? Array(movie.traktPlays).fill(watchedAt)
                            : watchedAt,
                        importedFromTrakt: true
                    };

                    user.watchedMovies.push(movieEntry);
                    moviesAdded++;
                } else if (movie.hasConflict) {
                    // Handle conflict based on resolution strategy
                    if (conflictResolution === 'use_trakt') {
                        user.watchedMovies[existingIdx].watchedAt = movie.traktWatchedAt;
                        moviesUpdated++;
                    } else if (conflictResolution === 'merge_rewatches') {
                        const existing = user.watchedMovies[existingIdx];
                        const existingDates = Array.isArray(existing.watchedAt)
                            ? existing.watchedAt
                            : [existing.watchedAt];
                        const traktDate = movie.traktWatchedAt;

                        // Add Trakt date if not already present (within a day)
                        const isDuplicate = existingDates.some(d => {
                            const diff = Math.abs(new Date(d) - new Date(traktDate));
                            return diff < 86400000; // 24 hours
                        });

                        if (!isDuplicate) {
                            existingDates.push(traktDate);
                            user.watchedMovies[existingIdx].watchedAt = existingDates;
                            moviesUpdated++;
                        }
                    }
                    // 'keep_existing' - do nothing
                }
            }

            // Add most recent movies to recentlyWatched
            const recentMovies = user.watchedMovies
                .filter(m => m.importedFromTrakt)
                .sort((a, b) => {
                    const aDate = Array.isArray(a.watchedAt) ? a.watchedAt[a.watchedAt.length - 1] : a.watchedAt;
                    const bDate = Array.isArray(b.watchedAt) ? b.watchedAt[b.watchedAt.length - 1] : b.watchedAt;
                    return new Date(bDate || 0) - new Date(aDate || 0);
                })
                .slice(0, 10);
            for (const m of recentMovies) {
                if (!user.recentlyWatched.some(r => r.id === m.id && r.type === 'movie')) {
                    user.recentlyWatched.unshift({ ...m, watchedAt: Array.isArray(m.watchedAt) ? m.watchedAt[m.watchedAt.length - 1] : m.watchedAt });
                }
            }
            user.recentlyWatched = user.recentlyWatched.slice(0, 20);

            // Process ALL shows - skip poster fetching for speed
            let showsAdded = 0;
            const recentEpisodes = []; // Track recent episodes for recentlyWatched
            for (const show of (shows || [])) {
                if (!user.showProgress[show.tmdbId]) {
                    user.showProgress[show.tmdbId] = {
                        id: show.tmdbId,
                        title: show.title,
                        poster: null, // Skip poster for speed
                        year: show.year,
                        watchedEpisodes: [],
                        startedAt: new Date().toISOString(),
                        importedFromTrakt: true
                    };
                    showsAdded++;
                }
                const showProgress = user.showProgress[show.tmdbId];

                for (const ep of show.traktEpisodes || []) {
                    const epKey = `S${ep.season}E${ep.episode}`;
                    const hasEpisode = showProgress.watchedEpisodes.includes(epKey) ||
                        showProgress.watchedEpisodes.some(e =>
                            typeof e === 'object' && e.season == ep.season && e.episode == ep.episode
                        );

                    if (!hasEpisode) {
                        // Store as string format like the rest of the app
                        showProgress.watchedEpisodes.push(epKey);
                        episodesAdded++;

                        // Track for recently watched (keep most recent)
                        if (ep.watchedAt) {
                            recentEpisodes.push({
                                type: 'episode',
                                id: show.tmdbId,
                                showId: show.tmdbId,
                                title: show.title,
                                episode: epKey,
                                poster: null,
                                watchedAt: ep.watchedAt,
                                importedFromTrakt: true
                            });
                        }
                    } else if (conflictResolution === 'use_trakt') {
                        // Update date if using trakt dates
                    }
                }

                showProgress.lastWatchedAt = show.traktLastWatched || showProgress.lastWatchedAt;
            }

            // Add most recent episodes to recentlyWatched
            recentEpisodes.sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0));
            for (const ep of recentEpisodes.slice(0, 10)) {
                if (!user.recentlyWatched.some(r => r.id === ep.id && r.type === 'episode' && r.episode === ep.episode)) {
                    user.recentlyWatched.push(ep);
                }
            }
            // Sort recentlyWatched by date and limit
            user.recentlyWatched.sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0));
            user.recentlyWatched = user.recentlyWatched.slice(0, 30);

            // Process ALL ratings - skip poster fetching for speed
            let ratingsAdded = 0;
            user.ratings = user.ratings || [];
            for (const rating of (ratings || [])) {
                const existingIdx = user.ratings.findIndex(r => r.id == rating.tmdbId && r.type === rating.type);

                if (existingIdx === -1) {
                    // New rating
                    user.ratings.push({
                        id: rating.tmdbId,
                        type: rating.type,
                        title: rating.title,
                        poster: null, // Skip poster for speed
                        year: rating.year,
                        rating: rating.traktRating,
                        ratedAt: rating.ratedAt || new Date().toISOString(),
                        importedFromTrakt: true
                    });
                    ratingsAdded++;
                } else if (rating.hasConflict && conflictResolution === 'use_trakt') {
                    user.ratings[existingIdx].rating = rating.traktRating;
                    user.ratings[existingIdx].ratedAt = rating.ratedAt || new Date().toISOString();
                    ratingsAdded++;
                }
            }

            // Process watchlist - add new items
            let watchlistAdded = 0;
            user.watchlist = user.watchlist || [];
            const { watchlist } = requestBody;
            for (const item of (watchlist || [])) {
                const type = item.type === 'movie' ? 'movie' : 'show';

                // Skip if already in watchlist
                if (user.watchlist.some(w => w.id == item.tmdbId && w.type === type)) continue;

                user.watchlist.push({
                    id: item.tmdbId,
                    type,
                    title: item.title,
                    poster: null, // Skip poster for speed - will be fetched on view
                    year: item.year,
                    addedAt: item.addedAt || new Date().toISOString(),
                    importedFromTrakt: true
                });
                watchlistAdded++;
            }

            // Update stats
            user.stats = user.stats || { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 };
            user.stats.moviesWatched = user.watchedMovies.length;
            user.stats.showsWatched = Object.keys(user.showProgress || {}).length;
            user.stats.episodesWatched = Object.values(user.showProgress || {})
                .reduce((sum, s) => sum + (s.watchedEpisodes?.length || 0), 0);

            // Track last import time
            if (user.traktAuth) {
                user.traktAuth.lastImportedAt = new Date().toISOString();
            }

            await store.setJSON(`user_${user.discordId}`, user);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    moviesAdded,
                    moviesUpdated,
                    showsAdded,
                    episodesAdded,
                    ratingsAdded,
                    watchlistAdded
                })
            };
        }

        // Auto-sync from Trakt (incremental - only imports NEW items since last sync)
        if (action === 'trakt-auto-sync' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            if (!user.traktAuth?.accessToken) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not connected to Trakt' }) };
            }

            const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
            const traktHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.traktAuth.accessToken}`,
                'trakt-api-version': '2',
                'trakt-api-key': TRAKT_CLIENT_ID
            };

            try {
                // Fetch all data from Trakt including watchlist
                const [moviesRes, showsRes, ratingsRes, watchlistRes] = await Promise.all([
                    fetch('https://api.trakt.tv/sync/watched/movies?extended=full', { headers: traktHeaders }),
                    fetch('https://api.trakt.tv/sync/watched/shows?extended=full', { headers: traktHeaders }),
                    fetch('https://api.trakt.tv/users/me/ratings?extended=full', { headers: traktHeaders }),
                    fetch('https://api.trakt.tv/users/me/watchlist?extended=full', { headers: traktHeaders })
                ]);

                const traktMovies = await moviesRes.json();
                const traktShows = await showsRes.json();
                const traktRatings = await ratingsRes.json();
                const traktWatchlist = await watchlistRes.json();

                // Debug logging
                console.log('Trakt sync - Watchlist response:', {
                    isArray: Array.isArray(traktWatchlist),
                    length: Array.isArray(traktWatchlist) ? traktWatchlist.length : 'not array',
                    sample: Array.isArray(traktWatchlist) && traktWatchlist.length > 0 ? traktWatchlist[0] : null
                });

                let moviesAdded = 0, episodesAdded = 0, ratingsAdded = 0, watchlistAdded = 0;

                // Initialize user data
                user.watchedMovies = user.watchedMovies || [];
                user.showProgress = user.showProgress || {};
                user.ratings = user.ratings || [];
                user.watchlist = user.watchlist || [];
                user.recentlyWatched = user.recentlyWatched || [];
                user.stats = user.stats || { moviesWatched: 0, episodesWatched: 0 };

                // Helper to fetch TMDB poster (skipped during bulk import for speed)
                const getPoster = async (tmdbId, type) => {
                    try {
                        const data = await tmdbFetch(`/${type}/${tmdbId}`);
                        return data.poster_path || null;
                    } catch {
                        return null;
                    }
                };

                // Process ALL movies - skip poster fetching for speed
                for (const tm of (Array.isArray(traktMovies) ? traktMovies : [])) {
                    const tmdbId = tm.movie?.ids?.tmdb;
                    if (!tmdbId) continue;

                    // Skip if already exists (don't overwrite)
                    if (user.watchedMovies.some(m => m.id == tmdbId)) continue;

                    const watchedAt = tm.last_watched_at || new Date().toISOString();

                    const movieEntry = {
                        id: tmdbId,
                        type: 'movie',
                        title: tm.movie.title,
                        poster: null, // Skip poster for speed - can be fetched later
                        year: tm.movie.year,
                        watchedAt,
                        importedFromTrakt: true
                    };

                    user.watchedMovies.push(movieEntry);
                    moviesAdded++;
                }

                // Add most recent movies to recentlyWatched
                const recentMovies = user.watchedMovies
                    .filter(m => m.importedFromTrakt)
                    .sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0))
                    .slice(0, 10);
                for (const m of recentMovies) {
                    if (!user.recentlyWatched.some(r => r.id === m.id && r.type === 'movie')) {
                        user.recentlyWatched.unshift({ ...m });
                    }
                }
                user.recentlyWatched = user.recentlyWatched.slice(0, 20);

                // Process ALL shows - skip poster fetching for speed
                let showsAdded = 0;
                const recentEpisodes = []; // Track recent episodes for recentlyWatched
                for (const ts of (Array.isArray(traktShows) ? traktShows : [])) {
                    const tmdbId = ts.show?.ids?.tmdb;
                    if (!tmdbId) continue;

                    if (!user.showProgress[tmdbId]) {
                        user.showProgress[tmdbId] = {
                            id: tmdbId,
                            title: ts.show.title,
                            poster: null, // Skip poster for speed
                            year: ts.show.year,
                            watchedEpisodes: [],
                            startedAt: new Date().toISOString(),
                            importedFromTrakt: true
                        };
                        showsAdded++;
                    }

                    const showProgress = user.showProgress[tmdbId];

                    for (const season of ts.seasons || []) {
                        for (const ep of season.episodes || []) {
                            const epKey = `S${season.number}E${ep.number}`;
                            if (!showProgress.watchedEpisodes.includes(epKey)) {
                                showProgress.watchedEpisodes.push(epKey);
                                episodesAdded++;

                                // Track for recently watched (with timestamp)
                                if (ep.last_watched_at) {
                                    recentEpisodes.push({
                                        type: 'episode',
                                        id: tmdbId,
                                        showId: tmdbId,
                                        title: ts.show.title,
                                        episode: epKey,
                                        poster: null,
                                        watchedAt: ep.last_watched_at,
                                        importedFromTrakt: true
                                    });
                                }
                            }
                        }
                    }

                    showProgress.lastWatchedAt = ts.last_watched_at || showProgress.lastWatchedAt;
                }

                // Add most recent episodes to recentlyWatched
                recentEpisodes.sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0));
                for (const ep of recentEpisodes.slice(0, 10)) {
                    if (!user.recentlyWatched.some(r => r.id === ep.id && r.type === 'episode' && r.episode === ep.episode)) {
                        user.recentlyWatched.push(ep);
                    }
                }
                // Sort recentlyWatched and limit
                user.recentlyWatched.sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0));
                user.recentlyWatched = user.recentlyWatched.slice(0, 30);

                // Process ALL ratings - skip poster fetching for speed
                for (const tr of (Array.isArray(traktRatings) ? traktRatings : [])) {
                    const tmdbId = tr.movie?.ids?.tmdb || tr.show?.ids?.tmdb;
                    const type = tr.movie ? 'movie' : 'show';
                    if (!tmdbId) continue;

                    // Skip if already rated
                    if (user.ratings.some(r => r.id == tmdbId && r.type === type)) continue;

                    user.ratings.push({
                        id: tmdbId,
                        type,
                        title: tr.movie?.title || tr.show?.title,
                        poster: null, // Skip poster for speed
                        year: tr.movie?.year || tr.show?.year,
                        rating: tr.rating,
                        ratedAt: tr.rated_at || new Date().toISOString(),
                        importedFromTrakt: true
                    });
                    ratingsAdded++;
                }

                // Process ALL watchlist items - skip poster fetching for speed
                // Trakt watchlist format: { type: "movie"|"show", movie: {...} | show: {...}, listed_at: "..." }
                console.log('Processing watchlist, total items:', Array.isArray(traktWatchlist) ? traktWatchlist.length : 0);
                for (const tw of (Array.isArray(traktWatchlist) ? traktWatchlist : [])) {
                    // Trakt uses 'type' field at root level
                    const traktType = tw.type; // "movie" or "show"
                    const media = tw.movie || tw.show;
                    const tmdbId = media?.ids?.tmdb;

                    if (!tmdbId) {
                        console.log('Watchlist item skipped - no TMDB ID:', JSON.stringify(tw).slice(0, 200));
                        continue;
                    }

                    const type = traktType === 'movie' ? 'movie' : 'show';

                    // Skip if already in watchlist
                    if (user.watchlist.some(w => w.id == tmdbId && w.type === type)) continue;

                    user.watchlist.push({
                        id: tmdbId,
                        type,
                        title: media.title,
                        poster: null, // Skip poster for speed
                        addedAt: tw.listed_at || new Date().toISOString(),
                        year: media.year,
                        importedFromTrakt: true
                    });
                    watchlistAdded++;
                    console.log('Watchlist item added:', { id: tmdbId, title: media.title, type });
                }

                // Update stats
                user.stats.moviesWatched = user.watchedMovies.length;
                user.stats.showsWatched = Object.keys(user.showProgress || {}).length;
                user.stats.episodesWatched = Object.values(user.showProgress || {})
                    .reduce((sum, s) => sum + (s.watchedEpisodes?.length || 0), 0);

                // Update sync time
                user.traktAuth.lastImportedAt = new Date().toISOString();
                user.traktAuth.lastAutoSyncAt = new Date().toISOString();

                await store.setJSON(`user_${user.discordId}`, user);

                console.log('Trakt sync complete:', { moviesAdded, showsAdded, episodesAdded, ratingsAdded, watchlistAdded });

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        moviesAdded,
                        showsAdded,
                        episodesAdded,
                        ratingsAdded,
                        watchlistAdded,
                        lastSync: user.traktAuth.lastAutoSyncAt
                    })
                };
            } catch (err) {
                console.error('Trakt auto-sync error:', err);
                return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Auto-sync failed' }) };
            }
        }

        // Fetch missing posters for ALL items (movies, shows, ratings, watchlist)
        if (action === 'fetch-missing-posters' && method === 'POST') {
            const session = await getSession(event, store);
            if (!session) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not logged in' }) };

            const user = await getAuthenticatedUser(event, store);
            if (!user) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not authenticated' }) };

            let postersAdded = 0;
            const MAX_FETCH = 50; // Limit to avoid timeout

            // Helper function
            const fetchPoster = async (id, type) => {
                try {
                    const data = await tmdbFetch(`/${type}/${id}`);
                    return data.poster_path || null;
                } catch { return null; }
            };

            // Fetch posters for movies without posters
            user.watchedMovies = user.watchedMovies || [];
            for (const item of user.watchedMovies) {
                if (postersAdded >= MAX_FETCH) break;
                if (!item.poster && item.id) {
                    const poster = await fetchPoster(item.id, 'movie');
                    if (poster) { item.poster = poster; postersAdded++; }
                }
            }

            // Fetch posters for shows without posters
            user.showProgress = user.showProgress || {};
            for (const showId of Object.keys(user.showProgress)) {
                if (postersAdded >= MAX_FETCH) break;
                const show = user.showProgress[showId];
                if (!show.poster && show.id) {
                    const poster = await fetchPoster(show.id, 'tv');
                    if (poster) { show.poster = poster; postersAdded++; }
                }
            }

            // Fetch posters for ratings without posters
            user.ratings = user.ratings || [];
            for (const item of user.ratings) {
                if (postersAdded >= MAX_FETCH) break;
                if (!item.poster && item.id) {
                    const type = item.type === 'movie' ? 'movie' : 'tv';
                    const poster = await fetchPoster(item.id, type);
                    if (poster) { item.poster = poster; postersAdded++; }
                }
            }

            // Fetch posters for watchlist without posters
            user.watchlist = user.watchlist || [];
            for (const item of user.watchlist) {
                if (postersAdded >= MAX_FETCH) break;
                if (!item.poster && item.id) {
                    const type = item.type === 'movie' ? 'movie' : 'tv';
                    const poster = await fetchPoster(item.id, type);
                    if (poster) { item.poster = poster; postersAdded++; }
                }
            }

            // Update recentlyWatched with current poster data
            user.recentlyWatched = user.recentlyWatched || [];
            for (const item of user.recentlyWatched) {
                if (item.type === 'movie') {
                    const movie = user.watchedMovies.find(m => m.id == item.id);
                    if (movie?.poster) item.poster = movie.poster;
                } else if (item.type === 'episode') {
                    const show = user.showProgress[item.showId || item.id];
                    if (show?.poster) item.poster = show.poster;
                }
            }

            if (postersAdded > 0) {
                await store.setJSON(`user_${user.discordId}`, user);
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    postersAdded,
                    remaining: {
                        movies: user.watchedMovies.filter(m => !m.poster).length,
                        shows: Object.values(user.showProgress).filter(s => !s.poster).length,
                        ratings: user.ratings.filter(r => !r.poster).length,
                        watchlist: user.watchlist.filter(w => !w.poster).length
                    }
                })
            };
        }

        // Unknown action
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unknown action' }) };

    } catch (error) {
        console.error('Cinetrack API error:', error);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};





