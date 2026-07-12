# Suggestions 1 — Frontend Decision Transparency

## Parallel assignment

**Owner:** Person 1 — frontend only

**Can run concurrently with:** `suggestions2.md`
**Goal:** Make Revenue Chief's strongest differentiation visible without changing the API request, response, mock, or TypeScript contract.

The positioning for this packet is:

> Paste the chaos. Find the three moves that can move or protect cash today. See the proof, park the rest, and review the messages needed to act.

## Exclusive file ownership

Person 1 may edit only these existing files:

- `frontend/src/App.tsx`
- `frontend/src/components/Results.tsx`
- `frontend/src/components/DraftCard.tsx`

Person 1 may create only these new files:

- `frontend/src/components/CashLeakRadar.tsx`
- `frontend/src/components/DecisionReceipt.tsx`
- `frontend/src/components/revenue-insights.css`
- `frontend/src/components/RevenueInsights.test.tsx`
- `frontend/src/App.copy.test.tsx`

Import `revenue-insights.css` from `Results.tsx`. Do not edit the shared `frontend/src/styles.css` for this packet.

## Frozen files — do not touch

- `backend/**`
- `tests/**`
- `api/**`
- `mock/process.json`
- `frontend/src/types.ts`
- `frontend/src/contract.ts`
- `frontend/src/api.ts`
- `frontend/src/sampleBraindump.ts`
- `frontend/src/App.test.tsx`
- `frontend/src/contract.test.ts`
- `frontend/src/api.test.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `requirements.txt`
- `requirements-dev.txt`
- `vercel.json`
- all root Markdown files

The current request and response contract remains exactly:

```text
request:  { braindump, today }
response: { items, scored, plan, drafts }
```

## Work items

### 1. Reposition the hero

Change copy in `App.tsx` while preserving all form, state, loading, error, and request logic.

Recommended copy:

**Eyebrow**

> Explainable revenue triage for one-person companies

**Headline**

> Paste the chaos. Find the 3 moves that can move cash today.

**Subheadline**

> Revenue Chief proves what matters from your own words, parks the safe work, unblocks what is stuck, and prepares only the messages needed to act.

**Proof strip**

> 3 Money Moves · Visible scoring · Verbatim evidence · Ready-to-review messages

Keep the CTA text `Find My Money Moves`.

### 2. Add a complete-accounting strip

At the top of the results, derive and display:

```text
3 Money Moves · 1 blocked · 5 safely parked · 9 commitments accounted for
```

All counts must come from the current `ProcessResponse`; never hard-code the sample counts.

This reinforces the promise: **three moves, zero dropped commitments**.

### 3. Add Cash Leak Radar

Create `CashLeakRadar.tsx`. Group the existing `scored` items by the six current revenue motions:

| Motion | User-facing meaning |
|---|---|
| `collect` | Earned but uncollected |
| `close` | Ready to win or renew |
| `deliver` | Paid work to ship |
| `retain` | Revenue at risk |
| `grow` | Pipeline for later |
| `operate` | No direct cash motion |

Rules:

- Show the count for each non-empty motion.
- Show exact `stated_value` strings individually.
- Never estimate an amount.
- Never sum mixed currencies or cadences.
- Do not convert `S$12,000/year` into a numeric total.
- Do not imply that stated value is earned revenue.
- Keep all six motion names available even when the frozen fixture has no item for one of them.

### 4. Turn the evidence panel into a Decision Receipt

Create `DecisionReceipt.tsx` and render it inside each Money Move card.

Use only current validated fields:

- revenue motion;
- stated value when present;
- verbatim evidence;
- revenue proximity;
- urgency;
- priority;
- cost-of-delay assessment;
- missing fact when present.

Show the score arithmetic explicitly:

```text
Revenue proximity 5 × 3 + urgency 5 = priority 20
```

Clearly distinguish:

- **Verbatim evidence** — copied from the founder's source text.
- **Cost-of-delay assessment** — model judgment grounded in that item.

Do not add a semantic “Why this beat #4” sentence in this packet. The current contract does not contain a validated comparison field.

### 5. Strengthen Parked and Blocked presentation

Using existing fields only:

- show motion, priority, exact evidence, and stated value on Parked cards;
- keep `why_safe` visually prominent;
- show motion, priority, evidence, blocker, and unblock action on Blocked cards;
- keep an unblock draft attached only when `message_needed` is true;
- never render a draft for a Parked item.

Do not invent:

- revisit dates;
- urgency triggers;
- response deadlines not already in `unblock_action`;
- new revenue estimates.

### 6. Change execution language from sending to reviewing

In `DraftCard.tsx`, change any implication of autonomous sending from “ready to send” to **“ready to review.”**

Keep existing copy-to-clipboard behavior, accessibility labels, failure handling, and message contents unchanged.

## Tests to add

Add new focused test files instead of editing the large existing suites.

`frontend/src/App.copy.test.tsx` should verify:

- the new headline and positioning copy;
- the CTA remains unchanged;
- submission behavior is unchanged.

`frontend/src/components/RevenueInsights.test.tsx` should verify:

- plan counts equal the actual partition;
- radar motion counts are derived correctly;
- exact stated values render;
- no synthetic aggregate such as `S$34,800` appears;
- the displayed formula equals `revenue_proximity * 3 + urgency`;
- evidence is labeled as verbatim;
- cost of delay is labeled as an assessment;
- Parked items never receive drafts;
- empty arrays render without crashing;
- all new controls and sections have accessible names.

Preserve these existing headings because current tests depend on them:

- `Today's 3 Money Moves`
- `Blocked → Unblock`
- `Parked Safely`
- `All Commitments`

## Verification

Run from `frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Manually inspect at approximately 320px, 768px, and 1440px widths.

## Definition of done

- Current `mock/process.json` renders without modification.
- No request or response field changes.
- The Decision Receipt arithmetic is exact.
- No amount is invented or incorrectly summed.
- All commitments remain visible exactly once in the plan sections.
- Drafts are presented as reviewable, not autonomously sent.
- Existing and new frontend tests, typecheck, and build pass.
- `git diff --name-only <shared-base>...HEAD` contains only the owned files listed above.

## Explicitly deferred

Do not implement these here because they require coordinated contract changes:

- interactive clarification;
- Revenue Sprint duration;
- a Must Not Miss lane;
- correction payloads;
- persistent outcomes;
- source-linked memory;
- Gmail, Stripe, calendar, or CRM connectors.

Those belong to `suggestions3.md` after both parallel branches are merged.

