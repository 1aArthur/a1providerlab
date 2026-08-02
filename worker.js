/**
 * A1ProviderLab — Unified AI Proxy
 * Gateway OpenAI-compatível para TokenRouter + Cloudflare Workers AI
 *
 * Endpoints:
 *   GET  /health              → Health check
 *   GET  /v1/models           → Lista modelos disponíveis
 *   POST /v1/chat/completions → Chat completions (TokenRouter ou CF AI)
 *   *    /*                   → Proxy genérico para TokenRouter
 */

// ============ CONFIGURAÇÕES ============
const TOKENROUTER_BASE_URL = "https://api.tokenrouter.com/v1";
const RATE_LIMIT_MAX = 100;        // requests por minuto por IP
const RATE_LIMIT_WINDOW = 60;      // segundos
const CORS_ORIGIN = "https://api.a1providerlab.com";

// Modelos disponíveis no Cloudflare Workers AI
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
];

// Rate limiting simples (em memória — para produção use KV/Durable Objects)
const rateLimitMap = new Map();

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // 2. Rate Limiting
    const rateLimitResult = checkRateLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return jsonResponse(
        { error: "Rate limit exceeded. Try again later." },
        429,
        { "Retry-After": String(rateLimitResult.retryAfter) }
      );
    }

    // 3. Health Check
    if (url.pathname === "/health") {
      return jsonResponse({
        status: "ok",
        service: "a1providerlab-proxy",
        timestamp: new Date().toISOString(),
        uptime: "active",
        version: "2.0.0",
      });
    }

    // 4. Authentication
    const authHeader = request.headers.get("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token || token !== env.CLOUDFLARE_AUTH_TOKEN) {
      log({ event: "auth_failed", ip: clientIP, path: url.pathname });
      return jsonResponse(
        {
          error: {
            message: "Invalid or missing API token. Use your Cloudflare API Token (cfat_...) as Bearer token.",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        },
        401
      );
    }

    try {
      // 5. Routing
      if (url.pathname === "/v1/models") {
        return await handleModelsList(env);
      }

      if (url.pathname.endsWith("/chat/completions")) {
        return await handleChatCompletions(request, env, url);
      }

      // 6. Generic Proxy to TokenRouter
      return await proxyToTokenRouter(request, url.pathname, env);

    } catch (err) {
      log({ event: "error", ip: clientIP, path: url.pathname, error: err.message, stack: err.stack });
      return jsonResponse(
        {
          error: {
            message: "Internal server error",
            type: "internal_error",
            details: err.message,
          },
        },
        500
      );
    }
  },
};

// ============ HANDLERS ============

async function handleModelsList(env) {
  const models = [
    // TokenRouter models (estáticos — em produção, buscar dinamicamente)
    { id: "gpt-4o", object: "model", owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", owned_by: "openai" },
    { id: "gpt-4-turbo", object: "model", owned_by: "openai" },
    { id: "gpt-3.5-turbo", object: "model", owned_by: "openai" },
    { id: "claude-3-5-sonnet", object: "model", owned_by: "anthropic" },
    { id: "claude-3-haiku", object: "model", owned_by: "anthropic" },
    { id: "gemini-1.5-pro", object: "model", owned_by: "google" },
    // Cloudflare AI models
    ...CF_AI_MODELS.map((m) => ({ id: m, object: "model", owned_by: "cloudflare-ai" })),
  ];

  return jsonResponse({ object: "list", data: models });
}

async function handleChatCompletions(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        error: {
          message: "Invalid JSON in request body",
          type: "invalid_request_error",
          code: "invalid_json",
        },
      },
      400
    );
  }

  const model = body.model || "";

  // Roteia para Cloudflare Workers AI
  if (model.startsWith("@cf/")) {
    if (!env.AI) {
      return jsonResponse(
        {
          error: {
            message: "Cloudflare Workers AI binding (env.AI) is not configured.",
            type: "invalid_request_error",
            code: "ai_binding_missing",
          },
        },
        503
      );
    }
    return await handleCloudflareAI(body, env, request.headers.get("Accept")?.includes("text/event-stream"));
  }

  // Roteia para TokenRouter
  return await proxyToTokenRouter(request, url.pathname, env, body);
}

async function handleCloudflareAI(body, env, isStream) {
  const model = body.model;
  const messages = body.messages || [];

  try {
    const response = await env.AI.run(model, {
      messages,
      stream: isStream,
    });

    if (isStream && response instanceof ReadableStream) {
      return new Response(response, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": CORS_ORIGIN,
        },
      });
    }

    // Formato OpenAI-compatível
    return jsonResponse({
      id: `cf-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response.response || response,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        error: {
          message: `Cloudflare AI Error: ${err.message}`,
          type: "ai_error",
          code: "ai_execution_failed",
        },
      },
      502
    );
  }
}

async function proxyToTokenRouter(request, path, env, body = null) {
  const targetUrl = `${TOKENROUTER_BASE_URL}${path}`;

  const newHeaders = new Headers(request.headers);
  newHeaders.set("Authorization", `Bearer ${env.TOKENROUTER_API_KEY}`);
  newHeaders.delete("Host");

  // Preserva headers de streaming
  const isStreamRequest = request.headers.get("Accept")?.includes("text/event-stream");

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: body ? JSON.stringify(body) : ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "follow",
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", CORS_ORIGIN);

    // Preserva headers de streaming do TokenRouter
    if (isStreamRequest || response.headers.get("Content-Type")?.includes("text/event-stream")) {
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return jsonResponse(
      {
        error: {
          message: "TokenRouter Proxy Error",
          type: "proxy_error",
          details: err.message,
        },
      },
      502
    );
  }
}

// ============ UTILITÁRIOS ============

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
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

function checkRateLimit(clientIP) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
  const key = `${clientIP}:${windowStart}`;

  const current = rateLimitMap.get(key) || 0;
  if (current >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: RATE_LIMIT_WINDOW - (now - windowStart) };
  }

  rateLimitMap.set(key, current + 1);

  // Limpa entradas antigas (simples GC)
  for (const [k, _] of rateLimitMap) {
    const entryWindow = parseInt(k.split(":")[1]);
    if (entryWindow < windowStart - RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(k);
    }
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - current - 1 };
}

function log(entry) {
  // Em produção, envie para um serviço de logs (ex: Logpush, Axiom, etc.)
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
}
