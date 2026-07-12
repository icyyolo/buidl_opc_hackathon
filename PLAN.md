# PLAN.md — Revenue Chief: Explainable Revenue Triage for One-Person Companies

> **Event:** BUIDL_OPC_Hackathon_SG (Claude SG Community × amber.ac × Amber Group). Category: AI.
> **Theme:** Next-generation One Person Companies via agentic services.
> **Build window:** 11:00 → 18:00 submission (~6h hacking). Then top-30 → top-10 pitch → judging.
> **Bet:** one deep, working, live-demoable agentic pipeline beats broad unfinished scope.

**Standing assumptions (chosen, not asked — override if wrong):**
- **Model:** OpenAI `gpt-5.6-sol` for all four stages — the current latest flagship model as verified against OpenAI's model guidance on 2026-07-12. Set via one `MODEL` constant. All calls use the Responses API with strict Structured Outputs backed by Pydantic response models. *(Note: this is a Claude-community hackathon — OpenAI is a deliberate, accepted choice; provider access must be confirmed in Block 0.)*
- **No streaming or simulated progress.** One `POST /api/process` runs the pipeline and returns the complete result. While it is pending, the UI shows one honest loading state ("Finding today's Money Moves…"); when it completes, all result sections render immediately. No staged reveal or fabricated intermediate events.
- **Deploy:** single Vercel project, same-origin, `builds`/`routes` legacy schema (KB-verified). Deploy from WSL via `npx vercel --prod`.
- **State:** none persisted. Paste → process → render. No DB, no auth, no accounts.
- **Date handling:** "today" is injected into prompts as an ISO string from the server clock so `due_date` reasoning is grounded. Demo machine timezone = SGT.

---

## 1. Problem + Solution (pitch paragraph)

Solo founders do not need another task list — they need to know which commitment changes cash today. **Revenue Chief** turns one messy founder brain-dump into three **Money Moves**. It extracts every obligation, classifies it as **Collect, Close, Deliver, Retain, Grow, or Operate**, then ranks it using revenue proximity and urgency. Every decision shows the source evidence and the cost of waiting. Safe work is deliberately parked, blockers get a concrete unblock action, and the selected client replies are drafted using the founder's actual details. No integrations or setup: paste the chaos, inspect the economic logic, and act.

### Competitive wedge

Calendar planners schedule already-known tasks. Inbox assistants triage email. Connected AI chiefs of staff build persistent context across apps. Revenue Chief makes a narrower promise: **one unstructured, cross-domain founder dump becomes an auditable revenue decision in under 30 seconds**. Its defensible combination is zero-setup intake, explicit revenue-motion classification, deterministic revenue-first scoring, source-grounded reasoning, complete Money Moves/Parked/Blocked triage, and action-ready messages. The novelty claim is this complete opinionated workflow — not the generic "AI chief of staff," "brain dump to plan," or "explainable ranking" categories.

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
     │ 1. EXTRACT    │  items   │ 2. SCORE       │scored│ 3. DECIDE      │    │ 4. PREPARE     │
     │ raw text →    │ ───────► │ +money motion  │─────►│ top 3 Money    │───►│ selected reply │
     │ JSON items[]  │          │ +rev proximity │      │ Moves / Park / │    │ + unblock      │
     │ {item,type,   │          │ +urgency       │      │ Blocked        │    │ messages only  │
     │  due_date?,   │          │ +evidence      │      │ +next action   │    │ using context  │
     │  value?,ctx}  │          │ rev*3+urgency  │      │ +done_when     │    │ +plan decision │
     │ MECHANICAL    │          │ JUDGMENT       │      │ JUDGMENT       │    │ GENERATION     │
     └───────────────┘          └────────────────┘      └────────────────┘    └────────────────┘
             │                           │                        │                    │
             └───────────────────────────┴────────────────────────┴────────────────────┘
                                         │  server assembles one JSON payload:
                                         ▼  { items, scored, plan, drafts }
                         ┌─────────────────────────────────────────────┐
                         │  React UI renders 4 result sections          │
                         │  3 Money Moves · Blocked → Unblock ·         │
                         │  Parked Safely · All Commitments             │
                         └─────────────────────────────────────────────┘
```

**Data contract (single source of truth — keep the field names identical across all 4 prompts):**

```jsonc
// after EXTRACT
{ "id": "i1", "item": "Reply to Acme re: renewal quote",
  "type": "email_owed",              // task | email_owed | deadline
  "due_date": "2026-07-12",          // ISO or null
  "stated_value": "S$12,000/year",   // exact value from input or null; never estimated
  "source_text": "Acme (Sarah) emailed twice about their renewal. She wants the revised annual quote today. Price is S$12,000/year with 10% off if they sign by Friday.",
  "context": "Sarah at Acme wants the revised renewal quote today. The price is S$12,000/year with a 10% signing incentive through Friday." }

// SCORE adds:
{ "revenue_motion": "close",         // collect | close | deliver | retain | grow | operate
  "revenue_proximity": 5, "urgency": 5,
  "evidence": "She wants the revised annual quote today",
  "cost_of_delay": "Waiting leaves Sarah less time to use the Friday signing incentive.",
  "missing_fact": null,
  "priority": 20 }                    // = revenue_proximity*3 + urgency, computed SERVER-SIDE

// DECIDE returns an exact partition of every id:
{ "money_moves": [
    { "id":"i1", "why_today":"Warm S$12k renewal with a decision expected this week.",
      "next_action":"Send Sarah the revised quote before 11am.",
      "done_when":"Quote sent and Friday follow-up scheduled." }
  ],
  "park": [{"id":"i2","why_safe":"No client or cash outcome depends on this today."}],
  "blocked": [{"id":"i5","blocker":"Waiting for Dave's final logo files.",
                "unblock_action":"Ask Dave to deliver the files by 3pm today.",
                "message_needed":true}] }

// PREPARE returns only selected Money Move replies and useful unblock messages:
{ "id": "i1", "purpose": "money_move",
  "subject": "Re: Annual plan pricing", "body": "Hi Sarah, ..." }
```

Each stage has a matching Pydantic response model passed to `client.responses.parse(...)`. OpenAI Structured Outputs constrains the response to that schema; the server then checks cross-stage invariants: unique and conserved IDs, evidence copied from the original input, stated values never invented, and complete non-overlapping DECIDE buckets.

> **Priority is computed in Python as `revenue_proximity*3 + urgency`**, not asked from the model. The 3× weight makes the product's revenue-first promise mechanically true. Revenue motion, evidence, cost of delay, and missing information make the judgment inspectable; arithmetic remains deterministic.

---

## 3. The four system prompts (full text)

All four share a preamble injected at the top:

```
You are the reasoning core of "Revenue Chief", an explainable revenue-triage agent for a solo
founder (a one-person company). Today's date is {TODAY} (ISO, Asia/Singapore). Your response
is constrained by the supplied JSON schema. Populate every field exactly as instructed; do
not add prose, markdown, or commentary outside the structured response.
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
  - stated_value: copy an explicitly stated monetary value and its unit/cadence (for example,
      "S$4,800", "US$12k ARR", or "€2,000/month"). Otherwise null. Never estimate a value.
  - source_text: the shortest exact excerpt from the input that proves this commitment exists.
      Copy it verbatim; do not paraphrase it.
  - context: 1–2 sentences of the surrounding detail from the brain-dump that a later stage
      would need to act (who, what they asked, any stakes). Quote specifics; never generalize
      to "a client asked something".

Split compound lines into separate items. Do not merge unrelated items. Do not drop items
because they seem trivial — extraction is exhaustive and neutral.

Return JSON: { "items": [ {id, item, type, due_date, stated_value, source_text, context}, ... ] }
```

### Stage 2 — SCORE (judgment: money motion + revenue + urgency, grounded in evidence)

```
ROLE: Revenue Prioritizer. For EACH item, classify the money motion, assess two independent
1–5 scores, and expose the evidence and cost of waiting.

  revenue_motion: exactly one of:
      "collect" — money already earned or owed (invoice, payment, receivable).
      "close"   — win, renew, or expand signed revenue now.
      "deliver" — complete paid work, unlock an invoice, or create promised customer value.
      "retain"  — prevent churn or protect an existing paying relationship.
      "grow"    — build future pipeline, audience, or relationships without near-term cash.
      "operate" — admin, compliance, internal, personal, or speculative work with no direct
                  revenue motion.

  revenue_proximity (1–5): how directly does completing this item move money toward the
    founder? Anchor the scale:
      5 = collects money already earned, closes/expands revenue now, or unblocks a paid
          delivery with immediate commercial consequence.
      4 = strongly revenue-adjacent (hot proposal, renewal conversation, at-risk account).
      3 = pipeline / relationship that could convert later.
      2 = keeps the business running but no direct revenue (admin, ops hygiene).
      1 = personal, speculative, or purely internal with no revenue line of sight.

  urgency (1–5): how time-critical is it, given due_date and TODAY?
      5 = overdue or due today with real consequence.
      4 = due within 2 days.
      3 = due this week.
      2 = due later / soft deadline.
      1 = no deadline pressure.

  evidence: a short exact phrase copied from source_text that supports the commercial or time
    judgment. It MUST be a verbatim substring of the original brain-dump.

  cost_of_delay: ONE specific sentence describing the likely consequence of not acting today.
    Use only consequences supported by the item. If none is supported, say "No material cost
    of waiting is stated."

  missing_fact: the single missing fact that would most change this item's rank (for example,
    "Exact invoice amount is unknown"), or null when the input is sufficient. Never invent the
    missing answer.

Do NOT compute a total or rank. Preserve id, item, type, due_date, stated_value, source_text,
and context unchanged.

Return JSON: { "scored": [ {id, item, type, due_date, stated_value, source_text, context,
  revenue_motion, revenue_proximity, urgency, evidence, cost_of_delay, missing_fact}, ... ] }
```

> Server then computes `priority = revenue_proximity*3 + urgency` for each and sorts descending.

### Stage 3 — DECIDE (today's three Money Moves / Park / Blocked)

```
ROLE: Revenue Chief. You are given the scored, priority-ranked items. Make a decisive,
realistic plan for TODAY for a founder with limited focused hours.

  money_moves: at most THREE items the founder can materially advance today, highest-leverage
    first. Prefer collect/close/deliver/retain motions with high priority. Each entry includes:
      - why_today: one sentence tying the decision to money motion, urgency, and evidence.
      - next_action: one concrete physical action, specific enough to begin immediately.
      - done_when: an observable finish line for today.
    Do not include an item that is genuinely blocked.

  park: work the founder should consciously NOT do today. For each, why_safe must explain why
    waiting does not threaten a near-term customer, cash outcome, or hard deadline.

  blocked: work the founder cannot progress because it depends on someone or something else.
    Name the blocker precisely and give one concrete unblock_action. If a person can unblock
    it, state the message/request and a reasonable requested response time without inventing
    contact details. Set message_needed true only when executing the unblock action requires a
    message to another person; otherwise false.

Every id from the input must appear in exactly one of the three buckets. Use only the given
ids; do not invent items. Judge blockers from the context field (e.g. "waiting on", "once X
sends", "pending approval").

Return JSON: { "money_moves": [ {id, why_today, next_action, done_when}, ... ],
               "park":        [ {id, why_safe}, ... ],
               "blocked":     [ {id, blocker, unblock_action, message_needed}, ... ] }
```

### Stage 4 — PREPARE (only the messages needed to execute today's decision)

```
ROLE: Execution Ghostwriter. You receive only the communication targets selected after DECIDE:
  1. a Money Move whose type is "email_owed"; or
  2. a Blocked item whose unblock_action requires a message to a person.

For EACH target, write the ready-to-send message the founder needs to execute the decision.
Set purpose to "money_move" or "unblock" exactly as supplied.

Rules:
  - Use context, stated_value, and the DECIDE fields. Reference the specific ask, names,
    numbers, and stakes. A generic "Thanks for reaching out" is a FAILURE.
  - Voice: warm, concise, professional, founder-to-client. No corporate filler, no emojis.
  - For a Money Move, answer or acknowledge the ask and propose the concrete next action.
  - For an unblock message, name what is needed, why it matters, and the requested response time.
  - Never invent an amount, promise, recipient address, or commercial term. Use dates stated in
    the item; for an unblock message, copy the operational response time supplied by DECIDE.
    If a required fact is unknown, use a clearly bracketed placeholder such as [confirm exact figure].
  - subject: a natural subject line (use "Re: ..." for replies when appropriate). body: 3–8
    sentences, real salutation and sign-off.

Never draft for parked items or for unselected email_owed items. Return an empty list when no
selected target needs a message.

Return JSON: { "drafts": [ {id, purpose, subject, body}, ... ] }
```

---

## 4. Six-hour timeline, checkpoints, cut list

Times assume 11:00 start / 18:00 submit. Each checkpoint is a *verifiable* state.

| Block | Time | Goal | Checkpoint (verify) |
|---|---|---|---|
| **0. Scaffold** | 11:00–11:30 | Repo shape from KB. `api/index.py`, `backend/app/main.py`, `frontend/` Vite+React, `vercel.json`, root `requirements.txt`, `.env`. | `GET /api/health` → `{"status":"ok"}` locally; Vite dev page loads. |
| **1. Backend pipeline** | 11:30–13:00 | `POST /api/process` runs all 4 `gpt-5.6-sol` Responses API calls sequentially with Pydantic Structured Outputs, computes `priority = revenue_proximity*3 + urgency`, selects communication targets from DECIDE, and returns the assembled payload. Hard-code the sample brain-dump in a test script. | `curl` the endpoint → schema-valid JSON with `items`, `scored`, `plan`, `drafts`; verbatim evidence; at most 3 Money Moves; exact bucket partition. **This is the core; protect this block.** |
| **2. Prompt tuning** | 13:00–13:45 | Run the sample through; tune money-motion labels, evidence, cost-of-delay language, concrete next actions, and drafts. Add semantic checks for conserved IDs, score ranges, evidence grounding, stated-value fidelity, and exact DECIDE buckets. | Top moves are Acme/Nordic/Meridian; every evidence string exists in the input; Dave has an unblock action; low-value parked emails receive no draft; malformed output fails cleanly. |
| **3. Frontend render** | 13:45–15:15 | Textarea + "Find My Money Moves" button. Four sections: **Today's 3 Money Moves**, **Blocked → Unblock**, **Parked Safely**, **All Commitments**. Attach each selected draft to its Money Move or blocked card. | Paste sample in browser (dev) → cards show money-motion badge, stated value when present, priority, evidence, cost of delay, next action, finish line, and selected draft. |
| **4. Loading state + polish** | 15:15–16:15 | Show one subtle spinner and the truthful label "Finding today's Money Moves…" for the duration of the request, then render all results immediately. Clean typography, copy-to-clipboard, empty/error states. | The wait is clear and honest; the three decisions and their economic logic are scannable in seconds. |
| **5. Deploy** | 16:15–17:00 | `npx vercel --prod` from WSL. Fix the KB gotchas proactively (static-build `/frontend/` prefix routes, `includeFiles: backend/**`, `.env.production` → `VITE_API_BASE=/api`). Set `OPENAI_API_KEY` in Vercel env. | Curl the **alias** (not raw URL): `/` 200 html, `/assets/*.js` 200, `/api/health` ok, `/api/process` 200 with body. |
| **6. Rehearse + submit** | 17:00–18:00 | Run the demo script twice on the live URL. Pre-stage the sample brain-dump. Write submission blurb. Screenshot as fallback. | Full demo runs end-to-end on the deployed URL in <2 min. **Submit by 17:45**, 15-min buffer. |

**Buffer discipline:** if Block 1 isn't done by 13:15, start cutting immediately.

### Cut list — drop in this order if behind

1. **Loading-state polish** (Block 4) → replace the spinner with plain "Working…" text. Results still render all at once.
2. **Copy-to-clipboard + visual polish** → messages remain plain selectable text inside their cards.
3. **Stage 4 PREPARE** → if truly desperate, ship 3 stages (Extract/Score/Decide). Losing action-ready messages hurts, so cut this only after 1–2.
4. **All Commitments as its own section** → keep only Money Moves, Blocked, and Parked; no data is lost from the response.
5. **Never cut:** grounded evidence, money-motion labels, deterministic 3× revenue score, and the exact Money Moves/Park/Blocked partition. Those elements are the differentiator. If only three stages ship, the pitch still lands.

**Fallback if the live deploy breaks during demo:** run `npx vercel dev` locally / `uvicorn` + `vite` on the laptop and demo on `localhost`; have screenshots + a 30s screen-recording of a good run as the ultimate backstop.

---

## 5. Two-minute live demo script

**Sample brain-dump (pre-loaded in the textarea — realistic and messy):**

```
ok brain dump before I lose it:
- Acme (Sarah) emailed twice about their renewal. She wants the revised annual quote today. Price is S$12,000/year with 10% off if they sign by Friday.
- still owe the podcast guy a reply about coming on the show, low prio but he's been waiting 2 wks
- Nordic Labs invoice #204 for S$4,800 was due last Friday. James in AP is the contact; need to ask whether anything is blocking payment.
- finish the generic onboarding deck template by Thursday if there is time; no client is waiting on it
- Dave the designer still hasn't sent the new logo files, blocked on the landing page redesign until then
- taxes / GST filing due end of month sometime
- reply to that recruiter, not urgent
- coffee chat w/ potential co-founder, want to schedule for next week
- Meridian has an S$18,000 budget. They asked yesterday for a revised scope removing analytics but keeping onboarding; they want it tomorrow and decide on Wednesday.
```

**Script (~2:00):**

- **[0:00–0:20] Problem.** "I'm a solo founder. This" — gesture at the textarea — "is my business at 9am: nine commitments across sales, delivery, cash collection, and admin. A task list stores the chaos. I need an economic decision." Click **Find My Money Moves**.
- **[0:20–0:45] Explain the pipeline while it runs.** While the single loading indicator is visible: "It extracts every commitment, identifies the money motion, grounds the judgment in my own words, ranks revenue three times more heavily than urgency, and prepares only the messages needed to act. Four specialist stages, one auditable decision."
- **[0:45–1:15] The payoff — three Money Moves.** "In seconds it found three different revenue motions: collect S$4,800 already earned, close a S$12,000 renewal, and advance an S$18,000 proposal." Point at the badges, source evidence, and cost-of-delay lines. "I can see exactly why each one is here — and what waiting could cost."
- **[1:15–1:40] Parked + Blocked.** "It also makes the decision most planners avoid: what *not* to do. GST and the recruiter are parked safely. The landing page is blocked on Dave, and Revenue Chief gives me the exact unblock request instead of pretending I can work on it."
- **[1:40–2:00] Prepared action.** Open the Acme Money Move and its attached draft. "The decision flows straight into action: Sarah's name, S$12,000 annual price, 10% signing incentive, and Friday deadline are already in the reply. It did not draft the podcast or recruiter emails because they are not today's moves. I review, copy, and send."

**Delivery notes:** narrate *while* it runs (don't wait in silence); if a call is slow, keep talking over the spinner; land on the draft — it's the strongest "wow".

---

## 6. Definition of Done

**Primary (must hit):** On the **deployed Vercel alias URL**, pasting the sample brain-dump and clicking **Find My Money Moves** renders **all four sections live** — Today's 3 Money Moves, Blocked → Unblock, Parked Safely, and All Commitments — driven by real `gpt-5.6-sol` Responses API calls with Pydantic Structured Outputs, end-to-end in under ~30s, reproducibly. Money Move cards show their motion, stated value when present, deterministic priority, verbatim evidence, cost of delay, next action, finish line, and any selected message.

**Decision-quality acceptance checks (all must pass on the sample):**

- Acme, Nordic Labs, and Meridian are the three Money Moves; no blocked item appears there.
- Acme is `close`, Nordic is `collect`, and Meridian is `close`.
- Every `evidence` string is a verbatim substring of the submitted brain-dump.
- `stated_value` preserves `S$12,000/year`, `S$4,800`, and `S$18,000`; no unstated value is invented.
- Dave appears in Blocked with a concrete request for the logo files and a response time.
- GST, the recruiter, podcast reply, coffee chat, and generic deck are Parked with a credible `why_safe`.
- The Acme draft contains Sarah, S$12,000/year, 10%, and Friday. Nordic and Meridian drafts use their supplied specifics.
- No draft is generated for the podcast or recruiter items.
- Every extracted id appears exactly once across `money_moves`, `park`, and `blocked`.

**Verification (run before calling it done):**
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<app>.vercel.app/                    # 200 text/html
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<app>.vercel.app/assets/index-*.js   # 200 application/javascript
curl -s https://<app>.vercel.app/api/health                                                           # {"status":"ok"}
curl -s -X POST https://<app>.vercel.app/api/process -H 'Content-Type: application/json' \
  -d '{"braindump":"<sample>","today":"2026-07-12"}' | jq 'keys'                                       # ["drafts","items","plan","scored"]
```
Then open the alias in a fresh browser, paste the sample, and verify both the four sections and the decision-quality checks above.

**Stretch (only if ahead of schedule):** an "Open in email" action for prepared messages; a second "regenerate this draft" button per message; per-stage latency metrics in server logs (not simulated UI progress).

---

## 7. Parallel work split (2 people)

The build divides along one clean seam: **Backend/Pipeline** and **Frontend/UI**. They run in
parallel because the `POST /api/process` JSON contract in §2 is the *only* interface between
them. Two self-contained briefs:

- **[PLAN_BACKEND.md](PLAN_BACKEND.md)** — Person A: FastAPI, the 4-stage OpenAI pipeline,
  Pydantic Structured Outputs, priority computation, semantic validation, and deploy support.
- **[PLAN_FRONTEND.md](PLAN_FRONTEND.md)** — Person B: Vite + React, the textarea, the four
  Revenue Chief sections, Money Move action cards, the loading state, and demo polish. Builds
  against a **frozen mock** of the contract, so it never waits on the backend.

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
| 11:20–13:15 | Pipeline: 4 `responses.parse` calls, Pydantic models, 3× revenue priority, selected draft targets, assembled payload | Layout + 4 sections rendering from `mock/process.json` |
| 13:15–14:00 | Prompt tuning + semantic checks (IDs conserved, exact partition, score ranges, evidence/value grounded) | Money Move cards, Blocked → Unblock, Parked Safely, All Commitments, attached drafts |
| 14:00–15:15 | Endpoint hardening; local `curl /api/process` green on the sample (uvicorn) | Loading state ("Finding today's Money Moves…"), copy-to-clipboard, styling |
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
backend/app/pipeline.py      # extract/score/decide/prepare functions + prompts + validation
frontend/                    # Vite + React
frontend/.env.production     # VITE_API_BASE=/api
mock/process.json            # frozen frontend/backend seam matching the §2 contract
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
    stated_value: str | None
    source_text: str
    context: str

class ExtractOutput(BaseModel):
    items: list[Item]

class ScoredItem(Item):
    revenue_motion: Literal["collect", "close", "deliver", "retain", "grow", "operate"]
    revenue_proximity: int
    urgency: int
    evidence: str
    cost_of_delay: str
    missing_fact: str | None

class ScoreOutput(BaseModel):
    scored: list[ScoredItem]

class MoneyMove(BaseModel):
    id: str
    why_today: str
    next_action: str
    done_when: str

class ParkItem(BaseModel):
    id: str
    why_safe: str

class BlockedItem(BaseModel):
    id: str
    blocker: str
    unblock_action: str
    message_needed: bool

class DecideOutput(BaseModel):
    money_moves: list[MoneyMove]
    park: list[ParkItem]
    blocked: list[BlockedItem]

class Draft(BaseModel):
    id: str
    purpose: Literal["money_move", "unblock"]
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
        s["priority"] = s["revenue_proximity"] * 3 + s["urgency"]
    scored.sort(key=lambda s: s["priority"], reverse=True)

    plan = _call(
        preamble + DECIDE,
        json.dumps({"scored": scored}),
        DecideOutput,
    ).model_dump(mode="json")

    by_id = {item["id"]: item for item in scored}
    targets = []
    for move in plan["money_moves"]:
        item = by_id[move["id"]]
        if item["type"] == "email_owed":
            targets.append({"purpose": "money_move", "item": item, "decision": move})
    for blocked in plan["blocked"]:
        if blocked["message_needed"]:
            targets.append({
                "purpose": "unblock",
                "item": by_id[blocked["id"]],
                "decision": blocked,
            })

    if targets:
        draft_output = _call(
            preamble + PREPARE,
            json.dumps({"targets": targets}),
            DraftOutput,
        )
        drafts = [draft.model_dump(mode="json") for draft in draft_output.drafts]
    else:
        drafts = []

    return {"items": items, "scored": scored, "plan": plan, "drafts": drafts}
```
`backend/app/main.py` exposes `GET /health` → `{"status":"ok"}` and `POST /process` → `run_pipeline(...)`, wrapped in try/except returning a clean 500 with the failing stage so demo-day errors are debuggable.

> **Structured Outputs requirement:** `client.responses.parse(..., text_format=Schema)` removes manual `json.loads` and constrains each response to its Pydantic schema. It does not replace semantic validation: verify 1–5 score ranges; unique and conserved IDs; `source_text`, `evidence`, and non-null `stated_value` against the original input; no more than three Money Moves; an exact Money Moves/Park/Blocked partition; and drafts whose ids/purposes exactly match the server-selected targets. Confirm `gpt-5.6-sol` account access and all four schemas with the sample in Block 0.

---

## 8. Post-build frontend audit — findings & UI improvements

> Added **2026-07-12** after a code vet + **live browser test** of the built `frontend/`
> (branch `feat/frontend`). Status: frontend is **complete and healthy** — `tsc -b` clean,
> 51/51 unit tests pass, production build succeeds (66 KB gzip), and every UI path below was
> driven live in a real browser against a controllable mock backend (not just the test suite).
> The items here are refinements + one integration-day risk to fix, not blockers.

### 8.1 Verified working live (browser, mock backend)

| Path | Result |
|---|---|
| Initial load | ✅ Hero, proof-strip, pre-filled 950-char sample, live char count, CTA, 3-step intro |
| Happy path | ✅ Spinner → all 4 sections; Money Moves ordered Nordic `COLLECT` P20 / Acme `CLOSE` P20 / Meridian `CLOSE` P19; grounded evidence, cost-of-delay, why/next/done, Meridian open-question, drafts, 1 blocked + 5 parked cards, 9-row audit with `—`/`No due date` |
| Copy draft | ✅ Flips to "Copied" + status; `writeText` succeeds on secure `localhost` |
| Empty input | ✅ Client guard fires, red box, **no** network call |
| HTTP 503 | ✅ Surfaces backend stage detail ("…EXTRACT stage failed: model unavailable") |
| Malformed 200 | ✅ Contract guard → "returned an incomplete plan. Please try again." |
| Slow (6s) | ✅ Spinner + disabled textarea/button held for full delay, then resolved |

### 8.2 Findings ranked by impact

1. **[HIGH — fix at integration] Strict validation is a hard render-gate that will blank the
   screen on a *renderable* plan.** `assertProcessResponse` ([frontend/src/contract.ts](frontend/src/contract.ts))
   enforces cross-stage **invariants** (priority formula, sort order, evidence/value grounding,
   exact draft-target match, `sameBaseFields`) and throws `ContractError` → generic error, **no
   results**. **Reproduced live:** a structurally-perfect payload (verified valid by curl) was
   rejected with "incomplete plan" purely because `sourceBraindump.includes(source_text)` failed
   when the submitted text didn't exactly substring-match the model's evidence — confirmed it was
   grounding, not timing, by reproducing it in instant mode. On demo day any whitespace/smart-quote
   drift between `evidence` and input blanks the screen. **Fix:** split validation — keep
   *structural* checks (shapes/types/enums/required strings) as hard gates (render would crash
   without them); demote *invariant* checks to `console.warn` in production (keep them hard in
   tests/dev to catch backend bugs at the 15:15 integration). A slightly-imperfect rendered plan
   beats a blank error live.
2. **[MED] `today` is hard-coded** to `'2026-07-12'` ([frontend/src/api.ts](frontend/src/api.ts),
   `DEMO_TODAY`). Breaks "paste your own" on any other day (relative dates like "Friday" anchor to
   July 12) and contradicts §Standing-assumptions ("today … from the server clock"). **Fix:**
   default to `new Date().toISOString().slice(0,10)`; keep an optional pin for the scripted demo.
3. **[MED] No client-side request timeout** on a 4-sequential-LLM call. Bare `fetch`, no
   `AbortController` — a hung backend spins forever locally. **Fix:** ~90s `AbortController` +
   friendly message; ideally reassure past ~15s ("still working, this can take up to a minute").
4. **[LOW] Render order depends on the backend sorting correctly.** "All Commitments" renders
   `data.scored` in raw array order. Since every row has `priority`, sort client-side as a safety
   net and drop the sort-order assertion.
5. **[LOW] Missing motion-edge colors** for `retain`/`grow`/`operate` money cards
   ([frontend/src/styles.css](frontend/src/styles.css) defines only collect/close/deliver);
   a `retain` Money Move (plausible for the Acme *renewal*) falls back to the generic green edge.

### 8.3 Suggested UI improvements (polish, drop-in)

- **Graceful degradation on validation failure** (finding #1) — render what's structurally valid
  instead of a blank error screen. Highest-value UI change.
- **Keep the intro/last-results visible on error** — currently `viewState==='error'` renders
  neither intro nor results ([frontend/src/App.tsx](frontend/src/App.tsx)), leaving the page below
  the form blank. Keep `IntroPlaceholder` (or prior results) mounted so the error reads as a
  transient banner, not a wipe.
- **Elapsed-time reassurance in the loading state** — for the realistic 30–60s pipeline, add a
  quiet "this can take up to a minute" after ~15s (still honest, no fake per-stage progress).
- **Human-friendly dates** — `Due Jul 12` instead of `Due 2026-07-12` in cards/rows (cosmetic).
- **Fill the retain/grow/operate edge colors** so every Money Move card has a motion accent.

### 8.4 Applied + environment notes

- **Applied:** `frontend/package.json` `"dev": "vite"` → `"dev": "vite --host"` so the dev server
  is reachable from a Windows/host browser by default (WSL preview needs `0.0.0.0` binding).
- **Local-dev CORS gap:** `backend/app/main.py` has no `CORSMiddleware`. Same-origin on Vercel so
  prod is fine, but running vite + `uvicorn` on separate ports locally (the documented dev flow)
  fails the cross-origin `/process` call. Add `CORSMiddleware` (dev-only) or a vite proxy so the
  15:15 integration doesn't stall on CORS.
