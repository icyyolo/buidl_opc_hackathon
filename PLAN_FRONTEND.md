# PLAN_FRONTEND.md — Person B: Frontend & UI

> Your half of **AI Chief of Staff for Solopreneurs**, a 6-hour hackathon build (BUIDL_OPC_
> Hackathon_SG, AI category). This doc is self-contained — you don't need anything else to
> start. Person A builds the backend in parallel; you build entirely against the **frozen mock
> payload** below, so you're never blocked waiting on them.

## The product (what you're building the face of)

A solo founder pastes a messy weekly brain-dump (tasks, emails they owe, deadlines) into one
textarea and hits **Run**. The backend returns a prioritized, revenue-weighted plan. Your UI
renders it as four sections. The pitch is "an operating layer, not a chatbot" — so the ranking
must be **legible**: every prioritized item shows the one-line *reason* it's ranked where it is.

## Your scope

You own the frontend **and** the repo + deploy (you hold the OpenAI key, Vercel account, deploy KB):
- **Scaffold the repo first** (11:00–11:20): the KB repo shape, `vercel.json`, `api/index.py`, a
  health-only `backend/app/main.py` stub, `requirements.txt`, and the committed **frozen
  `mock/process.json`**. Share it with the backend collaborator + hand them an OpenAI key for
  local dev. See "Scaffold + deploy" at the bottom for the exact config.
- The Vite + React app in `frontend/`: one textarea (pre-fillable with the sample), a **Run**
  button, one honest loading state, and four result sections.
- **Build against `mock/process.json`** (below) until the 15:15 integration checkpoint — you're
  never blocked on the backend. Then pull in their pipeline code, flip to the live API, and deploy.

**You do NOT write** the pipeline, prompts, or `backend/app/pipeline.py` — that's the collaborator.
You scaffold the empty backend skeleton; they fill it in.

## How you call the API (same for mock and live)

```js
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const res = await fetch(`${BASE}/process`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ braindump: text, today: "2026-07-12" }),
});
const data = await res.json();   // shape = the mock below, exactly
```

**Until integration**, don't even hit the network — import the mock JSON directly and fake a
~1.5s delay so you can build and style the loading state:
```js
import mock from "../mock/process.json";
const data = await new Promise(r => setTimeout(() => r(mock), 1500));
```
At 15:15, swap the mock import for the real `fetch` and set `frontend/.env.production` →
`VITE_API_BASE=/api`. Nothing else in your components changes — they render `data` either way.

## THE FROZEN CONTRACT — `mock/process.json`

This is the exact shape the backend returns. **Save it verbatim as `mock/process.json`.** Field
names are law; if Person A needs to change one, they'll update this file and tell you. Notes:
`scored` is **already sorted** by `priority` descending — render it in array order. Every `id`
appears in exactly one `plan` bucket. `drafts` has one entry per `email_owed` item.

```json
{
  "items": [
    { "id": "i1", "item": "Send Acme updated annual-plan quote", "type": "email_owed", "due_date": "2026-07-17", "context": "Sarah at Acme emailed twice asking for updated pricing on the annual plan; they want to sign this week." },
    { "id": "i2", "item": "Reply to podcast host about appearing", "type": "email_owed", "due_date": null, "context": "Podcast host invited the founder onto the show; he's been waiting ~2 weeks for a reply. Low priority." },
    { "id": "i3", "item": "Chase overdue invoice #204 to Nordic Labs", "type": "task", "due_date": "2026-07-10", "context": "Invoice #204 to Nordic Labs was due last Friday and is now overdue; needs a chase to get paid." },
    { "id": "i4", "item": "Finish onboarding deck for client demo", "type": "task", "due_date": "2026-07-16", "context": "Onboarding deck needed for the new client demo on Thursday." },
    { "id": "i5", "item": "Landing page redesign (waiting on logo)", "type": "task", "due_date": null, "context": "Landing page redesign is blocked until Dave the designer sends the new logo files, which he hasn't." },
    { "id": "i6", "item": "File GST / taxes", "type": "deadline", "due_date": "2026-07-31", "context": "GST filing due end of month; no exact date pinned yet." },
    { "id": "i7", "item": "Reply to recruiter", "type": "email_owed", "due_date": null, "context": "A recruiter reached out; founder wants to reply but it is not urgent." },
    { "id": "i8", "item": "Schedule coffee chat with potential co-founder", "type": "task", "due_date": null, "context": "Wants to set up a coffee chat with a potential co-founder for next week." },
    { "id": "i9", "item": "Send Meridian revised project scope", "type": "email_owed", "due_date": null, "context": "Meridian (a hot lead) asked for a revised scope and replied yesterday; needs a response to keep the deal moving." }
  ],
  "scored": [
    { "id": "i3", "item": "Chase overdue invoice #204 to Nordic Labs", "type": "task", "due_date": "2026-07-10", "context": "Invoice #204 to Nordic Labs was due last Friday and is now overdue; needs a chase to get paid.", "revenue_proximity": 5, "urgency": 5, "reason": "Money already earned but uncollected and now overdue — chase it today.", "priority": 15 },
    { "id": "i1", "item": "Send Acme updated annual-plan quote", "type": "email_owed", "due_date": "2026-07-17", "context": "Sarah at Acme emailed twice asking for updated pricing on the annual plan; they want to sign this week.", "revenue_proximity": 5, "urgency": 4, "reason": "Warm client ready to sign the annual contract this week — direct revenue, time-sensitive.", "priority": 14 },
    { "id": "i9", "item": "Send Meridian revised project scope", "type": "email_owed", "due_date": null, "context": "Meridian (a hot lead) asked for a revised scope and replied yesterday; needs a response to keep the deal moving.", "revenue_proximity": 4, "urgency": 4, "reason": "Hot lead actively engaged — reply fast while the deal is warm.", "priority": 12 },
    { "id": "i4", "item": "Finish onboarding deck for client demo", "type": "task", "due_date": "2026-07-16", "context": "Onboarding deck needed for the new client demo on Thursday.", "revenue_proximity": 4, "urgency": 3, "reason": "Directly supports closing a new client; due Thursday so it needs progress now.", "priority": 11 },
    { "id": "i5", "item": "Landing page redesign (waiting on logo)", "type": "task", "due_date": null, "context": "Landing page redesign is blocked until Dave the designer sends the new logo files, which he hasn't.", "revenue_proximity": 2, "urgency": 2, "reason": "Marketing improvement with no direct revenue and currently blocked on assets.", "priority": 6 },
    { "id": "i6", "item": "File GST / taxes", "type": "deadline", "due_date": "2026-07-31", "context": "GST filing due end of month; no exact date pinned yet.", "revenue_proximity": 2, "urgency": 2, "reason": "Compliance obligation but weeks of runway before the end-of-month deadline.", "priority": 6 },
    { "id": "i8", "item": "Schedule coffee chat with potential co-founder", "type": "task", "due_date": null, "context": "Wants to set up a coffee chat with a potential co-founder for next week.", "revenue_proximity": 2, "urgency": 1, "reason": "Relationship-building for later; no deadline pressure this week.", "priority": 5 },
    { "id": "i2", "item": "Reply to podcast host about appearing", "type": "email_owed", "due_date": null, "context": "Podcast host invited the founder onto the show; he's been waiting ~2 weeks for a reply. Low priority.", "revenue_proximity": 1, "urgency": 1, "reason": "Nice-to-have visibility with no revenue line of sight and no hard deadline.", "priority": 3 },
    { "id": "i7", "item": "Reply to recruiter", "type": "email_owed", "due_date": null, "context": "A recruiter reached out; founder wants to reply but it is not urgent.", "revenue_proximity": 1, "urgency": 1, "reason": "Personal / non-revenue and explicitly not urgent.", "priority": 3 }
  ],
  "plan": {
    "do_now": ["i3", "i1", "i9", "i4"],
    "defer": [
      { "id": "i6", "why": "End-of-month deadline; weeks of runway, nothing to do today." },
      { "id": "i8", "why": "Next-week coffee chat; a quick calendar note is enough for now." },
      { "id": "i2", "why": "Low-value visibility; a same-day reply changes nothing." },
      { "id": "i7", "why": "Not urgent and no revenue impact; batch with other admin later." }
    ],
    "blocked": [
      { "id": "i5", "why": "Waiting on Dave's logo files before the redesign can move." }
    ]
  },
  "drafts": [
    { "id": "i1", "subject": "Re: Annual plan pricing", "body": "Hi Sarah,\n\nThanks for the nudge — happy to get this over the line. Here's the updated pricing for the annual plan: [confirm final figure]. That reflects the annual commitment and locks the rate for the full term.\n\nIf that works, I can send the contract today so you're set up to sign this week. Want me to go ahead?\n\nBest,\n[Your name]" },
    { "id": "i9", "subject": "Re: Revised scope", "body": "Hi [Meridian contact],\n\nThanks for the quick reply. I've reworked the scope around your notes — the main change is [summarize key adjustment], which keeps us on the timeline we discussed.\n\nI'll send the full revised scope document by [date]. In the meantime, does a short call this week make sense to walk through it together?\n\nBest,\n[Your name]" },
    { "id": "i2", "subject": "Re: Coming on the podcast", "body": "Hi [Host name],\n\nApologies for the slow reply, and thank you for the invite — I'd genuinely enjoy coming on the show.\n\nWhat does your recording schedule look like over the next few weeks? Happy to work around you.\n\nBest,\n[Your name]" },
    { "id": "i7", "subject": "Re: Reaching out", "body": "Hi [Recruiter name],\n\nThanks for reaching out. I'm heads-down on my own company right now so I'm not exploring roles, but I appreciate you thinking of me.\n\nFeel free to stay in touch down the line.\n\nBest,\n[Your name]" }
  ]
}
```

## The four sections to render

Render from `data` (mock or live — identical shape):

1. **Prioritized Plan** — map over `data.scored` **in order** (already sorted). Each row: the
   `item`, a priority badge (`priority`), the `type`, `due_date` if present, and — importantly —
   the **`reason`** shown prominently. This "shows its work" and is the core of the pitch.
2. **Today** — three columns/groups from `data.plan`:
   - *Do now*: look up each id in `do_now` against `scored` to show the item text, in order.
   - *Defer*: each `{id, why}` — item text + the `why`.
   - *Blocked*: each `{id, why}` — item text + the blocker `why`.
3. **Draft Replies (ready to send)** — map over `data.drafts`: show `subject`, `body`
   (preserve `\n` line breaks — use `white-space: pre-wrap`), and a **Copy** button
   (`navigator.clipboard.writeText(body)`). This is the "it *acts*" beat of the demo — make it
   look like a real, sendable email.
4. **Deferred** — the `data.plan.defer` list again as its own calm section (safe-to-wait items
   with their `why`). Reuses the same data as Today's defer column.

## Loading state (be honest — no fake progress)

One request, one wait. While pending, show a single subtle spinner with the label
**"Analyzing your commitments…"**. When it resolves, render all four sections at once. Do **not**
fabricate staged "agent is extracting… scoring…" progress events — the backend returns one
payload, and honesty here is a deliberate product decision. (A cut-list fallback is fine: plain
"Working…" text instead of a styled spinner.)

## Your build order

| Time | Task | Done when |
|---|---|---|
| 11:00–11:30 | **Scaffold repo** (config in "Scaffold + deploy" below) + freeze `mock/process.json`; share repo + an OpenAI key with the collaborator | Backend person can clone and run the health stub |
| 11:30–12:00 | Save `mock/process.json` locally; wire the mock+delay data flow | Button click → mock renders as raw JSON on screen |
| 12:00–14:00 | Lay out the 4 sections; Prioritized-Plan rows with score badge + **reason** | All four sections render cleanly from the mock |
| 14:00–15:15 | Loading state, Copy-to-clipboard on drafts, typography, empty/error states, pre-fill sample | Looks demo-ready; refresh → paste sample → Run → clean result |
| **15:15–15:45** | **Integration:** pull the collaborator's `pipeline.py` + `main.py`; swap mock → real `fetch`; set `VITE_API_BASE=/api` | Live backend response renders identically to the mock |
| 15:45–16:45 | **Deploy `npx vercel --prod`; set `OPENAI_API_KEY` in Vercel env; verify the alias**; polish on real data | Alias serves the app + live API; real data looks as good as the mock |
| 16:45–18:00 | **Joint:** rehearse the demo, submit by 17:45 | — |

## Cut list (drop in this order if you fall behind)

1. Loading-state polish → plain "Working…" text.
2. Copy-to-clipboard → drafts as plain selectable `<pre>` text.
3. Deferred as its own section → fold it into Today's defer column.
4. **Never cut:** the Prioritized Plan with a visible **reason** per row. That legibility *is*
   the differentiator; if only that ships, the pitch still lands.

## Scaffold + deploy (you own this — from KB `vercel-fastapi-vite-colocated-deploy`)

You create the repo skeleton at 11:00 and deploy it at ~16:00. The collaborator only fills in
`backend/app/pipeline.py` + the `/process` route.

**Repo shape:**
```
api/index.py             backend/app/main.py       backend/app/pipeline.py  (collaborator fills)
frontend/                frontend/.env.production   # VITE_API_BASE=/api
requirements.txt         vercel.json                mock/process.json
.env                     # OPENAI_API_KEY  (local; set in Vercel dashboard for prod)
```

**`vercel.json`** — use the legacy `builds`/`routes` schema; the modern `functions` schema
silently fails to detect `api/index.py` with a subdirectory frontend:
```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.py", "use": "@vercel/python", "config": { "includeFiles": "backend/**" } },
    { "src": "frontend/package.json", "use": "@vercel/static-build", "config": { "distDir": "dist" } }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.py" },
    { "src": "/(.*\\.\\w+)$", "dest": "/frontend/$1" },
    { "src": "/(.*)", "dest": "/frontend/index.html" }
  ]
}
```

**`api/index.py`** (mounts the backend app under `/api`; Starlette strips the prefix):
```python
import sys
from pathlib import Path
_here = Path(__file__).resolve().parent
for _cand in (_here.parent / "backend", _here / "backend"):
    if (_cand / "app" / "main.py").is_file():
        sys.path.insert(0, str(_cand)); break
from fastapi import FastAPI            # noqa: E402
from app.main import app as backend_app  # noqa: E402
app = FastAPI()
app.mount("/api", backend_app)
```

**`backend/app/main.py`** — start with just the health stub so deploy works day one; the
collaborator adds `/process`:
```python
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}
```

**`frontend/.env.production`** → `VITE_API_BASE=/api` (Vite bakes this in at `vite build`; dev
ignores it and uses the localhost default). **`requirements.txt`**: the collaborator gives you
the deps — no `uvicorn` (Vercel supplies the ASGI server).

**Deploy gotchas — each costs an hour if you hit it blind:**
- `@vercel/static-build` namespaces output under `/frontend/` — the two non-API routes above
  rewrite root onto that prefix. If `/` 404s after a *successful* deploy, that's why; don't fix
  it any other way.
- Set `OPENAI_API_KEY` in the **Vercel dashboard** env, not just local `.env`.
- Test against the **production alias** (`<app>.vercel.app`) — the raw per-deploy URL 401s under
  Deployment Protection.
- The "`builds` overrides dashboard settings" warning is benign and permanent.

**Deploy + verify:**
```bash
npx vercel --prod                                                    # from WSL
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<app>.vercel.app/                  # 200 text/html
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<app>.vercel.app/assets/index-*.js # 200 application/javascript
curl -s https://<app>.vercel.app/api/health                                                         # {"status":"ok"}
```

## Definition of done (your half)

Refresh the app → the sample brain-dump is pre-filled → click **Run** → after the loading state,
all four sections render from the payload: Prioritized Plan (ranked, each row showing its
priority and reason), Today (do-now / defer / blocked with why), Draft Replies (with the Acme
draft referencing Sarah + annual pricing, copyable), and Deferred. Works identically on the mock
and, after integration, on the live `/api`.
