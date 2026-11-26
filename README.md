# FixFlow AI

FixFlow AI is a local-first, multi-tenant software reliability workspace. It
ingests application errors, groups recurring issues, tracks incidents and
deployments, and presents organization-scoped analytics and in-app alerts.

## Stack

- **Web:** Next.js App Router, React, TypeScript, Tailwind CSS, Recharts,
  Lucide React
- **API:** NestJS, TypeScript, TypeORM, MySQL
- **Security:** JWT access tokens, rotating HttpOnly refresh cookies, bcrypt,
  organization-level RBAC, hashed project API keys
- **Local AI (optional):** FastAPI, Ollama, HuggingFace sentence-transformer
  embeddings, and persistent Chroma vector search

## Run locally

1. Copy `fixflow-api/.env.example` to `fixflow-api/.env`, set a private JWT
   secret and local database values. Do not commit `.env` files.
2. From the repository root, start MySQL:

   ```powershell
   docker compose --env-file fixflow-api/.env -p fixflow-ai up -d mysql
   ```

3. In `fixflow-api`, install dependencies, migrate, and start NestJS:

   ```powershell
   npm install
   npm run migration:run
   npm run start:dev
   ```

4. In a second terminal, start Next.js:

   ```powershell
   cd fixflow-web
   Copy-Item .env.example .env.local
   npm install
   npm run dev
   ```

Open `http://localhost:3000`. The API defaults to
`http://localhost:3001/api/v1`; if the web app uses a different port, update
`WEB_ORIGIN` in the API environment and restart the API. Full environment
details and API examples are in the [local setup guide](./SETUP_GUIDE.md).

## Workspace screens

- Overview: live error metrics, activity and severity charts, frequent issues,
  endpoints, recent events, incidents and deployments
- Issues: organization/project filters, search, severity/status/environment
  filters, pagination, event history, sanitized stack traces, assignments,
  comments and resolve/reopen
- Incidents: CRUD, owner/severity/status changes, issue linking and audit
  timeline, with opt-in local AI summaries and evidence-based hypotheses
- Issue intelligence: on-demand root-cause hypotheses, similar historical
  issues, supporting evidence, and debugging/remediation suggestions from local
  models; recommendations are not verified fixes
- Deployments: release history, lifecycle status and before/after comparison
  explicitly labeled as possible correlation
- Analytics: error and incident trends, severity distribution, endpoints,
  issue frequency and average resolution time
- Alerts: critical-error and error-spike rules, notification history and
  read/unread state
- Projects: organization-scoped project creation and archive management

Authentication uses an in-memory access token and an HttpOnly refresh cookie;
the browser does not persist bearer or API-key secrets in local storage.
Notification email is a development simulation, not real delivery. AI
investigation is optional: Phases 1–8 work without Python or Ollama.

## Checks

```powershell
cd fixflow-api
npm run build
npm run lint
npm test
npm run test:e2e

cd ..\fixflow-web
npm run lint
npm run build
```

The e2e suite requires the configured MySQL database and all migrations.

## Documentation

- [API routes and request examples](./API_DOCUMENTATION.md)
- [MySQL schema and tenancy model](./DATABASE_SCHEMA.md)
- [Setup, security and local workflows](./SETUP_GUIDE.md)
- [Production deployment and recovery](./DEPLOYMENT.md)
- [Local AI architecture and API workflow](./API_DOCUMENTATION.md#phase-9-ai-incident-intelligence)

## Phase 10 operations

The repo includes development and production Compose configurations for the
web app, API, MySQL 8.4 and Redis. FastAPI/Ollama and Prometheus/Grafana are
optional overlays. Production secrets are mounted from ignored files; the
production stack does not publish MySQL or Redis ports and does not download
LLM models. Use the documented migration step before starting the API.

The existing synchronous AI endpoints remain available. When Redis and
`QUEUE_ENABLED=true` are configured, separate endpoints accept retryable AI
analysis jobs. Request logs include a correlation ID and omit query strings
and request bodies. Protected Prometheus metrics expose request latency,
status and queue counts. Windows backup/restore scripts and the deployment
checklist are in [DEPLOYMENT.md](./DEPLOYMENT.md).

```powershell
# Development stack; first configure fixflow-api/.env.
docker compose --env-file fixflow-api/.env -p fixflow-ai up -d --build

# Local checks
cd fixflow-api
npm run build
npm run lint
npm test
npm run test:e2e
```

Docker must be running for Compose or image checks. No workflow deploys to a
production host; CI only verifies builds and prepares tagged image artifacts.
