# Suggestions 3 — Serial Full-Stack Evolution

## Important scheduling rule

**Do not implement this packet in parallel with `suggestions1.md` or `suggestions2.md`.**

This packet contains the ideas that necessarily cross the frozen frontend/backend seam. Start it only after both parallel branches are merged and green. Assign one integration owner to make each contract change atomically.

This serial packet exists specifically to prevent merge conflicts and contract drift.

## Why these features cannot be split safely

Each feature below changes at least two of these layers together:

- FastAPI request models;
- pipeline prompts or Pydantic outputs;
- backend semantic validation;
- TypeScript interfaces;
- frontend runtime validation;
- API request construction;
- mock fixtures;
- backend and frontend tests;
- UI rendering.

Changing only one side would either break the app or leave an untested, unused feature.

## Ownership rule

For each slice, one person owns the complete atomic change across all required files. The other person reviews but does not make concurrent edits to the same branch.

Likely seam files include:

- `backend/app/pipeline.py`
- `backend/app/main.py`
- `frontend/src/types.ts`
- `frontend/src/contract.ts`
- `frontend/src/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/Results.tsx`
- `mock/process.json` or a new v2 fixture
- relevant Python and TypeScript tests

Do not begin a slice until its exact contract is written down and approved.

## Preserve v1

Keep the current endpoint stable:

```text
POST /process
request:  { braindump, today }
response: { items, scored, plan, drafts }
```

Build contract-changing experiments under a versioned route such as:

```text
POST /process/v2
```

Do not silently add required fields to v1.

## Atomic slice 1 — Ranking-changing clarification

### Goal

Ask exactly one question only when the missing answer could change the top three or a blocked decision.

### Proposed behavior

1. Run extraction and scoring.
2. Identify the highest-impact unresolved `missing_fact`.
3. Return a clarification request before final decision only when it could materially change the partition.
4. Accept the answer on a second v2 request.
5. Show what changed after reranking.

### Contract questions to freeze first

- Is clarification a separate response state or an optional response field?
- How is `item_id` conserved?
- Is the original dump resent or represented by a server-side session id?
- How is a user answer distinguished from source evidence?
- What happens when the user skips the question?

### Acceptance criteria

- At most one question per pass.
- No question when the answer cannot change today's decision.
- User answers are never presented as verbatim source evidence.
- Skipping keeps the original v1-compatible decision path.

## Atomic slice 2 — Revenue Sprint

### Goal

Choose realistic cash-moving advances for the focused time the founder actually has without becoming a full calendar.

### Proposed optional request field

```json
{
  "available_minutes": 15
}
```

Allowed values should be a small explicit set such as `15`, `30`, `60`, or `120`.

### Rules

- Preserve the maximum of three Money Moves.
- Produce immediately startable next actions.
- Do not invent precise task duration when none is supported.
- Explain when only part of a commitment can be advanced in the window.
- Keep calendar scheduling out of scope.

## Atomic slice 3 — Must Not Miss guardrail

### Goal

Prevent revenue weighting from hiding urgent legal, tax, security, payroll, contractual, or serious customer-harm obligations.

### Product rule

Position it as:

> Cash-first, not cash-blind.

### Contract decision

Choose one design before coding:

1. A separate `must_not_miss` lane outside the Money Moves/Park/Blocked partition; or
2. An explicit override attached to an existing item while preserving exact partition semantics.

Do not quietly place non-revenue exceptions into Money Moves without explaining the changed meaning of that promise.

### Acceptance criteria

- Override rules are explicit and tested.
- Month-end work is not incorrectly pulled forward when no near-term consequence exists.
- A genuine same-day high-consequence obligation cannot be labeled safely parked.
- The UI distinguishes cash priority from business-continuity risk.

## Atomic slice 4 — Corrections and outcome loop

### Goal

Close the loop from decision to action without building a full CRM.

### Corrections

Support precise feedback:

- fact is wrong;
- blocked status is wrong;
- should or should not be a Money Move.

Retain the original decision receipt and show the revised result.

### Minimal outcome states

- Draft reviewed
- Sent or action completed
- Waiting on someone
- Won or renewed
- Paid
- Lost or no longer relevant

Include one optional follow-up date.

### Language guardrail

“S$12,000 renewal advanced” is not the same as “S$12,000 earned.” Never report pipeline value as realized revenue.

### Storage decision required

Before implementation, choose and document:

- session-only state;
- browser-local state; or
- authenticated server persistence.

Do not introduce a database or authentication implicitly.

## Atomic slice 5 — Source-linked Revenue Memory

### Goal

Remember only information that improves future revenue decisions.

Candidate memory:

- customers and contacts;
- proposals, invoices, renewals, and paid deliverables;
- commitments and follow-up dates;
- founder corrections;
- verified outcomes.

Every stored fact must include:

- source;
- captured date;
- edit control;
- delete control;
- clear separation between quoted fact and model inference.

Keep a no-account, no-memory first run available.

## Atomic slice 6 — Narrow revenue connectors

Add optional read-only connectors only after repeat usage is proven, in this order:

1. Gmail or Outlook for outstanding customer commitments.
2. Stripe or invoicing data for earned-but-uncollected work.
3. Calendar for promised dates and follow-ups.
4. CRM only when target users already maintain one.

Every connector must improve a named revenue motion. Do not add integrations merely to claim that all work is in one place.

Each connector requires a separate privacy, authorization, revocation, and data-retention review.

## Atomic slice 7 — Business-model calibration

Support confirmable lenses for service businesses, creators, indie SaaS, and e-commerce only after outcome data shows a need.

Rules:

- infer a suggested lens, then ask the founder to confirm it;
- do not require a long onboarding form;
- keep any changed scoring weights visible;
- never silently personalize the formula;
- test the same input under every supported lens.

## Validation work that can begin before coding v2

Run a seven-day pilot with 10–15 solo service founders and measure:

- top-three acceptance without reordering;
- same-day action rate;
- time from result to first reviewed message or action;
- extraction and monetary-fact correction rate;
- agreement that Parked items are safe;
- usefulness of unblock actions;
- repeat use;
- verified progress to sent, waiting, won, renewed, or paid.

Also run a blind comparison against a generic chatbot prompt and close competitors where their workflows permit it. Ask which result:

- is most likely to improve a cash outcome today;
- is most trustworthy;
- is easiest to begin immediately;
- gives the clearest permission to ignore the rest.

## Serial implementation order

1. Ranking-changing clarification.
2. Revenue Sprint.
3. Must Not Miss guardrail.
4. Corrections and minimal outcomes.
5. Source-linked memory.
6. Narrow connectors.
7. Business-model calibration.

Complete, test, and merge one slice before starting the next.

## Definition of done for every slice

- Contract written before code.
- Backend and frontend change in one branch.
- Mock or v2 fixture updated in the same commit.
- Python and TypeScript runtime validators agree.
- Old v1 tests remain green.
- New happy, invalid, and error paths are tested.
- No unrelated formatter or dependency churn.
- No other person edits seam files until the slice merges.

