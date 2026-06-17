# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run typecheck    # tsc --noEmit (fast standalone type check)
npm run test         # Compile tests (tsconfig.tests.json) + run Node's test runner
npm run lint         # ESLint check
npm run start        # Start production server
```

Verify changes with **`npm run typecheck` → `npm run test` → `npm run build`** (all three).

**Testing notes:**
- Tests are `tests/**/*.test.ts`, run by Node's built-in `node --test` against JS that `tsconfig.tests.json` compiles into `.tmp/tests/`. Tests import sources with **relative paths** (`../../src/lib/...`), not the `@/` alias.
- `tsconfig.tests.json` has an **explicit `include` allowlist** — a new `src/lib/*` file is only compiled for tests if you add it there. Pure (import-free) modules are easiest to unit test.
- `npm test`'s `**` glob needs **Node ≥ 22**. On Node 18 run tests directly: `npm run test:build && node --test $(find .tmp/tests/tests -name '*.test.js')`, or a single file: `... node --test .tmp/tests/tests/<dir>/<name>.test.js`.

## Deployment

Deployed on Vercel. Production deploy:
```bash
vercel deploy --prod
```
Production URL: https://investment-advisor-one.vercel.app

## Architecture Overview

Next.js 15 App Router application that analyzes US stocks using a **3-screener scoring system** (Chart + Valuation + Sentiment). The only external data dependency is `yahoo-finance2`.

### Scoring Pipeline

```
Yahoo Finance Data → Individual Screeners → Combined Screener → Verdict + Action Guide
```

**Three core screeners produce a 0-70 total score:**
- **Chart Screener** (0-25): MA crossover, deviation from MA200, RSI, W/M patterns, market breadth
- **Valuation Screener** (0-20): PE vs market, fair price estimate, PEG, market PE level
- **Sentiment Screener** (0-25): VIX, Put/Call ratio, AAII sentiment, margin debt, HY spread

**Key design principle — contrarian scoring:** Higher score = more market fear = better buy opportunity. This inverts typical sentiment interpretation.

**Score → Verdict thresholds** (defined in `combined-screener.ts`):
- ≥53: Very Bullish (extreme fear) → 42-52: Bullish → 28-41: Neutral → 18-27: Bearish → <18: Very Bearish (extreme euphoria)

**Optional supplementary screeners:**
- **Dividend Screener** (+0-20): Yield, safety, growth, consecutive increase streak
- **Masters Screener**: 8 legendary investor strategy evaluations (Buffett, Graham, Lynch, etc.)
- **ETF Screener** (0-70): Chart + Efficiency + Momentum (separate scoring for ETFs)

### Data Flow

**Single ticker** (`/api/screener/combined/[ticker]`): Parallel fetch of chart/financial/sentiment/dividend/masters data → score each → combine → return JSON.

**Daily screening** (`/api/screening/daily`, logic in `screeners/auto-screener.ts`): Batch-processes the ~193 stocks from `stock-universe.ts` (`getAllTickers()`) in groups of 5 with ~300ms delays (Yahoo Finance rate limiting). Caches for 4 hours. Categorizes into: Fear Buys, Undervalued, Dividend Attractive, Momentum Leaders, Sector Rotation.

**ETF screening** (`/api/screening/etf`, `screeners/etf-auto-screener.ts`): Similar batch pipeline for the ETFs in `etf-universe.ts`.

### Research & Monitoring Tools (separate from the 0-70 score)

These are intentionally **not** trade signals and do not feed the combined verdict. They follow a strict research posture: measure against a random/null baseline and surface an honest verdict (no edge → say so). Empirically the bitgak strategy shows **no trading edge**, and the pages render that conclusion — do not re-frame these as buy/sell signals.

- **Bitgak** (`/bitgak`, `screeners/bitgak.ts` + `bitgak-screener.ts`): mechanical detection of 저저고/고고저 **weekly log-space trendlines** across the universe. Includes line-quality gates (no-violation, touch count, strength, slope, expiry), volume-confirmed breakouts, retest "밟기" entry points, quality stratification (2-touch vs 3-touch+ breakout rate vs synthetic ~25% null), and a built-in entry backtest (entry vs same-direction random baseline) — all computed in `runBitgakScreening`. Uses weekly OHLCV from `fetchWeeklyBars` (7-day TTL). Pivot confirmation delays detection by ~5 weeks (not a realtime signal).
- **Signals** (`/signals`, `signals.ts` pure parse + `signals-store.ts`): receives TradingView webhook alerts at `/api/signals/webhook`, stores them in **Upstash Redis** (REST via `fetch`, env `UPSTASH_REDIS_REST_URL`/`_TOKEN` or legacy `KV_REST_API_*`) with an **in-memory fallback** when unset. Webhook auth via `SIGNALS_WEBHOOK_SECRET` (query `?token=` or body `secret`). Setup/deploy guide: `docs/signals-webhook.md`.

### Key Directories

```
src/
├── middleware.ts           # Next.js root middleware — rate limiting (30 req/min per IP, /api/* only)
├── app/                    # Pages + API routes
│   ├── page.tsx            # Main stock analysis (single/multi ticker)
│   ├── discover/page.tsx   # Daily screening recommendations
│   ├── etf/page.tsx        # ETF recommendations
│   ├── legends/page.tsx    # Legendary-investor strategy screening
│   ├── bitgak/page.tsx     # Bitgak weekly-trendline research tool
│   ├── signals/page.tsx    # TradingView webhook signal feed
│   └── api/
│       ├── screener/       # Per-ticker analysis endpoints
│       ├── screening/      # Batch endpoints (daily, etf, sector, legends, bitgak)
│       └── signals/        # Webhook receiver + feed
├── lib/
│   ├── screeners/          # Scoring + research logic (chart, valuation, sentiment, dividend, masters,
│   │                       #   combined, etf, auto, etf-auto, bitgak, bitgak-screener)
│   ├── data/               # Data fetching (yahoo-finance.ts incl. fetchWeeklyBars) + stock/ETF universe lists
│   ├── signals.ts          # Pure TradingView payload parse (+ signals-store.ts: Upstash/in-memory)
│   ├── cache.ts            # In-memory cache with TTL presets
│   └── validate-ticker.ts  # Input sanitization (regex: /^[A-Za-z0-9.\-^]{1,10}$/) — rejects '=' (futures use batch only)
└── types/index.ts          # Shared TypeScript interfaces
```

### Caching

In-memory cache (`cache.ts`) with preset TTLs:
- **5 min**: VIX, quotes, market overview (REALTIME)
- **15 min**: Chart data, market breadth (CHART)
- **1 hour**: Financial data, sentiment, dividends (FINANCIAL/SENTIMENT)
- **4 hours**: Daily screening report
- **7 days**: Margin debt (WEEKLY, quarterly data from FRED)

Cache key convention: `chart:{ticker}`, `market:vix`, `screening:daily`, etc. Cache resets on deploy (process-bound).

### Frontend

All pages are self-contained `'use client'` components with no shared component library. UI text is hardcoded in Korean — no i18n system. Styled with Tailwind CSS (neo-brutalist: `#2A2A2A` bg, `#D4F94E` accent, `border-2 border-[#1A1A1A]` + hard shadow). Cross-page nav is duplicated per page (no shared nav component).

Scoring display uses `{score}/{max}점` format with color-coded interpretation. Verdicts include action-oriented Korean labels.

### Security

- Rate limiting middleware: 30 requests/min per IP sliding window
- Ticker validation: regex whitelist + uppercase sanitization
- Security headers in `next.config.mjs`: nosniff, DENY framing, XSS protection, strict referrer

### Important Conventions

- All UI text is in Korean. Respond in Korean when the user writes in Korean.
- Score maximums vary by screener (25/20/25 for core, 20 for dividend, 70 total). These are hardcoded throughout — changing a max requires updating both screener logic and UI.
- Sentiment screener data sources have fallback values. Each indicator tracks whether it's `'live'` or `'fallback'`.
- The `stock-universe.ts` and `etf-universe.ts` files define which tickers are analyzed in batch screening (bitgak adds chart-only extras like `MGC=F` in `BITGAK_EXTRA`, kept out of the stock universe so the scoring screeners don't run on futures).
- Bitgak/signals are **research & monitoring tools, not trade signals** — keep the random-baseline verification and "not a signal" disclaimers; don't re-litigate the no-edge finding.
- Path alias: `@/*` maps to `./src/*`.
- `git push` targets the `fork` remote (main's upstream); `origin` may be stale — use `git log @{u}..` / `git push`, not `origin/main`.
