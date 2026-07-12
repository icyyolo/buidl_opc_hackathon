"""Four-stage, validated Revenue Radar pipeline.

The model is responsible for structured judgment; this module is responsible for
the contract. Every cross-stage invariant is checked explicitly before downstream
data is trusted.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Annotated, Any, Literal, TypeVar, cast

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator

load_dotenv()

MODEL = "gpt-5.6-luna"
# GPT-5.6 otherwise defaults to medium; these bounded, validated stages favor latency.
REASONING_EFFORT = "low"

PipelineStage = Literal["INPUT", "EXTRACT", "SCORE", "DECIDE", "PREPARE"]
ItemId = Annotated[str, StringConstraints(pattern=r"^i[1-9][0-9]*$")]


def _nonblank_text(value: str) -> str:
    if not value.strip():
        raise ValueError("text fields must be nonblank")
    return value


NonEmptyText = Annotated[str, AfterValidator(_nonblank_text)]
StrictScore = Annotated[int, Field(strict=True, ge=1, le=5)]

_ISO_DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")


class PipelineError(RuntimeError):
    """A safe, stage-aware pipeline failure suitable for HTTP error reporting."""

    def __init__(self, stage: PipelineStage, message: str | Exception) -> None:
        self.stage = stage
        if isinstance(message, Exception):
            self.message = f"{type(message).__name__}: pipeline stage failed"
        else:
            self.message = message
        super().__init__(f"{stage}: {self.message}")


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _validate_iso_date(value: str | None) -> str | None:
    if value is None:
        return None
    if not _ISO_DATE_RE.fullmatch(value):
        raise ValueError("must use YYYY-MM-DD format")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("must be a real ISO calendar date") from exc
    if parsed.isoformat() != value:
        raise ValueError("must use canonical YYYY-MM-DD format")
    return value


class Item(_StrictModel):
    id: ItemId
    item: NonEmptyText
    type: Literal["task", "email_owed", "deadline"]
    due_date: str | None
    stated_value: str | None
    source_text: NonEmptyText
    context: NonEmptyText

    @field_validator("due_date")
    @classmethod
    def due_date_must_be_iso(cls, value: str | None) -> str | None:
        return _validate_iso_date(value)

    @field_validator("stated_value")
    @classmethod
    def stated_value_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("stated_value must be nonblank when supplied")
        return value

    @field_validator("item", "source_text", "context")
    @classmethod
    def text_cannot_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text fields must be nonblank")
        return value


class ExtractOutput(_StrictModel):
    items: list[Item]


class ScoredItem(Item):
    revenue_motion: Literal["collect", "close", "deliver", "retain", "grow", "operate"]
    revenue_proximity: StrictScore
    urgency: StrictScore
    evidence: NonEmptyText
    cost_of_delay: NonEmptyText
    missing_fact: str | None

    @field_validator("evidence", "cost_of_delay")
    @classmethod
    def score_text_cannot_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("score explanation fields must be nonblank")
        return value

    @field_validator("missing_fact")
    @classmethod
    def missing_fact_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("missing_fact must be nonblank when supplied")
        return value


# Internal model output; the server joins it to the validated extracted item.
class ScoreJudgment(_StrictModel):
    id: ItemId
    revenue_motion: Literal["collect", "close", "deliver", "retain", "grow", "operate"]
    revenue_proximity: StrictScore
    urgency: StrictScore
    evidence: NonEmptyText
    cost_of_delay: NonEmptyText
    missing_fact: str | None

    @field_validator("evidence", "cost_of_delay")
    @classmethod
    def score_text_cannot_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("score explanation fields must be nonblank")
        return value

    @field_validator("missing_fact")
    @classmethod
    def missing_fact_cannot_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("missing_fact must be nonblank when supplied")
        return value


class ScoreOutput(_StrictModel):
    scored: list[ScoreJudgment]


class MoneyMove(_StrictModel):
    id: ItemId
    why_today: NonEmptyText
    next_action: NonEmptyText
    done_when: NonEmptyText


class ParkItem(_StrictModel):
    id: ItemId
    why_safe: NonEmptyText


class BlockedItem(_StrictModel):
    id: ItemId
    blocker: NonEmptyText
    unblock_action: NonEmptyText
    message_needed: bool = Field(strict=True)


class DecideOutput(_StrictModel):
    money_moves: list[MoneyMove]
    park: list[ParkItem]
    blocked: list[BlockedItem]


class Draft(_StrictModel):
    id: ItemId
    purpose: Literal["money_move", "unblock"]
    subject: NonEmptyText
    body: NonEmptyText


class DraftOutput(_StrictModel):
    drafts: list[Draft]


OutputT = TypeVar("OutputT", bound=BaseModel)

client: OpenAI | None = None


def _get_client() -> OpenAI:
    """Create the SDK client lazily so health checks never require an API key."""

    global client
    if client is None:
        client = OpenAI()
    return client


def _call(system: str, user: str, schema: type[OutputT]) -> OutputT:
    """Call one Responses API stage using a Pydantic Structured Output schema."""

    response = _get_client().responses.parse(
        model=MODEL,
        reasoning={"effort": REASONING_EFFORT},
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        text_format=schema,
    )
    parsed = response.output_parsed
    if parsed is None:
        raise ValueError("Model returned no structured output")
    if isinstance(parsed, schema):
        return parsed
    return cast(OutputT, schema.model_validate(parsed))


PREAMBLE = """You are the reasoning core of \"Revenue Radar\", an explainable revenue-triage agent for a solo
founder (a one-person company). Today's date is {TODAY} (ISO, Asia/Singapore). Your response
is constrained by the supplied JSON schema. Populate every field exactly as instructed; do
not add prose, markdown, or commentary outside the structured response."""

EXTRACT = """

ROLE: Extractor. Your ONLY job is to parse the founder's raw brain-dump into a flat list of
discrete commitments. Do NOT prioritize, judge importance, or invent anything not in the text.

For each distinct item you find, emit:
  - id: sequential \"i1\", \"i2\", ...
  - item: a short imperative summary of the commitment (max ~12 words)
  - type: exactly one of:
        \"task\"        — something the founder must DO
        \"email_owed\"  — a reply/message the founder OWES someone
        \"deadline\"    — a dated obligation or milestone
      If an item is both a reply-owed and dated, prefer \"email_owed\".
  - due_date: an ISO date \"YYYY-MM-DD\" if the text implies one (resolve relative dates like
      \"Friday\", \"end of week\", \"tomorrow\" against TODAY). Otherwise null.
  - stated_value: copy an explicitly stated monetary value and its unit/cadence (for example,
      \"S$4,800\", \"US$12k ARR\", or \"€2,000/month\"). Otherwise null. Never estimate a value.
  - source_text: the shortest exact excerpt from the input that proves this commitment exists.
      Copy it verbatim; do not paraphrase it.
  - context: 1–2 sentences of the surrounding detail from the brain-dump that a later stage
      would need to act (who, what they asked, any stakes). Quote specifics; never generalize
      to \"a client asked something\".

Split compound lines into separate items. Do not merge unrelated items. Do not drop items
because they seem trivial — extraction is exhaustive and neutral.

Return JSON: { \"items\": [ {id, item, type, due_date, stated_value, source_text, context}, ... ] }"""

SCORE = """

ROLE: Revenue Prioritizer. For EACH item, classify the money motion, assess two independent
1–5 scores, and expose the evidence and cost of waiting.

  revenue_motion: exactly one of:
      \"collect\" — money already earned or owed (invoice, payment, receivable).
      \"close\"   — win, renew, or expand signed revenue now.
      \"deliver\" — complete paid work, unlock an invoice, or create promised customer value.
      \"retain\"  — prevent churn or protect an existing paying relationship.
      \"grow\"    — build future pipeline, audience, or relationships without near-term cash.
      \"operate\" — admin, compliance, internal, personal, or speculative work with no direct
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
    Use only consequences supported by the item. If none is supported, say \"No material cost
    of waiting is stated.\"

  missing_fact: the single missing fact that would most change this item's rank (for example,
    \"Exact invoice amount is unknown\"), or null when the input is sufficient. Never invent the
    missing answer.

Do NOT compute a total or rank. Preserve each id unchanged. The server will join each score
back onto its already-validated item, so do not repeat item, type, due_date, stated_value,
source_text, or context in this response.

Return JSON: { \"scored\": [ {id, revenue_motion, revenue_proximity, urgency, evidence,
  cost_of_delay, missing_fact}, ... ] }"""

DECIDE = """

ROLE: Revenue Radar. You are given the scored, priority-ranked items. Make a decisive,
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
ids; do not invent items. Judge blockers from the context field (e.g. \"waiting on\", \"once X
sends\", \"pending approval\").

Return JSON: { \"money_moves\": [ {id, why_today, next_action, done_when}, ... ],
               \"park\":        [ {id, why_safe}, ... ],
               \"blocked\":     [ {id, blocker, unblock_action, message_needed}, ... ] }"""

PREPARE = """

ROLE: Execution Ghostwriter. You receive only the communication targets selected after DECIDE:
  1. a Money Move whose type is \"email_owed\"; or
  2. a Blocked item whose unblock_action requires a message to a person.

For EACH target, write the ready-to-send message the founder needs to execute the decision.
Set purpose to \"money_move\" or \"unblock\" exactly as supplied.

Rules:
  - Use context, stated_value, and the DECIDE fields. Reference the specific ask, names,
    numbers, and stakes. A generic \"Thanks for reaching out\" is a FAILURE.
  - Voice: warm, concise, professional, founder-to-client. No corporate filler, no emojis.
  - For a Money Move, answer or acknowledge the ask and propose the concrete next action.
  - For an unblock message, name what is needed, why it matters, and the requested response time.
  - Never invent an amount, promise, recipient address, or commercial term. Use dates stated in
    the item; for an unblock message, copy the operational response time supplied by DECIDE.
    If a required fact is unknown, use a clearly bracketed placeholder such as [confirm exact figure].
  - subject: a natural subject line (use \"Re: ...\" for replies when appropriate). body: 3–8
    sentences, real salutation and sign-off.

Never draft for parked items or for unselected email_owed items. Return an empty list when no
selected target needs a message.

Return JSON: { \"drafts\": [ {id, purpose, subject, body}, ... ] }"""


def _safe_failure_message(exc: Exception) -> str:
    """Keep errors useful without echoing a potentially sensitive API payload."""

    if isinstance(exc, PipelineError):
        return exc.message
    return f"{type(exc).__name__}: model request or structured parsing failed"


def _call_stage(
    stage: PipelineStage,
    system: str,
    user: str,
    schema: type[OutputT],
) -> OutputT:
    try:
        return _call(system, user, schema)
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError(stage, _safe_failure_message(exc)) from exc


def _validation_error(stage: PipelineStage, message: str) -> None:
    raise PipelineError(stage, f"Semantic validation failed: {message}")


def _validate_input(braindump: str, today: str) -> None:
    if not isinstance(braindump, str) or not braindump.strip():
        _validation_error("INPUT", "braindump must be a nonblank string")
    if not isinstance(today, str):
        _validation_error("INPUT", "today must be a YYYY-MM-DD string")
    try:
        _validate_iso_date(today)
    except ValueError as exc:
        _validation_error("INPUT", f"today {exc}")


def _validate_extracted(items: list[dict[str, Any]], braindump: str) -> None:
    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        _validation_error("EXTRACT", "ids must be unique")
    expected_ids = [f"i{index}" for index in range(1, len(items) + 1)]
    if ids != expected_ids:
        _validation_error("EXTRACT", "ids must be sequential in extraction order")
    for item in items:
        if not item["source_text"].strip() or item["source_text"] not in braindump:
            _validation_error(
                "EXTRACT", f"source_text for {item['id']} must be a nonblank verbatim input substring"
            )
        value = item["stated_value"]
        if value is not None and (not value.strip() or value not in braindump):
            _validation_error(
                "EXTRACT", f"stated_value for {item['id']} must be a nonblank verbatim input substring"
            )


def _validate_scored(
    items: list[dict[str, Any]],
    scored: list[dict[str, Any]],
    braindump: str,
) -> None:
    expected_ids = [item["id"] for item in items]
    actual_ids = [item["id"] for item in scored]
    if len(actual_ids) != len(set(actual_ids)):
        _validation_error("SCORE", "ids must be unique")
    if len(scored) != len(items) or set(actual_ids) != set(expected_ids):
        _validation_error("SCORE", "must return exactly one row for every extracted id")

    extracted_by_id = {item["id"]: item for item in items}
    for scored_item in scored:
        item_id = scored_item["id"]
        extracted = extracted_by_id[item_id]
        proximity = scored_item["revenue_proximity"]
        urgency = scored_item["urgency"]
        if type(proximity) is not int or not 1 <= proximity <= 5:
            _validation_error("SCORE", f"revenue_proximity for {item_id} must be an integer from 1 to 5")
        if type(urgency) is not int or not 1 <= urgency <= 5:
            _validation_error("SCORE", f"urgency for {item_id} must be an integer from 1 to 5")
        evidence = scored_item["evidence"]
        if (
            not evidence.strip()
            or evidence not in extracted["source_text"]
            or evidence not in braindump
        ):
            _validation_error(
                "SCORE", f"evidence for {item_id} must be a nonblank source_text substring"
            )


def _validate_plan(plan: dict[str, Any], scored: list[dict[str, Any]]) -> None:
    money_moves = plan["money_moves"]
    if len(money_moves) > 3:
        _validation_error("DECIDE", "may select at most three Money Moves")

    bucket_ids = (
        [move["id"] for move in money_moves]
        + [item["id"] for item in plan["park"]]
        + [item["id"] for item in plan["blocked"]]
    )
    if len(bucket_ids) != len(set(bucket_ids)):
        _validation_error("DECIDE", "buckets must not overlap or contain duplicate ids")
    expected_ids = {item["id"] for item in scored}
    if set(bucket_ids) != expected_ids:
        _validation_error("DECIDE", "buckets must exactly partition every scored id")

def _select_targets(
    plan: dict[str, Any], scored: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in scored}
    targets: list[dict[str, Any]] = []
    for move in plan["money_moves"]:
        item = by_id[move["id"]]
        if item["type"] == "email_owed":
            targets.append({"purpose": "money_move", "item": item, "decision": move})
    for blocked in plan["blocked"]:
        if blocked["message_needed"]:
            targets.append(
                {
                    "purpose": "unblock",
                    "item": by_id[blocked["id"]],
                    "decision": blocked,
                }
            )
    return targets


def _validate_drafts(
    drafts: list[dict[str, Any]], targets: list[dict[str, Any]]
) -> None:
    expected = [(target["item"]["id"], target["purpose"]) for target in targets]
    actual = [(draft["id"], draft["purpose"]) for draft in drafts]
    if len(actual) != len(set(actual)):
        _validation_error("PREPARE", "draft targets must be unique")
    if len(actual) != len(expected) or set(actual) != set(expected):
        _validation_error("PREPARE", "must draft exactly the server-selected targets")


def run_pipeline(braindump: str, today: str) -> dict[str, Any]:
    """Run Extract → Score → Decide → Prepare and return the frozen contract."""

    _validate_input(braindump, today)
    preamble = PREAMBLE.format(TODAY=today)

    extracted_output = _call_stage(
        "EXTRACT", preamble + EXTRACT, braindump, ExtractOutput
    )
    items = [item.model_dump(mode="json") for item in extracted_output.items]
    _validate_extracted(items, braindump)

    score_output = _call_stage(
        "SCORE",
        preamble + SCORE,
        json.dumps({"items": items}, ensure_ascii=False),
        ScoreOutput,
    )
    judgments = [item.model_dump(mode="json") for item in score_output.scored]
    _validate_scored(items, judgments, braindump)

    extracted_by_id = {item["id"]: item for item in items}
    scored = [
        ScoredItem.model_validate(
            {**extracted_by_id[judgment["id"]], **judgment}
        ).model_dump(mode="json")
        for judgment in judgments
    ]

    extraction_order = {item["id"]: index for index, item in enumerate(items)}
    for scored_item in scored:
        scored_item["priority"] = (
            scored_item["revenue_proximity"] * 3 + scored_item["urgency"]
        )
    scored.sort(
        key=lambda item: (-item["priority"], extraction_order[item["id"]])
    )

    decide_output = _call_stage(
        "DECIDE",
        preamble + DECIDE,
        json.dumps({"scored": scored}, ensure_ascii=False),
        DecideOutput,
    )
    plan = decide_output.model_dump(mode="json")
    _validate_plan(plan, scored)

    targets = _select_targets(plan, scored)
    drafts: list[dict[str, Any]] = []
    if targets:
        draft_output = _call_stage(
            "PREPARE",
            preamble + PREPARE,
            json.dumps({"targets": targets}, ensure_ascii=False),
            DraftOutput,
        )
        drafts = [draft.model_dump(mode="json") for draft in draft_output.drafts]
        _validate_drafts(drafts, targets)

    return {"items": items, "scored": scored, "plan": plan, "drafts": drafts}
