# Connection Cleaner

Keep your network relevant. Upload your LinkedIn connections CSV, describe your ideal network, and get a ranked list of connections to keep, review, or consider removing. You perform any removals manually on LinkedIn.

## Run locally
```bash
npm install
cp .env.example .env.local   # optional; demo mode needs no credentials
npm run dev                  # http://localhost:3000
npm test                     # CSV, scoring, filtering, export tests
npm run build
```
Try it with `public/sample-connections.csv` (also linked in the app).

## Jev configuration
Set `JEV_API_URL` and `JEV_API_KEY` in `.env.local` (server-side only). **No public Jev API docs were available, so the Jev adapter is a stub** in `src/lib/providers.ts` and returns a clear "not implemented" error. Implement `jevProvider.analyze()` there; the UI, batching (100/request), consent gate and API route need no changes.

## Privacy
- CSV is parsed in the browser and kept in memory only; nothing is persisted.
- Demo mode scores on this app's own server with no external calls.
- Jev mode requires explicit consent before any data is sent. Secrets never reach the browser. No connection data is logged.
- No scraping, automation, or LinkedIn credentials. Exports neutralise spreadsheet formula injection.

## Mock / limited
- Demo scoring is keyword-based, not AI. Jev integration is not implemented.
