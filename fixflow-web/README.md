# FixFlow AI web

The Next.js App Router client for FixFlow AI. It provides authenticated,
organization-scoped monitoring and management views while keeping the existing
dark dashboard visual language.

## Local development

Run the NestJS API and MySQL first; see the repository
[setup guide](../SETUP_GUIDE.md). Then:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

The API URL defaults to `http://localhost:3001/api/v1`. `.env.local` is ignored
by git and must not contain credentials or project API keys.

## Routes

| Route | Screen |
| --- | --- |
| `/login` | Register or sign in |
| `/` | Live organization dashboard |
| `/issues` and `/issues/:issueId` | Issue list and event details |
| `/incidents` and `/incidents/:incidentId` | Incident list and timeline |
| `/deployments` | Project release history and error comparison |
| `/analytics` | Trends and reliability metrics |
| `/alerts` | Alert rules and notification history |
| `/projects` | Organization project management |

Access tokens remain in memory. Refresh tokens are sent only as an HttpOnly
cookie with credentialed requests. API errors are shown in the relevant view;
email notifications are labeled as simulated.

```powershell
npm run lint
npm run build
```
