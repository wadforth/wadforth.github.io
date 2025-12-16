/**
 * RAWG API Proxy
 * Proxies requests to RAWG API to avoid CORS issues
 */

// Use environment variable or fallback key
const RAWG_API_KEY = process.env.RAWG_API_KEY || 'a34ab5b2b4e347f4942d6ca3d9e3d77f';
const RAWG_BASE = 'https://api.rawg.io/api';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const params = event.queryStringParameters || {};
    const endpoint = params.endpoint;

    if (!endpoint) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing endpoint parameter' })
        };
    }

    try {
        let url = '';

        switch (endpoint) {
            case 'games':
                // List games with filters
                url = `${RAWG_BASE}/games?key=${RAWG_API_KEY}`;
                if (params.search) url += `&search=${encodeURIComponent(params.search)}`;
                if (params.dates) url += `&dates=${params.dates}`;
                if (params.ordering) url += `&ordering=${params.ordering}`;
                if (params.page_size) url += `&page_size=${params.page_size}`;
                if (params.genres) url += `&genres=${params.genres}`;
                break;

            case 'game':
                // Single game details
                if (!params.id) throw new Error('Missing game id');
                url = `${RAWG_BASE}/games/${params.id}?key=${RAWG_API_KEY}`;
                break;

            case 'suggested':
                // Get suggested games for a game
                if (!params.id) throw new Error('Missing game id');
                url = `${RAWG_BASE}/games/${params.id}/suggested?key=${RAWG_API_KEY}`;
                if (params.page_size) url += `&page_size=${params.page_size}`;
                break;

            case 'upcoming':
                // Get upcoming releases
                const today = new Date().toISOString().split('T')[0];
                const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                url = `${RAWG_BASE}/games?key=${RAWG_API_KEY}&dates=${today},${future}&ordering=released&page_size=${params.page_size || 20}`;
                break;

            default:
                throw new Error('Unknown endpoint: ' + endpoint);
        }

        const res = await fetch(url);

        if (!res.ok) {
            const errorText = await res.text();
            console.error('RAWG API error:', res.status, errorText);
            return {
                statusCode: res.status,
                headers,
                body: JSON.stringify({ error: 'RAWG API error', status: res.status })
            };
        }

        const data = await res.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (e) {
        console.error('RAWG Proxy error:', e);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: e.message })
        };
    }
};
