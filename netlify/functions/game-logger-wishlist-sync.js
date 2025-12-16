const { getStore } = require("@netlify/blobs");

// Weekly wishlist sync for all users
exports.handler = async (event, context) => {
    console.log('Starting weekly wishlist sync...');

    const store = getStore({ name: 'game-logger', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN });

    try {
        // List all users
        const { blobs } = await store.list({ prefix: 'user_' });
        console.log(`Found ${blobs.length} users to sync wishlists`);

        let synced = 0;
        let errors = 0;

        for (const blob of blobs) {
            try {
                const user = await store.get(blob.key, { type: 'json' });
                if (!user?.steam?.id) continue;

                console.log(`Syncing wishlist for ${user.username || user.discordId}`);

                // Fetch Steam wishlist
                const wishlistUrl = `https://store.steampowered.com/wishlist/profiles/${user.steam.id}/wishlistdata/?p=0`;
                const wishlistRes = await fetch(wishlistUrl);

                if (!wishlistRes.ok) {
                    console.log(`Failed to fetch wishlist for ${user.discordId}`);
                    continue;
                }

                const wishlistData = await wishlistRes.json();

                if (wishlistData && typeof wishlistData === 'object') {
                    // Preserve manually added items
                    const manualItems = (user.wishlist || []).filter(w => w.manuallyAdded);

                    // Convert Steam wishlist to our format
                    const steamWishlist = Object.entries(wishlistData).map(([appId, data]) => ({
                        id: `steam_${appId}`,
                        steamAppId: parseInt(appId),
                        name: data.name,
                        background_image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
                        released: data.release_date ? new Date(data.release_date * 1000).toISOString().split('T')[0] : null,
                        priority: data.priority,
                        added_at: data.added ? new Date(data.added * 1000).toISOString() : null,
                        fromSteamSync: true
                    }));

                    // Merge: keep manual items + add Steam items (avoid duplicates)
                    const existingIds = new Set(manualItems.map(w => w.name?.toLowerCase()));
                    const newSteamItems = steamWishlist.filter(sw => !existingIds.has(sw.name?.toLowerCase()));

                    user.wishlist = [...manualItems, ...newSteamItems];
                    user.wishlistLastSync = new Date().toISOString();

                    await store.setJSON(blob.key, user);
                    synced++;
                    console.log(`Synced ${steamWishlist.length} Steam wishlist items for ${user.username || user.discordId}`);
                }
            } catch (userError) {
                console.error(`Error syncing user ${blob.key}:`, userError);
                errors++;
            }
        }

        console.log(`Weekly wishlist sync complete: ${synced} synced, ${errors} errors`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                synced,
                errors,
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('Weekly wishlist sync failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
