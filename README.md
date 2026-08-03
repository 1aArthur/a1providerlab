# a1providerlab - Kimi 3 Dedicated Proxy

Este repositório contém um Cloudflare Worker otimizado que atua como um proxy dedicado para o modelo **Kimi 3** (`moonshotai/kimi-k3-free`) via TokenRouter.

## 🚀 Status de Produção
O Worker já foi implantado e está funcional em:
`https://tokenrouter-proxy.arthurlorenco78.workers.dev/v1/chat/completions`

## Configuração de Segurança
*   **Modelo Único**: Apenas requisições para `moonshotai/kimi-k3-free` são processadas.
*   **Autenticação**: Requer o Header `Authorization: Bearer <SUA_CHAVE_CLOUDFLARE>`.

## Como configurar o seu Domínio Customizado
Para usar `api.a1providerlab.com`:
1.  Acesse o painel da Cloudflare.
2.  Vá em **Workers & Pages** > selecione `tokenrouter-proxy`.
3.  Vá na aba **Settings** > **Domains & Routes**.
4.  Clique em **Add Custom Domain** e digite `api.a1providerlab.com`.
5.  A Cloudflare cuidará da configuração do DNS e do certificado SSL.

## Exemplo de Teste (CURL)
```bash
curl https://tokenrouter-proxy.arthurlorenco78.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <SUA_CHAVE_CLOUDFLARE>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/kimi-k3-free",
    "messages": [{"role": "user", "content": "Olá, Kimi!"}]
  }'
```
