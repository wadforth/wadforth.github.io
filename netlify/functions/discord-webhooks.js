const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

/**
 * Discord Webhooks API
 * 
 * Endpoints:
 *   POST ?action=register - Register a new webhook
 *   POST ?action=delete - Delete a webhook
 *   POST ?action=test - Send test with real latest game
 *   POST ?action=pause - Pause notifications
 *   POST ?action=resume - Resume notifications
 *   POST ?action=update - Update settings (platforms, etc.)
 *   GET ?action=status&key=xxx - Check webhook status
 */

const SITE_URL = 'https://kierxn.netlify.app/free-games/';
const GAMERPOWER_API = 'https://www.gamerpower.com/api/giveaways?platform=pc';

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
};

// Platform mappings for embed colors
const PLATFORM_MAP = {
    'steam': { name: 'Steam', color: 0x1b2838, emoji: '🎮' },
    'epic': { name: 'Epic Games', color: 0x0078f2, emoji: '🎁' },
    'gog': { name: 'GOG', color: 0x8a2be2, emoji: '🌌' },
    'ubisoft': { name: 'Ubisoft', color: 0x0070c9, emoji: '🎯' },
    'pc': { name: 'PC', color: 0x5865F2, emoji: '💻' }
};

function detectPlatform(platformStr) {
    const lower = platformStr.toLowerCase();
    if (lower.includes('steam')) return 'steam';
    if (lower.includes('epic')) return 'epic';
    if (lower.includes('gog')) return 'gog';
    if (lower.includes('ubisoft')) return 'ubisoft';
    return 'pc';
}

// Generate secure 32-character key
function generateSecretKey() {
    return crypto.randomBytes(24).toString('base64url');
}

// Validate Discord webhook URL
function isValidWebhookUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'discord.com' &&
            parsed.pathname.includes('/api/webhooks/');
    } catch {
        return false;
    }
}

// Calculate time remaining
function getTimeRemaining(endDate) {
    if (!endDate || endDate === 'N/A') return null;

    const end = new Date(endDate);
    const now = new Date();
    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
}

// Send Discord message with improved embed
async function sendDiscordMessage(webhookUrl, embed, content = null) {
    const payload = {
        username: '🎮 Free Games',
        avatar_url: 'https://kierxn.netlify.app/favicon.png',
        embeds: [embed]
    };

    if (content) payload.content = content;

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return response.ok;
}

// Create a beautiful game embed with large image
function createGameEmbed(game, isTest = false) {
    const platform = detectPlatform(game.platforms);
    const platformInfo = PLATFORM_MAP[platform] || PLATFORM_MAP['pc'];
    const timeRemaining = getTimeRemaining(game.end_date);

    // Format worth nicely
    const worthDisplay = game.worth === 'N/A' || !game.worth
        ? '**FREE** 🎉'
        : `~~${game.worth}~~ → **FREE**`;

    // Build description with claim link
    let description = '';
    if (game.description) {
        description = game.description.substring(0, 150);
        if (game.description.length > 150) description += '...';
        description += '\n\n';
    }
    description += `**[🎁 Claim Now →](${game.open_giveaway_url})**`;

    const embed = {
        title: `${platformInfo.emoji} ${game.title}`,
        url: game.open_giveaway_url,
        description: description,
        color: platformInfo.color,
        // Large image at bottom (full width)
        image: {
            url: game.image
        },
        fields: [
            {
                name: '💰 Value',
                value: worthDisplay,
                inline: true
            },
            {
                name: '🏪 Platform',
                value: platformInfo.name,
                inline: true
            }
        ],
        footer: {
            text: 'kierxn.netlify.app/free-games',
            icon_url: 'https://kierxn.netlify.app/favicon.png'
        },
        timestamp: new Date().toISOString()
    };

    // Add time remaining with urgency indicator
    if (timeRemaining) {
        const isUrgent = timeRemaining.includes('h remaining') && !timeRemaining.includes('d');
        embed.fields.push({
            name: isUrgent ? '⚠️ Ends Soon!' : '⏰ Ends',
            value: timeRemaining,
            inline: true
        });
    }

    // Add test indicator
    if (isTest) {
        embed.author = {
            name: '🧪 TEST — This is how notifications will look',
            icon_url: 'https://kierxn.netlify.app/favicon.png'
        };
        embed.footer.text = 'Test from kierxn.netlify.app/free-games';
    }

    return embed;
}

// Fetch latest game from API
async function fetchLatestGame() {
    try {
        const response = await fetch(GAMERPOWER_API);
        if (!response.ok) return null;

        const games = await response.json();
        // Filter to games only (no DLCs) and get the latest
        const latestGame = games.find(g => g.type === 'Game');
        return latestGame || games[0];
    } catch (e) {
        console.error('Failed to fetch games:', e);
        return null;
    }
}

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: "" };
    }

    const { action, key } = event.queryStringParameters || {};

    try {
        connectLambda(event);
        const store = getStore('discord-webhooks');

        // === REGISTER NEW WEBHOOK ===
        if (action === 'register' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { webhookUrl, platforms, gamesOnly = true } = body;

            if (!webhookUrl) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Webhook URL required" })
                };
            }

            if (!isValidWebhookUrl(webhookUrl)) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Invalid Discord webhook URL" })
                };
            }

            const secretKey = generateSecretKey();
            const webhookId = crypto.randomBytes(8).toString('hex');

            const webhookData = {
                id: webhookId,
                url: webhookUrl,
                secretKey: secretKey,
                platforms: platforms || ['epic', 'steam', 'gog', 'ubisoft'],
                gamesOnly: gamesOnly,
                active: true,
                paused: false,
                createdAt: new Date().toISOString(),
                lastPosted: null
            };

            await store.setJSON(`webhook_${secretKey}`, webhookData);

            const index = await store.get('_webhook_index', { type: 'json' }) || { webhooks: [] };
            index.webhooks.push({ secretKey, active: true });
            await store.setJSON('_webhook_index', index);

            // Improved welcome message
            await sendDiscordMessage(webhookUrl, {
                title: '✅ Notifications Enabled!',
                description: `You'll now receive alerts for new free PC games.\n\n[View all free games →](${SITE_URL})`,
                color: 0x00ff9d,
                fields: [
                    {
                        name: '🔑 Secret Key',
                        value: `\`\`\`${secretKey}\`\`\``,
                        inline: false
                    },
                    {
                        name: '📺 Platforms',
                        value: (platforms || ['epic', 'steam', 'gog', 'ubisoft']).map(p => PLATFORM_MAP[p]?.name || p).join(' • '),
                        inline: true
                    },
                    {
                        name: '🎮 Types',
                        value: gamesOnly ? 'Games only' : 'Games + DLCs',
                        inline: true
                    }
                ],
                footer: {
                    text: '⚠️ Save your secret key to manage this webhook!',
                    icon_url: 'https://kierxn.netlify.app/favicon.png'
                },
                timestamp: new Date().toISOString()
            });

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    secretKey,
                    webhookId,
                    message: "Webhook registered!"
                })
            };
        }

        // === PAUSE WEBHOOK ===
        if (action === 'pause' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { secretKey } = body;

            if (!secretKey) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Secret key required" }) };
            }

            const webhook = await store.get(`webhook_${secretKey}`, { type: 'json' });
            if (!webhook) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Webhook not found" }) };
            }

            webhook.paused = true;
            await store.setJSON(`webhook_${secretKey}`, webhook);

            await sendDiscordMessage(webhook.url, {
                title: '⏸️ Notifications Paused',
                description: 'You won\'t receive new game alerts until you resume.',
                color: 0xfbbf24,
                footer: { text: `Resume at ${SITE_URL}` }
            });

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, message: "Notifications paused" })
            };
        }

        // === RESUME WEBHOOK ===
        if (action === 'resume' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { secretKey } = body;

            if (!secretKey) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Secret key required" }) };
            }

            const webhook = await store.get(`webhook_${secretKey}`, { type: 'json' });
            if (!webhook) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Webhook not found" }) };
            }

            webhook.paused = false;
            await store.setJSON(`webhook_${secretKey}`, webhook);

            await sendDiscordMessage(webhook.url, {
                title: '▶️ Notifications Resumed',
                description: 'You\'ll now receive alerts for new free games!',
                color: 0x00ff9d,
                footer: { text: SITE_URL }
            });

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, message: "Notifications resumed" })
            };
        }

        // === UPDATE WEBHOOK SETTINGS ===
        if (action === 'update' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { secretKey, platforms, gamesOnly } = body;

            if (!secretKey) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Secret key required" }) };
            }

            const webhook = await store.get(`webhook_${secretKey}`, { type: 'json' });
            if (!webhook) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Webhook not found" }) };
            }

            if (platforms) webhook.platforms = platforms;
            if (gamesOnly !== undefined) webhook.gamesOnly = gamesOnly;

            await store.setJSON(`webhook_${secretKey}`, webhook);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, message: "Settings updated" })
            };
        }

        // === DELETE WEBHOOK ===
        if (action === 'delete' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { secretKey } = body;

            if (!secretKey) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Secret key required" }) };
            }

            const webhook = await store.get(`webhook_${secretKey}`, { type: 'json' });
            if (!webhook) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Webhook not found" }) };
            }

            try {
                await sendDiscordMessage(webhook.url, {
                    title: '👋 Webhook Removed',
                    description: 'You\'ll no longer receive free game notifications.',
                    color: 0xef4444,
                    footer: { text: `Come back anytime at ${SITE_URL}` }
                });
            } catch (e) { /* ignore */ }

            await store.delete(`webhook_${secretKey}`);

            const index = await store.get('_webhook_index', { type: 'json' }) || { webhooks: [] };
            index.webhooks = index.webhooks.filter(w => w.secretKey !== secretKey);
            await store.setJSON('_webhook_index', index);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, message: "Webhook deleted" })
            };
        }

        // === TEST WEBHOOK WITH REAL GAME ===
        if (action === 'test' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { secretKey } = body;

            if (!secretKey) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Secret key required" }) };
            }

            const webhook = await store.get(`webhook_${secretKey}`, { type: 'json' });
            if (!webhook) {
                return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Webhook not found" }) };
            }

            // Fetch the latest real game
            const latestGame = await fetchLatestGame();

            if (!latestGame) {
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Could not fetch games" })
                };
            }

            // Send real game as test
            const embed = createGameEmbed(latestGame, true);
            const success = await sendDiscordMessage(webhook.url, embed);

            return {
                statusCode: success ? 200 : 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success,
                    message: success ? "Test sent with latest game!" : "Failed to send"
                })
            };
        }

        // === CHECK STATUS ===
        if (action === 'status' && key) {
            const webhook = await store.get(`webhook_${key}`, { type: 'json' });

            if (!webhook) {
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ found: false }) };
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    found: true,
                    active: webhook.active,
                    paused: webhook.paused || false,
                    platforms: webhook.platforms,
                    gamesOnly: webhook.gamesOnly,
                    createdAt: webhook.createdAt,
                    lastPosted: webhook.lastPosted
                })
            };
        }

        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid action" }) };

    } catch (e) {
        console.error('Discord webhook error:', e);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Server error" }) };
    }
};
