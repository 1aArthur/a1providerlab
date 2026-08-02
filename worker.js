/**
 * A1ProviderLab — Unified AI Proxy (SEM autenticação)
 * Worker: tokenrouter-proxy
 */

const TOKENROUTER_BASE_URL = "https://api.tokenrouter.com/v1";
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 60;
const CORS_ORIGIN = "*"; // Permite qualquer origem

const CF_AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.3-70b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.2",
  "@cf/google/gemma-2b-it",
  "@cf/google/gemma-7b-it",
  "@cf/qwen/qwen1.5-7b-chat-awq",
  "@cf/deepseek-ai/deepseek-math-7b-instruct",
  "@cf/microsoft/phi-2",
  "@cf/tiiuae/falcon-7b-instruct",
  "@cf/anthropic/claude-3-haiku",
  "moonshotai/kimi-k3-free",
];

const rateLimitMap = new Map();

export default {
  async fetch(request, env, ctx) {
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleCORS();

    const rateLimitResult = checkRateLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return jsonResponse({ error: "Rate limit exceeded." }, 429, {
        "Retry-After": String(rateLimitResult.retryAfter),
      });
    }

    if (url.pathname === "/health") {
      return jsonResponse({
        status: "ok",
        service: "a1providerlab-proxy",
        timestamp: new Date().toISOString(),
        version: "2.0.0-noauth",
      });
    }

    try {
      if (url.pathname === "/v1/models") return await handleModelsList(env);
      if (url.pathname.endsWith("/chat/completions"))
        return await handleChatCompletions(request, env, url);
      return await proxyToTokenRouter(request, url.pathname, env);
    } catch (err) {
      log({ event: "error", error: err.message });
      return jsonResponse(
        { error: { message: "Internal server error", details: err.message } },
        500
      );
    }
  },
};

async function handleModelsList(env) {
  const models = [
    { id: "gpt-4o", object: "model", owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", owned_by: "openai" },
    { id: "gpt-4-turbo", object: "model", owned_by: "openai" },
    { id: "gpt-3.5-turbo", object: "model", owned_by: "openai" },
    { id: "claude-3-5-sonnet", object: "model", owned_by: "anthropic" },
    { id: "claude-3-haiku", object: "model", owned_by: "anthropic" },
    { id: "gemini-1.5-pro", object: "model", owned_by: "google" },
    ...CF_AI_MODELS.map((m) => ({ id: m, object: "model", owned_by: "cloudflare-ai" })),
  ];
  return jsonResponse({ object: "list", data: models });
}

async function handleChatCompletions(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { message: "Invalid JSON", code: "invalid_json" } }, 400);
  }
  const model = body.model || "";
  if (model.startsWith("@cf/")) {
    if (!env.AI)
      return jsonResponse({ error: { message: "AI binding missing", code: "ai_binding_missing" } }, 503);
    return await handleCloudflareAI(body, env, request.headers.get("Accept")?.includes("text/event-stream"));
  }
  return await proxyToTokenRouter(request, url.pathname, env, body);
}

async function handleCloudflareAI(body, env, isStream) {
  const response = await env.AI.run(body.model, {
    messages: body.messages || [],
    stream: isStream,
  });
  if (isStream && response instanceof ReadableStream) {
    return new Response(response, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": CORS_ORIGIN,
      },
    });
  }
  return jsonResponse({
    id: `cf-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: response.response || response },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

async function proxyToTokenRouter(request, path, env, body = null) {
  const targetUrl = `${TOKENROUTER_BASE_URL}${path}`;
  const newHeaders = new Headers(request.headers);
  newHeaders.set("Authorization", `Bearer ${env.TOKENROUTER_API_KEY}`);
  newHeaders.delete("Host");
  const isStream = request.headers.get("Accept")?.includes("text/event-stream");
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: newHeaders,
    body: body ? JSON.stringify(body) : ["GET", "HEAD"].includes(request.method) ? null : request.body,
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  if (isStream || response.headers.get("Content-Type")?.includes("text/event-stream")) {
    responseHeaders.set("Content-Type", "text/event-stream");
    responseHeaders.set("Cache-Control", "no-cache");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
  });
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(JSON.stringify(data), { status, headers });
}

function checkRateLimit(ip) {
  const now = Math.floor(Date.now() / 1000),
    ws = Math.floor(now / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW,
    key = `${ip}:${ws}`;
  const cur = rateLimitMap.get(key) || 0;
  if (cur >= RATE_LIMIT_MAX) return { allowed: false, retryAfter: RATE_LIMIT_WINDOW - (now - ws) };
  rateLimitMap.set(key, cur + 1);
  for (const [k, _] of rateLimitMap) {
    if (parseInt(k.split(":")[1]) < ws - RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - cur - 1 };
}

function log(e) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...e }));
}
