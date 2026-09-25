# Interview Prep Studio

Per-company interview preparation, personalized automatically.

Add each company you've applied to, then generate a tailored question set covering
four categories:

| Category        | What it is                                   | NVIDIA example (domain flavor)          |
|-----------------|----------------------------------------------|-----------------------------------------|
| **Coding**      | LeetCode-style algorithm problems            | CUDA vector-add kernel; parallel reduction |
| **Behavioral**  | STAR-format, company-culture questions       | "Tell me about making something dramatically faster" |
| **System design** | Architecture and scaling discussions       | GPU inference serving platform          |
| **Domain**      | Company-specific deep technical questions    | CUDA memory hierarchy; occupancy analysis |

Every question ships with **example test cases** (always visible) and a **final
solution** that is revealed only when you click **"Show me the solution"** — so you
can genuinely practice first. Track your progress per question
(To do / Practicing / Mastered) and per company (application stage).

## Quick start

Requirements: Node 18.17+ (this repo is pinned to Next.js 14 / Prisma 5 on purpose).
Set `DATABASE_URL` to a PostgreSQL database before running migrations.

```bash
cd interview-prep
npm install
npm run db:migrate          # apply PostgreSQL migrations
cp .env.example .env        # only if .env is missing
npm run dev                 # http://localhost:3000
```

Then in the UI: add a company (NVIDIA is pre-profiled) → **Generate question set**.
For runnable coding questions, choose **Practice in editor** to open the CodePad.

### Without an API key (default)

Out of the box the app uses the **curated offline generator**: hand-written,
company-specific questions for NVIDIA, OpenAI, Google, Meta, Amazon, Apple,
Microsoft, Anthropic, Tesla and Databricks, plus solid generic pools for any other
company. No network, no key, free. The generation dialog also offers this
curated fallback explicitly.

### With an OpenAI key (tailored AI questions)

```bash
# .env
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"      # cheap + good
OPENAI_RESEARCH_MODEL="gpt-4.1" # live interview-report research
OPENAI_WEB_RESEARCH="true"
QUESTION_PROVIDER="auto"        # auto: openai when key present, else curated
```

`QUESTION_PROVIDER` accepts `auto | openai | curated`. The OpenAI output is
validated with zod before touching the database and retried once on malformed JSON.
When an OpenAI key is present and `OPENAI_WEB_RESEARCH` is enabled, generation
first searches recent public interview reports. It prioritizes Reddit, Blind,
1Point3Acres, and other public interview-report sources, then supplies the
research brief to the question generator. The resulting question cards show the
source links under **Research sources**.

The generation dialog also accepts a one-time OpenAI key. It is sent only with
that request and is never saved in SQLite, local storage, or the generated
question set. Leave it blank, or choose **Use curated fallback**, to use the
offline path. Only enter a key over localhost or a trusted HTTPS deployment.

## Project layout

```
src/
  app/
    page.tsx                    # dashboard: companies + add form
    companies/[id]/page.tsx     # per-company workspace (client, calls the API)
    api/
      status/                   # GET  provider status / health
      companies/                # GET, POST (create company)
      companies/[id]/           # GET, PATCH, DELETE
      companies/[id]/questions/generate/   # POST generate + persist question set
      questions/[id]/           # GET  full question incl. solution (reveal)
                                # PATCH update practice status
      questions/[id]/run/       # POST run Python code against the server-side harness
  components/                   # UI building blocks (RSC islands + client cards)
  lib/
    companyKnowledge.ts          # profiles + curated questions per company
    research.ts                  # live public interview-report research
    llm/                         # pluggable question generators
      types.ts                   # LLMProvider contract + zod validation
      curated.ts                 # offline generator
      openai.ts                  # OpenAI generator
      index.ts                   # provider factory (auto/openai/curated)
    config.ts                    # all tunables (env overrides)
    prisma.ts / dto.ts / uiMeta.ts
    exec/                       # runtime detection, process limits, and runners
    practice/specs.ts           # checked Python starters and test harnesses
prisma/schema.prisma             # PostgreSQL Company, Question, TestCase
```

## How it works

1. You create a company (name + optional role).
2. The app looks up the company in `src/lib/companyKnowledge.ts` (fuzzy name match).
   Known companies get their domain profile + curated questions. Unknown companies
   fall back to the generic pools.
3. **Generate** resolves the provider from config:
   - no server or dialog key → curated generator returns profile questions (padded from generic pools)
   - server or dialog key present → OpenAI generates questions from a prompt that includes the
     company profile, its domain focus areas and the role; results are zod-validated.
4. The set replaces the previous one for that company (transactional), with
   `source: "curated" | "openai" | "openai-web"` and stable `sortOrder`.
5. The question list never contains solutions; the client fetches
   `GET /api/questions/:id` only when you click "Show me the solution".

For OpenAI generation, the first pass searches current public interview reports
for the company and role. The second pass turns that evidence into questions and
labels the set **AI + web research**. Search results are treated as untrusted
source material, not instructions, and exact-question claims are only made when
the reports support them.

## Accounts and data isolation

The app supports email/password registration and login. Passwords are stored as
scrypt hashes, and the browser receives only an HTTP-only, same-site session
cookie. Sessions are revocable database records; raw passwords and session
tokens are never stored.

Every company belongs to exactly one user. All company, question, solution,
generation, status, delete, and CodePad APIs enforce the current session and
filter through the owning user. Company names are unique per account, not
globally. A password must be at least 12 characters.

Companies created before accounts existed have no owner and are invisible to
everyone until the first account registers; that account adopts all ownerless
companies so pre-auth data is not lost.

## CodePad

The CodePad currently runs **Python 3**. It supports two modes:

- **Checked mode** runs the submitted function against a server-side test harness
  and shows each expected and actual result.
- **Freeform mode** runs a starter program and shows its stdout/stderr when no
  checked harness exists. It is marked "no auto-check" in the UI.

Open a coding question and click **Practice in editor**. Drafts are saved in
browser local storage per question and language. **Run tests** (or
Cmd/Ctrl+Enter) executes the code, and **Reset** restores the starter. A checked
question is automatically marked **Mastered** only when every test passes.
Freeform runs never auto-mark a question.

The built-in checked specs are in `src/lib/practice/specs.ts`. Questions generated
by OpenAI can still show a freeform editor when they include starter code, but
they are not automatically graded unless a matching server-side harness is
added.

### CodePad configuration

```bash
# .env
CODE_EXECUTION_ENABLED=true   # development default; production default is false
RUN_TIMEOUT_MS=8000            # allowed range: 1000–60000
MAX_RUN_OUTPUT_CHARS=64000    # per stream; allowed range: 2000–500000
```

`POST /api/questions/:id/run` also limits submitted code to 100 KB. The
`GET /api/status` response reports whether execution is enabled and which
runtimes were detected.

Live interview research uses OpenAI web search and adds search/tool cost to
generation. Set `OPENAI_WEB_RESEARCH=false` to disable it, or use
`QUESTION_PROVIDER=curated` for a completely offline generator.

The runner uses a temporary working directory, a minimal environment, output
limits, and a wall-clock timeout. This is **process-level containment, not a
security sandbox**: submitted code runs with the server user's operating-system
permissions. Keep CodePad local or place it behind authentication and a real
sandbox before exposing it to other users. In production, leave
`CODE_EXECUTION_ENABLED=false` unless you have added that isolation.

Only Python is registered today. C++ is intentionally deferred until a working
compiler toolchain is available. To add a language later, implement a
`LanguageRuntime` in `src/lib/exec/`, register it in `src/lib/exec/runner.ts`,
add its schema metadata in `src/lib/exec/types.ts`, and provide language-specific
starters and harnesses in `src/lib/practice/specs.ts`.

## Extending (this is designed to be easy)

### Add a new company profile
Open `src/lib/companyKnowledge.ts`, add an entry to `companyProfiles`:

```ts
{ name: "Netflix", domains: ["CDN", "media streaming", "JVM performance"],
  focusAreas: ["Adaptive bitrate streaming architecture", "Cache/CDN edge serving",
               "JVM tuning for low latency"],
  curated: [ ...your hand-written GeneratedQuestion[]... ] }
```

`domains`/`focusAreas` feed OpenAI prompts; `curated` powers offline generation.
The four categories appear automatically (empty categories are simply hidden).

### Add a new LLM provider (Anthropic, Gemini, local Ollama…)
1. Implement `LLMProvider` in a new file under `src/lib/llm/`
   (`generateQuestions(input, perCategory) => GeneratedQuestion[]`).
2. Register it in `src/lib/llm/index.ts` (`PROVIDERS` + `resolveProvider`).
3. Add its env vars to `src/lib/config.ts` and `QUESTION_PROVIDER` support.

### Ship a new fetch/save
All routes live under `src/app/api/` with zod validation at the boundary; models
live in `prisma/schema.prisma` (run `npm run db:migrate` after schema changes).

### Database

The app now uses PostgreSQL for local and hosted runs. Neon/Vercel Postgres is
recommended. Set `DATABASE_URL`, then run `npm run db:migrate`. The old SQLite
development migrations are retained under `prisma/migrations-sqlite/` for history;
the active PostgreSQL baseline is under `prisma/migrations/`.

## Security & deployment notes (for when you put this on a domain)

Current posture: **authenticated multi-user app**. Before exposing it broadly:

- **Auth**: database-backed sessions and ownership checks are implemented, but
  add distributed rate limiting and account recovery/email verification before
  treating this as a production identity system.
- **HTTPS**: terminate TLS at a proxy (Caddy/nginx/Cloudflare) or a platform's
  managed TLS. Never serve plain HTTP with auth cookies.
- **Secrets**: the server-side `OPENAI_API_KEY` lives in `.env` (gitignored) and
  is never included in a client bundle. A key typed into the generation dialog is
  transient, but still requires localhost or trusted HTTPS. Never paste keys into
  shared or untrusted deployments.
- **Rate limiting**: add per-user rate limits to `POST /api/...` (generation calls
  spend your OpenAI budget and live research adds another billable call);
  e.g. `@upstash/ratelimit` or a simple in-DB token bucket.
- **Code execution**: do not expose `/api/questions/:id/run` publicly without a
  sandbox, authentication, resource limits, and rate limiting. The local runner
  is not sufficient isolation for untrusted users.
- **Dependency hygiene**: this scaffold is pinned to Next 14.2.35 (the final
  14.x), which needs only Node 18.17. The audit currently reports known Next.js
  advisories. For a public deployment on current runtime, upgrade Next to the
  latest 15/16 line first (needs Node 20+), then re-run `npm audit`.
- **Database backup**: use the managed backup and branching tools provided by
  Neon/Vercel Postgres.
- **Error handling**: API routes return sanitized messages; in production set
  `NODE_ENV=production` and revisit `src/lib/prisma.ts` logging.

## Scripts

```bash
npm run dev          # local dev server
npm run build        # production build
npm run start        # serve production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run db:migrate   # apply PostgreSQL schema changes
npm run db:studio    # browse the configured PostgreSQL database
npm run verify:practice # exercise checked harnesses against a running app
```

## Data model

- `User` — email, scrypt password hash, created timestamp
- `Session` — hashed token, expiry, user relation
- `Company` — owner, name (unique per owner), role, stage (`APPLIED|PREP|INTERVIEWING|OFFER|REJECTED`), notes
- `Question` — company, category, title, prompt, difficulty, solution (markdown), status (`TODO|PRACTICING|MASTERED`), source, research source links, optional CodePad execution spec
- `TestCase` — input, expected, explanation, hidden (reserved for autograding later)

Deleting a company cascades to its questions and test cases.
