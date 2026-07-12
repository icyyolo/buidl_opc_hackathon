# PLAN.md — AI Chief of Staff for Solopreneurs

> **Event:** BUIDL_OPC_Hackathon_SG (Claude SG Community × amber.ac × Amber Group). Category: AI.
> **Theme:** Next-generation One Person Companies via agentic services.
> **Build window:** 11:00 → 18:00 submission (~6h hacking). Then top-30 → top-10 pitch → judging.
> **Bet:** one deep, working, live-demoable agentic pipeline beats broad unfinished scope.

**Standing assumptions (chosen, not asked — override if wrong):**
- **Model:** OpenAI `gpt-5.6-sol` for all four stages — the current latest flagship model as verified against OpenAI's model guidance on 2026-07-12. Set via one `MODEL` constant. All calls use the Responses API with strict Structured Outputs backed by Pydantic response models. *(Note: this is a Claude-community hackathon — OpenAI is a deliberate, accepted choice; provider access must be confirmed in Block 0.)*
- **No streaming or simulated progress.** One `POST /api/process` runs the pipeline and returns the complete result. While it is pending, the UI shows one honest loading state ("Analyzing your commitments…"); when it completes, all result sections render immediately. No staged reveal or fabricated intermediate events.
- **Deploy:** single Vercel project, same-origin, `builds`/`routes` legacy schema (KB-verified). Deploy from WSL via `npx vercel --prod`.
- **State:** none persisted. Paste → process → render. No DB, no auth, no accounts.
- **Date handling:** "today" is injected into prompts as an ISO string from the server clock so `due_date` reasoning is grounded. Demo machine timezone = SGT.

---

## 1. Problem + Solution (pitch paragraph)

Solo founders are one-person companies: they *are* sales, ops, support, and delivery at once. With no ops team, the revenue-generating work that only they can do gets buried under admin — unanswered client emails, scattered tasks, deadlines creeping up — and there's nobody to triage the chaos and say *what to do next*. Existing "AI assistants" are passive chatbots: you have to know what to ask, and they don't reason about what actually matters (revenue). **AI Chief of Staff** is an operating layer, not a chatbot. The founder pastes a raw weekly brain-dump; the agent runs a 4-stage pipeline that extracts every commitment, scores each by revenue-proximity and urgency, produces a do-now/defer/blocked plan for today, and writes ready-to-send draft replies to the clients they owe. The founder just reviews and hits send. One person, the output of a small ops team — and every ranking shows its reason, so it's a legible operator, not a black box.

---

## 2. Architecture — the 4-stage pipeline (text diagram)

```
                         ┌─────────────────────────────────────────────┐
  Founder pastes         │  FastAPI  POST /api/process                  │
  raw brain-dump ─────►  │  body: { braindump: str, today: "YYYY-MM-DD" }│
  (single textarea)      └───────────────┬─────────────────────────────┘
                                         │  sequential OpenAI Responses API calls; each output feeds the next
             ┌───────────────────────────┼───────────────────────────────────────────┐
             ▼                           ▼                        ▼                    ▼
     ┌───────────────┐          ┌────────────────┐      ┌────────────────┐    ┌────────────────┐
     │ 1. EXTRACT    │  items   │ 2. SCORE       │scored│ 3. PLAN        │    │ 4. DRAFT       │
     │ raw text →    │ ───────► │ +revenue_prox  │─────►│ today:         │    │ for each       │
     │ JSON items[]  │          │ +urgency       │      │ do_now/defer/  │    │ email_owed →   │
     │ {item,type,   │          │ +reason        │      │ blocked (+why) │    │ real draft     │
     │  due_date?,   │          │ priority =     │      │ (reorders/     │    │ using .context │
     │  context}     │          │  rev*2+urgency │      │  groups items) │    │                │
     │ MECHANICAL    │          │ JUDGMENT       │      │ JUDGMENT       │    │ GENERATION     │
     └───────────────┘          └────────────────┘      └────────────────┘    └────────────────┘
             │                           │                        │                    │
             └───────────────────────────┴────────────────────────┴────────────────────┘
                                         │  server assembles one JSON payload:
                                         ▼  { items, scored, plan, drafts }
                         ┌─────────────────────────────────────────────┐
                         │  React UI renders 4 result sections          │
                         │  Prioritized Plan · Today · Draft Replies ·  │
                         │  Deferred   (all render when POST completes) │
                         └─────────────────────────────────────────────┘
```

**Data contract (single source of truth — keep the field names identical across all 4 prompts):**

```jsonc
// after EXTRACT
{ "id": "i1", "item": "Reply to Acme re: renewal quote",
  "type": "email_owed",              // task | email_owed | deadline
  "due_date": "2026-07-15",          // ISO or null
  "context": "Acme asked for updated pricing on the annual plan; they hinted at signing this week." }

// SCORE adds:
{ "revenue_proximity": 5, "urgency": 4,
  "reason": "Warm client ready to sign the annual contract — direct revenue, time-sensitive.",
  "priority": 14 }                   // = revenue_proximity*2 + urgency, computed SERVER-SIDE not by the model

// PLAN returns:
{ "do_now": ["i1","i4"], "defer": [{"id":"i3","why":"No client is blocked on it this week."}],
  "blocked": [{"id":"i7","why":"Waiting on designer's assets before you can ship."}] }

// DRAFT returns, per email_owed id:
{ "id": "i1", "subject": "Re: Annual plan pricing", "body": "Hi Sarah, ..." }
```

Each stage has a matching Pydantic response model passed to `client.responses.parse(...)`. OpenAI Structured Outputs constrains the response to that schema; the server then checks cross-stage invariants such as ID conservation and complete, non-overlapping PLAN buckets.

> **Priority is computed in Python from the model's two scores**, not asked from the model — deterministic, auditable, and impossible for the model to get arithmetic-wrong on stage. The `reason` string is the model's; the number is ours.

---

## 3. The four system prompts (full text)

All four share a preamble injected at the top:

```
You are the reasoning core of "AI Chief of Staff", an operating layer for a solo founder
(a one-person company). Today's date is {TODAY} (ISO, Asia/Singapore). Your response is
constrained by the supplied JSON schema. Populate every field exactly as instructed; do not
add prose, markdown, or commentary outside the structured response.
```

### Stage 1 — EXTRACT (mechanical, no judgment)

```
ROLE: Extractor. Your ONLY job is to parse the founder's raw brain-dump into a flat list of
discrete commitments. Do NOT prioritize, judge importance, or invent anything not in the text.

For each distinct item you find, emit:
  - id: sequential "i1", "i2", ...
  - item: a short imperative summary of the commitment (max ~12 words)
  - type: exactly one of:
        "task"        — something the founder must DO
        "email_owed"  — a reply/message the founder OWES someone
        "deadline"    — a dated obligation or milestone
      If an item is both a reply-owed and dated, prefer "email_owed".
  - due_date: an ISO date "YYYY-MM-DD" if the text implies one (resolve relative dates like
      "Friday", "end of week", "tomorrow" against TODAY). Otherwise null.
  - context: 1–2 sentences of the surrounding detail from the brain-dump that a later stage
      would need to act (who, what they asked, any stakes). Quote specifics; never generalize
      to "a client asked something".

Split compound lines into separate items. Do not merge unrelated items. Do not drop items
because they seem trivial — extraction is exhaustive and neutral.

Return JSON: { "items": [ {id, item, type, due_date, context}, ... ] }
```

### Stage 2 — SCORE (judgment: revenue + urgency, with a visible reason)

```
ROLE: Prioritizer. For EACH item, assess two independent 1–5 scores and justify them.

  revenue_proximity (1–5): how directly does completing this item move money toward the
    founder? Anchor the scale:
      5 = closes/expands paying revenue now (signing a contract, sending an invoice, a
          warm client ready to buy, unblocking a paid deliverable).
      4 = strongly revenue-adjacent (proposal to a hot lead, renewal conversation).
      3 = pipeline / relationship that could convert later.
      2 = keeps the business running but no direct revenue (admin, ops hygiene).
      1 = personal, speculative, or purely internal with no revenue line of sight.

  urgency (1–5): how time-critical is it, given due_date and TODAY?
      5 = overdue or due today with real consequence.
      4 = due within 2 days.
      3 = due this week.
      2 = due later / soft deadline.
      1 = no deadline pressure.

  reason: ONE sentence, plain language, explaining the scores TOGETHER so the founder trusts
    the ranking (e.g. "Warm client ready to sign — direct revenue and they expect a reply
    today."). This is shown in the UI; make it legible, specific, and honest.

Do NOT compute a total or rank — only score and justify. Preserve id, item, type, due_date,
context unchanged.

Return JSON: { "scored": [ {id, item, type, due_date, context, revenue_proximity, urgency,
  reason}, ... ] }
```

> Server then computes `priority = revenue_proximity*2 + urgency` for each and sorts descending.

### Stage 3 — PLAN (today's do-now / defer / blocked)

```
ROLE: Chief of Staff. You are given the scored, priority-ranked items. Produce a realistic
plan for TODAY for a founder who has limited focused hours.

  do_now: ids the founder should tackle today, highest-leverage first. Cap at ~4–5 — a plan
    that says "do everything" is useless. Favor high revenue_proximity and high urgency.
  defer: items to consciously NOT do today. For each, a one-line "why" that reassures the
    founder it's safe to wait (e.g. "Soft deadline next week; no client waiting.").
  blocked: items the founder CANNOT progress right now because they depend on someone/
    something else. For each, a one-line "why" naming the blocker.

Every id from the input must appear in exactly one of the three buckets. Use only the given
ids; do not invent items. Judge blockers from the context field (e.g. "waiting on", "once X
sends", "pending approval").

Return JSON: { "do_now": [id,...],
               "defer":   [ {id, why}, ... ],
               "blocked": [ {id, why}, ... ] }
```

### Stage 4 — DRAFT (real, context-specific replies)

```
ROLE: Ghostwriter for the founder. For EACH item of type "email_owed", write a ready-to-send
reply the founder can review and send with minimal edits.

Rules:
  - Use the item's context field: reference the specific ask, names, numbers, and stakes in
    it. A generic "Thanks for reaching out, I'll get back to you" is a FAILURE.
  - Voice: warm, concise, professional, founder-to-client. No corporate filler, no emojis.
  - Move the relationship forward: answer or acknowledge the ask AND propose a concrete next
    step (a date, a number, a call). If a fact is genuinely unknown, use a clearly-bracketed
    placeholder like [confirm exact figure] rather than inventing specifics.
  - subject: a natural "Re: ..." line. body: 3–8 sentences, real salutation and sign-off.

Only draft for email_owed items; ignore the rest.

Return JSON: { "drafts": [ {id, subject, body}, ... ] }
```

---

## 4. Six-hour timeline, checkpoints, cut list

Times assume 11:00 start / 18:00 submit. Each checkpoint is a *verifiable* state.

| Block | Time | Goal | Checkpoint (verify) |
|---|---|---|---|
| **0. Scaffold** | 11:00–11:30 | Repo shape from KB. `api/index.py`, `backend/app/main.py`, `frontend/` Vite+React, `vercel.json`, root `requirements.txt`, `.env`. | `GET /api/health` → `{"status":"ok"}` locally; Vite dev page loads. |
| **1. Backend pipeline** | 11:30–13:00 | `POST /api/process` runs all 4 `gpt-5.6-sol` Responses API calls sequentially with Pydantic Structured Outputs, computes `priority`, and returns the assembled payload. Hard-code one sample brain-dump in a test script. | `curl` the endpoint → schema-valid JSON with `items`, `scored`, `plan`, `drafts` all populated. **This is the core; protect this block.** |
| **2. Prompt tuning** | 13:00–13:45 | Run the sample through; improve weak reasons and generic drafts. Define one Pydantic response model per stage and add semantic checks for conserved IDs, score ranges, and complete PLAN buckets. | Drafts reference the sample's specifics; every id appears in exactly one PLAN bucket; malformed stage output fails cleanly. |
| **3. Frontend render** | 13:45–15:15 | Textarea + "Run" button. Four sections: **Prioritized Plan** (ranked, each row shows priority score + reason), **Today** (do-now/defer/blocked), **Draft Replies** (copy-to-clipboard), **Deferred**. | Paste sample in browser (dev) → all four sections render from live API. |
| **4. Loading state + polish** | 15:15–16:15 | Show one subtle spinner and the truthful label "Analyzing your commitments…" for the duration of the request, then render all results immediately. Clean typography, empty/error states. | The wait is clear and honest; the completed result is easy to scan. |
| **5. Deploy** | 16:15–17:00 | `npx vercel --prod` from WSL. Fix the KB gotchas proactively (static-build `/frontend/` prefix routes, `includeFiles: backend/**`, `.env.production` → `VITE_API_BASE=/api`). Set `OPENAI_API_KEY` in Vercel env. | Curl the **alias** (not raw URL): `/` 200 html, `/assets/*.js` 200, `/api/health` ok, `/api/process` 200 with body. |
| **6. Rehearse + submit** | 17:00–18:00 | Run the demo script twice on the live URL. Pre-stage the sample brain-dump. Write submission blurb. Screenshot as fallback. | Full demo runs end-to-end on the deployed URL in <2 min. **Submit by 17:45**, 15-min buffer. |

**Buffer discipline:** if Block 1 isn't done by 13:15, start cutting immediately.

### Cut list — drop in this order if behind

1. **Loading-state polish** (Block 4) → replace the spinner with plain "Working…" text. Results still render all at once.
2. **Copy-to-clipboard + polish** → drafts shown as plain selectable `<pre>` text.
3. **Stage 4 DRAFT** → if truly desperate, ship 3 stages (Extract/Score/Plan). Losing drafts hurts the "it *acts*" story, so cut this only after 1–2.
4. **Deferred as its own section** → fold "defer" + "blocked" into the Today view.
5. **Never cut:** Extract → Score (with visible `reason`) → ranked Prioritized Plan. That trio *is* the differentiator (legible revenue-weighted prioritization). If only this ships, the pitch still lands.

**Fallback if the live deploy breaks during demo:** run `npx vercel dev` locally / `uvicorn` + `vite` on the laptop and demo on `localhost`; have screenshots + a 30s screen-recording of a good run as the ultimate backstop.

---

## 5. Two-minute live demo script

**Sample brain-dump (pre-loaded in the textarea — realistic and messy):**

```
ok brain dump before I lose it:
- Acme (Sarah) emailed twice about the annual plan pricing, they want to sign this week, need to send updated quote
- still owe the podcast guy a reply about coming on the show, low prio but he's been waiting 2 wks
- invoice #204 to Nordic Labs is overdue, was due last Friday, need to chase
- finish the onboarding deck for the new client demo on Thursday
- Dave the designer still hasn't sent the new logo files, blocked on the landing page redesign until then
- taxes / GST filing due end of month sometime
- reply to that recruiter, not urgent
- coffee chat w/ potential co-founder, want to schedule for next week
- the Meridian proposal — they asked for a revised scope, hot lead, they replied yesterday
```

**Script (~2:00):**

- **[0:00–0:20] Problem.** "I'm a solo founder. This" — gesture at the textarea — "is my brain at 9am. Nine things, no ops team, and the stuff that actually makes money is buried in here. Chatbots wait for me to ask the right question. This doesn't." Click **Run**.
- **[0:20–0:45] Explain the pipeline while it runs.** While the single loading indicator is visible: "Behind this request, it extracts every commitment, scores each one on revenue-proximity and urgency, plans my day, and drafts the replies I owe. Four specialized reasoning steps, assembled into one decision-ready result."
- **[0:45–1:15] The payoff — Prioritized Plan.** "Top of my list isn't the loudest thing, it's the most valuable: the Acme renewal and the Meridian hot lead — and look, every ranking shows *why*." Point at a `reason` line. "The overdue Nordic invoice is right there too — money already earned, just uncollected. It reasoned about revenue, and it shows its work."
- **[1:15–1:40] Today + Blocked.** "It tells me exactly what to do *now*, what's safe to defer — GST filing, the recruiter — and what I'm *blocked* on: the landing page, because Dave hasn't sent the logo. It knew that from the context."
- **[1:40–2:00] Draft Replies — the 'it acts' beat.** Open the Acme draft. "And it already wrote the reply — not 'thanks for reaching out', but the actual updated-pricing response to Sarah, referencing that they want to sign this week. I review, I send. One person, the output of an ops team. That's the One Person Company." Close.

**Delivery notes:** narrate *while* it runs (don't wait in silence); if a call is slow, keep talking over the spinner; land on the draft — it's the strongest "wow".

---

## 6. Definition of Done

**Primary (must hit):** On the **deployed Vercel alias URL**, pasting the sample brain-dump and clicking Run renders **all four sections live** — Prioritized Plan (ranked, each item showing its priority score and one-line reason), Today (do-now / defer / blocked with why), Draft Replies (≥1 context-specific draft), Deferred — driven by real `gpt-5.6-sol` Responses API calls with Pydantic Structured Outputs, end-to-end in under ~30s, reproducibly.

**Verification (run before calling it done):**
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<app>.vercel.app/                    # 200 text/html
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<app>.vercel.app/assets/index-*.js   # 200 application/javascript
curl -s https://<app>.vercel.app/api/health                                                           # {"status":"ok"}
curl -s -X POST https://<app>.vercel.app/api/process -H 'Content-Type: application/json' \
  -d '{"braindump":"<sample>","today":"2026-07-12"}' | jq 'keys'                                       # ["drafts","items","plan","scored"]
```
Then open the alias in a fresh browser, paste the sample, and watch all four sections populate.

**Stretch (only if ahead of schedule):** copy-to-clipboard on drafts; a second "regenerate this draft" button per email; per-stage latency metrics in server logs (not simulated UI progress).

---

## 7. Parallel work split (2 people)

The build divides along one clean seam: **Backend/Pipeline** and **Frontend/UI**. They run in
parallel because the `POST /api/process` JSON contract in §2 is the *only* interface between
them. Two self-contained briefs:

- **[PLAN_BACKEND.md](PLAN_BACKEND.md)** — Person A: FastAPI, the 4-stage OpenAI pipeline,
  Pydantic Structured Outputs, priority computation, semantic validation, and deploy.
- **[PLAN_FRONTEND.md](PLAN_FRONTEND.md)** — Person B: Vite + React, the textarea, the four
  result sections, the loading state, and demo polish. Builds against a **frozen mock** of the
  contract, so it never waits on the backend.

**Roles:** Person B (Frontend) = **you** — and because you hold the `OPENAI_API_KEY`, the Vercel
account, and the deploy KB, you also own the repo scaffold, the frozen contract, and the deploy.
Person A (Backend) = your collaborator, who needs only Python + the backend brief + an OpenAI key
for local testing (yours or their own).

### The three rules that make parallelism work

1. **Freeze the contract before splitting.** The JSON in §2 (and the `mock/process.json`
   fixture in the frontend brief) is law. Both people code to those exact field names.
2. **Any contract change is a two-person event.** If Person A must rename/add a field, they
   announce it and update `mock/process.json` in the same commit. No silent drift.
3. **One integration checkpoint, ~15:15.** Person B flips `VITE_API_BASE` from the mock to the
   live `/api`, both sit together for 30 min, reconcile any mismatch against the frozen
   contract, then finish polish on real data.

### Who owns the scaffold, the seam, and deploy

**You (Person B) create the repo skeleton first thing (11:00–11:20)** — the KB repo shape,
`vercel.json`, `api/index.py`, `requirements.txt`, an empty `backend/app/` with a health-only
`main.py` stub, and the committed **frozen `mock/process.json`** — then share it (git remote or
zip) plus an OpenAI key for local dev. The collaborator (Person A) receives that skeleton and
fills in `backend/app/pipeline.py` + `main.py`'s `/process` against the frozen contract, testing
locally with uvicorn. At integration they hand you (or push) the pipeline code; **you deploy**
(you own the Vercel account + deploy KB) and set `OPENAI_API_KEY` in the Vercel project env.

> This mirrors the split perfectly: you own *both* ends of the seam (the contract/mock and the
> deploy), so each side is unblocked by a frozen interface — you by the mock, the collaborator by
> the contract + skeleton. Neither waits on the other until 15:15.

### Parallel timelines

| Time | Person A (Backend — collaborator) | Person B (Frontend — you) |
|---|---|---|
| 11:00–11:20 | (set up Python env; clone repo once shared) | **Scaffold repo + `vercel.json` + `api/index.py` + `main.py` health stub + freeze `mock/process.json`; share repo + an OpenAI key** |
| 11:20–13:15 | Pipeline: 4 `responses.parse` calls, Pydantic models, priority, assemble payload | Layout + 4 sections rendering from `mock/process.json` |
| 13:15–14:00 | Prompt tuning + semantic checks (IDs conserved, buckets partition, score ranges) | Prioritized-Plan rows (score + reason), Today buckets, Drafts, Deferred |
| 14:00–15:15 | Endpoint hardening; local `curl /api/process` green on the sample (uvicorn) | Loading state ("Analyzing your commitments…"), copy-to-clipboard, styling |
| **15:15–15:45** | **Integration: push/hand pipeline code to you; reconcile contract together** | **Integration: pull backend code in, point frontend at real `/api`** |
| 15:45–16:45 | Help verify on real data; on standby | **Deploy `npx vercel --prod`; set `OPENAI_API_KEY` in Vercel; verify alias** |
| 16:45–18:00 | **Joint:** rehearse demo twice on live URL, write blurb, submit by 17:45 | **Joint** |

If Person A slips, you're unaffected until 15:15 (you have the mock) — protect that independence;
it's the whole point of the split.

---

## Appendix A — Repo shape (from KB `vercel-fastapi-vite-colocated-deploy`)

```
api/index.py                 # serverless entry: mounts backend FastAPI app under /api
backend/app/main.py          # FastAPI app: /health, /process; the 4-stage pipeline
backend/app/pipeline.py      # extract/score/plan/draft functions + prompts + JSON parsing
frontend/                    # Vite + React
frontend/.env.production     # VITE_API_BASE=/api
requirements.txt             # ROOT — runtime deps only (no uvicorn)
vercel.json                  # version 2, legacy builds/routes
.vercelignore
.env                         # OPENAI_API_KEY (local; set in Vercel dashboard for prod)
```

**`vercel.json`** (KB-verified; note the `/frontend/` prefix routes — Gotcha 2):
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

**`api/index.py`** — import + mount, prefix auto-stripped by Starlette:
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

**Root `requirements.txt`** (runtime only — Vercel provides the ASGI server):
```
fastapi>=0.115
pydantic>=2.7
python-dotenv>=1.0
openai>=2.0
```

## Appendix B — Backend pipeline sketch (`backend/app/pipeline.py`)

```python
import json, os
from typing import Literal, TypeVar

from openai import OpenAI
from pydantic import BaseModel

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
MODEL = "gpt-5.6-sol"

# These Pydantic types are the executable version of the contracts above.
class Item(BaseModel):
    id: str
    item: str
    type: Literal["task", "email_owed", "deadline"]
    due_date: str | None
    context: str

class ExtractOutput(BaseModel):
    items: list[Item]

class ScoredItem(Item):
    revenue_proximity: int
    urgency: int
    reason: str

class ScoreOutput(BaseModel):
    scored: list[ScoredItem]

class BucketItem(BaseModel):
    id: str
    why: str

class PlanOutput(BaseModel):
    do_now: list[str]
    defer: list[BucketItem]
    blocked: list[BucketItem]

class Draft(BaseModel):
    id: str
    subject: str
    body: str

class DraftOutput(BaseModel):
    drafts: list[Draft]

OutputT = TypeVar("OutputT", bound=BaseModel)

def _call(system: str, user: str, schema: type[OutputT]) -> OutputT:
    response = client.responses.parse(
        model=MODEL,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        text_format=schema,
    )
    if response.output_parsed is None:
        raise ValueError("Model returned no structured output")
    return response.output_parsed

def run_pipeline(braindump: str, today: str) -> dict:
    preamble = PREAMBLE.format(TODAY=today)

    extracted = _call(preamble + EXTRACT, braindump, ExtractOutput)
    items = [item.model_dump(mode="json") for item in extracted.items]

    scored_output = _call(
        preamble + SCORE,
        json.dumps({"items": items}),
        ScoreOutput,
    )
    scored = [item.model_dump(mode="json") for item in scored_output.scored]
    for s in scored:                                   # priority computed server-side
        s["priority"] = s["revenue_proximity"] * 2 + s["urgency"]
    scored.sort(key=lambda s: s["priority"], reverse=True)

    plan = _call(
        preamble + PLAN,
        json.dumps({"scored": scored}),
        PlanOutput,
    ).model_dump(mode="json")

    emails = [s for s in scored if s["type"] == "email_owed"]
    if emails:
        draft_output = _call(
            preamble + DRAFT,
            json.dumps({"items": emails}),
            DraftOutput,
        )
        drafts = [draft.model_dump(mode="json") for draft in draft_output.drafts]
    else:
        drafts = []

    return {"items": items, "scored": scored, "plan": plan, "drafts": drafts}
```
`backend/app/main.py` exposes `GET /health` → `{"status":"ok"}` and `POST /process` → `run_pipeline(...)`, wrapped in try/except returning a clean 500 with the failing stage so demo-day errors are debuggable.

> **Structured Outputs requirement:** `client.responses.parse(..., text_format=Schema)` removes manual `json.loads` and constrains each response to its Pydantic schema. It does not replace semantic validation: after each stage, verify score ranges, conserved/unique IDs, and that the PLAN buckets form an exact partition. Confirm `gpt-5.6-sol` account access and all four schemas with the sample in Block 0.
