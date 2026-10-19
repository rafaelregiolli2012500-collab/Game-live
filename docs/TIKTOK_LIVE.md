# Brasil Fight Arena — integração de presentes (TikTok LIVE)

## Estado atual
- **Modo DEMO (funcional e testado):** presentes simulados pelo painel `LIVE ADMIN` → `POST /api/live/demo/gift`.
  Todo evento demo é marcado `source: "demo"` e aparece como **SIMULADO** na barra inferior.
- **Modo LIVE (não conectado):** o contrato está pronto, mas **nenhum conector real ao TikTok foi implementado ou testado**.
  Ao selecionar `LIVE / PENDENTE`, o status mostra `disconnected` — o jogo nunca afirma estar conectado.

## Arquitetura
```
TikTok LIVE ──► serviço intermediário próprio (backend, credenciais em .env)
                  │ normaliza para GiftEvent
                  ▼
FastAPI /api/live/*  ── deduplicação (índice único game_id+event_id) ── sequência ── fila asyncio
                  │ WebSocket /api/live/ws/{game_id}
                  ▼
Navegador: fila local ordenada ──► loop único do Canvas (1 requestAnimationFrame) ──► controlador central de dano
```

## Endpoints
| Método | Rota | Uso |
|---|---|---|
| GET/PUT | `/api/live/config` | Regras presente→golpe e configurações de combate (persistidas no MongoDB) |
| GET | `/api/live/status` | Estado da integração (`demo` / `disconnected`) |
| POST | `/api/live/demo/gift` | Simula presente (somente modo DEMO; 409 no modo LIVE) |
| GET | `/api/live/events` | Histórico (50 últimos) |
| GET | `/api/live/queue` | Eventos ainda em fila/processamento |
| WS | `/api/live/ws/{game_id}` | Status + eventos de presente em tempo real; responde `ping` com `pong` |

Formato do evento (`GiftEvent`): `event_id`, `sequence`, `username`, `user_id`, `gift_id`, `gift_name`, `quantity`,
`benefited_character`, `target_character`, `action_name`, `damage`, `animation_ms`, `effect_intensity`, `repeat_policy`, `source`.
A associação é feita por `gift_id` (identificador do conector), nunca só pelo nome exibido.

## O que falta para ativar o LIVE real
1. Escolher um serviço/biblioteca compatível que entregue eventos de presente da sua LIVE (o TikTok não documenta uma API pública
   oficial de presentes em tempo real; verifique termos de uso e permissões do provedor escolhido).
2. Implementar um adaptador no backend (`backend/routers/live.py`) que leia `TIKTOK_PROVIDER_WS_URL` / `TIKTOK_PROVIDER_API_KEY`
   do `backend/.env`, mapeie o payload para `GiftEvent` (usando o ID real do evento para deduplicação) e chame a mesma rotina de
   enfileiramento usada pelo modo demo, emitindo status `connected` / `reconnecting` / `error`.
3. Mapear os `gift_id` reais do provedor nas regras do painel.
4. Opcional: definir `LIVE_WS_TOKEN` no `backend/.env` para exigir token no WebSocket.
Credenciais **nunca** devem ir para o frontend (variáveis `VITE_*` são públicas).

## Como testar os presentes (demo)
1. Abrir o jogo → `CPU VS CPU` → `INICIAR COMBATE`.
2. Clicar em `LIVE ADMIN` (topo) → seção **SIMULAR PRESENTE** → escolher presente, usuário, quantidade, beneficiado → `ENFILEIRAR PRESENTE`.
3. Observar: golpe executado, vida do alvo reduzida, barra inferior (presente/usuário/golpe/contagem/meta), barra superior (último especial).
4. Em **Modo Live Interativo** os golpes automáticos não tiram vida; troque para **Combate Normal** no painel para dano automático.

Teste via curl:
```bash
curl -X POST "$APP/api/live/demo/gift" -H 'Content-Type: application/json' \
  -d '{"gift_id":"rose","username":"teste","quantity":3,"benefited_character":"lula","event_id":"meu-id-1"}'
```
Reenviar o mesmo `event_id` retorna o evento original sem duplicar.
