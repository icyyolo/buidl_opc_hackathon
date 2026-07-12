# Suggestions 5 — Metric Legibility Without a Splash Page

## Purpose

A first-time visitor meets several metrics with no definition: the six revenue motions
(Collect / Close / Deliver / Retain / Grow / Operate), the priority formula
`revenue_proximity × 3 + urgency`, and the Money Move / Parked / Blocked partition. The
question this packet answers is: **how do we make those metrics understandable without a
separate splash or onboarding page?**

The deliberate decision is **not** to add a splash page. A page you must read before you
can act reintroduces exactly the friction the product's wedge removes — "paste the chaos,
get three moves, no setup" (`suggestion.md`). It also delays the single best teacher of
the metrics: seeing them applied to the founder's own words. Instead, this packet teaches
**progressively and in context**, on demand, without gating the run.

> Design principle: explain a metric **where and when the user first meets it**, never on a
> door they have to open first.

None of the items below appear in `suggestion.md`, `suggestions1.md`, `suggestions2.md`,
`suggestions3.md`, or `suggestions4.md`. Every item is **frontend-only, presentation-only**,
and changes **no API request, response, mock, or TypeScript contract**.

## Parallel assignment

**Owner:** Person 1 — frontend only

**Can run concurrently with:** `suggestions2.md` (backend). Assumes `suggestions1.md` has
merged (it builds on the components suggestions1 created). If run alongside
`suggestions4.md`, both edit overlapping files — sequence them, or assign both packets to
the same owner on one branch to avoid conflicts.

**Goal:** Make every on-screen metric self-explanatory through inline, on-demand
disclosure — no splash, no gate, no contract change.

## Exclusive file ownership

Person 1 may edit only these existing files:

- `frontend/src/App.tsx`
- `frontend/src/components/Results.tsx`
- `frontend/src/components/CashLeakRadar.tsx`
- `frontend/src/components/DecisionReceipt.tsx`
- `frontend/src/components/revenue-insights.css`

Person 1 may create only these new files:

- `frontend/src/components/MetricGlossary.tsx`
- `frontend/src/components/MetricLegibility.test.tsx`

Prefer adding rules to `revenue-insights.css`. Do not edit `frontend/src/styles.css` in
this packet.

## Frozen files — do not touch

- `backend/**`, `tests/**`, `api/**`
- `mock/process.json`
- `frontend/src/types.ts`, `frontend/src/contract.ts`, `frontend/src/api.ts`, `frontend/src/sampleBraindump.ts`
- `frontend/src/App.test.tsx`, `frontend/src/contract.test.ts`, `frontend/src/api.test.ts`
- `frontend/src/App.copy.test.tsx`, `frontend/src/components/RevenueInsights.test.tsx`
- `frontend/src/styles.css`
- `frontend/package.json`, `frontend/package-lock.json`, `vercel.json`
- all root Markdown files

The request/response contract stays exactly:

```text
request:  { braindump, today }
response: { items, scored, plan, drafts }
```

All definitions added here are **static UI copy**, derived from the fixed six-motion
taxonomy and the fixed scoring formula. Never read a definition from the API response, and
never invent a metric the backend does not already produce.

## Work items

### 1. A one-line "How to read this" strip above the plan

At the very top of the results — adjacent to the existing complete-accounting strip —
render one plain sentence explaining the whole mechanic:

```text
Every commitment is scored revenue proximity × 3 + urgency, then sorted into
3 Money Moves, safely parked, or blocked.
```

Rules:

- One sentence, calm and muted; it explains, it does not sell.
- It must be **dismissible** (an "×" that hides it for the session via component state
  only — no persistence, no storage, no contract).
- It renders only when results are present, so it never blocks the empty/first-load state.
- Give it an accessible name so it is reachable and skippable by assistive tech.

This is the smallest possible substitute for a splash: the mental model arrives exactly
when the user has output to attach it to.

### 2. On-demand glossary for the six revenue motions

Create `MetricGlossary.tsx` holding the canonical one-line meaning of each motion (the same
wording already used in `CashLeakRadar`, kept in **one** shared source so the Radar and the
tooltips can never drift):

| Motion | Meaning |
|---|---|
| `collect` | Earned but uncollected |
| `close` | Ready to win or renew |
| `deliver` | Paid work to ship |
| `retain` | Revenue at risk |
| `grow` | Pipeline for later |
| `operate` | No direct cash motion |

Surface these definitions where a motion badge **first appears** to the user — the Money
Move cards and the Cash Leak Radar headers — as an accessible tooltip/popover:

- Reveal on hover **and** on keyboard focus / tap (not hover-only — mobile and keyboard
  users must reach it).
- Use a native affordance where possible (e.g. `title`/`aria-describedby` or a small
  `<button>` popover); do **not** add a tooltip dependency (`package.json` is frozen).
- The badge's visible text and color are unchanged (locked by `suggestions1.md` /
  `suggestions4.md`); the definition is additive.

Refactor `CashLeakRadar` to import its motion labels from `MetricGlossary` rather than
holding its own copy, so there is a single definition list.

### 3. Explain the priority arithmetic inline

The Decision Receipt already shows `revenue proximity 5 × 3 + urgency 5 = priority 20`,
which is precise but not yet legible. Add a compact, on-demand note (a small "?" affordance
next to the formula, expanding to a one-line explanation) covering only what is true and
fixed:

- both inputs are on a fixed low-to-high scale (state the actual range the backend uses,
  e.g. 1–5 — confirm against `types.ts`/`contract.ts`, do not guess);
- revenue proximity is weighted ×3 because how directly an item moves cash outranks how
  soon it is due;
- higher total = earlier in today's order.

Constraints:

- Do not restate or recompute the number — it is already rendered; only explain what the
  parts mean.
- No new field, no claim the backend does not support. If the exact scale is not derivable
  from the frozen contract, describe it qualitatively ("higher is stronger") rather than
  asserting a range.

### 4. Name the partition rule where the sections begin

Each result section (`Today's 3 Money Moves`, `Blocked → Unblock`, `Parked Safely`) has a
short descriptive subhead already. Add one clarifying clause per section that states the
**rule** for belonging to it, reinforcing "three moves, zero dropped commitments":

- Money Moves — "the highest-scoring commitments that can move or protect cash today";
- Blocked — "would score high, but a named dependency must move first";
- Parked — "deliberately not today, with the reason waiting is economically safe".

Keep the exact existing headings (`Today's 3 Money Moves`, `Blocked → Unblock`,
`Parked Safely`, `All Commitments`) verbatim — current tests depend on them. Add the clause
as adjacent copy, do not alter the heading text.

### 5. Strengthen the pre-run intro instead of a splash

The existing "01 / 02 / 03" intro steps already do the job a splash page would — visible
before a run, blocking nothing. Let this block carry a little more of the metric
vocabulary so the terms are pre-seeded before the first result:

- name the six-motion idea in step 01 ("Collect, close, deliver, retain, grow, operate");
- name the two scoring inputs in step 02 ("revenue proximity and urgency");
- keep it to a phrase per step — this is a primer, not documentation.

This is the ceiling for "upfront explanation": it lives on the same scroll as the intake,
requires no click, and never stands between the user and a run.

## Guardrails (apply to every item)

- No splash, no modal gate, no onboarding wizard, no route change.
- Every definition is static UI copy tied to the fixed taxonomy/formula — never sourced
  from, or dependent on, the API payload.
- Never introduce a metric, weight, or scale the backend does not already produce.
- All reveal affordances work for hover, keyboard focus, and touch.
- No new npm dependency; `package.json` is frozen.
- One canonical motion-definition list (`MetricGlossary.tsx`) — the Radar and tooltips
  import it; no duplicated wording that can drift.

## Tests to add

Add `frontend/src/components/MetricLegibility.test.tsx` (do not edit the frozen suites):

- the "how to read this" strip renders with results, is absent on first load, and can be
  dismissed;
- each of the six motions exposes its definition via an accessible name / describedby (not
  hover-only);
- `CashLeakRadar` and the badge tooltips render the **same** wording (proves the single
  shared source);
- the priority explanation appears on demand and does not recompute or restate the number;
- each partition section renders its rule clause while the frozen headings stay verbatim;
- no definition text is read from the response object (metrics are static copy);
- everything renders without crashing when a motion has zero items or a section is empty.

Preserve these existing headings: `Today's 3 Money Moves`, `Blocked → Unblock`,
`Parked Safely`, `All Commitments`.

## Verification

Run from `frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Manually confirm at ~320px, 768px, and 1440px that every definition is reachable by
**hover, keyboard Tab, and tap**, and that no explanation blocks or delays a run.

## Definition of done

- No splash/onboarding page or modal is added; the run is never gated.
- Current `mock/process.json` renders without modification; no request/response change.
- Every metric on screen (six motions, priority formula, partition rule) has an inline,
  on-demand explanation reachable by hover, keyboard, and touch.
- Motion definitions live in exactly one place and are shared by Radar and tooltips.
- Existing and new frontend tests, typecheck, and build pass.
- `git diff --name-only <shared-base>...HEAD` contains only the owned files listed above.

## Explicitly out of scope

- A splash page, onboarding wizard, product tour, or coach-marks overlay.
- Any persisted "seen it" / dismissal state (would need storage) — session-only hide is
  the limit here.
- Any new response field, scale, or weight, and any contract-changing feature — those
  remain in `suggestions3.md`.
- The visual-polish items (proportion bars, dark theme, print, etc.) — those live in
  `suggestions4.md`; keep this packet scoped to *legibility of metrics* only.
