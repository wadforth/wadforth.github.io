const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Discord OAuth - Initiates login flow
 * Redirects user to Discord authorization page
 */

exports.handler = async (event, context) => {
    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!clientId) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Discord not configured' })
        };
    }

    // Determine redirect URI based on environment
    const host = event.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/.netlify/functions/discord-callback`;

    // Discord OAuth2 URL
    const scope = 'identify';
    const authUrl = `https://discord.com/api/oauth2/authorize?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${scope}`;

    return {
        statusCode: 302,
        headers: {
            Location: authUrl,
            'Cache-Control': 'no-cache'
        },
        body: ''
    };
};
