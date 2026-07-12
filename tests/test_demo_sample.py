from __future__ import annotations

import json
from typing import Any

import pytest

from app import pipeline
from app.pipeline import (
    BlockedItem,
    DecideOutput,
    Draft,
    DraftOutput,
    ExtractOutput,
    Item,
    MoneyMove,
    ParkItem,
    ScoreOutput,
    ScoredItem,
)


TODAY = "2026-07-12"
SAMPLE_BRAINDUMP = """ok brain dump before I lose it:
- Acme (Sarah) emailed twice about their renewal. She wants the revised annual quote today. Price is S$12,000/year with 10% off if they sign by Friday.
- still owe the podcast guy a reply about coming on the show, low prio but he's been waiting 2 wks
- Nordic Labs invoice #204 for S$4,800 was due last Friday. James in AP is the contact; need to ask whether anything is blocking payment.
- finish the generic onboarding deck template by Thursday if there is time; no client is waiting on it
- Dave the designer still hasn't sent the new logo files, blocked on the landing page redesign until then
- taxes / GST filing due end of month sometime
- reply to that recruiter, not urgent
- coffee chat w/ potential co-founder, want to schedule for next week
- Meridian has an S$18,000 budget. They asked yesterday for a revised scope removing analytics but keeping onboarding; they want it tomorrow and decide on Wednesday."""


def test_exact_demo_brain_dump_meets_decision_quality_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lines = SAMPLE_BRAINDUMP.splitlines()[1:]
    items = [
        Item(
            id="i1",
            item="Send Sarah the revised Acme renewal quote",
            type="email_owed",
            due_date=TODAY,
            stated_value="S$12,000/year",
            source_text=lines[0],
            context="Sarah at Acme wants the revised annual quote today with a 10% Friday signing incentive.",
        ),
        Item(
            id="i2",
            item="Reply to the podcast invitation",
            type="email_owed",
            due_date=None,
            stated_value=None,
            source_text=lines[1],
            context="The podcast host has waited two weeks, but the founder called it low priority.",
        ),
        Item(
            id="i3",
            item="Ask James what blocks Nordic invoice payment",
            type="email_owed",
            due_date="2026-07-10",
            stated_value="S$4,800",
            source_text=lines[2],
            context="Nordic Labs invoice #204 is overdue; James in AP is the contact.",
        ),
        Item(
            id="i4",
            item="Finish the generic onboarding deck template",
            type="task",
            due_date="2026-07-16",
            stated_value=None,
            source_text=lines[3],
            context="The deck is optional and no client is waiting for it.",
        ),
        Item(
            id="i5",
            item="Finish the landing page redesign",
            type="task",
            due_date=None,
            stated_value=None,
            source_text=lines[4],
            context="The redesign is blocked until Dave sends the new logo files.",
        ),
        Item(
            id="i6",
            item="File taxes and GST",
            type="deadline",
            due_date="2026-07-31",
            stated_value=None,
            source_text=lines[5],
            context="The filing is due at the end of the month.",
        ),
        Item(
            id="i7",
            item="Reply to the recruiter",
            type="email_owed",
            due_date=None,
            stated_value=None,
            source_text=lines[6],
            context="The recruiter reply is explicitly not urgent.",
        ),
        Item(
            id="i8",
            item="Schedule the potential co-founder coffee chat",
            type="task",
            due_date=None,
            stated_value=None,
            source_text=lines[7],
            context="The founder wants the coffee chat next week.",
        ),
        Item(
            id="i9",
            item="Send Meridian the revised project scope",
            type="email_owed",
            due_date="2026-07-13",
            stated_value="S$18,000",
            source_text=lines[8],
            context="Meridian wants analytics removed, onboarding kept, and will decide Wednesday.",
        ),
    ]

    score_specs = [
        ("close", 5, 5, "revised annual quote today"),
        ("grow", 2, 2, "low prio"),
        ("collect", 5, 5, "S$4,800 was due last Friday"),
        ("operate", 2, 3, "if there is time"),
        ("deliver", 4, 2, "blocked on the landing page redesign"),
        ("operate", 2, 2, "due end of month"),
        ("operate", 1, 1, "not urgent"),
        ("grow", 3, 2, "schedule for next week"),
        ("close", 5, 4, "they want it tomorrow"),
    ]
    scored = [
        ScoredItem(
            **item.model_dump(mode="python"),
            revenue_motion=motion,
            revenue_proximity=proximity,
            urgency=urgency,
            evidence=evidence,
            cost_of_delay="No material cost of waiting is stated.",
            missing_fact=None,
        )
        for item, (motion, proximity, urgency, evidence) in zip(items, score_specs, strict=True)
    ]

    decision = DecideOutput(
        money_moves=[
            MoneyMove(
                id="i3",
                why_today="Collect the overdue Nordic receivable.",
                next_action="Ask James what is blocking invoice #204.",
                done_when="James confirms payment status and the next step.",
            ),
            MoneyMove(
                id="i1",
                why_today="Close the Acme renewal while Friday's incentive is usable.",
                next_action="Send Sarah the revised quote now.",
                done_when="The quote is sent and follow-up is scheduled.",
            ),
            MoneyMove(
                id="i9",
                why_today="Advance Meridian's live S$18,000 decision.",
                next_action="Send the revised scope by tomorrow.",
                done_when="Meridian receives the revised scope.",
            ),
        ],
        park=[
            ParkItem(id="i2", why_safe="No near-term cash outcome depends on the podcast reply."),
            ParkItem(id="i4", why_safe="No client is waiting for the generic deck."),
            ParkItem(id="i6", why_safe="The month-end filing is not yet due."),
            ParkItem(id="i7", why_safe="The recruiter reply is explicitly not urgent."),
            ParkItem(id="i8", why_safe="The coffee chat is intended for next week."),
        ],
        blocked=[
            BlockedItem(
                id="i5",
                blocker="Dave has not sent the new logo files.",
                unblock_action="Ask Dave to send the final logo files by 3pm today.",
                message_needed=True,
            )
        ],
    )
    drafts = DraftOutput(
        drafts=[
            Draft(
                id="i3",
                purpose="money_move",
                subject="Nordic invoice #204",
                body="Hi James, Nordic Labs invoice #204 for S$4,800 was due last Friday. Is anything blocking payment? Best, Founder",
            ),
            Draft(
                id="i1",
                purpose="money_move",
                subject="Re: Acme annual renewal",
                body="Hi Sarah, here is the revised S$12,000/year quote with 10% off if signed by Friday. Best, Founder",
            ),
            Draft(
                id="i9",
                purpose="money_move",
                subject="Re: Meridian revised scope",
                body="Hi Meridian team, the S$18,000 scope removes analytics and keeps onboarding. I will send it tomorrow ahead of Wednesday's decision. Best, Founder",
            ),
            Draft(
                id="i5",
                purpose="unblock",
                subject="Logo files needed today",
                body="Hi Dave, please send the final logo files by 3pm today so I can unblock the landing page redesign. Best, Founder",
            ),
        ]
    )

    outputs: dict[type[Any], Any] = {
        ExtractOutput: ExtractOutput(items=items),
        ScoreOutput: ScoreOutput(scored=list(reversed(scored))),
        DecideOutput: decision,
        DraftOutput: drafts,
    }
    calls: list[tuple[type[Any], str]] = []

    def fake_call(system: str, user: str, schema: type[Any]) -> Any:
        calls.append((schema, user))
        return outputs[schema]

    monkeypatch.setattr(pipeline, "_call", fake_call)

    result = pipeline.run_pipeline(SAMPLE_BRAINDUMP, TODAY)

    assert len(result["items"]) == 9
    assert [item["priority"] for item in result["scored"]] == sorted(
        (item["priority"] for item in result["scored"]), reverse=True
    )
    scored_by_id = {item["id"]: item for item in result["scored"]}
    assert scored_by_id["i1"]["revenue_motion"] == "close"
    assert scored_by_id["i3"]["revenue_motion"] == "collect"
    assert scored_by_id["i9"]["revenue_motion"] == "close"
    assert {move["id"] for move in result["plan"]["money_moves"]} == {"i1", "i3", "i9"}
    assert result["plan"]["blocked"][0]["id"] == "i5"
    assert result["plan"]["blocked"][0]["message_needed"] is True
    assert {item["id"] for item in result["plan"]["park"]} == {"i2", "i4", "i6", "i7", "i8"}
    assert {(draft["id"], draft["purpose"]) for draft in result["drafts"]} == {
        ("i1", "money_move"),
        ("i3", "money_move"),
        ("i9", "money_move"),
        ("i5", "unblock"),
    }
    assert all(item["source_text"] in SAMPLE_BRAINDUMP for item in result["items"])
    assert all(item["evidence"] in SAMPLE_BRAINDUMP for item in result["scored"])
    assert {item["stated_value"] for item in result["items"] if item["stated_value"]} == {
        "S$12,000/year",
        "S$4,800",
        "S$18,000",
    }
    acme_body = next(draft["body"] for draft in result["drafts"] if draft["id"] == "i1")
    assert all(detail in acme_body for detail in ("Sarah", "S$12,000/year", "10%", "Friday"))
    prepare_payload = json.loads(next(user for schema, user in calls if schema is DraftOutput))
    assert [(target["item"]["id"], target["purpose"]) for target in prepare_payload["targets"]] == [
        ("i3", "money_move"),
        ("i1", "money_move"),
        ("i9", "money_move"),
        ("i5", "unblock"),
    ]
