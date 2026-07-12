# Suggestions 2 — Backend Quality Proof and Endpoint Hardening

## Parallel assignment

**Owner:** Person 2 — backend and backend tests only

**Can run concurrently with:** `suggestions1.md`
**Goal:** Prove and improve revenue-triage quality while preserving the frozen v1 success contract.

This packet does not add product fields. It makes the existing promise more reliable and measurable.

## Exclusive file ownership

Person 2 may edit only these existing files:

- `backend/app/pipeline.py`
- `backend/app/main.py`
- `tests/test_main.py`

Person 2 may create only these new files:

- `backend/evals/__init__.py`
- `backend/evals/cases.json`
- `backend/evals/metrics.py`
- `backend/evals/run_benchmark.py`
- `tests/test_eval_metrics.py`

## Frozen files — do not touch

- `frontend/**`
- `mock/process.json`
- `api/index.py`
- `tests/conftest.py`
- `tests/test_pipeline.py`
- `tests/test_demo_sample.py`
- `tests/test_http_pipeline_integration.py`
- `tests/test_structured_schemas.py`
- `scratch_test.py`
- `requirements.txt`
- `requirements-dev.txt`
- `vercel.json`
- all root Markdown files

The v1 success seam remains byte-for-byte compatible in shape:

```text
request:  { braindump, today }
response: { items, scored, plan, drafts }
```

Do not add top-level `insights`, `radar`, `receipts`, or extra Pydantic fields merely because the frontend runtime validator currently ignores some unknown properties.

## Work items

### 1. Build an opt-in Revenue Triage Benchmark

Create an evaluation runner around `run_pipeline`.

The default benchmark mode must be offline and deterministic. A live mode may call OpenAI only when the user explicitly passes `--live` and a valid key is present.

Recommended interface:

```bash
python -m backend.evals.run_benchmark
python -m backend.evals.run_benchmark --live
```

The default command must:

- use saved synthetic results;
- require no API key;
- make no network request;
- return a non-zero exit code when a required metric fails.

The live command must:

- clearly state that case text will be sent to OpenAI;
- use only synthetic/anonymized cases;
- avoid printing secrets;
- report per-case failures and a concise summary.

### 2. Add benchmark cases

`backend/evals/cases.json` should include at least these independent scenarios:

1. Overdue invoice versus low-value admin work.
2. Active renewal or expansion versus generic networking.
3. Paid delivery blocked on a named person's input.
4. No selected communication targets, producing no drafts.
5. Multiple currencies or cadences that must never be combined.
6. A high-consequence compliance obligation that exposes the limits of pure revenue weighting.
7. Missing commercial information that should produce a rank-changing `missing_fact`.
8. A parked email that must not receive a draft.

Keep all organizations, people, values, and text synthetic.

### 3. Implement offline-tested metrics

`backend/evals/metrics.py` should measure at least:

- expected commitment markers found;
- exact stated-value preservation;
- invented-value rate;
- evidence grounded in each item's source excerpt;
- `priority == revenue_proximity * 3 + urgency`;
- descending priority order;
- exact Money Moves / Park / Blocked partition;
- expected revenue motions;
- expected or allowed Money Move ids;
- no blocked item selected as a Money Move;
- exact draft target ids and purposes;
- no draft for Parked work;
- no more than three Money Moves.

Metrics must return structured values that can be unit-tested. Do not make tests depend on formatted console output.

### 4. Tune prompts only when a case proves a failure

The benchmark is the gate for changes to `pipeline.py`.

Allowed prompt refinements:

- `missing_fact` must be the fact most likely to change the rank, otherwise null;
- `why_safe` must state why waiting is economically and operationally safe;
- cost of delay must stay supported by the item;
- unblock actions must include a concrete request and reasonable response time;
- next actions must be immediately startable;
- hard legal, security, payroll, contractual, or customer-harm consequences must be considered even when direct revenue proximity is low.

Restrictions:

- Keep the four existing stages.
- Keep the current model constant unless separately approved.
- Do not add a fifth model call.
- Do not rename or add Pydantic output fields.
- Do not change the priority formula.
- Do not change the exact success keys.
- Do not squeeze a new fourth bucket into the existing partition.

If the Must Not Miss scenario cannot be handled without changing the product contract, document the failure in benchmark output and defer the feature to `suggestions3.md`.

### 5. Add local-development CORS

In `backend/app/main.py`, add narrowly scoped CORS support for:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

Do not use `allow_origins=["*"]`.

Keep production same-origin behavior unchanged. Add regression coverage in `tests/test_main.py` for an allowed Vite origin and a disallowed origin.

### 6. Make backend errors visible through the existing frontend path

The frontend already reads an error field named `detail`, while the backend currently returns `error`, `stage`, and `message`.

Keep the existing error fields and add a safe `detail` string, for example:

```json
{
  "error": "pipeline_failed",
  "stage": "SCORE",
  "message": "RuntimeError: pipeline stage failed",
  "detail": "SCORE stage failed: RuntimeError: pipeline stage failed"
}
```

Requirements:

- Never expose an API key, request body, stack trace, or provider response.
- Preserve the status code and current fields.
- Cover known `PipelineError` and unexpected-error paths.
- Do not edit the frontend error parser.

## Dependencies

Add no dependencies.

Use the standard library for the benchmark where possible:

- `argparse`
- `collections`
- `dataclasses`
- `json`
- `pathlib`
- `statistics`

FastAPI already provides the CORS middleware dependency.

## Tests to add

`tests/test_eval_metrics.py` should cover:

- a fully passing synthetic case;
- missing commitment markers;
- invented monetary value;
- ungrounded evidence;
- wrong priority arithmetic;
- overlapping or incomplete partition;
- blocked Money Move;
- incorrect draft target;
- parked draft;
- mixed-currency values preserved without aggregation;
- benchmark exit status aggregation.

Extend `tests/test_main.py` only for:

- allowed and disallowed CORS origins;
- safe `detail` for a stage error;
- safe `detail` for an unexpected error;
- preservation of existing error fields.

Do not make unit tests call OpenAI.

## Verification

Run from the repository root using the configured Python environment:

```bash
python -m pytest
python -m compileall backend tests
python -m backend.evals.run_benchmark
```

Run `--live` only with explicit approval because it sends the synthetic cases to OpenAI and consumes API credits.

## Definition of done

- The v1 request and success response schemas are unchanged.
- Existing backend tests still pass.
- New benchmark metrics have offline unit coverage.
- Default benchmark execution makes no network request.
- Live benchmark cases contain no repository or private user data.
- CORS is restricted to the two local Vite origins.
- Error `detail` is useful but sanitized.
- No new dependency is added.
- `git diff --name-only <shared-base>...HEAD` contains only the owned files listed above.

## Explicitly deferred

Do not implement these here:

- new response fields for Decision Receipts or Cash Leak Radar;
- a fourth `must_not_miss` response bucket;
- `available_minutes` or clarification request fields;
- outcomes, persistence, or memory;
- email, payment, calendar, or CRM connectors;
- frontend contract or mock changes.

Those belong to `suggestions3.md` after both parallel branches are merged.

