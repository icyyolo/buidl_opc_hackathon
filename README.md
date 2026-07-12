# Revenue Chief

Revenue Chief is an explainable revenue-triage assistant for solo founders and one-person companies. A founder provides an unstructured brain dump of tasks, messages, deadlines, client commitments, and stated deal values. The product is designed to identify the three actions most likely to move cash today, explain the reasoning, park lower-value work safely, identify blockers, and prepare the messages needed to act.

> **Current status:** the React frontend, response contract, mock payload, and health endpoint are implemented. The live AI pipeline and `POST /process` backend route described in the project plans are **not yet implemented in this checkout**. The frontend therefore builds and tests successfully, but submitting the form to the current backend returns `404` until the process endpoint is added.

## Product idea

Revenue Chief is deliberately narrower than a general task manager or calendar planner. It asks:

> Which commitment changes cash today, and what is the evidence?

The intended result contains:

- Up to three **Money Moves** ordered by revenue impact and urgency.
- A **Blocked → Unblock** section with concrete dependency-clearing actions.
- A **Parked Safely** section explaining why work can wait.
- An **All Commitments** audit trail containing every extracted obligation.
- Grounded message drafts only for selected actions and useful unblock requests.

Each commitment is assigned one revenue motion:

| Motion | Meaning |
| --- | --- |
| `collect` | Collect money already earned or owed. |
| `close` | Win, renew, or expand revenue. |
| `deliver` | Complete paid work or unlock an invoice. |
| `retain` | Protect an existing paying relationship. |
| `grow` | Build future pipeline or relationships. |
| `operate` | Run the business without a direct near-term revenue outcome. |

Priority is intentionally deterministic:

```text
priority = revenue_proximity * 3 + urgency
```

Both inputs use a 1–5 scale. Weighting revenue proximity three times makes the product's revenue-first claim mechanically inspectable rather than leaving the final order entirely to an opaque model judgment.

## Intended pipeline

The planned backend performs four sequential stages:

```text
Founder brain dump
       |
       v
1. Extract commitments, exact source text, dates, and stated values
       |
       v
2. Classify revenue motion and score revenue proximity + urgency
       |
       v
3. Decide: Money Moves, Parked, and Blocked
       |
       v
4. Prepare only the messages needed to execute the decision
```

Structured response models and cross-stage validation are intended to ensure that:

- Every extracted commitment is conserved.
- Plan buckets do not overlap and cover every commitment.
- Evidence is copied from the submitted brain dump.
- Monetary values are never invented.
- Priority arithmetic is computed deterministically.
- Drafts are produced only for selected communication targets.

The frontend independently validates these invariants in `frontend/src/contract.ts` before rendering a response.

## Current implementation

| Area | Status |
| --- | --- |
| Responsive React interface | Implemented |
| Sample founder brain dump | Implemented |
| Money Move, Blocked, Parked, and audit views | Implemented |
| Copyable selected message drafts | Implemented |
| Runtime response-contract validation | Implemented |
| Frontend unit and interaction tests | Implemented |
| FastAPI health endpoint | Implemented |
| `POST /process` AI pipeline | **Pending** |
| Accounts, database, or saved history | Not included |
| Calendar, email, voice, or task integrations | Not included |

The application currently keeps no persistent state and has no authentication or database.

## Technology stack

- **Frontend:** React 19, TypeScript, Vite, CSS
- **Frontend testing:** Vitest, Testing Library, jsdom
- **Backend:** Python, FastAPI, Pydantic
- **Planned AI integration:** OpenAI Responses API with structured outputs
- **Deployment:** One Vercel project containing the static frontend and Python API

## Repository structure

```text
.
├── api/
│   └── index.py               # Vercel ASGI entry point; mounts the backend at /api
├── backend/
│   └── app/
│       ├── __init__.py
│       └── main.py            # FastAPI app; currently exposes GET /health only
├── frontend/
│   ├── src/
│   │   ├── components/        # Result and draft UI components
│   │   ├── api.ts             # Browser API client
│   │   ├── contract.ts        # Runtime response validation
│   │   ├── sampleBraindump.ts # Demonstration input
│   │   ├── types.ts           # Shared frontend response types
│   │   └── App.tsx            # Main application flow
│   ├── .env.production        # Uses the same-origin /api path in production
│   └── package.json
├── mock/
│   └── process.json           # Frozen example of the intended API response
├── PLAN.md                    # Canonical product and architecture plan
├── PLAN_BACKEND.md            # Backend implementation handoff
├── PLAN_FRONTEND.md           # Frontend implementation handoff
├── requirements.txt           # Python runtime dependencies for Vercel
└── vercel.json                # Combined frontend/API deployment configuration
```

## Prerequisites

Install:

- Node.js 20.19 or newer (or Node.js 22.12+)
- npm 10 or newer
- Python 3.10 or newer
- `curl` for the verification commands

Vercel deployment additionally requires a Vercel account and either the Vercel CLI or `npx`.

## API keys and environment variables

### Current checkout

No API key is required to build the frontend, run its tests, or call the current `/health` endpoint.

### Completed AI backend

The planned live pipeline requires one server-side secret:

```dotenv
# .env at the repository root
OPENAI_API_KEY=your_openai_api_key
```

Important:

- Never commit `.env`; it is already ignored by Git.
- Never expose the key through a variable beginning with `VITE_`. Vite variables are bundled into browser code.
- Set `OPENAI_API_KEY` in the Vercel project environment for production.
- The design documents currently propose `gpt-5.6-sol`. Confirm that the configured account can access the chosen model when implementing the pipeline, and change the backend model constant if necessary.
- Adding the key alone will not enable the current checkout: the `/process` handler and pipeline code still need to be implemented.

The existing frontend environment settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `http://localhost:8000` in development | Base URL used by the browser for API requests. |
| `VITE_API_BASE` | `/api` in `frontend/.env.production` | Same-origin API base used by the Vercel build. |

## Run locally

Use two terminals: one for FastAPI and one for Vite.

### 1. Install and run the backend

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt uvicorn
python3 -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

`uvicorn` is installed separately because Vercel supplies the production ASGI runtime and it is intentionally absent from `requirements.txt`.

Verify the current backend:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

Once the AI backend exists, load the root `.env` while starting it:

```bash
python3 -m uvicorn app.main:app --app-dir backend --env-file .env --reload --port 8000
```

### 2. Install and run the frontend

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The development frontend defaults to `http://localhost:8000/process`. CORS is enabled for the Vite development origins. In the current checkout, pressing **Find My Money Moves** reaches the backend but fails because `/process` has not yet been implemented.

## API contract

### Health

```http
GET /health
```

```json
{"status":"ok"}
```

In production, the Vercel wrapper exposes this as `GET /api/health`.

### Process — planned, not currently available

Local backend route:

```http
POST /process
Content-Type: application/json
```

Production route:

```http
POST /api/process
Content-Type: application/json
```

Planned request:

```json
{
  "braindump": "Acme needs the revised renewal quote today...",
  "today": "2026-07-12"
}
```

Planned top-level response:

```json
{
  "items": [],
  "scored": [],
  "plan": {
    "money_moves": [],
    "park": [],
    "blocked": []
  },
  "drafts": []
}
```

See `mock/process.json` for a complete example and `frontend/src/types.ts` for the field-level contract.

> The frontend currently sends a fixed demonstration date from `frontend/src/api.ts`. Before production use, date resolution should move to the server so “today” cannot become stale or be manipulated by the client.

## Test and build

Run the frontend test suite:

```bash
cd frontend
npm test
```

Run type checking:

```bash
cd frontend
npm run typecheck
```

Create the production frontend build:

```bash
cd frontend
npm run build
```

Run coverage checks:

```bash
cd frontend
npm run test:coverage
```

The current tests mock `fetch` and validate the frontend against `mock/process.json`; they are not a substitute for an end-to-end test against the real FastAPI process route. When the backend is implemented, add an integration test that calls the ASGI app and verifies both `/health` and `/process`.

## Deploy to Vercel

The repository is configured as one Vercel project:

- `@vercel/static-build` builds `frontend/`.
- `@vercel/python` serves `api/index.py`.
- `/api/*` is routed to the mounted FastAPI app.
- Other routes fall back to the React application.

Before deploying a completed AI backend, add `OPENAI_API_KEY` to the Vercel project for the required environments. Then run from the repository root:

```bash
npx vercel --prod
```

Verify the production alias:

```bash
curl https://YOUR-PROJECT.vercel.app/api/health
```

After `/process` is implemented, also verify a real sample request:

```bash
curl -X POST https://YOUR-PROJECT.vercel.app/api/process \
  -H 'Content-Type: application/json' \
  -d '{"braindump":"Invoice 204 for S$4,800 is overdue today.","today":"2026-07-12"}'
```

Do not treat the deployment as complete until the production alias returns valid JSON for the process request and the browser renders it successfully.

## Known limitations

- The AI pipeline and `/process` route are pending.
- The frontend currently uses a fixed demonstration date.
- The demonstration brain dump is preloaded into the input.
- Results are not persisted between refreshes.
- There is no account, authentication, database, calendar, email, task, or voice integration.
- Generated messages can only be copied; they cannot yet open directly in an email client.
- The project has frontend contract tests but no backend or end-to-end suite.

## Suggested next steps

1. Implement the four-stage structured AI pipeline and `POST /process`.
2. Add backend unit tests and a real frontend-to-ASGI integration test.
3. Resolve the current date on the server.
4. Start the input empty and make the sample an explicit **Try demo** action.
5. Add **Type / Speak / Upload** capture modes.
6. Add reviewable email drafts and one-click calendar follow-ups.
7. Add an optional capture inbox before introducing broad account integrations.
8. Record completed Money Moves and associated revenue outcomes to improve ranking over time.

## Additional documentation

- `PLAN.md` — product rationale, prompts, contract, architecture, delivery plan, and validation rules.
- `PLAN_BACKEND.md` — backend implementation instructions and endpoint invariants.
- `PLAN_FRONTEND.md` — frontend contract, interface, testing, and deployment notes.
