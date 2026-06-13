# Kishore Sabha Coordinator

Serverless Kishore Sabha dashboard + Telegram bot built for:
- `GitHub Pages` frontend hosting
- `Cloudflare Workers` backend/webhook/scheduler
- `Cloudflare D1` as the single database

This version removes local hosting, Docker hosting, and always-on personal machines. There is one live app, one live bot, and one live database.

## What v1 includes
- Member management with BKMS ID, center, coordinator flag, and optional manual Telegram chat ID
- Telegram linking with `/start <token>`
- Telegram self-registration with first name, last name, BKMS ID, and allowed center list
- Weekly Sabha planning with partial role assignment support
- Role template editing
- Send only new or changed assignments
- Confirm / `Can't do it` inline Telegram actions
- Decline reason capture and coordinator notification
- 24-hour follow-up for unanswered assignments
- Saturday 8:00 p.m. and daily 12:00 p.m. coordinator reminders
- Sabha history with send/confirm/decline state

## What v1 intentionally does not include
- File uploads
- Sabha summary attachments
- Group summary posting
- Excel report generation

Those can come back later in a phase 2 using Cloudflare R2.

## Project layout
- [`client`](./client): React dashboard for GitHub Pages
- [`cloudflare`](./cloudflare): Worker code and D1 migrations
- [`scripts/export-sqlite-to-d1-seed.js`](./scripts/export-sqlite-to-d1-seed.js): exports your old local SQLite data into D1 seed SQL
- [`scripts/set-telegram-webhook.mjs`](./scripts/set-telegram-webhook.mjs): sets the Telegram webhook URL

## Local development
1. Install dependencies:

```bash
npm install
npm --prefix client install
```

2. Create `.dev.vars` from `.env.example` and fill in your Cloudflare Worker secrets.

3. Create a D1 database in Cloudflare and update `wrangler.toml` with the real `database_id`.

4. Apply migrations:

```bash
npm run d1:migrate
```

5. Run the Worker and the client:

```bash
npm run dev
```

- Worker dev server: `http://127.0.0.1:8787`
- Client dev server: `http://127.0.0.1:5173`

## Deploying the Cloudflare Worker
1. Install and authenticate Wrangler:

```bash
npx wrangler login
```

2. Create the D1 database:

```bash
npx wrangler d1 create kishore_sabha
```

3. Copy the returned D1 database ID into [`wrangler.toml`](./wrangler.toml).

4. Add Worker secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put AUTH_SIGNING_SECRET
```

5. Deploy the Worker:

```bash
npm run deploy:worker
```

6. Set the Telegram webhook URL in `.env` and run:

```bash
npm run set:webhook
```

Use the deployed Worker URL plus `/telegram/webhook`, for example:

```text
https://your-worker.your-subdomain.workers.dev/telegram/webhook
```

## Deploying the dashboard to GitHub Pages
1. Push the repo to GitHub.
2. In GitHub repository settings:
   - enable GitHub Pages via GitHub Actions
   - create repository variable `VITE_API_BASE`
3. Set `VITE_API_BASE` to:

```text
https://your-worker.your-subdomain.workers.dev/api
```

4. Push to `main` or manually run the `Deploy GitHub Pages` workflow.

The Pages workflow is defined in [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml).

## Migrating old local SQLite data into D1
If you want to preserve your existing local members, assignments, and history:

1. Export seed SQL from the old SQLite database:

```bash
npm run export:seed
```

2. This writes:

```text
cloudflare/seed.sql
```

3. Import that seed into D1:

```bash
npx wrangler d1 execute kishore_sabha --file cloudflare/seed.sql
```

## Important environment values
Worker config is driven by `wrangler.toml` vars plus secrets.

Useful values:
- `TIMEZONE`
- `ALLOWED_ORIGINS`
- `GITHUB_PAGES_ORIGIN`
- `BOT_USERNAME`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_PASSWORD`
- `AUTH_SIGNING_SECRET`

## Notes
- Telegram only allows one active bot webhook/worker path at a time. This architecture solves the old polling conflict because Cloudflare is now the only live bot runtime.
- If you manually save a Telegram chat ID for a person, Telegram may still require that user to have started the bot once before the bot can message them.

## Verification
Run tests:

```bash
npm test
```

Build the GitHub Pages frontend:

```bash
npm run build
```
