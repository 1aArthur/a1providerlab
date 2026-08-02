# A1ProviderLab — Unified AI Proxy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/1aArthur/a1providerlab)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Gateway OpenAI-compatível** que unifica **TokenRouter** e **Cloudflare Workers AI** em um único endpoint.

---

## ✨ O que faz

Este Worker atua como um proxy unificado para APIs de IA:

- 🔐 **Autenticação via Bearer Token** (Cloudflare API Token)
- 🚀 **Proxy para TokenRouter** — roteia requests para `api.tokenrouter.com`
- 🤖 **Cloudflare Workers AI** — suporte nativo a modelos `@cf/...`
- 📡 **Streaming SSE** — respostas em tempo real para chat completions
- 📋 **Endpoint `/models`** — lista todos os modelos disponíveis
- 🛡️ **Rate Limiting** — proteção básica contra abuso
- 📝 **Logging estruturado** — observabilidade completa

---

## 🚀 Deploy Rápido

### 1. Clone o repositório
```bash
git clone https://github.com/1aArthur/a1providerlab.git
cd a1providerlab
```

### 2. Configure as variáveis de ambiente
```bash
wrangler secret put TOKENROUTER_API_KEY
# Cole sua chave do TokenRouter

wrangler secret put CLOUDFLARE_AUTH_TOKEN
# Cole seu Cloudflare API Token (cfat_...)
```

### 3. Deploy
```bash
npm run deploy
```

---

## 🔧 Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `TOKENROUTER_API_KEY` | Sua chave de API do TokenRouter | ✅ Sim |
| `CLOUDFLARE_AUTH_TOKEN` | Seu token de API do Cloudflare (`cfat_...`) | ✅ Sim |
| `AI` | Binding do Cloudflare Workers AI | ⚪ Opcional |

---

## 📖 Uso

### Autenticação
Todas as requisições devem incluir o header:
```
Authorization: Bearer <CLOUDFLARE_AUTH_TOKEN>
```

### Chat Completions (TokenRouter)
```bash
curl -X POST https://api.a1providerlab.com/v1/chat/completions \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Olá!"}],
    "stream": true
  }'
```

### Chat Completions (Cloudflare AI)
```bash
curl -X POST https://api.a1providerlab.com/v1/chat/completions \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Olá!"}]
  }'
```

### Listar Modelos
```bash
curl https://api.a1providerlab.com/v1/models \
  -H "Authorization: Bearer $CF_TOKEN"
```

### Health Check
```bash
curl https://api.a1providerlab.com/health
```

---

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Cliente       │────▶│  A1ProviderLab   │────▶│  TokenRouter    │
│  (OpenAI SDK)   │     │   Worker Proxy   │     │  (gpt-4o, etc)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ Cloudflare AI    │
                        │ (@cf/ models)    │
                        └──────────────────┘
```

---

## 📁 Estrutura do Projeto

```
a1providerlab/
├── .github/
│   └── workflows/
│       └── deploy.yml      # CI/CD automático
├── src/
│   └── index.js            # Código principal do Worker
├── wrangler.toml           # Configuração do Cloudflare
├── package.json            # Scripts e dependências
├── .gitignore
├── LICENSE
└── README.md               # Você está aqui!
```

---

## 🛡️ Segurança

- ✅ Autenticação obrigatória via Bearer Token
- ✅ Rate limiting por IP (configurável)
- ✅ CORS controlado (não permite `*` em produção)
- ✅ Headers sensíveis removidos no proxy

---

## 📄 Licença

[MIT](LICENSE) — Arthur_1
