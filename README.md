# a1providerlab - Kimi 3 Dedicated Proxy

Este repositório contém um Cloudflare Worker otimizado que atua como um proxy dedicado para o modelo **Kimi 3** (`moonshotai/kimi-k3-free`) via TokenRouter.

## Configuração

### 1. Segredos no GitHub (Secrets)
Adicione em **Settings > Secrets and variables > Actions**:
*   `CLOUDFLARE_API_TOKEN`: Token da Cloudflare com permissão de edição de Workers.

### 2. Segredos no Cloudflare (Worker Secrets)
Configure as variáveis de ambiente no painel da Cloudflare ou via CLI:
*   `TOKENROUTER_API_KEY`: Sua chave da TokenRouter.
*   `CLOUDFLARE_AUTH_TOKEN`: Sua chave customizada da Cloudflare (usada no Header Authorization).

```bash
wrangler secret put TOKENROUTER_API_KEY
wrangler secret put CLOUDFLARE_AUTH_TOKEN
```

## Restrições de Segurança
*   **Modelo Único**: Apenas requisições para `moonshotai/kimi-k3-free` são processadas. Outros modelos retornarão erro `403 Forbidden`.
*   **Método Único**: Apenas `POST` para `/v1/chat/completions` é suportado.
*   **Autenticação Estrita**: O Header `Authorization` deve ser exatamente `Bearer <CLOUDFLARE_AUTH_TOKEN>`.

## Exemplo de Uso
```bash
curl https://api.a1providerlab.com/v1/chat/completions \
  -H "Authorization: Bearer <SUA_CHAVE_CUSTOM_CLOUDFLARE>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/kimi-k3-free",
    "messages": [{"role": "user", "content": "Olá, Kimi!"}]
  }'
```
