const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

/**
 * Blog Authentication API
 * Validates password against BLOG_ADMIN_PASSWORD env var
 * 
 * POST { password: string }
 * Returns { success: true, token: string } or { success: false }
 */

exports.handler = async function (event, context) {
    // CORS headers
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" })
        };
    }

    try {
        const { password } = JSON.parse(event.body || '{}');
        const adminPassword = process.env.BLOG_ADMIN_PASSWORD;

        if (!adminPassword) {
            console.error('BLOG_ADMIN_PASSWORD not set');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Server configuration error" })
            };
        }

        if (!password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: "Password required" })
            };
        }

        if (password !== adminPassword) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, error: "Invalid password" })
            };
        }

        // Generate a simple token (in production, use JWT or similar)
        const token = crypto.randomBytes(32).toString('hex');

        // Store token in Blobs for validation
        connectLambda(event);
        const store = getStore('blog-auth');
        await store.setJSON(`token_${token}`, {
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, token })
        };

    } catch (e) {
        console.error('Auth error:', e);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Authentication failed" })
        };
    }
};
