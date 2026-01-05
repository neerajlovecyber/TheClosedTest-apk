export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        const key = url.pathname.slice(1);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, PUT, DELETE, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (req.method === "DELETE") {
            if (!key) {
                return new Response("Key required", { status: 400, headers: corsHeaders });
            }

            await env.MY_BUCKET.delete(key);

            return new Response(`Object ${key} deleted successfully!`, {
                status: 200,
                headers: corsHeaders,
            });
        }

        if (req.method === "PUT") {
            if (!key) {
                return new Response("Key required", { status: 400, headers: corsHeaders });
            }

            // Read body to ensure we have data
            let bodyBuffer;
            try {
                bodyBuffer = await req.arrayBuffer();
            } catch (e) {
                return new Response(`Failed to read body: ${e.message}`, { status: 400, headers: corsHeaders });
            }

            const size = bodyBuffer.byteLength;
            if (size === 0) {
                return new Response(`Received 0 bytes`, { status: 400, headers: corsHeaders });
            }

            // Store the object in R2
            await env.MY_BUCKET.put(key, bodyBuffer, {
                httpMetadata: {
                    contentType: req.headers.get("Content-Type"),
                },
            });

            return new Response(`Object ${key} uploaded successfully! Size: ${size} bytes`, {
                status: 200,
                headers: corsHeaders,
            });
        }

        // Allow for keys with just a slash to perhaps list or return 404, here we treat it as empty key which likely fails or returns nothing useful, but let's stick to user's simple example
        if (!key) {
            return new Response("Welcome to R2 Image Worker. Usage: /<key>", { status: 200, headers: corsHeaders });
        }

        const object = await env.MY_BUCKET.get(key);
        if (!object) return new Response("Not Found", { status: 404, headers: corsHeaders });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

        // Safety check for Content-Type
        if (!headers.get("Content-Type")) {
            headers.set("Content-Type", "application/octet-stream");
        }

        // Add CORS headers to response
        Object.keys(corsHeaders).forEach(key => {
            headers.set(key, corsHeaders[key]);
        });

        return new Response(object.body, {
            headers
        });
    }
};
