const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

/**
 * Cinetrack Discord OAuth Callback
 * Exchanges code for token, gets user info, creates session
 */

exports.handler = async (event, context) => {
    const { code } = event.queryStringParameters || {};

    if (!code) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No code provided' })
        };
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Discord not configured' })
        };
    }

    // Determine redirect URI
    const host = event.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/.netlify/functions/cinetrack-auth`;
    const baseUrl = `${protocol}://${host}`;

    try {
        // Exchange code for access token
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
            })
        });

        if (!tokenRes.ok) {
            console.error('Token exchange failed:', await tokenRes.text());
            return {
                statusCode: 302,
                headers: { Location: `${baseUrl}/cinetrack/?error=auth_failed` },
                body: ''
            };
        }

        const tokens = await tokenRes.json();

        // Get user info from Discord
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });

        if (!userRes.ok) {
            return {
                statusCode: 302,
                headers: { Location: `${baseUrl}/cinetrack/?error=user_fetch_failed` },
                body: ''
            };
        }

        const discordUser = await userRes.json();

        // Connect to Blobs
        connectLambda(event);
        const store = getStore('cinetrack');

        // Check if user already exists
        let user = await store.get(`user_${discordUser.id}`, { type: 'json' });

        if (!user) {
            // Create new user
            user = {
                discordId: discordUser.id,
                username: null, // Will be set during onboarding
                displayName: discordUser.global_name || discordUser.username,
                avatar: discordUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`,
                watchedMovies: [],
                showProgress: {},
                watchlist: [],
                favorites: [],
                ratings: [],
                recentlyWatched: [],
                stats: { moviesWatched: 0, showsWatched: 0, episodesWatched: 0 },
                createdAt: new Date().toISOString()
            };
            await store.setJSON(`user_${discordUser.id}`, user);
        } else {
            // Update avatar/name in case they changed
            user.displayName = discordUser.global_name || discordUser.username;
            user.avatar = discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`;
            await store.setJSON(`user_${discordUser.id}`, user);
        }

        // Create session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const session = {
            discordId: discordUser.id,
            createdAt: Date.now(),
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        };
        await store.setJSON(`session_${sessionToken}`, session);

        // Redirect - if no username, go to onboarding, else go to dashboard
        const redirectTo = user.username
            ? `${baseUrl}/cinetrack/dashboard`
            : `${baseUrl}/cinetrack/?setup=true`;

        return {
            statusCode: 302,
            headers: {
                Location: redirectTo,
                'Set-Cookie': `cinetrack_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${protocol === 'https' ? '; Secure' : ''}`,
                'Cache-Control': 'no-cache'
            },
            body: ''
        };

    } catch (error) {
        console.error('Cinetrack auth error:', error);
        return {
            statusCode: 302,
            headers: { Location: `${baseUrl}/cinetrack/?error=server_error` },
            body: ''
        };
    }
};
