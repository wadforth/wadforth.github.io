const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Penta Cache API
 * Stores and retrieves penta kill history per summoner (puuid)
 * 
 * GET /penta-cache?puuid={puuid}
 *   Returns cached penta data for summoner
 * 
 * POST /penta-cache?puuid={puuid}
 *   Body: { pentas: {...}, total: number, scanned: number }
 *   Stores penta data for summoner
 */

exports.handler = async function (event, context) {
    const { puuid } = event.queryStringParameters || {};

    if (!puuid) {
        return {
            statusCode: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Missing 'puuid' parameter" })
        };
    }

    // Connect Lambda environment for Blobs
    connectLambda(event);
    const store = getStore('penta-cache');
    const cacheKey = `penta_${puuid}`;

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: ""
        };
    }

    // GET - Retrieve penta data
    if (event.httpMethod === 'GET') {
        try {
            const cached = await store.get(cacheKey, { type: 'json' });

            if (cached) {
                return {
                    statusCode: 200,
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        found: true,
                        ...cached
                    })
                };
            }

            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ found: false })
            };
        } catch (e) {
            console.error('[Penta Cache GET Error]', e);
            return {
                statusCode: 500,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Cache read failed" })
            };
        }
    }

    // POST - Store penta data
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);

            if (!body.pentas || typeof body.total !== 'number') {
                return {
                    statusCode: 400,
                    headers: { "Access-Control-Allow-Origin": "*" },
                    body: JSON.stringify({ error: "Invalid body. Expected { pentas, total, scanned }" })
                };
            }

            const dataToStore = {
                pentas: body.pentas,
                total: body.total,
                scanned: body.scanned || 0,
                timestamp: Date.now()
            };

            await store.setJSON(cacheKey, dataToStore);
            console.log(`[Penta Cache SAVE] ${cacheKey}`);

            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ success: true, saved: dataToStore })
            };
        } catch (e) {
            console.error('[Penta Cache POST Error]', e);
            return {
                statusCode: 500,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Cache write failed" })
            };
        }
    }

    return {
        statusCode: 405,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Method not allowed" })
    };
};
