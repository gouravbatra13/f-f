# FixFlow AI Local Setup

## Prerequisites

- Node.js compatible with the repository's NestJS toolchain
- npm
- MySQL Community 8.4 or Docker Desktop with the Docker Compose plugin
- Optional local AI: Python 3.11–3.13 (Python 3.12 recommended) and Ollama

## Configure the API

From the repository root, copy `fixflow-api/.env.example` to
`fixflow-api/.env`, then replace the example access-token secret with a random
secret of at least 32 bytes. Generate one with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

The provided MySQL credentials and token secret are local development examples
only. Never use them in production or commit a real `.env` file.

## Start MySQL

From the repository root:

```powershell
docker compose --env-file fixflow-api/.env -p fixflow-ai up -d mysql
```

The host port is `33316` (the container listens on `3306`). This matches
`MYSQL_PORT` in the API environment and avoids a common port mismatch.
Compose persists database files in the `mysql_data` volume. Start Docker
Desktop first and confirm `docker info` succeeds before proceeding.

### Windows alternative: local MySQL

If Docker Desktop is unavailable, install the free **MySQL Community Server
8.4 LTS MSI** from the official MySQL downloads page. In the installer,
configure TCP port `3306`, bind to `127.0.0.1` for local-only access, and set
a root password. Start the `MySQL84` Windows service from Services or:

```powershell
Get-Service MySQL84
Start-Service MySQL84
Test-NetConnection 127.0.0.1 -Port 3306
```

In the ignored `fixflow-api/.env`, set `MYSQL_HOST=127.0.0.1` and
`MYSQL_PORT=3306`, and set the matching `MYSQL_USER`, `MYSQL_PASSWORD`,
`MYSQL_DATABASE`, and `MYSQL_ROOT_PASSWORD`. Create only the dedicated local
database and account with MySQL Workbench or the MySQL command line; do not
reuse or drop another application's schema. Run the migrations in the next
section after confirming the app user's credentials work:

```powershell
mysql --host=127.0.0.1 --port=3306 --user=fixflow_local --password fixflow_ai_local
```

XAMPP's bundled MariaDB may also be used for local experimentation, but it is
not the project's pinned MySQL 8.4 target. Configure `MYSQL_PORT` to XAMPP's
actual port (default `3306`) and use a separate FixFlow database/user. Do not
change its existing databases or data directory to make this project work.

## Install, migrate, and start the API

```powershell
cd fixflow-api
npm install
npm run migration:run
npm run start:dev
```

The API listens on `http://localhost:3001` by default. Liveness is available at
`http://localhost:3001/api/v1/health`; readiness (including the MySQL check) is
at `http://localhost:3001/api/v1/health/ready`. Existing ignored local
configuration in this checkout overrides that to API port `3201` and web
origin `http://localhost:3200`; match `WEB_ORIGIN` and
`NEXT_PUBLIC_API_BASE_URL` when using those overrides.

The migrations create auth, organization, invitation, project, project API key,
issue, error event, comment, activity, incident, incident issue link, incident
timeline, deployment, alert-rule, notification, and AI investigation tables.
Organization invitations use a mock delivery response for local development; no email is sent. Error ingestion accepts JSON
requests up to 64 KiB and is limited to 120 requests per minute per client IP
in this single-instance setup. The limiter is in memory; production
multi-instance deployments need shared throttler storage and edge rate limits.
Ingestion is synchronous and transactional; a durable queue is a future
scaling step for high-volume workloads.

To try ingestion, register/sign in, create an organization and project, and
create a project API key. The key is returned once. Send it in the `x-api-key`
header:

```bash
curl -i -X POST http://localhost:3001/api/v1/ingest/errors \
  -H "x-api-key: <project-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Checkout failed for order 123456","severity":"error","environment":"development","stackTrace":"Error\n at checkout (src/checkout.ts:22:5)"}'
```

Then query issues with the user access token:

```bash
curl -i "http://localhost:3001/api/v1/issues?status=open&page=1&limit=25" \
  -H "Authorization: Bearer <accessToken>"
```

## Incidents and deployment impact

Organization members can create incidents under their organization and link
issues from the same organization. `VIEWER` members are read-only. Incident
severity values are `SEV1`–`SEV4`; statuses are `OPEN`, `INVESTIGATING`,
`IDENTIFIED`, `MONITORING`, and `RESOLVED`. Deleting an incident archives it
so its timeline remains in MySQL.

```bash
curl -i -X POST http://localhost:3001/api/v1/organizations/<organizationId>/incidents \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<projectId>","title":"Checkout outage","severity":"SEV1"}'

curl -i -X POST http://localhost:3001/api/v1/organizations/<organizationId>/incidents/<incidentId>/issues \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"issueId":"<issueId>"}'
```

Deployment environments are `PRODUCTION`, `STAGING`, and `DEVELOPMENT`; statuses
are `PENDING`, `IN_PROGRESS`, `SUCCESS`, `FAILED`, and `ROLLED_BACK`. Compare
the default 60-minute windows (or provide `windowMinutes` from 1 to 10,080):

```bash
curl -i -X POST http://localhost:3001/api/v1/projects/<projectId>/deployments \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"environment":"PRODUCTION","release":"2026.11.12.1","status":"SUCCESS","commitHash":"abcdef1234567"}'

curl -i "http://localhost:3001/api/v1/projects/<projectId>/deployments/<deploymentId>/impact?windowMinutes=60" \
  -H "Authorization: Bearer <accessToken>"
```

Impact comparison filters by project and environment and reports the before
and after counts, event rates, severity distribution, and first-seen
fingerprints. It labels a higher after-rate as a **possible correlation**, not
proof that the deployment caused the errors. Partial after-windows use
events-per-minute so their rate is not compared unfairly with a full window.
See `API_DOCUMENTATION.md` for lifecycle diagrams, all routes, curl examples,
and interview explanations.

## Start the frontend

In another terminal:

```powershell
cd fixflow-web
Copy-Item .env.example .env.local
npm install
npm run dev
```

The frontend API base URL defaults to `http://localhost:3001/api/v1`. If Next.js
chooses a port other than `3000`, set `WEB_ORIGIN` in the API `.env` to that
frontend origin and restart the API.

The web app provides `/login`, `/`, `/issues`, `/issues/:issueId`,
`/incidents`, `/incidents/:incidentId`, `/deployments`, `/analytics`,
`/alerts`, and `/projects`. After signing in, create an organization and
project if your account has none. Dashboard and analytics pages then use the
selected organization/project instead of preview data.

The API client keeps the access JWT in memory, sends the refresh credential
only as an HttpOnly cookie, and retries a protected request once after a 401
and successful token rotation. Browser requests include credentials. `WEB_ORIGIN`
must exactly match the frontend origin; the API checks supplied origins on
cookie-based authentication routes. Do not copy tokens or project API keys
into browser logs, screenshots, local storage, or source code.

## Dashboard, analytics, and alerts

The dashboard defaults to the last 24 hours and supports 7-day and 30-day
ranges, organization/project selection, and environment filters. The analytics
screen includes error trends/distribution, endpoints, frequent issues,
resolution duration, and incident trends. A dashboard response can also be
queried directly:

```bash
curl -G http://localhost:3001/api/v1/organizations/<organizationId>/analytics/dashboard \
  -H "Authorization: Bearer <accessToken>" \
  --data-urlencode "projectId=<projectId>" \
  --data-urlencode "environment=production" \
  --data-urlencode "from=2026-11-12T00:00:00.000Z" \
  --data-urlencode "to=2026-11-13T00:00:00.000Z"
```

Configure a project-scoped critical alert:

```bash
curl -i -X POST \
  http://localhost:3001/api/v1/organizations/<organizationId>/alert-rules \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production critical errors","type":"CRITICAL_ERROR","projectId":"<projectId>","environment":"production","cooldownMinutes":15}'
```

`ERROR_SPIKE` rules need `thresholdCount` and `windowMinutes`; event counts use
the database clock and accepted-event timestamps. Matching rules create
in-app notifications and record email as `simulated`; no email is sent.
Deployment comparisons are possible correlations only, not causal proof.
Refer to `API_DOCUMENTATION.md` for rule, notification, and response details.

## Run checks

```powershell
cd fixflow-api
npm run build
npm run lint
npm test
npm run test:e2e
```

The end-to-end suite uses the configured MySQL database and requires the
migrations to have been applied. It creates uniquely named test accounts and
deletes each account after its test.

## Docker development and production

The development Compose stack starts MySQL, Redis, NestJS and Next.js. Optional
FastAPI can be started with the `ai` profile after configuring the shared
service token and local Ollama URL:

```powershell
docker compose --env-file fixflow-api/.env -p fixflow-ai up -d --build
docker compose --env-file fixflow-api/.env -p fixflow-ai --profile ai up -d --build ai-service
```

Docker Desktop must be running. Compose maps MySQL to host port `33316`,
Redis to `6379`, the API to `3001`, and the web app to `3000` by default.
MySQL and Redis are only bound to loopback in development. Run migrations from
the API host environment with `npm run migration:run`. The AI profile does not
pull Ollama models; download them manually on the host as described below.
Stop services without deleting volumes with `docker compose ... stop`; do not
use `down -v` on data you want to keep.

Production Compose is separate and secret-file based. Follow the complete
secret setup, private-network, migration, TLS and backup steps in
[DEPLOYMENT.md](./DEPLOYMENT.md). In brief:

1. Copy `.env.production.example` to ignored `.env.production` and set
   deployment URLs, database name/user, and image/build options.
2. Create the required files in ignored `secrets\` using random values; never
   put secret values in Compose, Dockerfiles, source control or chat.
3. Build images and start only MySQL and Redis; verify both are healthy.
4. Run the explicit migration profile, then start the API and frontend.
5. Add optional AI and monitoring overlays only when their secret files and
   local services are configured. Ollama remains external and optional.

The production configuration binds web/API and optional monitoring ports to
`127.0.0.1`; put a TLS reverse proxy in front before allowing remote users.
MySQL, Redis and FastAPI have no published production ports. No automatic
production deploy is configured.

## Background AI jobs, logging and monitoring

Synchronous issue/incident analysis stays supported. With Redis reachable and
`QUEUE_ENABLED=true`, the API also offers `POST /api/v1/ai/issues/:issueId/analysis-jobs`,
`POST /api/v1/ai/incidents/:incidentId/analysis-jobs`, and
`GET /api/v1/ai/analysis-jobs/:jobId`. Job data contains source/user IDs and
options rather than copied stack traces or credentials. Jobs use deterministic
IDs, up to three attempts with exponential backoff, bounded worker concurrency,
and Redis-backed state. A worker derives a stable investigation ID so retries
do not create duplicate saved investigations. A failed job can be resubmitted
after the underlying issue is addressed; queue state is not a replacement for
the MySQL source records.

API and Python logs are structured JSON and carry `X-Request-ID` across the
gateway. Request bodies, cookies, query strings, and credentials are not logged.
`GET /api/v1/health` is liveness; `/api/v1/health/ready` checks MySQL and the
enabled queue. The API metrics endpoint is
`GET /api/v1/internal/metrics`; it requires a bearer token configured through
`METRICS_TOKEN` (or `METRICS_TOKEN_FILE`) and returns 404 when disabled.
Prometheus/Grafana are optional, loopback-bound in the production overlay.
See [DEPLOYMENT.md](./DEPLOYMENT.md) for dashboard access and token setup.

## MySQL backup and restore

Install MySQL 8.4 client tools locally and configure the existing ignored
`fixflow-api/.env`. The PowerShell script saves a timestamped SQL dump under
`backups\mysql`, verifies its header and SHA-256, and keeps 14 days by default:

```powershell
.\scripts\backup-mysql.ps1
```

For production Compose, after creating `.env.production` and the mounted secret
files, run:

```powershell
.\scripts\backup-mysql.ps1 -Docker
```

Restores are explicit and destructive to tables with matching names. Prefer
restoring to a newly-created, empty recovery database first; inspect the file
and verify its SHA-256 before importing. The script requires both a switch and
an interactive confirmation:

```powershell
Get-FileHash .\backups\mysql\fixflow-<database>-<timestamp>.sql -Algorithm SHA256
.\scripts\restore-mysql.ps1 `
  -BackupFile .\backups\mysql\fixflow-<database>-<timestamp>.sql `
  -Database fixflow_recovery `
  -ConfirmRestore
```

The backup contains production data: restrict access to the backup directory,
use encrypted storage, and copy it to a separate protected location according
to the operator's retention requirements. The script's 14-day cleanup only
targets matching `fixflow-<database>-*.sql` files inside the selected backup
directory. Periodically restore a copy into an isolated database and verify
migrations and application health; a file hash alone does not prove that the
SQL can be restored. Never test restore over a live database.

## Authentication notes

- Access tokens are short-lived JWTs (15 minutes by default) returned in the
  response body.
- Refresh tokens are opaque, rotated, stored only as SHA-256 hashes, and sent
  to the browser only in an HttpOnly cookie.
- New accounts receive the `DEVELOPER` platform role. Roles are centralized as
  `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `DEVELOPER`; users cannot choose an
  elevated role at registration.
- Registration passwords must be 12–72 characters, fit within bcrypt's
  72-byte input limit, and include uppercase/lowercase letters, a number, and
  a special character.
- Local cookies are not marked `Secure` because local development uses HTTP.
  Production requires secure cookies.
- Cookie-based auth POST endpoints validate a supplied browser `Origin`
  against `WEB_ORIGIN`. `SameSite=Lax` is the local/same-site default. Read the
  CSRF section and curl examples in `API_DOCUMENTATION.md` before changing
  production cookie settings.
- Password reset email delivery is not part of this phase.

## Optional local AI investigation

FixFlow works normally when AI is not configured. To enable Phase 9, install
Python 3.12 and Ollama, then create the Python environment from the
`fixflow-ai-service` folder:

```powershell
cd fixflow-ai-service
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

The current host Python is 3.14; Sentence Transformers/PyTorch support is
version-sensitive, so the service manifest intentionally supports Python
3.11–3.13 instead. The test suite can run with the installed Python 3.14
because it injects a deterministic test-only encoder; production embeddings
must use the configured Sentence Transformers model.

Install Ollama from its official Windows installer, start Ollama, then pull a
local model manually. The default is the already available, relatively small
`deepseek-coder:latest`; you can choose a model that fits your hardware by
setting `OLLAMA_MODEL` in `fixflow-api/.env` and the Python process environment
to the same value.

```powershell
ollama pull deepseek-coder:latest
ollama list
```

Verify the Ollama Windows service and model before starting Python:

```powershell
Get-Service Ollama
Start-Service Ollama
Invoke-RestMethod http://127.0.0.1:11434/api/tags |
  Select-Object -ExpandProperty models |
  Select-Object name, size
ollama run deepseek-coder:latest "Reply with a short JSON object containing status: ok"
```

`deepseek-coder:latest` is a quantized model of roughly 0.8 GB on disk; the
running model and inference context need additional RAM. Keep the prompt and
context bounded and close other memory-heavy applications if the host has
limited free RAM. The default embedding model is also small on disk, but its
PyTorch runtime needs additional memory and an initial download. Check free
memory before loading both models concurrently.

Do not pull a model as part of normal application startup. The configured
embedding model defaults to
`sentence-transformers/all-MiniLM-L6-v2`; its weights are loaded on the first
AI search/index request and cached locally. An initial download may require
internet access, but runtime inference and vector search are local.

Generate one random service-to-service token and store it only in the ignored
`fixflow-api/.env` file. Do not paste it in chat, source code, or logs:

```powershell
$aiToken = node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
Add-Content -Path .\fixflow-api\.env -Value "AI_SERVICE_TOKEN=$aiToken"
Add-Content -Path .\fixflow-api\.env -Value "AI_SERVICE_URL=http://127.0.0.1:8000"
Add-Content -Path .\fixflow-api\.env -Value "OLLAMA_MODEL=deepseek-coder:latest"
```

Start the local AI service in a separate terminal. This reads the same token
from the local environment file without printing it:

```powershell
cd fixflow-ai-service
.\.venv\Scripts\Activate.ps1
$tokenLine = Get-Content ..\fixflow-api\.env | Where-Object { $_ -match '^AI_SERVICE_TOKEN=' } | Select-Object -First 1
if (-not $tokenLine) { throw 'AI_SERVICE_TOKEN is missing from fixflow-api/.env' }
$env:AI_SERVICE_TOKEN = $tokenLine.Substring('AI_SERVICE_TOKEN='.Length)
$env:OLLAMA_MODEL = 'deepseek-coder:latest'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then restart the NestJS API so it reads `.env`, apply its migrations, and
start the frontend as usual. Check the authenticated gateway health endpoint:

```powershell
curl.exe http://localhost:3001/api/v1/ai/health -H "Authorization: Bearer <accessToken>"
```

### Complete startup order

1. Start Docker/MySQL (or the configured local MySQL service) and verify the
   exact configured host port with `Test-NetConnection`.
2. From `fixflow-api`, run `npm run migration:show`, then `npm run
   migration:run`; both use the same ignored `.env`.
3. Start Ollama and confirm the configured model appears at
   `http://127.0.0.1:11434/api/tags`.
4. Start the FastAPI service on `127.0.0.1:8000` as above.
5. Start NestJS with `npm run start:dev` from `fixflow-api`.
6. Start Next.js with `npm run dev` from `fixflow-web`.
7. Sign in, open an existing issue/incident, and explicitly request AI
   analysis. The initial embedding-model download can take time.

### Troubleshooting

- **MySQL `ECONNREFUSED`:** Docker Desktop may be stopped, the MySQL service
  may be stopped, or `MYSQL_PORT` may not match the published/listening port.
  Compose defaults to host port `33316`; a local MySQL service typically uses
  `3306`. Check `docker ps` and `Test-NetConnection`.
- **XAMPP MariaDB system-table errors:** XAMPP's bundled server is MariaDB, not
  the project's MySQL 8.4 target. If its Aria grant tables are corrupt, do not
  run a repair/upgrade against a shared data directory without a backup. Use
  Docker or a separate MySQL Community installation and leave other projects'
  schemas untouched.
- **Migration table already exists:** do not drop it. Inspect
  `npm run migration:show` and `typeorm_migrations`, then compare the existing
  schema to the migration before taking any corrective action.
- **AI reports not configured:** verify `AI_SERVICE_URL` and
  `AI_SERVICE_TOKEN` are both set in the ignored API `.env`, then restart
  NestJS. The token must be identical in the Python process environment.
- **AI returns service unavailable:** check FastAPI `/health`, the shared
  token, and the URL reachable from NestJS. For containerized FastAPI use
  `host.docker.internal` to reach host Ollama; for host FastAPI use
  `127.0.0.1`.
- **Embedding or Ollama memory errors:** check available RAM, use the
  configured lightweight local models, close memory-heavy processes, and
  retry. Do not substitute an external paid API.
- **Ollama model not found:** run `ollama list` and `ollama pull` for the
  exact `OLLAMA_MODEL` name, then restart Ollama if needed.

Alternatively, run the AI service with Docker (the model itself remains on the
host and is never pulled by Compose):

```powershell
docker compose --env-file fixflow-api/.env -p fixflow-ai --profile ai up -d ai-service
```

For containerized Python, configure `AI_SERVICE_URL` in the API to the
host-published URL and set `OLLAMA_BASE_URL` to
`http://host.docker.internal:11434` for the AI container.

The default embedding provider is HuggingFace Sentence Transformers. If
PyTorch is unavailable or the machine is memory-constrained, the service also
supports Ollama embeddings without installing PyTorch. Configure both
processes consistently using `AI_EMBEDDING_PROVIDER=ollama` and
`AI_EMBEDDING_MODEL=nomic-embed-text:latest`; pull that small embedding model
only if it is not already present:

```powershell
ollama pull nomic-embed-text:latest
```

Changing embedding providers/models changes vector dimensions. Use a fresh
Chroma collection/data path when switching an existing index between models;
do not mix embeddings from different models in one collection.

### AI endpoints and behavior

Issue and incident detail pages provide explicit **Analyze with AI** actions;
the application does not run inference on every ingested event. It also
supports a separate similar-issue query from the issue page. Analysis is
retrieved only after the backend validates organization membership and source
ownership, and is then sent over a private shared-token connection to FastAPI.
If Python, embeddings, or Ollama is unavailable, the API reports a clear 503 or
504 error and issue/incident functionality remains usable.

AI analyzes sanitized issue events, incident timelines and linked issues,
resolution notes, related historical issues/incidents, and deployment metadata.
Semantic results are restricted to the same organization and project scope,
then rechecked against MySQL before they are returned. The UI distinguishes
evidence from hypotheses, shows a confidence indicator, and warns that
recommendations are unverified. No generated code is executed.

See the **Phase 9 AI incident intelligence** section in
`API_DOCUMENTATION.md` for the request/response examples, Python internal
routes, RAG diagram, security decisions, limitations, and interview questions.

Stop the database without removing its data with:

```powershell
docker compose --env-file fixflow-api/.env -p fixflow-ai stop mysql
```
