const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

/**
 * Blog API - CRUD operations for blog posts
 * 
 * Public endpoints (no auth):
 *   GET ?action=list - List all published posts
 *   GET ?action=get&id=xxx - Get single post
 * 
 * Protected endpoints (auth required):
 *   POST ?action=create - Create new post
 *   POST ?action=update&id=xxx - Update post
 *   POST ?action=delete&id=xxx - Delete post
 */

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
};

// Validate auth token
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

exports.handler = async function (event, context) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: "" };
    }

    const { action, id } = event.queryStringParameters || {};

    try {
        connectLambda(event);
        const store = getStore('blog-posts');

        // === LIST POSTS (Public) ===
        if (action === 'list') {
            const postIndex = await store.get('_index', { type: 'json' }) || { posts: [] };

            // For public listing, only return published posts with limited fields
            const authHeader = event.headers.authorization || event.headers.Authorization;
            const isAdmin = authHeader && await validateToken(event);

            let posts = postIndex.posts || [];

            if (!isAdmin) {
                posts = posts.filter(p => p.status === 'published');
            }

            // Sort by published date (newest first)
            posts.sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ posts })
            };
        }

        // === GET SINGLE POST (Public) ===
        if (action === 'get' && id) {
            const post = await store.get(`post_${id}`, { type: 'json' });

            if (!post) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Post not found" })
                };
            }

            // Check if published or admin
            const isAdmin = await validateToken(event);
            if (post.status !== 'published' && !isAdmin) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Post not found" })
                };
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(post)
            };
        }

        // === PROTECTED ENDPOINTS ===
        if (!await validateToken(event)) {
            return {
                statusCode: 401,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: "Unauthorized" })
            };
        }

        // === CREATE POST ===
        if (action === 'create' && event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const postId = crypto.randomBytes(8).toString('hex');
            const now = new Date().toISOString();

            const post = {
                id: postId,
                title: body.title || 'Untitled',
                excerpt: body.excerpt || '',
                content: body.content || '',
                author: body.author || 'Kieran',
                tags: body.tags || [],
                readingTime: body.readingTime || 5,
                featuredImage: body.featuredImage || '',
                status: body.status || 'draft',
                createdAt: now,
                updatedAt: now,
                publishedAt: body.status === 'published' ? now : null
            };

            // Save full post
            await store.setJSON(`post_${postId}`, post);

            // Update index
            const postIndex = await store.get('_index', { type: 'json' }) || { posts: [] };
            postIndex.posts.push({
                id: postId,
                title: post.title,
                excerpt: post.excerpt,
                author: post.author,
                tags: post.tags,
                readingTime: post.readingTime,
                featuredImage: post.featuredImage,
                status: post.status,
                createdAt: post.createdAt,
                publishedAt: post.publishedAt
            });
            await store.setJSON('_index', postIndex);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, id: postId, post })
            };
        }

        // === UPDATE POST ===
        if (action === 'update' && id && event.httpMethod === 'POST') {
            const existing = await store.get(`post_${id}`, { type: 'json' });

            if (!existing) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Post not found" })
                };
            }

            const body = JSON.parse(event.body || '{}');
            const now = new Date().toISOString();
            const wasPublished = existing.status === 'published';
            const isNowPublished = body.status === 'published';

            const post = {
                ...existing,
                title: body.title ?? existing.title,
                excerpt: body.excerpt ?? existing.excerpt,
                content: body.content ?? existing.content,
                author: body.author ?? existing.author,
                tags: body.tags ?? existing.tags,
                readingTime: body.readingTime ?? existing.readingTime,
                featuredImage: body.featuredImage ?? existing.featuredImage,
                status: body.status ?? existing.status,
                updatedAt: now,
                publishedAt: (!wasPublished && isNowPublished) ? now : existing.publishedAt
            };

            // Save full post
            await store.setJSON(`post_${id}`, post);

            // Update index
            const postIndex = await store.get('_index', { type: 'json' }) || { posts: [] };
            const idx = postIndex.posts.findIndex(p => p.id === id);
            if (idx >= 0) {
                postIndex.posts[idx] = {
                    id: post.id,
                    title: post.title,
                    excerpt: post.excerpt,
                    author: post.author,
                    tags: post.tags,
                    readingTime: post.readingTime,
                    featuredImage: post.featuredImage,
                    status: post.status,
                    createdAt: post.createdAt,
                    publishedAt: post.publishedAt
                };
            }
            await store.setJSON('_index', postIndex);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, post })
            };
        }

        // === DELETE POST ===
        if (action === 'delete' && id && event.httpMethod === 'POST') {
            // Delete post
            await store.delete(`post_${id}`);

            // Update index
            const postIndex = await store.get('_index', { type: 'json' }) || { posts: [] };
            postIndex.posts = postIndex.posts.filter(p => p.id !== id);
            await store.setJSON('_index', postIndex);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true })
            };
        }

        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Invalid action" })
        };

    } catch (e) {
        console.error('Blog API error:', e);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Server error" })
        };
    }
};
