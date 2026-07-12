from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

from backend.evals.metrics import evaluate_benchmark, evaluate_case
from backend.evals.run_benchmark import load_cases, run_cases


def _passing_case_and_result() -> tuple[dict[str, Any], dict[str, Any]]:
    invoice_source = "Invoice AX-8 for US$1,800 was due 2026-07-13; email Nia for payment."
    migration_source = (
        "The paid migration for €750/month is due 2026-07-15, "
        "but it is blocked until Omar sends the export."
    )
    newsletter_source = (
        "Reply to the optional newsletter whenever convenient; no business deadline is attached."
    )
    braindump = " ".join((invoice_source, migration_source, newsletter_source))
    items = [
        {
            "id": "i1",
            "item": "Chase invoice AX-8",
            "type": "email_owed",
            "due_date": "2026-07-13",
            "stated_value": "US$1,800",
            "source_text": invoice_source,
            "context": "Nia should be asked for payment on overdue invoice AX-8.",
        },
        {
            "id": "i2",
            "item": "Complete the paid migration",
            "type": "task",
            "due_date": "2026-07-15",
            "stated_value": "€750/month",
            "source_text": migration_source,
            "context": "Testing is blocked until Omar sends the export.",
        },
        {
            "id": "i3",
            "item": "Reply to optional newsletter",
            "type": "email_owed",
            "due_date": None,
            "stated_value": None,
            "source_text": newsletter_source,
            "context": "The optional reply has no business deadline.",
        },
    ]
    score_fields = [
        {
            "revenue_motion": "collect",
            "revenue_proximity": 5,
            "urgency": 5,
            "evidence": "due 2026-07-13",
            "cost_of_delay": "Waiting leaves US$1,800 of earned cash uncollected.",
            "missing_fact": None,
            "priority": 20,
        },
        {
            "revenue_motion": "deliver",
            "revenue_proximity": 5,
            "urgency": 4,
            "evidence": "blocked until Omar sends the export",
            "cost_of_delay": "The paid migration cannot progress without the export.",
            "missing_fact": None,
            "priority": 19,
        },
        {
            "revenue_motion": "grow",
            "revenue_proximity": 2,
            "urgency": 1,
            "evidence": "no business deadline is attached",
            "cost_of_delay": "No material cost of waiting is stated.",
            "missing_fact": "The newsletter's commercial audience is unknown.",
            "priority": 7,
        },
    ]
    scored = [{**item, **score} for item, score in zip(items, score_fields, strict=True)]
    result = {
        "items": items,
        "scored": scored,
        "plan": {
            "money_moves": [
                {
                    "id": "i1",
                    "why_today": "Collect overdue earned cash.",
                    "next_action": "Email Nia and request the payment date.",
                    "done_when": "The payment chase is sent.",
                }
            ],
            "park": [
                {
                    "id": "i3",
                    "why_safe": "No deadline or active commercial opportunity is attached.",
                }
            ],
            "blocked": [
                {
                    "id": "i2",
                    "blocker": "Omar has not sent the export.",
                    "unblock_action": "Ask Omar for the export by 3pm today.",
                    "message_needed": True,
                }
            ],
        },
        "drafts": [
            {
                "id": "i1",
                "purpose": "money_move",
                "subject": "Invoice AX-8 payment",
                "body": "Hi Nia, please confirm the payment date for invoice AX-8. Best, Founder",
            },
            {
                "id": "i2",
                "purpose": "unblock",
                "subject": "Export needed by 3pm",
                "body": "Hi Omar, please send the export by 3pm today. Best, Founder",
            },
        ],
    }
    case = {
        "id": "unit_case",
        "synthetic": True,
        "today": "2026-07-14",
        "braindump": braindump,
        "expectations": {
            "commitments": [
                {
                    "key": "invoice",
                    "marker": "Invoice AX-8",
                    "stated_value": "US$1,800",
                    "revenue_motion": "collect",
                },
                {
                    "key": "migration",
                    "marker": "paid migration",
                    "stated_value": "€750/month",
                    "revenue_motion": "deliver",
                },
                {
                    "key": "newsletter",
                    "marker": "optional newsletter",
                    "stated_value": None,
                    "revenue_motion": "grow",
                },
            ],
            "partition": {
                "money_moves": ["invoice"],
                "park": ["newsletter"],
                "blocked": ["migration"],
            },
            "required_money_moves": ["invoice"],
            "allowed_money_moves": ["invoice"],
            "draft_targets": [
                {"key": "invoice", "purpose": "money_move"},
                {"key": "migration", "purpose": "unblock"},
            ],
            "missing_fact_contains": {"newsletter": ["audience"]},
        },
        "saved_result": result,
    }
    return case, result


def test_fully_passing_synthetic_case_returns_structured_metrics() -> None:
    case, result = _passing_case_and_result()

    report = evaluate_case(case, result)

    assert report.required_passed is True
    assert report.required_failures == ()
    assert report.metric("commitment_markers").to_dict() == {
        "name": "commitment_markers",
        "passed": True,
        "required": True,
        "numerator": 3,
        "denominator": 3,
        "details": {
            "resolved": {"invoice": "i1", "migration": "i2", "newsletter": "i3"},
            "unresolved_or_ambiguous": {},
        },
    }
    assert report.metric("invented_value_rate").details["rate"] == 0.0
    assert report.metric("money_move_limit").passed is True


def test_missing_commitment_marker_is_reported() -> None:
    case, result = _passing_case_and_result()
    result["items"][0]["source_text"] = "A different synthetic commitment."
    result["scored"][0]["source_text"] = "A different synthetic commitment."

    metric = evaluate_case(case, result).metric("commitment_markers")

    assert metric.passed is False
    assert metric.numerator == 2
    assert metric.details["unresolved_or_ambiguous"] == {"invoice": []}


def test_invented_monetary_value_has_a_nonzero_rate() -> None:
    case, result = _passing_case_and_result()
    result["items"][0]["stated_value"] = "US$99,999"
    result["scored"][0]["stated_value"] = "US$99,999"

    report = evaluate_case(case, result)

    assert report.metric("invented_value_rate").passed is False
    assert report.metric("invented_value_rate").numerator == 1
    assert report.metric("invented_value_rate").details["rate"] == pytest.approx(0.5)
    assert report.metric("stated_values_preserved").passed is False


def test_evidence_must_be_grounded_in_its_own_source_excerpt() -> None:
    case, result = _passing_case_and_result()
    result["scored"][0]["evidence"] = "blocked until Omar sends the export"

    metric = evaluate_case(case, result).metric("evidence_grounded")

    assert metric.passed is False
    assert metric.details["ungrounded_ids"] == ["i1"]


def test_wrong_priority_arithmetic_is_reported() -> None:
    case, result = _passing_case_and_result()
    result["scored"][0]["priority"] = 19

    metric = evaluate_case(case, result).metric("priority_formula")

    assert metric.passed is False
    assert metric.details["mismatches"] == [
        {"id": "i1", "expected": 20, "actual": 19}
    ]


def test_priorities_must_be_in_descending_order() -> None:
    case, result = _passing_case_and_result()
    result["scored"][0], result["scored"][1] = result["scored"][1], result["scored"][0]

    metric = evaluate_case(case, result).metric("priority_descending")

    assert metric.passed is False
    assert metric.details["priorities"] == [19, 20, 7]


@pytest.mark.parametrize("mutation", ["overlap", "incomplete"])
def test_partition_must_be_exact_and_non_overlapping(mutation: str) -> None:
    case, result = _passing_case_and_result()
    if mutation == "overlap":
        result["plan"]["park"].append(
            {"id": "i1", "why_safe": "Invalid overlap for the regression test."}
        )
    else:
        result["plan"]["park"] = []

    metric = evaluate_case(case, result).metric("partition_exact")

    assert metric.passed is False
    if mutation == "overlap":
        assert metric.details["duplicate_or_overlapping_ids"] == ["i1"]
    else:
        assert metric.details["missing_ids"] == ["i3"]


def test_semantically_blocked_item_cannot_be_a_money_move() -> None:
    case, result = _passing_case_and_result()
    result["plan"]["blocked"] = []
    result["plan"]["money_moves"].append(
        {
            "id": "i2",
            "why_today": "Invalid blocked selection.",
            "next_action": "Try work that cannot start.",
            "done_when": "This should not be selected.",
        }
    )

    metric = evaluate_case(case, result).metric("no_blocked_money_moves")

    assert metric.passed is False
    assert metric.details["blocked_money_move_ids"] == ["i2"]


def test_incorrect_draft_target_and_purpose_are_reported() -> None:
    case, result = _passing_case_and_result()
    result["drafts"][1]["purpose"] = "money_move"

    report = evaluate_case(case, result)

    assert report.metric("draft_targets").passed is False
    assert report.metric("draft_target_consistency").passed is False


def test_parked_email_must_not_receive_a_draft() -> None:
    case, result = _passing_case_and_result()
    result["drafts"].append(
        {
            "id": "i3",
            "purpose": "money_move",
            "subject": "Optional newsletter",
            "body": "This parked email must not be drafted.",
        }
    )

    metric = evaluate_case(case, result).metric("no_parked_drafts")

    assert metric.passed is False
    assert metric.details["parked_draft_ids"] == ["i3"]


def test_mixed_currency_values_are_preserved_without_aggregation() -> None:
    case, result = _passing_case_and_result()

    passing = evaluate_case(case, result)

    assert passing.metric("stated_values_preserved").passed is True
    assert passing.metric("no_value_aggregation").passed is True
    assert passing.metric("stated_values_preserved").details["actual_multiset"] == [
        {"value": "US$1,800", "count": 1},
        {"value": "€750/month", "count": 1},
    ]

    combined = deepcopy(result)
    combined["items"][0]["stated_value"] = "US$1,800 + €750/month"
    combined["scored"][0]["stated_value"] = "US$1,800 + €750/month"
    combined["items"][1]["stated_value"] = None
    combined["scored"][1]["stated_value"] = None

    failing = evaluate_case(case, combined)

    assert failing.metric("stated_values_preserved").passed is False
    assert failing.metric("no_value_aggregation").passed is False


def test_expected_revenue_motion_and_rank_changing_missing_fact_are_checked() -> None:
    case, result = _passing_case_and_result()
    result["scored"][0]["revenue_motion"] = "operate"
    result["scored"][2]["missing_fact"] = None

    report = evaluate_case(case, result)

    assert report.metric("revenue_motions").passed is False
    assert report.metric("rank_changing_missing_fact").passed is False


def test_benchmark_exit_status_aggregates_required_failures() -> None:
    case, passing_result = _passing_case_and_result()
    failing_case = deepcopy(case)
    failing_case["id"] = "failing_case"
    failing_result = deepcopy(passing_result)
    failing_result["scored"][0]["priority"] = 999

    passing_report = evaluate_benchmark([(case, passing_result)])
    mixed_report = evaluate_benchmark(
        [(case, passing_result), (failing_case, failing_result)]
    )

    assert passing_report.exit_code == 0
    assert passing_report.to_dict()["required_failure_count"] == 0
    assert mixed_report.exit_code == 1
    assert mixed_report.passed_cases == 1
    assert any(
        case_id == "failing_case" and metric.name == "priority_formula"
        for case_id, metric in mixed_report.required_failures
    )


def test_malformed_payload_fails_cleanly_instead_of_raising() -> None:
    case, _ = _passing_case_and_result()

    report = evaluate_case(case, {"items": "not-a-list"})

    assert report.required_passed is False
    assert report.metrics == (report.metric("payload_shape"),)


def test_default_runner_uses_all_saved_cases_without_touching_live_boundary() -> None:
    cases = load_cases()
    called = False

    def must_not_run(braindump: str, today: str) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("offline benchmark must not call the pipeline")

    report = run_cases(cases, pipeline_runner=must_not_run)

    assert len(cases) == 8
    assert report.exit_code == 0
    assert report.passed_cases == 8
    assert called is False


def test_live_execution_failure_is_structured_and_suppresses_exception_text() -> None:
    case, _ = _passing_case_and_result()
    secret = "sk-proj-secret-provider-payload"

    def fail_live(braindump: str, today: str) -> dict[str, Any]:
        raise RuntimeError(secret)

    report = run_cases([case], live=True, pipeline_runner=fail_live)

    assert report.exit_code == 1
    metric = report.cases[0].metric("pipeline_execution")
    assert metric.details["exception_type"] == "RuntimeError"
    assert secret not in repr(metric.to_dict())
