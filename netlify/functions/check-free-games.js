const { getStore, connectLambda } = require('@netlify/blobs');

/**
 * Scheduled Function: Check for new free games and post to all registered webhooks
 * Runs every hour via Netlify Scheduled Functions
 */

exports.config = {
    schedule: "@hourly"
};

const SITE_URL = 'https://kierxn.netlify.app/free-games/';
const GAMERPOWER_API = 'https://www.gamerpower.com/api/giveaways?platform=pc';

// Platform mappings with improved styling
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

async function sendDiscordEmbed(webhookUrl, embed) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: '🎮 Free Games',
                avatar_url: 'https://kierxn.netlify.app/favicon.png',
                embeds: [embed]
            })
        });
        return response.ok;
    } catch (e) {
        console.error('Failed to send Discord message:', e);
        return false;
    }
}

function createGameEmbed(game) {
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

    if (timeRemaining) {
        const isUrgent = timeRemaining.includes('h remaining') && !timeRemaining.includes('d');
        embed.fields.push({
            name: isUrgent ? '⚠️ Ends Soon!' : '⏰ Ends',
            value: timeRemaining,
            inline: true
        });
    }

    return embed;
}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
};

exports.handler = async function (event, context) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: "" };
    }

    const action = event.queryStringParameters?.action;

    try {
        if (event) connectLambda(event);
        const store = getStore('discord-webhooks');

        // === STATUS ENDPOINT ===
        if (action === 'status') {
            const lastKnown = await store.get('_last_known_games', { type: 'json' }) || { gameIds: [] };
            const index = await store.get('_webhook_index', { type: 'json' }) || { webhooks: [] };

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    lastKnownCount: lastKnown.gameIds?.length || 0,
                    lastUpdated: lastKnown.updatedAt || 'never',
                    webhookCount: index.webhooks?.length || 0,
                    webhooks: index.webhooks?.map(w => ({ key: w.secretKey?.substring(0, 8) + '...', active: w.active })) || []
                })
            };
        }

        // === RESET ENDPOINT (clear last known games) ===
        if (action === 'reset' && event.httpMethod === 'POST') {
            await store.setJSON('_last_known_games', { gameIds: [], updatedAt: new Date().toISOString() });
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, message: 'Last known games cleared - next check will treat all games as new' })
            };
        }

        // === MANUAL TRIGGER or SCHEDULED RUN ===
        const isManualTrigger = action === 'trigger';
        console.log(isManualTrigger ? '[Manual] Triggered check for new free games...' : '[Scheduled] Checking for new free games...');

        // Fetch current free games
        const response = await fetch(GAMERPOWER_API);
        if (!response.ok) {
            console.error('Failed to fetch games from API');
            return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'API fetch failed' }) };
        }

        const allGames = await response.json();
        const games = allGames.filter(g => g.type === 'Game');
        console.log(`[Scheduled] Found ${games.length} games`);

        // Get last known game IDs
        const lastKnown = await store.get('_last_known_games', { type: 'json' }) || { gameIds: [] };
        const lastKnownIds = new Set(lastKnown.gameIds);

        // Find new games
        const newGames = games.filter(g => !lastKnownIds.has(g.id));
        console.log(`[Scheduled] ${newGames.length} new games to post`);

        if (newGames.length === 0) {
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'No new games' }) };
        }

        // Get all webhooks
        const index = await store.get('_webhook_index', { type: 'json' }) || { webhooks: [] };
        console.log(`[Scheduled] ${index.webhooks.length} registered webhooks`);

        let successCount = 0;
        let failCount = 0;

        // Post each new game to each active, non-paused webhook
        for (const game of newGames) {
            const embed = createGameEmbed(game);
            const gamePlatform = detectPlatform(game.platforms);

            for (const webhookRef of index.webhooks) {
                try {
                    const webhook = await store.get(`webhook_${webhookRef.secretKey}`, { type: 'json' });

                    // Skip if not active or paused
                    if (!webhook || !webhook.active || webhook.paused) continue;

                    // Check platform filter
                    if (webhook.platforms && !webhook.platforms.includes(gamePlatform) && !webhook.platforms.includes('all')) {
                        continue;
                    }

                    // Check games only filter
                    if (webhook.gamesOnly && game.type !== 'Game') {
                        continue;
                    }

                    const success = await sendDiscordEmbed(webhook.url, embed);

                    if (success) {
                        successCount++;
                        webhook.lastPosted = new Date().toISOString();
                        await store.setJSON(`webhook_${webhookRef.secretKey}`, webhook);
                    } else {
                        failCount++;
                    }

                    // Rate limit: 500ms between posts
                    await new Promise(r => setTimeout(r, 500));

                } catch (e) {
                    console.error(`Error posting to webhook:`, e);
                    failCount++;
                }
            }
        }

        // Update last known games
        await store.setJSON('_last_known_games', {
            gameIds: games.map(g => g.id),
            updatedAt: new Date().toISOString()
        });

        console.log(`[Scheduled] Complete: ${successCount} sent, ${failCount} failed`);

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ newGames: newGames.length, successCount, failCount })
        };

    } catch (e) {
        console.error('[Scheduled] Error:', e);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
    }
};
