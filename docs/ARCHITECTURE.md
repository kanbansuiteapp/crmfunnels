# Arquitectura — CRM multiagente de ventas y mensajería

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js (App Router, TypeScript, Tailwind), desplegado en Vercel |
| Datos / Auth | Supabase: Postgres + RLS, Auth, Storage |
| Tiempo real | Supabase Realtime (reemplaza WebSockets propios) sobre `messages`, `conversations`, `deals` |
| Backend lógico | Supabase Edge Functions (Deno) + RPC SQL |
| Jobs | pg_cron + Vault (`net.http_post` con `x-cron-secret`) |
| Mensajería | Evolution API (QR) y/o WhatsApp Cloud API (Meta) |
| IA | LLM por agente (API key por org), pgvector para base de conocimiento |

```
Cliente WhatsApp ⇄ Evolution/Meta ⇄ Edge Fn `wa-webhook` ─┐
                                                          ▼
Next.js (Vercel) ⇄ Supabase Postgres (RLS) ⇄ Realtime ⇄ Next.js
                         ▲        ▲
         pg_cron ─► `automation-runner`   `ai-agent` ─► LLM
         Hotmart/Stripe ─► `inbound-webhook` (HMAC)   `mcp` (MCP server)
```

## 2. Multi-empresa y seguridad
- Toda tabla tiene `organization_id`; RLS habilitado; políticas `to authenticated` con `(select current_org_id())`; `anon` sin acceso.
- Helpers `security definer` con `search_path = ''`: `current_org_id()`, `is_org_admin()`.
- Roles: `admin` (visión global) y `agent` (solo conversaciones/deals asignados o de sus `assigned_phone_ids`).
- Escrituras sensibles (`messages` salientes, `organizations`, secretos) solo con `service_role` desde Edge Functions. Secretos (API keys, tokens) nunca se exponen al cliente.
- Hora de negocio explícita por organización (`timezone`).

## 3. Mapa módulos → implementación

| Módulo | Tablas | Lógica | Pantallas |
|---|---|---|---|
| A Contactos | `contacts`, `tags`, `contact_tags`, `custom_field_defs/values`, `contact_events` | trigger registra evento al etiquetar; endpoint de redirección registra clics | `/contacts`, `/contacts/[id]` |
| B Kanban | `pipelines` (máx. 10/org), `stages`, `deals` | RPC `move_deal` reordena y aplica la etiqueta de la etapa | `/pipelines/[id]` |
| C Inbox | `channels`, `conversations`, `messages` | rotador round-robin en `assign_conversation()`; envío por Edge Fn `send-message` | `/inbox` |
| D Automatizaciones | `automations`, `automation_runs`, `webhooks` | `automation-runner` recorre `actions_tree_json`; disparadores: mensaje entrante, tag añadido, inactividad (cron) | `/automations` |
| E Agentes IA | `ai_agents`, `knowledge_sources`, `knowledge_chunks` | RAG con pgvector; salida JSON (`reply`, `extracted`, `tags`); `mcp` expone herramientas CRM | `/agents` |
| F Dashboards | vistas/RPC agregadas | consultas filtrables por tag, fecha, campaña | `/dashboard` |

## 4. Flujo de mensaje entrante
1. `wa-webhook` identifica el canal, busca/crea `contacts` y `conversations`.
2. **Guarda el mensaje primero** (`messages`, `direction='in'`).
3. Si la conversación no tiene asignado, `assign_conversation()` (rotador o manual).
4. Se evalúan automatizaciones con trigger `incoming_message`.
5. Si `ai_enabled`, `ai-agent` responde con el prompt y KB del agente; extrae datos y etiqueta.
6. Realtime empuja a la bandeja; el envío saliente se guarda con `status` y se actualiza por callbacks de entrega.

## 5. Motor de automatizaciones
`actions_tree_json` es un árbol de nodos: `{ id, type: 'send_message'|'add_tag'|'move_stage'|'http_request'|'wait'|'condition', config, next|branches }`. Webhooks de entrada validan firma HMAC por `webhooks.secret`; los de salida registran cada intento en `automation_runs`. Meta solo permite texto libre dentro de 24 h tras el último mensaje del cliente: los envíos proactivos deben tolerar el fallo.

## 6. Estructura de carpetas
```
supabase/migrations/0001_core.sql
supabase/functions/{wa-webhook,send-message,ai-agent,automation-runner,inbound-webhook,mcp}/
web/app/{inbox,contacts,pipelines/[id],automations,agents,dashboard}/
web/components/kanban/
web/lib/supabase/{client,server}.ts
docs/ARCHITECTURE.md
```

## 7. Fases
1. Núcleo + Kanban (esta sesión). 2. Inbox y webhook WhatsApp. 3. Automatizaciones y webhooks. 4. Agentes IA + MCP. 5. Dashboards y límites de plan.
