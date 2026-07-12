# PLAN_BACKEND.md — Person A: Backend & Pipeline

> Your half of **Revenue Radar: Explainable Revenue Triage for One-Person Companies**
> (BUIDL_OPC_Hackathon_SG, AI category).
> Full context in [PLAN.md](PLAN.md); this is everything *you* need. Person B builds the UI in
> parallel against the frozen contract — don't change field names without telling them.

**What the product does (one line for context):** a solo founder pastes a messy weekly
brain-dump; a 4-stage pipeline extracts every commitment, classifies its money motion, computes
a revenue-first priority, selects three Money Moves, parks or unblocks everything else, and
prepares only the messages required to execute that decision.

## Your scope

You own the pipeline. Person B (frontend) owns the repo, the accounts, and the deploy.
- `backend/app/main.py` (the `/process` handler) and `backend/app/pipeline.py` — **this is your core**
- The 4 OpenAI Responses-API calls, Pydantic Structured Outputs, `priority` math, semantic validation
- `requirements.txt` content (the Python deps your pipeline needs)

**Person B gives you** the scaffolded repo (KB shape, `vercel.json`, `api/index.py`, a health-only
`main.py` stub), the **frozen `mock/process.json`** contract, and an OpenAI key for local dev.

**You do NOT touch** `frontend/`, `vercel.json`, or `api/index.py` (Person B owns the repo +
deploy). You do **not** deploy — you develop and test locally with uvicorn, then hand Person B
your `pipeline.py` + `main.py` at the 15:15 integration point; they deploy.

**Local dev needs an OpenAI key.** Use the one Person B shares, or your own — put it in a local
`.env` as `OPENAI_API_KEY`. The production key lives in Person B's Vercel env, not your concern.

## The contract you must honor (this is law — Person B codes to it)

`POST /api/process` — request `{ "braindump": str, "today": "YYYY-MM-DD" }`, response:

```jsonc
{
  "items": [
    { "id", "item", "type": "task|email_owed|deadline", "due_date": "ISO|null",
      "stated_value": "string|null", "source_text", "context" }
  ],
  "scored": [
    { ...item fields, "revenue_motion": "collect|close|deliver|retain|grow|operate",
      "revenue_proximity": 1-5, "urgency": 1-5, "evidence", "cost_of_delay",
      "missing_fact": "string|null", "priority": int }
  ],
  "plan": {
    "money_moves": [{"id","why_today","next_action","done_when"}],
    "park": [{"id","why_safe"}],
    "blocked": [{"id","blocker","unblock_action","message_needed":bool}]
  },
  "drafts": [ { "id", "purpose": "money_move|unblock", "subject", "body" } ]
}
```

Invariants Person B (and the demo) rely on:
- `scored` is **pre-sorted** by `priority` descending. The frontend renders it in array order.
- `source_text` and `evidence` are verbatim substrings of the submitted brain-dump. A non-null
  `stated_value` must also be grounded in that input; never accept an invented amount.
- Every `id` appears in **exactly one** of `plan.money_moves / park / blocked`; Money Moves has
  at most three entries and contains no blocked item.
- `drafts` contains only server-selected Money Move replies and `message_needed` unblock
  messages. Parked and unselected email items receive no draft; `drafts` may be `[]`.
- `priority` is computed **server-side** as `revenue_proximity*3 + urgency` — never ask the model for it.

If you must change any field name, update `mock/process.json` in the same commit and tell Person B.

## Your build order

1. **Receive the skeleton (11:00–11:20).** Person B shares the scaffolded repo + the frozen
   `mock/process.json` + an OpenAI key. Set up your Python env, put the key in a local `.env`,
   confirm `uvicorn` serves the health stub. You now have everything to work in isolation.
2. **Pipeline (11:20–13:15).** Implement `run_pipeline` (sketch below). Hard-code the sample
   brain-dump from [PLAN.md §5](PLAN.md) verbatim in a `scratch_test.py`; evidence validation
   depends on its exact text. Iterate until `python -m scratch_test` prints all four keys.
3. **Prompt tuning + validation (13:15–14:00).** Tune money-motion labels, grounded evidence,
   cost of delay, next actions, and selected drafts. Validate 1–5 score ranges; ID conservation;
   evidence/source/value grounding; ≤3 Money Moves; exact DECIDE partition; and exact draft
   target ids/purposes. On violation, raise so it fails loud (better than a broken demo).
4. **Endpoint hardening (14:00–15:15).** `POST /process` in `main.py`, try/except returning a
   clean 500 naming the failing stage. `curl` locally (uvicorn) until green — your output must
   match the frozen contract exactly.
5. **Integration (15:15–15:45).** Push (or hand) your `pipeline.py` + `main.py` to Person B and
   sit together while they wire the live `/api`. Reconcile any mismatch **against the frozen
   contract**, not by ad-hoc patching.
6. **Standby during deploy (15:45–16:45).** Person B deploys; be on hand to fix anything that
   only shows up on real data.
7. **Joint rehearse + submit (16:45–18:00).** Submit by 17:45.

## The 4 system prompts, Pydantic models, and pipeline

The full prompt text (PREAMBLE + EXTRACT / SCORE / DECIDE / PREPARE) is in [PLAN.md §3](PLAN.md).
Paste those verbatim as the string constants. The pipeline and models:

```python
import json, os
from typing import Literal, TypeVar
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
MODEL = "gpt-5.6-sol"   # fallback if latency/access bites: confirm in Block 0

class Item(BaseModel):
    id: str; item: str
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
    id: str; why_today: str; next_action: str; done_when: str
class ParkItem(BaseModel):
    id: str; why_safe: str
class BlockedItem(BaseModel):
    id: str; blocker: str; unblock_action: str; message_needed: bool
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
    resp = client.responses.parse(
        model=MODEL,
        input=[{"role": "system", "content": system},
               {"role": "user", "content": user}],
        text_format=schema,
    )
    if resp.output_parsed is None:
        raise ValueError("Model returned no structured output")
    return resp.output_parsed

def run_pipeline(braindump: str, today: str) -> dict:
    pre = PREAMBLE.format(TODAY=today)

    items = [i.model_dump(mode="json") for i in _call(pre + EXTRACT, braindump, ExtractOutput).items]
    assert len({i["id"] for i in items}) == len(items), "EXTRACT ids must be unique"
    for item in items:
        assert item["source_text"] in braindump, "source_text must be verbatim input"
        if item["stated_value"] is not None:
            assert item["stated_value"] in braindump, "stated_value must be verbatim input"

    scored = [s.model_dump(mode="json")
              for s in _call(pre + SCORE, json.dumps({"items": items}), ScoreOutput).scored]
    assert len(scored) == len(items), "SCORE must return exactly one row per item"
    assert {s["id"] for s in scored} == {i["id"] for i in items}, "SCORE must conserve ids"
    extracted_by_id = {i["id"]: i for i in items}
    for s in scored:
        assert 1 <= s["revenue_proximity"] <= 5 and 1 <= s["urgency"] <= 5, "score out of range"
        for field in ("item", "type", "due_date", "stated_value", "source_text", "context"):
            assert s[field] == extracted_by_id[s["id"]][field], f"SCORE changed {field}"
        assert s["evidence"] in s["source_text"], "evidence must come from source_text"
        s["priority"] = s["revenue_proximity"] * 3 + s["urgency"]
    scored.sort(key=lambda s: s["priority"], reverse=True)

    plan = _call(pre + DECIDE, json.dumps({"scored": scored}), DecideOutput).model_dump(mode="json")
    assert len(plan["money_moves"]) <= 3, "DECIDE may select at most three Money Moves"
    bucket_ids = (
        [m["id"] for m in plan["money_moves"]]
        + [p["id"] for p in plan["park"]]
        + [b["id"] for b in plan["blocked"]]
    )
    expected_ids = {s["id"] for s in scored}
    assert len(bucket_ids) == len(set(bucket_ids)), "DECIDE buckets overlap"
    assert set(bucket_ids) == expected_ids, "DECIDE buckets must partition all ids"

    by_id = {s["id"]: s for s in scored}
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

    drafts = []
    if targets:
        drafts = [d.model_dump(mode="json")
                  for d in _call(pre + PREPARE, json.dumps({"targets": targets}), DraftOutput).drafts]
        expected_targets = {(t["item"]["id"], t["purpose"]) for t in targets}
        actual_targets = {(d["id"], d["purpose"]) for d in drafts}
        assert len(drafts) == len(actual_targets) == len(targets), "PREPARE targets must be unique"
        assert actual_targets == expected_targets, "PREPARE must draft exactly the selected targets"

    return {"items": items, "scored": scored, "plan": plan, "drafts": drafts}
```

`backend/app/main.py`:
```python
from fastapi import FastAPI
from pydantic import BaseModel
from app.pipeline import run_pipeline

app = FastAPI()

class ProcessIn(BaseModel):
    braindump: str
    today: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/process")
def process(body: ProcessIn):
    return run_pipeline(body.braindump, body.today)
```

## How your app gets deployed (reference — Person B owns this)

You don't write the deploy config, but two facts shape how you write the backend:

1. **Your routes stay `/health` and `/process`.** `api/index.py` (Person B's) does
   `app.mount("/api", backend_app)`, and Starlette strips the `/api` prefix before matching — so
   define your routes without any `/api` prefix. Adding an endpoint needs zero deploy-config change.
2. **Serverless = read-only filesystem** (except `/tmp`), no shared in-memory state across
   requests, ~10–60s cap. Your pipeline is stateless request/response, so this is fine — just
   don't write to disk or rely on process-level caches.

**`requirements.txt`** — you own its *content* (Person B commits it). Runtime deps only; **no
uvicorn** (Vercel supplies the ASGI server), even though you use uvicorn locally:
```
fastapi>=0.115
pydantic>=2.7
python-dotenv>=1.0
openai>=2.0
```

## Definition of done (your half — local)

```bash
python -m scratch_test                                   # payload has items, scored, plan, drafts
uvicorn app.main:app --port 8000                          # then:
curl -s localhost:8000/health                            # {"status":"ok"}
curl -s -X POST localhost:8000/process -H 'Content-Type: application/json' \
  -d '{"braindump":"<sample>","today":"2026-07-12"}' | jq 'keys'   # ["drafts","items","plan","scored"]
```
`scored` is sorted by `priority` desc; `source_text`, `evidence`, and stated values are grounded;
Money Moves/Park/Blocked partition every id exactly; Acme/Nordic/Meridian are the three moves;
Dave has a message-needed unblock action; and drafts exist only for selected targets. The Acme
draft references Sarah, S$12,000/year, 10%, and Friday; no podcast or recruiter draft exists.
The live alias verification happens jointly after Person B deploys — your job is to make the
*local* curl match the frozen contract exactly.
