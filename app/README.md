# 7RANSMI7 (`app/`)

Short-lived social network: Vite + React client, Hono API, shared Zod schemas, JSON file stores.

## Run locally

```bash
cd app
npm install
cp .env.example .env   # then edit secrets
npm run dev            # Vite + API (see package.json scripts)
```

From the repo root you can also use `npm run dev` (delegates to `app/`).

## Environment

See `.env.example`. Important:

| Variable | Notes |
|---|---|
| `SESSION_SECRET` | **Required in production** (min 16 chars). Dev/test may use a local default. |
| `VITE_API_BASE_URL` | Frontend API origin (no trailing slash). |
| `ALLOWED_ORIGINS` | Comma-separated CORS / CSRF allowlist. |
| `TRUST_PROXY` | Set when behind a trusted reverse proxy (or rely on `RENDER`). |
| `RESEND_API_KEY` | Optional; without it, OTP codes log to the API console (non-production only). |
| `OPENROUTER_API_KEY` | Optional; enables AI assist / companion / semantic search. |

## Architecture

```
app/
  src/       React client (Vite)
  server/    Hono API + JSON stores (tweets, users, otps, follows, messages, notifications, blocks)
  shared/    Zod schemas + constants shared by client and server
  data/      Runtime JSON files (gitignored except .gitkeep)
```

Auth: email OTP + password, `httpOnly` signed session cookie. Mutating browser requests are origin/referer-checked when those headers are present.

## Deploy

- **Client:** GitHub Pages (static Vite build). Point `VITE_API_BASE_URL` at the API.
- **API:** Render (or similar Node host). Set `SESSION_SECRET`, `ALLOWED_ORIGINS`, and optional Resend/OpenRouter keys. Enable `TRUST_PROXY` / rely on `RENDER` for rate-limit IP headers.

## Security notes

- Never ship without a strong `SESSION_SECRET` in production.
- Runtime data under `data/` is private — keep it out of git.
- Explore suggestions and user search require a signed-in session.
