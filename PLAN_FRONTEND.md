# PLAN_FRONTEND.md — Person B: Frontend & UI

> Your half of **Revenue Radar: Explainable Revenue Triage for One-Person Companies**, a
> 6-hour hackathon build (BUIDL_OPC_Hackathon_SG, AI category). The canonical raw demo input
> remains in [PLAN.md §5](PLAN.md); everything else needed for the frontend is here. Person A
> builds the backend in parallel; you build entirely against the **frozen mock
> payload** below, so you're never blocked waiting on them.

## The product (what you're building the face of)

A solo founder pastes a messy weekly brain-dump (tasks, owed messages, deadlines, and stated
commercial values) into one textarea and clicks **Find My Money Moves**. The backend returns
three revenue-first decisions, safely parked work, blockers with unblock actions, and only the
messages required to act. The UI must make the economic logic legible: money-motion badge,
stated value, deterministic priority, source evidence, cost of delay, next action, and finish line.

## Your scope

You own the frontend **and** the repo + deploy (you hold the OpenAI key, Vercel account, deploy KB):
- **Scaffold the repo first** (11:00–11:20): the KB repo shape, `vercel.json`, `api/index.py`, a
  health-only `backend/app/main.py` stub, `requirements.txt`, and the committed **frozen
  `mock/process.json`**. Share it with the backend collaborator + hand them an OpenAI key for
  local dev. See "Scaffold + deploy" at the bottom for the exact config.
- The Vite + React app in `frontend/`: one textarea (pre-fillable with the sample), a **Find My
  Money Moves** button, one honest loading state, and four result sections.
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
appears in exactly one `plan` bucket. `drafts` contains only selected Money Move replies and
message-needed unblock requests — never parked or unselected email items.

```json
{
  "items": [
    {
      "id": "i1", "item": "Send Acme revised annual quote", "type": "email_owed",
      "due_date": "2026-07-12", "stated_value": "S$12,000/year",
      "source_text": "Acme (Sarah) emailed twice about their renewal. She wants the revised annual quote today. Price is S$12,000/year with 10% off if they sign by Friday.",
      "context": "Sarah at Acme emailed twice about the renewal and wants the revised annual quote today. The price is S$12,000/year with a 10% incentive for signing by Friday."
    },
    {
      "id": "i2", "item": "Reply to podcast host", "type": "email_owed",
      "due_date": null, "stated_value": null,
      "source_text": "still owe the podcast guy a reply about coming on the show, low prio but he's been waiting 2 wks",
      "context": "The podcast host has waited two weeks, but the founder explicitly marked it low priority."
    },
    {
      "id": "i3", "item": "Chase Nordic Labs invoice #204", "type": "email_owed",
      "due_date": "2026-07-10", "stated_value": "S$4,800",
      "source_text": "Nordic Labs invoice #204 for S$4,800 was due last Friday. James in AP is the contact; need to ask whether anything is blocking payment.",
      "context": "Nordic Labs owes S$4,800 on invoice #204, which is overdue. James in AP is the contact and should be asked what is blocking payment."
    },
    {
      "id": "i4", "item": "Finish generic onboarding deck", "type": "task",
      "due_date": "2026-07-16", "stated_value": null,
      "source_text": "finish the generic onboarding deck template by Thursday if there is time; no client is waiting on it",
      "context": "This is a reusable internal template desired by Thursday, but no client is waiting for it."
    },
    {
      "id": "i5", "item": "Redesign landing page after logo arrives", "type": "task",
      "due_date": null, "stated_value": null,
      "source_text": "Dave the designer still hasn't sent the new logo files, blocked on the landing page redesign until then",
      "context": "The landing-page redesign cannot progress until Dave sends the new logo files."
    },
    {
      "id": "i6", "item": "File GST and taxes", "type": "deadline",
      "due_date": "2026-07-31", "stated_value": null,
      "source_text": "taxes / GST filing due end of month sometime",
      "context": "GST and tax filing is due at the end of July, with no earlier consequence stated."
    },
    {
      "id": "i7", "item": "Reply to recruiter", "type": "email_owed",
      "due_date": null, "stated_value": null,
      "source_text": "reply to that recruiter, not urgent",
      "context": "The founder owes a recruiter a reply and explicitly says it is not urgent."
    },
    {
      "id": "i8", "item": "Schedule potential co-founder coffee", "type": "task",
      "due_date": null, "stated_value": null,
      "source_text": "coffee chat w/ potential co-founder, want to schedule for next week",
      "context": "The founder wants a relationship-building coffee chat next week; no immediate outcome is stated."
    },
    {
      "id": "i9", "item": "Send Meridian revised scope", "type": "email_owed",
      "due_date": "2026-07-13", "stated_value": "S$18,000",
      "source_text": "Meridian has an S$18,000 budget. They asked yesterday for a revised scope removing analytics but keeping onboarding; they want it tomorrow and decide on Wednesday.",
      "context": "Meridian has an S$18,000 budget and wants a revised scope tomorrow, removing analytics but retaining onboarding, before its Wednesday decision."
    }
  ],
  "scored": [
    {
      "id": "i3", "item": "Chase Nordic Labs invoice #204", "type": "email_owed",
      "due_date": "2026-07-10", "stated_value": "S$4,800",
      "source_text": "Nordic Labs invoice #204 for S$4,800 was due last Friday. James in AP is the contact; need to ask whether anything is blocking payment.",
      "context": "Nordic Labs owes S$4,800 on invoice #204, which is overdue. James in AP is the contact and should be asked what is blocking payment.",
      "revenue_motion": "collect", "revenue_proximity": 5, "urgency": 5,
      "evidence": "was due last Friday", "cost_of_delay": "Another day leaves S$4,800 of earned cash uncollected.",
      "missing_fact": null, "priority": 20
    },
    {
      "id": "i1", "item": "Send Acme revised annual quote", "type": "email_owed",
      "due_date": "2026-07-12", "stated_value": "S$12,000/year",
      "source_text": "Acme (Sarah) emailed twice about their renewal. She wants the revised annual quote today. Price is S$12,000/year with 10% off if they sign by Friday.",
      "context": "Sarah at Acme emailed twice about the renewal and wants the revised annual quote today. The price is S$12,000/year with a 10% incentive for signing by Friday.",
      "revenue_motion": "close", "revenue_proximity": 5, "urgency": 5,
      "evidence": "She wants the revised annual quote today", "cost_of_delay": "Waiting reduces the time Sarah has to use the Friday signing incentive.",
      "missing_fact": null, "priority": 20
    },
    {
      "id": "i9", "item": "Send Meridian revised scope", "type": "email_owed",
      "due_date": "2026-07-13", "stated_value": "S$18,000",
      "source_text": "Meridian has an S$18,000 budget. They asked yesterday for a revised scope removing analytics but keeping onboarding; they want it tomorrow and decide on Wednesday.",
      "context": "Meridian has an S$18,000 budget and wants a revised scope tomorrow, removing analytics but retaining onboarding, before its Wednesday decision.",
      "revenue_motion": "close", "revenue_proximity": 5, "urgency": 4,
      "evidence": "they want it tomorrow and decide on Wednesday", "cost_of_delay": "A late revision could exclude the proposal from Wednesday's S$18,000 decision.",
      "missing_fact": "The Meridian contact's name is not stated.", "priority": 19
    },
    {
      "id": "i5", "item": "Redesign landing page after logo arrives", "type": "task",
      "due_date": null, "stated_value": null,
      "source_text": "Dave the designer still hasn't sent the new logo files, blocked on the landing page redesign until then",
      "context": "The landing-page redesign cannot progress until Dave sends the new logo files.",
      "revenue_motion": "grow", "revenue_proximity": 2, "urgency": 2,
      "evidence": "blocked on the landing page redesign until then", "cost_of_delay": "The redesign remains stalled until the logo files arrive.",
      "missing_fact": "No deadline for the landing-page redesign is stated.", "priority": 8
    },
    {
      "id": "i6", "item": "File GST and taxes", "type": "deadline",
      "due_date": "2026-07-31", "stated_value": null,
      "source_text": "taxes / GST filing due end of month sometime",
      "context": "GST and tax filing is due at the end of July, with no earlier consequence stated.",
      "revenue_motion": "operate", "revenue_proximity": 2, "urgency": 2,
      "evidence": "due end of month sometime", "cost_of_delay": "No material cost of waiting is stated.",
      "missing_fact": "Any filing preparation already completed is unknown.", "priority": 8
    },
    {
      "id": "i8", "item": "Schedule potential co-founder coffee", "type": "task",
      "due_date": null, "stated_value": null,
      "source_text": "coffee chat w/ potential co-founder, want to schedule for next week",
      "context": "The founder wants a relationship-building coffee chat next week; no immediate outcome is stated.",
      "revenue_motion": "grow", "revenue_proximity": 2, "urgency": 2,
      "evidence": "want to schedule for next week", "cost_of_delay": "No material cost of waiting is stated.",
      "missing_fact": "No concrete business objective for the meeting is stated.", "priority": 8
    },
    {
      "id": "i2", "item": "Reply to podcast host", "type": "email_owed",
      "due_date": null, "stated_value": null,
      "source_text": "still owe the podcast guy a reply about coming on the show, low prio but he's been waiting 2 wks",
      "context": "The podcast host has waited two weeks, but the founder explicitly marked it low priority.",
      "revenue_motion": "grow", "revenue_proximity": 2, "urgency": 1,
      "evidence": "low prio but he's been waiting 2 wks", "cost_of_delay": "Another day may add minor relationship friction, but no commercial deadline is stated.",
      "missing_fact": "The show's audience relevance is unknown.", "priority": 7
    },
    {
      "id": "i4", "item": "Finish generic onboarding deck", "type": "task",
      "due_date": "2026-07-16", "stated_value": null,
      "source_text": "finish the generic onboarding deck template by Thursday if there is time; no client is waiting on it",
      "context": "This is a reusable internal template desired by Thursday, but no client is waiting for it.",
      "revenue_motion": "operate", "revenue_proximity": 1, "urgency": 3,
      "evidence": "no client is waiting on it", "cost_of_delay": "No material cost of waiting is stated.",
      "missing_fact": null, "priority": 6
    },
    {
      "id": "i7", "item": "Reply to recruiter", "type": "email_owed",
      "due_date": null, "stated_value": null,
      "source_text": "reply to that recruiter, not urgent",
      "context": "The founder owes a recruiter a reply and explicitly says it is not urgent.",
      "revenue_motion": "operate", "revenue_proximity": 1, "urgency": 1,
      "evidence": "not urgent", "cost_of_delay": "No material cost of waiting is stated.",
      "missing_fact": null, "priority": 4
    }
  ],
  "plan": {
    "money_moves": [
      { "id": "i3", "why_today": "Collect S$4,800 already earned and now overdue.", "next_action": "Email James in AP to ask what is blocking invoice #204 and request a payment date.", "done_when": "The chase is sent and a follow-up reminder is set." },
      { "id": "i1", "why_today": "Close a S$12,000 annual renewal while Sarah can still use the Friday incentive.", "next_action": "Send Sarah the revised quote before 11am.", "done_when": "The quote is sent and a Friday follow-up is scheduled." },
      { "id": "i9", "why_today": "Advance an S$18,000 proposal before Meridian's Wednesday decision.", "next_action": "Send the revised scope removing analytics and retaining onboarding tomorrow.", "done_when": "The revised scope and a proposed review call are sent." }
    ],
    "park": [
      { "id": "i6", "why_safe": "The filing is due at month-end and no earlier consequence is stated." },
      { "id": "i8", "why_safe": "The coffee is for next week and has no immediate commercial outcome." },
      { "id": "i2", "why_safe": "The founder marked it low priority and no commercial deadline is stated." },
      { "id": "i4", "why_safe": "It is an internal template and no client is waiting for it." },
      { "id": "i7", "why_safe": "It is explicitly not urgent and has no revenue line of sight." }
    ],
    "blocked": [
      { "id": "i5", "blocker": "Dave has not supplied the final logo files.", "unblock_action": "Ask Dave to deliver the final logo files by 3pm today.", "message_needed": true }
    ]
  },
  "drafts": [
    { "id": "i3", "purpose": "money_move", "subject": "Invoice #204 — payment timing", "body": "Hi James,\n\nInvoice #204 for S$4,800 was due last Friday, so I wanted to check whether anything is blocking payment on your side. Could you confirm the expected payment date, or let me know if you need anything from me to release it?\n\nThanks,\n[Your name]" },
    { "id": "i1", "purpose": "money_move", "subject": "Re: Annual plan pricing", "body": "Hi Sarah,\n\nThanks for the follow-up. The revised annual price is S$12,000/year, with 10% off if you sign by Friday.\n\nIf that works for you, I can send the final agreement today so we stay on track for this week.\n\nBest,\n[Your name]" },
    { "id": "i9", "purpose": "money_move", "subject": "Re: Revised Meridian scope", "body": "Hi [Meridian contact],\n\nI've revised the S$18,000 scope as requested: analytics is removed and onboarding remains included. I'll send the updated scope tomorrow, ahead of your Wednesday decision.\n\nWould a short review call tomorrow help resolve any final questions?\n\nBest,\n[Your name]" },
    { "id": "i5", "purpose": "unblock", "subject": "Final logo files needed today", "body": "Hi Dave,\n\nThe landing-page redesign is blocked until I have the final logo files. Could you send the approved files by 3pm today, or let me know what is preventing that handoff?\n\nThanks,\n[Your name]" }
  ]
}
```

For the pre-filled textarea, copy the sample brain-dump from [PLAN.md §5](PLAN.md) verbatim.
Do not rewrite its punctuation, numbers, or relative dates: the frozen `evidence`, `source_text`,
and `stated_value` fields are deliberately grounded against that exact string.

## The four sections to render

Render from `data` (mock or live — identical shape):

Build `scoredById` and `draftById` maps once; all decision cards join by id.

1. **Today's 3 Money Moves** — map over `data.plan.money_moves` in order. Each primary card shows:
   - the joined item's `revenue_motion` as a strong badge (`COLLECT`, `CLOSE`, etc.);
   - `stated_value` when non-null, `priority`, and `due_date` when present;
   - `evidence` as a visibly quoted source fragment and `cost_of_delay` directly beneath it;
   - the decision's `why_today`, `next_action`, and `done_when`;
   - `missing_fact` as a quiet uncertainty note when non-null; and
   - the attached `money_move` draft, if present, with subject, pre-wrapped body, and **Copy**.
2. **Blocked → Unblock** — map over `data.plan.blocked`. Show joined item text, `blocker`, and
   `unblock_action`. Attach its `unblock` draft when `message_needed` is true. This section must
   make blocked work look actionable without pretending the underlying task can start.
3. **Parked Safely** — map over `data.plan.park`. Show the joined item, motion badge, due date,
   and `why_safe`. Use calm styling: this is a deliberate decision, not a failure state.
4. **All Commitments** — map over `data.scored` in its already-sorted order. Show a compact row
   with item, motion, stated value, priority, type, and due date. This proves exhaustive capture;
   it is secondary to the three decision cards.

## Loading state (be honest — no fake progress)

One request, one wait. While pending, show a single subtle spinner with the label
**"Finding today's Money Moves…"**. When it resolves, render all four sections at once. Do **not**
fabricate staged "agent is extracting… scoring…" progress events — the backend returns one
payload, and honesty here is a deliberate product decision. (A cut-list fallback is fine: plain
"Working…" text instead of a styled spinner.)

## Your build order

| Time | Task | Done when |
|---|---|---|
| 11:00–11:30 | **Scaffold repo** (config in "Scaffold + deploy" below) + freeze `mock/process.json`; share repo + an OpenAI key with the collaborator | Backend person can clone and run the health stub |
| 11:30–12:00 | Save `mock/process.json` locally; wire the mock+delay data flow | Button click → mock renders as raw JSON on screen |
| 12:00–14:00 | Lay out the 4 sections; build Money Move cards with evidence, cost, next action, and attached draft | All four sections render cleanly from the mock |
| 14:00–15:15 | Loading state, Copy-to-clipboard, motion/value badges, typography, empty/error states, pre-fill sample | Looks demo-ready; refresh → paste sample → Find My Money Moves → clean result |
| **15:15–15:45** | **Integration:** pull the collaborator's `pipeline.py` + `main.py`; swap mock → real `fetch`; set `VITE_API_BASE=/api` | Live backend response renders identically to the mock |
| 15:45–16:45 | **Deploy `npx vercel --prod`; set `OPENAI_API_KEY` in Vercel env; verify the alias**; polish on real data | Alias serves the app + live API; real data looks as good as the mock |
| 16:45–18:00 | **Joint:** rehearse the demo, submit by 17:45 | — |

## Cut list (drop in this order if you fall behind)

1. Loading-state polish → plain "Working…" text.
2. Copy-to-clipboard → drafts as plain selectable `<pre>` text.
3. All Commitments as its own section → omit the duplicate compact list; keep all response data.
4. **Never cut:** the three Money Move cards with motion, value, deterministic score, evidence,
   cost of delay, next action, and finish line. That economic legibility is the differentiator.

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

Refresh the app → the sample brain-dump is pre-filled → click **Find My Money Moves** → after the
loading state, all four sections render from the payload. The three Money Moves are Nordic
(`COLLECT`, S$4,800), Acme (`CLOSE`, S$12,000/year), and Meridian (`CLOSE`, S$18,000); evidence
and cost of delay are visible; Dave has an unblock request; parked work is reassuringly
explained; and selected messages are attached and copyable. The Acme draft includes Sarah,
S$12,000/year, 10%, and Friday. There is no podcast or recruiter draft. Behavior is identical
on the mock and, after integration, on the live `/api`.
