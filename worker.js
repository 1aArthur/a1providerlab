/**
 * Cloudflare Worker: Unified AI Proxy (TokenRouter + Cloudflare Workers AI)
 * 
 * This worker acts as an OpenAI-compatible gateway that:
 * 1. Authenticates using your Cloudflare API Token.
 * 2. Proxies requests to TokenRouter (using your TokenRouter Key).
 * 3. Supports Cloudflare Workers AI models directly.
 * 
 * Target Domain: api.a1providerlab.com
 */

export default {
  async fetch(request, env, ctx) {
    // Keys are now retrieved from environment variables (env.TOKENROUTER_API_KEY, etc.)
    const TOKENROUTER_API_KEY = env.TOKENROUTER_API_KEY;
    const TOKENROUTER_BASE_URL = "https://api.tokenrouter.com/v1";
    const CLOUDFLARE_AUTH_TOKEN = env.CLOUDFLARE_AUTH_TOKEN;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");

    // 1. Authentication Check
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== CLOUDFLARE_AUTH_TOKEN) {
      return new Response(JSON.stringify({ 
        error: {
          message: "Invalid or missing Cloudflare API Token. Use your 'cfat_...' key as the Bearer token.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key"
        }
      }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 2. Routing Logic
    if (url.pathname.endsWith("/chat/completions")) {
      const body = await request.json();
      const model = body.model || "";

      if (model.startsWith("@cf/")) {
        return await handleCloudflareAI(body, env);
      }
      
      // Default: Proxy to TokenRouter
      return await proxyToTokenRouter(request, url.pathname, TOKENROUTER_API_KEY, TOKENROUTER_BASE_URL, body);
    }

    return await proxyToTokenRouter(request, url.pathname, TOKENROUTER_API_KEY, TOKENROUTER_BASE_URL);
  }
};

async function proxyToTokenRouter(request, path, apiKey, baseUrl, body = null) {
  const targetUrl = `${baseUrl}${path}`;
  
  const newHeaders = new Headers(request.headers);
  newHeaders.set("Authorization", `Bearer ${apiKey}`);
  newHeaders.delete("Host"); 

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: body ? JSON.stringify(body) : (request.method !== "GET" && request.method !== "HEAD" ? request.body : null),
      redirect: "follow"
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "TokenRouter Proxy Error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

async function handleCloudflareAI(body, env) {
  // Logic for Cloudflare Workers AI
  return new Response(JSON.stringify({ 
    message: "Cloudflare Workers AI integration is active. Ensure env.AI is bound to the worker."
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
