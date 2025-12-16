const { getStore, connectLambda } = require("@netlify/blobs");

// CORS headers
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Validate auth token (same as blog-api)
async function validateToken(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        connectLambda(event);
        const store = getStore('blog-auth');
        const tokenData = await store.get(`token_${token}`, { type: 'json' });

        if (!tokenData) return false;
        if (Date.now() > tokenData.expiresAt) return false;

        return true;
    } catch (e) {
        console.error('Token validation error:', e);
        return false;
    }
}

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    const params = event.queryStringParameters || {};
    const action = params.action;

    try {
        // Connect to Netlify Blobs
        connectLambda(event);
        const store = getStore('announcements');

        // === LIST ANNOUNCEMENTS (public) ===
        if (action === 'list') {
            const announcements = await store.get('announcements', { type: 'json' }) || [];
            // For public, only return active announcements
            const isAdmin = await validateToken(event);

            const filtered = isAdmin ? announcements : announcements.filter(a => a.active);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ announcements: filtered })
            };
        }

        // === AUTH CHECK for admin actions ===
        if (!await validateToken(event)) {
            return {
                statusCode: 401,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        // === CREATE ANNOUNCEMENT ===
        if (action === 'create' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { message, type = 'info', link, linkText, dismissible = true } = body;

            if (!message) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Message is required' })
                };
            }

            const announcements = await store.get('announcements', { type: 'json' }) || [];
            const newAnnouncement = {
                id: `ann_${Date.now()}`,
                message,
                type, // info, success, warning, alert
                link,
                linkText,
                dismissible,
                active: true,
                createdAt: new Date().toISOString()
            };

            announcements.unshift(newAnnouncement);
            await store.setJSON('announcements', announcements);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, announcement: newAnnouncement })
            };
        }

        // === UPDATE ANNOUNCEMENT ===
        if (action === 'update' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { id, message, type, link, linkText, dismissible, active } = body;

            if (!id) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'ID is required' })
                };
            }

            const announcements = await store.get('announcements', { type: 'json' }) || [];
            const index = announcements.findIndex(a => a.id === id);

            if (index === -1) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Announcement not found' })
                };
            }

            if (message !== undefined) announcements[index].message = message;
            if (type !== undefined) announcements[index].type = type;
            if (link !== undefined) announcements[index].link = link;
            if (linkText !== undefined) announcements[index].linkText = linkText;
            if (dismissible !== undefined) announcements[index].dismissible = dismissible;
            if (active !== undefined) announcements[index].active = active;
            announcements[index].updatedAt = new Date().toISOString();

            await store.setJSON('announcements', announcements);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, announcement: announcements[index] })
            };
        }

        // === DELETE ANNOUNCEMENT ===
        if (action === 'delete' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { id } = body;

            if (!id) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'ID is required' })
                };
            }

            let announcements = await store.get('announcements', { type: 'json' }) || [];
            announcements = announcements.filter(a => a.id !== id);
            await store.setJSON('announcements', announcements);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true })
            };
        }

        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid action' })
        };

    } catch (error) {
        console.error('Announcements API error:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Server error' })
        };
    }
};
