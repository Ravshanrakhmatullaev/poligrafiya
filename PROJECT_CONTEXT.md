# Poligrafiya — Ads uz Internal Management System

Internal CRM/ERP web app for **Ads uz** (poligrafiya = printing business, Uzbekistan).
Uzbek-language UI. Plain HTML/CSS/JS (no framework, no bundler) backed by Supabase.

## Repo

- GitHub: `Ravshanrakhmatullaev/poligrafiya`
- Branch: `main` (single-branch workflow, direct commits)

## Stack

- **Frontend**: vanilla JS, loaded via `<script>` tags in `index.html` — no build step.
- **Backend**: Supabase (Postgres + Auth), client bundled locally as `supabase.min.js`.
- **Charts**: `chart.min.js` (Chart.js, vendored).
- **PWA**: `manifest.json` + icons — installable.
- **Tests**: Playwright (`tests/*.spec.js`), config in `playwright.config.js`.
- **Telegram integration**: notifications sent via a Vercel webhook endpoint (bot token is never stored client-side).

## Load order (see comments in each file)

```
config.js → utils.js → db.js → auth.js → panels/*.js → app.js
```

- `js/config.js` — constants: Supabase URL/anon key, role map (`ROLES`), employee display names (`XODIMLAR`), commission tiers (`FOIZ`), KPI targets/bonuses/fines, print pricing tables.
- `js/auth.js` — Supabase email/password login, role resolution, per-role nav visibility, first-visit "yo'riqnoma" (onboarding) screens tracked via `sessionStorage`.
- `js/db.js` — Supabase data access layer.
- `js/utils.js` — shared helpers.
- `js/app.js` — app controller: theme system (auto light/dark by time of day + system preference), mobile hamburger nav, panel routing.

## Roles

Defined in `ROLES` (config.js), keyed by email:

- `owner` — full access, sees owner panel.
- `admin` — management panel; onboarding gate on first login.
- `ishlab` (ishlab chiqarish = production) — production-floor panel.
- `dizayner` (designer) — design panel + stopwatch/timer tracking (`loadTimers`).
- `uvdtf` — restricted single-purpose role, only sees the UV DTF report panel.

Users are provisioned as Gmail `+alias` addresses under the owner's account (e.g. `ra.ravshan1998+abror@gmail.com`).

## Panels (`js/panels/`)

- `dashboard.js` — main overview/KPIs.
- `history.js` — order/transaction history (largest panel, ~1300 lines).
- `kalk.js` — pricing calculator (uses `ISH_FORMAT` / `PECHAT_NARX` tables).
- `sklad.js` — warehouse/inventory.
- `bozorlik.js` — purchasing/shopping list.
- `dizayner.js` — designer workflow panel.
- `foiz.js` — commission (foiz = percentage) view, tiered by `FOIZ`.
- `uvdtf.js` — UV DTF partner report.
- `xabar.js` — messaging/notifications (polled every 30s via `loadMessages`).

## Conventions

- No localStorage for theme (explicit requirement in code comment) — theme is in-memory + `sessionStorage` only for onboarding "seen" flags.
- Comments and section banners are in Uzbek; keep new comments consistent with that style where the surrounding file already does.
- No package.json build/dev scripts beyond Playwright tests — `index.html` is opened/served directly.

## Working agreement

- All work for this project happens only in this repo (`D:\Projects\poligrafiya`). Do not reference or touch any other project/repo.
- Commit and push changes directly — no manual upload steps.
