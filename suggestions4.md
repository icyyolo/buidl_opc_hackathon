# Suggestions 4 — Frontend Visual Polish & Problem-Statement Fit

## Purpose

`suggestions1.md` made the **decision** transparent (copy, accounting strip, Cash
Leak Radar, Decision Receipt, Parked/Blocked, review language). This packet is about
making the page **look nicer and feel more like the product it claims to be** — visual
craft, motion, consistency, and a few founder-facing affordances that reinforce the
positioning:

> Paste the chaos. Find the three moves that can move or protect cash today. See the
> proof, park the rest, and review the messages needed to act.

None of the items below appear in `suggestion.md`, `suggestions1.md`, `suggestions2.md`,
or `suggestions3.md`. Every item is **frontend-only, presentation-only**, and changes
**no API request, response, mock, or TypeScript contract**.

## Parallel assignment

**Owner:** Person 1 — frontend only

**Can run concurrently with:** `suggestions2.md` (backend). Do **not** run concurrently
with `suggestions1.md` — this packet assumes suggestions1 has merged, since it builds on
the components it created.

**Goal:** Raise the visual quality and internal consistency of the existing UI without
touching the data contract or inventing any new revenue information.

## Exclusive file ownership

Person 1 may edit only these existing files:

- `frontend/src/App.tsx`
- `frontend/src/components/Results.tsx`
- `frontend/src/components/CashLeakRadar.tsx`
- `frontend/src/components/DecisionReceipt.tsx`
- `frontend/src/components/DraftCard.tsx`
- `frontend/src/components/revenue-insights.css`
- `frontend/index.html` *(only for the `<meta name="theme-color">` and `<title>` items in §1 and §7; no script or structural changes)*

Person 1 may create only these new files:

- `frontend/src/components/VisualPolish.test.tsx`

Prefer adding new rules to `revenue-insights.css`. Only edit `frontend/src/styles.css`
for the two explicitly scoped items that must live there (the brand-name fix touches
markup, not `styles.css`; the focus-ring and print items below **do** touch `styles.css`
and are called out individually).

## Frozen files — do not touch

- `backend/**`, `tests/**`, `api/**`
- `mock/process.json`
- `frontend/src/types.ts`, `frontend/src/contract.ts`, `frontend/src/api.ts`, `frontend/src/sampleBraindump.ts`
- `frontend/src/App.test.tsx`, `frontend/src/contract.test.ts`, `frontend/src/api.test.ts`
- `frontend/src/App.copy.test.tsx`, `frontend/src/components/RevenueInsights.test.tsx`
- `frontend/package.json`, `frontend/package-lock.json`, `vercel.json`
- all root Markdown files

The request/response contract stays exactly:

```text
request:  { braindump, today }
response: { items, scored, plan, drafts }
```

## Work items

### 1. Fix the product-name inconsistency (highest priority, near-zero effort)

The app is named **Revenue Radar** everywhere — the `<title>`, the logo lockup, the
footer, and every error string in `api.ts` — **except** the hero subheadline in
`App.tsx`, which still reads "**Revenue Chief** proves what matters…". That name was the
internal working title in `suggestion.md`; it was copied verbatim into the shipped
subheadline and never reconciled.

- Change the single occurrence of "Revenue Chief" in `App.tsx` (currently line ~113) to
  "Revenue Radar".
- Grep the whole `frontend/src` tree to confirm "Revenue Chief" appears **zero** times in
  shipped (non-`suggestions*.md`) code afterward.
- Note: `App.copy.test.tsx` is frozen and currently asserts the "Revenue Chief" string.
  Because that file may not be edited in this packet, coordinate the rename with whoever
  owns the frozen test, or defer only the test-string half. Flag this dependency
  explicitly in the PR description; do not silently break the suite.

A product whose own headline calls it by a different name reads as unfinished. This is the
single most damaging polish defect on the page.

### 2. Give Cash Leak Radar honest visual proportion

Today each motion shows a count and a list of stated values, but every motion looks
visually identical, so the eye can't see where the exposure concentrates. Add a
**count-proportion bar** per motion (a horizontal fill whose width is
`motion_count / max_motion_count`), tinted with that motion's existing color.

Hard rules (identical to the honesty rules in `suggestions1.md §3`):

- The bar encodes **item count only**, never money. Label it as such (e.g. an
  `aria-label` of "4 of 12 commitments").
- Never sum, convert, or infer amounts. Stated-value strings still render individually
  and verbatim.
- Empty motions still render with a zero-width bar and the existing "No commitments in
  this motion" text.

This turns the taxonomy from a list into a genuine "radar" the founder can read at a
glance, which is the metaphor the loading animation already promises.

### 3. Reveal results with a calm staggered entrance

When the plan replaces the loading panel, the four sections currently pop in instantly.
Add a short, staggered fade-and-rise (opacity 0→1, translateY ~8px→0) applied to the
accounting strip, radar, and each result section in document order, ~60–90 ms apart.

- Total settle time under ~500 ms; this is polish, not a show.
- Must be fully disabled under `@media (prefers-reduced-motion: reduce)` (the existing
  block at the bottom of `styles.css` already zeroes animations — extend the same
  guarantee to the new classes in `revenue-insights.css`).
- Use CSS animation only; do not add a JS animation library (`package.json` is frozen).

### 4. Auto-scroll to the plan after a successful run

On submit, once results render, smooth-scroll the results container into view (respecting
`prefers-reduced-motion` by using an instant jump). On a laptop the plan currently appears
below the fold and some users won't realize the scan finished. Move focus to the results
region heading as well, so keyboard and screen-reader users are taken to the output too.

### 5. Complete and unify the motion color system

`styles.css` defines top-edge accent colors for only three motions
(`.motion-edge-collect`, `-close`, `-deliver`) but Money Moves can also be `retain`,
`grow`, or `operate`; those cards fall back to the generic `--green-2` edge, so the edge
color silently disagrees with the motion badge. Define all six edge colors and derive
them from the **same** palette already used by `.motion-*` badges and the radar, so a
motion has one consistent color wherever it appears (badge, card edge, radar bar).

Keep it a small, documented token set at the top of `revenue-insights.css`; do not
introduce a theming abstraction.

### 6. Add a "Copied ✓" confirmation state to draft copy buttons

`DraftCard` already has copy-to-clipboard with a `.copy-status` line. Strengthen the
button itself: on success briefly swap the label to "Copied ✓" (or toggle a checkmark),
then revert after ~1.5 s. Keep the existing `copy-status` text, accessibility labels,
failure handling, and message contents unchanged (those are locked by `suggestions1.md`).
This is the one moment the founder actually "acts," so it deserves tactile feedback.

### 7. Add a dark theme

The palette is entirely CSS custom properties (`--ink`, `--paper`, `--green`, `--lime`,
etc.), so a dark theme is mostly a `@media (prefers-color-scheme: dark)` override of those
tokens plus a `<meta name="theme-color">` update in `index.html`. Founders triaging late
at night are squarely in the target use case.

- Override tokens under `@media (prefers-color-scheme: dark)`; do not rewrite component
  rules.
- Verify contrast on the motion badges, value/priority chips, and the evidence
  blockquote — these are the most likely to fail in dark mode.
- No theme-toggle UI in this packet (that would need persisted state); honor the OS
  setting only.

### 8. Add a print / "save today's plan" stylesheet

The problem statement ends at "leave ready to act." A founder who wants to keep today's
three moves should be able to `Cmd/Ctrl+P` to a clean one-pager. Add an `@media print`
block (in `styles.css`, scoped to print only) that:

- hides the intake card, loading panel, intro steps, top bar, and footer chrome;
- prints the accounting strip, the three Money Moves with their Decision Receipts, and the
  Blocked section;
- removes background gradients/shadows and forces high-contrast ink on white.

No "Download PDF" button is required — the browser's native print is enough and adds no
new dependency.

### 9. Align the focus ring with the brand palette

Global `:focus-visible` uses `#7292ff` (a blue that appears nowhere else in the
green/lime/cream system). Change it in `styles.css` to a brand-consistent focus color
(e.g. a darkened green or the lime on a dark halo) while **keeping** a ≥3:1 contrast ratio
against both light and dark backgrounds and preserving the 3px outline + offset for
accessibility.

### 10. Intake affordances: clear, keyboard submit, and count guidance

Small, contract-safe quality-of-life additions to the textarea intake:

- A **"Clear"** text button next to the "Demo sample loaded" pill that empties the
  textarea and returns to an empty state (does not call the API).
- **`Cmd/Ctrl+Enter`** submits the form (in addition to the button), with a hint in the
  helper text.
- Turn the raw "950 characters" counter into gentle guidance (e.g. muted when short,
  neutral otherwise) — **without** imposing a hard max or altering the request body.

Keep all existing form, state, loading, error, and request logic intact.

## Tests to add

Add `frontend/src/components/VisualPolish.test.tsx` (do not edit the frozen suites).
Cover behavior, not pixels:

- radar renders a proportion bar per non-empty motion with an accessible count label, and
  still shows no synthetic aggregate;
- empty motions render a zero-value bar without crashing;
- all six motion edge/color classes resolve for their motion;
- the "Copied ✓" state appears after a successful copy and reverts;
- the "Clear" control empties the textarea and does not fire a request;
- `Cmd/Ctrl+Enter` triggers the same submit path as the button;
- results receive focus / are scrolled into view after a successful run;
- reduced-motion disables the entrance animation (assert the guard class/rule, or that no
  animation runs when the media query matches);
- the string "Revenue Chief" does **not** appear in the rendered app.

Preserve these existing headings (current tests depend on them):
`Today's 3 Money Moves`, `Blocked → Unblock`, `Parked Safely`, `All Commitments`.

## Verification

Run from `frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Manually inspect at ~320px, 768px, and 1440px, in **both** light and dark OS themes, and
do a **print preview** to confirm the one-pager. Tab through the page to confirm the new
focus ring and that focus lands on results after a run.

## Definition of done

- Current `mock/process.json` renders without modification.
- No request or response field changes; no new npm dependency.
- "Revenue Chief" no longer appears in shipped UI copy.
- Cash Leak Radar bars encode counts only; no amount is summed, converted, or invented.
- All six motions have a single consistent color across badge, card edge, and radar.
- Entrance animation, dark theme, and print all respect reduced-motion / theme / print
  media correctly.
- Existing and new frontend tests, typecheck, and build pass.
- `git diff --name-only <shared-base>...HEAD` contains only the owned files listed above.

## Explicitly out of scope

Deferred to `suggestions3.md` (they require contract changes) or simply not in this
packet:

- any new response field, Revenue Sprint timing, Must Not Miss lane, clarification,
  corrections, persistence, memory, or connectors;
- a persisted user-controlled theme toggle (needs stored state);
- a "Download PDF" button or any export dependency;
- editing the frozen test suites — coordinate the one name-string dependency in §1 rather
  than modifying `App.copy.test.tsx` here.
