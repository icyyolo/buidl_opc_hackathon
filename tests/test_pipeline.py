from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Callable

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
    PipelineError,
    ScoreOutput,
    ScoredItem,
)


TODAY = "2026-07-12"


def _item(
    item_id: str,
    source_text: str,
    *,
    item: str | None = None,
    item_type: str = "task",
    due_date: str | None = None,
    stated_value: str | None = None,
    context: str | None = None,
) -> Item:
    return Item(
        id=item_id,
        item=item or f"Handle {item_id}",
        type=item_type,
        due_date=due_date,
        stated_value=stated_value,
        source_text=source_text,
        context=context or source_text,
    )


def _scored(
    item: Item,
    *,
    revenue_motion: str = "operate",
    revenue_proximity: int = 2,
    urgency: int = 2,
    evidence: str | None = None,
    cost_of_delay: str = "No material cost of waiting is stated.",
    missing_fact: str | None = None,
) -> ScoredItem:
    return ScoredItem(
        **item.model_dump(mode="python"),
        revenue_motion=revenue_motion,
        revenue_proximity=revenue_proximity,
        urgency=urgency,
        evidence=evidence if evidence is not None else item.source_text,
        cost_of_delay=cost_of_delay,
        missing_fact=missing_fact,
    )


def _move(item_id: str) -> MoneyMove:
    return MoneyMove(
        id=item_id,
        why_today=f"{item_id} moves revenue today.",
        next_action=f"Act on {item_id} now.",
        done_when=f"{item_id} is sent.",
    )


def _park(item_id: str) -> ParkItem:
    return ParkItem(id=item_id, why_safe=f"{item_id} can safely wait.")


def _blocked(item_id: str, *, message_needed: bool = True) -> BlockedItem:
    return BlockedItem(
        id=item_id,
        blocker=f"Dependency for {item_id} is missing.",
        unblock_action=f"Ask for {item_id} by 3pm.",
        message_needed=message_needed,
    )


def _draft(item_id: str, purpose: str) -> Draft:
    return Draft(
        id=item_id,
        purpose=purpose,
        subject=f"Subject for {item_id}",
        body=f"Ready-to-send body for {item_id}.",
    )


def _assert_stage(error: PipelineError, stage: str) -> None:
    assert error.stage == stage
    assert stage in str(error).upper()


def _install_outputs(
    monkeypatch: pytest.MonkeyPatch,
    outputs: dict[type[Any], Any],
) -> list[tuple[str, str, type[Any]]]:
    calls: list[tuple[str, str, type[Any]]] = []

    def fake_call(system: str, user: str, schema: type[Any]) -> Any:
        calls.append((system, user, schema))
        return outputs[schema]

    monkeypatch.setattr(pipeline, "_call", fake_call)
    return calls


def _two_item_outputs(
    sample_braindump: str,
    *,
    plan: DecideOutput | None = None,
) -> tuple[ExtractOutput, ScoreOutput, DecideOutput]:
    first_source, second_source, *_ = sample_braindump.splitlines()
    first = _item(
        "i1",
        first_source,
        item="Send Acme renewal quote",
        item_type="email_owed",
        due_date=TODAY,
        stated_value="S$12,000/year",
    )
    second = _item("i2", second_source, item="Chase Nordic invoice", item_type="task")
    extract = ExtractOutput(items=[first, second])
    score = ScoreOutput(
        scored=[
            _scored(
                first,
                revenue_motion="close",
                revenue_proximity=5,
                urgency=5,
                evidence="renewal quote today",
            ),
            _scored(
                second,
                revenue_motion="collect",
                revenue_proximity=5,
                urgency=4,
                evidence="invoice S$4,800 is overdue",
            ),
        ]
    )
    decision = plan or DecideOutput(
        money_moves=[_move("i1")],
        park=[_park("i2")],
        blocked=[],
    )
    return extract, score, decision


def test_run_pipeline_orchestrates_all_stages_and_builds_contract(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
) -> None:
    acme_source, nordic_source, dave_source, podcast_source = sample_braindump.splitlines()
    items = [
        _item(
            "i1",
            acme_source,
            item="Send Acme renewal quote",
            item_type="email_owed",
            due_date=TODAY,
            stated_value="S$12,000/year",
            context="Acme needs the renewal quote today.",
        ),
        _item(
            "i2",
            nordic_source,
            item="Chase Nordic invoice",
            item_type="email_owed",
            stated_value="S$4,800",
            context="James handles the overdue Nordic payment.",
        ),
        _item(
            "i3",
            dave_source,
            item="Finish landing page redesign",
            item_type="task",
            context="The work is waiting on Dave's logo files.",
        ),
        _item(
            "i4",
            podcast_source,
            item="Reply to podcast invitation",
            item_type="email_owed",
        ),
    ]
    # Deliberately unsorted: the server, not SCORE, owns ordering and arithmetic.
    scored = [
        _scored(items[3], revenue_motion="grow", revenue_proximity=1, urgency=1),
        _scored(
            items[1],
            revenue_motion="collect",
            revenue_proximity=5,
            urgency=4,
            evidence="invoice S$4,800 is overdue",
        ),
        _scored(items[2], revenue_motion="deliver", revenue_proximity=3, urgency=2),
        _scored(
            items[0],
            revenue_motion="close",
            revenue_proximity=5,
            urgency=5,
            evidence="renewal quote today",
        ),
    ]
    decision = DecideOutput(
        money_moves=[_move("i2"), _move("i1")],
        park=[_park("i4")],
        blocked=[_blocked("i3", message_needed=True)],
    )
    prepared = DraftOutput(
        drafts=[
            _draft("i2", "money_move"),
            _draft("i1", "money_move"),
            _draft("i3", "unblock"),
        ]
    )
    outputs = {
        ExtractOutput: ExtractOutput(items=items),
        ScoreOutput: ScoreOutput(scored=scored),
        DecideOutput: decision,
        DraftOutput: prepared,
    }
    calls = _install_outputs(monkeypatch, outputs)

    result = pipeline.run_pipeline(sample_braindump, TODAY)

    assert list(result) == ["items", "scored", "plan", "drafts"]
    assert [schema for _, _, schema in calls] == [
        ExtractOutput,
        ScoreOutput,
        DecideOutput,
        DraftOutput,
    ]
    assert all(TODAY in system for system, _, _ in calls)
    assert calls[0][1] == sample_braindump
    assert json.loads(calls[1][1]) == {"items": result["items"]}

    priorities = [entry["priority"] for entry in result["scored"]]
    assert priorities == [20, 19, 11, 4]
    assert priorities == sorted(priorities, reverse=True)
    assert {
        entry["id"]: entry["priority"] for entry in result["scored"]
    } == {"i1": 20, "i2": 19, "i3": 11, "i4": 4}
    assert json.loads(calls[2][1]) == {"scored": result["scored"]}

    targets = json.loads(calls[3][1])["targets"]
    assert [(target["item"]["id"], target["purpose"]) for target in targets] == [
        ("i2", "money_move"),
        ("i1", "money_move"),
        ("i3", "unblock"),
    ]
    assert targets[0]["decision"] == decision.money_moves[0].model_dump(mode="json")
    assert targets[2]["decision"] == decision.blocked[0].model_dump(mode="json")
    assert {draft["id"] for draft in result["drafts"]} == {"i1", "i2", "i3"}
    assert "i4" not in {draft["id"] for draft in result["drafts"]}


def test_run_pipeline_skips_prepare_when_server_selects_no_message_targets(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
) -> None:
    first_source, _, dave_source, podcast_source = sample_braindump.splitlines()
    task = _item("i1", first_source, item_type="task")
    blocked = _item("i2", dave_source, item_type="task")
    unselected_email = _item("i3", podcast_source, item_type="email_owed")
    outputs = {
        ExtractOutput: ExtractOutput(items=[task, blocked, unselected_email]),
        ScoreOutput: ScoreOutput(
            scored=[_scored(task), _scored(blocked), _scored(unselected_email)]
        ),
        DecideOutput: DecideOutput(
            money_moves=[_move("i1")],
            park=[_park("i3")],
            blocked=[_blocked("i2", message_needed=False)],
        ),
    }
    calls = _install_outputs(monkeypatch, outputs)

    result = pipeline.run_pipeline(sample_braindump, TODAY)

    assert result["drafts"] == []
    assert [schema for _, _, schema in calls] == [ExtractOutput, ScoreOutput, DecideOutput]


@pytest.mark.parametrize(
    "invalid_extract",
    [
        lambda dump: ExtractOutput(
            items=[
                _item("i1", dump.splitlines()[0]),
                _item("i1", dump.splitlines()[1]),
            ]
        ),
        lambda dump: ExtractOutput(items=[_item("i1", "text not present in input")]),
        lambda dump: ExtractOutput(
            items=[
                _item(
                    "i1",
                    dump.splitlines()[0],
                    stated_value="S$999,999 invented",
                )
            ]
        ),
    ],
    ids=["duplicate_ids", "ungrounded_source", "invented_stated_value"],
)
def test_extract_invariants_fail_at_extract_stage(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
    invalid_extract: Callable[[str], ExtractOutput],
) -> None:
    _install_outputs(monkeypatch, {ExtractOutput: invalid_extract(sample_braindump)})

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "EXTRACT")


def test_score_must_return_exactly_one_row_per_extracted_item(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
) -> None:
    extract, score, decision = _two_item_outputs(sample_braindump)
    only_one = ScoreOutput(scored=[score.scored[0]])
    _install_outputs(
        monkeypatch,
        {ExtractOutput: extract, ScoreOutput: only_one, DecideOutput: decision},
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "SCORE")


def test_score_must_conserve_the_exact_id_set(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
) -> None:
    extract, score, decision = _two_item_outputs(sample_braindump)
    duplicate = score.scored[0].model_copy(update={"id": "i1"})
    malformed = ScoreOutput(scored=[score.scored[0], duplicate])
    _install_outputs(
        monkeypatch,
        {ExtractOutput: extract, ScoreOutput: malformed, DecideOutput: decision},
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "SCORE")


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("item", "A changed summary"),
        ("type", "task"),
        ("due_date", None),
        ("stated_value", None),
        ("source_text", "Nordic invoice S$4,800 is overdue; email James about payment."),
        ("context", "Changed context"),
    ],
)
def test_score_cannot_change_any_extracted_field(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
    field: str,
    invalid_value: Any,
) -> None:
    extract, score, decision = _two_item_outputs(sample_braindump)
    changed = score.scored[0].model_copy(update={field: invalid_value})
    malformed = ScoreOutput(scored=[changed, score.scored[1]])
    _install_outputs(
        monkeypatch,
        {ExtractOutput: extract, ScoreOutput: malformed, DecideOutput: decision},
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "SCORE")


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("revenue_proximity", 0),
        ("revenue_proximity", 6),
        ("urgency", 0),
        ("urgency", 6),
    ],
)
def test_score_ranges_are_enforced_even_for_schema_bypassed_output(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
    field: str,
    invalid_value: int,
) -> None:
    extract, score, decision = _two_item_outputs(sample_braindump)
    values = score.scored[0].model_dump(mode="python")
    values[field] = invalid_value
    invalid = ScoredItem.model_construct(**values)
    malformed = ScoreOutput.model_construct(scored=[invalid, score.scored[1]])
    _install_outputs(
        monkeypatch,
        {ExtractOutput: extract, ScoreOutput: malformed, DecideOutput: decision},
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "SCORE")


def test_score_evidence_must_be_grounded_in_its_own_source_excerpt(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
) -> None:
    extract, score, decision = _two_item_outputs(sample_braindump)
    # This phrase exists in the overall dump but belongs to the other item.
    invalid = score.scored[0].model_copy(update={"evidence": "invoice S$4,800 is overdue"})
    malformed = ScoreOutput(scored=[invalid, score.scored[1]])
    _install_outputs(
        monkeypatch,
        {ExtractOutput: extract, ScoreOutput: malformed, DecideOutput: decision},
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "SCORE")


@pytest.mark.parametrize("case", ["overlap", "missing", "unknown", "duplicate"])
def test_decide_buckets_must_be_an_exact_non_overlapping_partition(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
    case: str,
) -> None:
    if case == "overlap":
        decision = DecideOutput(
            money_moves=[_move("i1")],
            park=[_park("i1"), _park("i2")],
            blocked=[],
        )
    elif case == "missing":
        decision = DecideOutput(money_moves=[_move("i1")], park=[], blocked=[])
    elif case == "unknown":
        decision = DecideOutput(
            money_moves=[_move("i1")],
            park=[_park("i2")],
            blocked=[_blocked("i999")],
        )
    else:
        decision = DecideOutput(
            money_moves=[_move("i1")],
            park=[_park("i2"), _park("i2")],
            blocked=[],
        )
    extract, score, _ = _two_item_outputs(sample_braindump, plan=decision)
    _install_outputs(
        monkeypatch,
        {ExtractOutput: extract, ScoreOutput: score, DecideOutput: decision},
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "DECIDE")


def test_decide_rejects_more_than_three_money_moves(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
) -> None:
    sources = sample_braindump.splitlines()
    items = [_item(f"i{index}", source) for index, source in enumerate(sources, start=1)]
    decision = DecideOutput(
        money_moves=[_move(item.id) for item in items],
        park=[],
        blocked=[],
    )
    _install_outputs(
        monkeypatch,
        {
            ExtractOutput: ExtractOutput(items=items),
            ScoreOutput: ScoreOutput(scored=[_scored(item) for item in items]),
            DecideOutput: decision,
        },
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "DECIDE")


@pytest.mark.parametrize("case", ["missing", "extra", "duplicate", "wrong_purpose"])
def test_prepare_must_return_each_and_only_each_server_selected_target(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
    case: str,
) -> None:
    first_source, _, dave_source, podcast_source = sample_braindump.splitlines()
    money_email = _item("i1", first_source, item_type="email_owed")
    blocked_task = _item("i2", dave_source, item_type="task")
    parked_email = _item("i3", podcast_source, item_type="email_owed")
    decision = DecideOutput(
        money_moves=[_move("i1")],
        park=[_park("i3")],
        blocked=[_blocked("i2", message_needed=True)],
    )
    drafts_by_case = {
        "missing": [_draft("i1", "money_move")],
        "extra": [
            _draft("i1", "money_move"),
            _draft("i2", "unblock"),
            _draft("i3", "money_move"),
        ],
        "duplicate": [
            _draft("i1", "money_move"),
            _draft("i1", "money_move"),
        ],
        "wrong_purpose": [
            _draft("i1", "money_move"),
            _draft("i2", "money_move"),
        ],
    }
    _install_outputs(
        monkeypatch,
        {
            ExtractOutput: ExtractOutput(items=[money_email, blocked_task, parked_email]),
            ScoreOutput: ScoreOutput(
                scored=[_scored(money_email), _scored(blocked_task), _scored(parked_email)]
            ),
            DecideOutput: decision,
            DraftOutput: DraftOutput(drafts=drafts_by_case[case]),
        },
    )

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, "PREPARE")


@pytest.mark.parametrize(
    ("failing_schema", "expected_stage"),
    [
        (ExtractOutput, "EXTRACT"),
        (ScoreOutput, "SCORE"),
        (DecideOutput, "DECIDE"),
        (DraftOutput, "PREPARE"),
    ],
)
def test_model_call_errors_are_wrapped_with_the_failing_stage_and_cause(
    monkeypatch: pytest.MonkeyPatch,
    sample_braindump: str,
    failing_schema: type[Any],
    expected_stage: str,
) -> None:
    extract, score, _ = _two_item_outputs(sample_braindump)
    # An email Money Move guarantees PREPARE is reached in the final parameter case.
    decision = DecideOutput(
        money_moves=[_move("i1")],
        park=[_park("i2")],
        blocked=[],
    )
    outputs = {
        ExtractOutput: extract,
        ScoreOutput: score,
        DecideOutput: decision,
        DraftOutput: DraftOutput(drafts=[_draft("i1", "money_move")]),
    }
    original = RuntimeError("upstream SDK failure")

    def fake_call(system: str, user: str, schema: type[Any]) -> Any:
        if schema is failing_schema:
            raise original
        return outputs[schema]

    monkeypatch.setattr(pipeline, "_call", fake_call)

    with pytest.raises(PipelineError) as exc_info:
        pipeline.run_pipeline(sample_braindump, TODAY)

    _assert_stage(exc_info.value, expected_stage)
    assert exc_info.value.__cause__ is original


def test_call_wires_responses_parse_with_model_messages_and_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = ExtractOutput(items=[])
    seen: dict[str, Any] = {}

    class FakeResponses:
        def parse(self, **kwargs: Any) -> Any:
            seen.update(kwargs)
            return SimpleNamespace(output_parsed=expected)

    monkeypatch.setattr(
        pipeline,
        "client",
        SimpleNamespace(responses=FakeResponses()),
    )

    actual = pipeline._call("system instructions", "user payload", ExtractOutput)

    assert actual is expected
    assert seen == {
        "model": pipeline.MODEL,
        "input": [
            {"role": "system", "content": "system instructions"},
            {"role": "user", "content": "user payload"},
        ],
        "text_format": ExtractOutput,
    }


def test_call_rejects_a_response_without_parsed_structured_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeResponses:
        def parse(self, **kwargs: Any) -> Any:
            return SimpleNamespace(output_parsed=None)

    monkeypatch.setattr(
        pipeline,
        "client",
        SimpleNamespace(responses=FakeResponses()),
    )

    with pytest.raises(ValueError, match="no structured output"):
        pipeline._call("system", "user", ExtractOutput)

