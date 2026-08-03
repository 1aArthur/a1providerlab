/**
 * Cloudflare Worker: Kimi 3 Dedicated Proxy
 * 
 * Restrições:
 * 1. Apenas autenticação via CLOUDFLARE_AUTH_TOKEN é permitida.
 * 2. Apenas o modelo 'moonshotai/kimi-k3-free' é permitido.
 */

export default {
  async fetch(request, env) {
    const { TOKENROUTER_API_KEY, CLOUDFLARE_AUTH_TOKEN } = env;
    const TOKENROUTER_URL = "https://api.tokenrouter.com/v1/chat/completions";

    // CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // 1. Validação de Autenticação
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${CLOUDFLARE_AUTH_TOKEN}`) {
      return errorResponse("Unauthorized: Invalid Cloudflare Auth Token", 401);
    }

    // 2. Validação de Rota e Método
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/chat/completions") || request.method !== "POST") {
      return errorResponse("Only POST to /v1/chat/completions is supported", 404);
    }

    try {
      const body = await request.json();
      
      // 3. Restrição de Modelo (Kimi 3 apenas)
      if (body.model !== "moonshotai/kimi-k3-free") {
        return errorResponse("Access Denied: This API key is restricted to 'moonshotai/kimi-k3-free'", 403);
      }

      // 4. Proxy para TokenRouter
      const response = await fetch(TOKENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TOKENROUTER_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      const resHeaders = new Headers(response.headers);
      resHeaders.set("Access-Control-Allow-Origin", "*");
      
      return new Response(response.body, {
        status: response.status,
        headers: resHeaders
      });

    } catch (err) {
      return errorResponse(`Proxy Error: ${err.message}`, 500);
    }
  }
};

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
