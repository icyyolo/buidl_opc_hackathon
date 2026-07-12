"""Pure, dependency-free metrics for Revenue Radar benchmark results.

The evaluator consumes the public v1 response rather than internal Pydantic
models.  This keeps offline fixtures useful as contract and quality regression
tests, and makes every result directly unit-testable without parsing console
output.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, Mapping


_SUCCESS_KEYS = {"items", "scored", "plan", "drafts"}
_BASE_FIELDS = (
    "item",
    "type",
    "due_date",
    "stated_value",
    "source_text",
    "context",
)


@dataclass(frozen=True)
class MetricResult:
    """One structured benchmark assertion."""

    name: str
    passed: bool
    required: bool = True
    numerator: int | float | None = None
    denominator: int | float | None = None
    details: Mapping[str, Any] = field(default_factory=dict)

    @property
    def status(self) -> str:
        return "pass" if self.passed else "fail"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CaseReport:
    """All metric results for one synthetic benchmark case."""

    case_id: str
    metrics: tuple[MetricResult, ...]

    @property
    def required_passed(self) -> bool:
        return not self.required_failures

    @property
    def required_failures(self) -> tuple[MetricResult, ...]:
        return tuple(metric for metric in self.metrics if metric.required and not metric.passed)

    @property
    def advisory_failures(self) -> tuple[MetricResult, ...]:
        return tuple(metric for metric in self.metrics if not metric.required and not metric.passed)

    def metric(self, name: str) -> MetricResult:
        matches = [metric for metric in self.metrics if metric.name == name]
        if len(matches) != 1:
            raise KeyError(f"expected exactly one metric named {name!r}")
        return matches[0]

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "required_passed": self.required_passed,
            "metrics": [metric.to_dict() for metric in self.metrics],
        }


@dataclass(frozen=True)
class BenchmarkReport:
    """Aggregate result and process exit semantics for multiple cases."""

    cases: tuple[CaseReport, ...]

    @property
    def required_failures(self) -> tuple[tuple[str, MetricResult], ...]:
        return tuple(
            (case.case_id, metric)
            for case in self.cases
            for metric in case.required_failures
        )

    @property
    def advisory_failures(self) -> tuple[tuple[str, MetricResult], ...]:
        return tuple(
            (case.case_id, metric)
            for case in self.cases
            for metric in case.advisory_failures
        )

    @property
    def passed_cases(self) -> int:
        return sum(case.required_passed for case in self.cases)

    @property
    def exit_code(self) -> int:
        return 1 if self.required_failures else 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_count": len(self.cases),
            "passed_cases": self.passed_cases,
            "required_failure_count": len(self.required_failures),
            "advisory_failure_count": len(self.advisory_failures),
            "exit_code": self.exit_code,
            "cases": [case.to_dict() for case in self.cases],
        }


def _is_mapping(value: Any) -> bool:
    return isinstance(value, Mapping)


def _list_of_mappings(value: Any) -> list[Mapping[str, Any]]:
    if not isinstance(value, list) or not all(_is_mapping(item) for item in value):
        return []
    return list(value)


def _ids(rows: Iterable[Mapping[str, Any]]) -> list[Any]:
    return [row.get("id") for row in rows]


def _duplicates(values: Iterable[Any]) -> list[Any]:
    counts = Counter(values)
    return sorted((value for value, count in counts.items() if count > 1), key=repr)


def _strict_int(value: Any) -> bool:
    return type(value) is int


def _counter_pairs(rows: Iterable[Mapping[str, Any]]) -> Counter[tuple[Any, Any]]:
    return Counter((row.get("id"), row.get("purpose")) for row in rows)


def _counter_as_rows(counter: Counter[Any]) -> list[dict[str, Any]]:
    return [
        {"value": value, "count": count}
        for value, count in sorted(counter.items(), key=lambda item: repr(item[0]))
    ]


def _resolve_commitments(
    commitments: list[Mapping[str, Any]],
    items: list[Mapping[str, Any]],
) -> tuple[dict[str, str], dict[str, list[Any]]]:
    resolutions: dict[str, str] = {}
    unresolved: dict[str, list[Any]] = {}
    for commitment in commitments:
        key = commitment.get("key")
        marker = commitment.get("marker")
        if not isinstance(key, str) or not key or not isinstance(marker, str) or not marker:
            unresolved[str(key)] = []
            continue
        matches = [
            item.get("id")
            for item in items
            if isinstance(item.get("source_text"), str)
            and marker in item["source_text"]
        ]
        if len(matches) == 1 and isinstance(matches[0], str) and matches[0]:
            resolutions[key] = matches[0]
        else:
            unresolved[key] = matches

    resolved_ids = list(resolutions.values())
    for duplicate_id in _duplicates(resolved_ids):
        for key, item_id in tuple(resolutions.items()):
            if item_id == duplicate_id:
                unresolved[key] = [duplicate_id]
                del resolutions[key]
    return resolutions, unresolved


def _resolve_keys(keys: Any, resolutions: Mapping[str, str]) -> tuple[list[str], list[Any]]:
    if not isinstance(keys, list):
        return [], ["<expectation is not a list>"]
    resolved: list[str] = []
    unresolved: list[Any] = []
    for key in keys:
        item_id = resolutions.get(key) if isinstance(key, str) else None
        if item_id is None:
            unresolved.append(key)
        else:
            resolved.append(item_id)
    return resolved, unresolved


def _shape_metric(result: Any) -> tuple[MetricResult, bool]:
    top_level_mapping = _is_mapping(result)
    keys = set(result) if top_level_mapping else set()
    items = result.get("items") if top_level_mapping else None
    scored = result.get("scored") if top_level_mapping else None
    plan = result.get("plan") if top_level_mapping else None
    drafts = result.get("drafts") if top_level_mapping else None
    valid = (
        top_level_mapping
        and keys == _SUCCESS_KEYS
        and isinstance(items, list)
        and all(_is_mapping(item) for item in items)
        and isinstance(scored, list)
        and all(_is_mapping(item) for item in scored)
        and _is_mapping(plan)
        and all(
            isinstance(plan.get(bucket), list)
            and all(_is_mapping(item) for item in plan.get(bucket, []))
            for bucket in ("money_moves", "park", "blocked")
        )
        and isinstance(drafts, list)
        and all(_is_mapping(item) for item in drafts)
    )
    return (
        MetricResult(
            name="payload_shape",
            passed=valid,
            details={
                "expected_top_level_keys": sorted(_SUCCESS_KEYS),
                "actual_top_level_keys": sorted(map(str, keys)),
            },
        ),
        valid,
    )


def evaluate_case(case: Mapping[str, Any], result: Any) -> CaseReport:
    """Evaluate one final v1 pipeline response without raising on bad output."""

    case_id_value = case.get("id") if _is_mapping(case) else None
    case_id = case_id_value if isinstance(case_id_value, str) else "<unknown-case>"
    shape_metric, usable_shape = _shape_metric(result)
    if not usable_shape:
        return CaseReport(case_id=case_id, metrics=(shape_metric,))

    expectations_value = case.get("expectations", {})
    expectations = expectations_value if _is_mapping(expectations_value) else {}
    commitments = _list_of_mappings(expectations.get("commitments", []))
    braindump_value = case.get("braindump", "")
    braindump = braindump_value if isinstance(braindump_value, str) else ""

    items = _list_of_mappings(result["items"])
    scored = _list_of_mappings(result["scored"])
    plan = result["plan"]
    money_moves = _list_of_mappings(plan["money_moves"])
    park = _list_of_mappings(plan["park"])
    blocked = _list_of_mappings(plan["blocked"])
    drafts = _list_of_mappings(result["drafts"])

    resolutions, unresolved_markers = _resolve_commitments(commitments, items)
    item_ids = _ids(items)
    scored_ids = _ids(scored)
    valid_item_ids = all(isinstance(item_id, str) and item_id for item_id in item_ids)
    valid_scored_ids = all(isinstance(item_id, str) and item_id for item_id in scored_ids)
    item_id_counts = Counter(item_ids)
    scored_id_counts = Counter(scored_ids)
    id_integrity = (
        valid_item_ids
        and valid_scored_ids
        and not _duplicates(item_ids)
        and not _duplicates(scored_ids)
        and item_id_counts == scored_id_counts
    )

    items_by_id = {
        item["id"]: item
        for item in items
        if isinstance(item.get("id"), str) and item_ids.count(item.get("id")) == 1
    }
    scored_by_id = {
        row["id"]: row
        for row in scored
        if isinstance(row.get("id"), str) and scored_ids.count(row.get("id")) == 1
    }

    metrics: list[MetricResult] = [shape_metric]
    metrics.append(
        MetricResult(
            name="commitment_markers",
            passed=not unresolved_markers and len(resolutions) == len(commitments),
            numerator=len(resolutions),
            denominator=len(commitments),
            details={
                "resolved": resolutions,
                "unresolved_or_ambiguous": unresolved_markers,
            },
        )
    )
    metrics.append(
        MetricResult(
            name="id_integrity",
            passed=id_integrity,
            numerator=len(set(item_ids) & set(scored_ids)),
            denominator=max(len(item_ids), len(scored_ids)),
            details={
                "item_ids": item_ids,
                "scored_ids": scored_ids,
                "duplicate_item_ids": _duplicates(item_ids),
                "duplicate_scored_ids": _duplicates(scored_ids),
            },
        )
    )

    base_mismatches: dict[str, list[str]] = {}
    if id_integrity:
        for item_id in item_ids:
            mismatched_fields = [
                field_name
                for field_name in _BASE_FIELDS
                if items_by_id[item_id].get(field_name) != scored_by_id[item_id].get(field_name)
            ]
            if mismatched_fields:
                base_mismatches[item_id] = mismatched_fields
    else:
        base_mismatches["<ids>"] = ["cannot compare duplicate or non-conserved ids"]
    metrics.append(
        MetricResult(
            name="base_field_conservation",
            passed=not base_mismatches,
            numerator=max(len(item_ids) - len(base_mismatches), 0),
            denominator=len(item_ids),
            details={"mismatches": base_mismatches},
        )
    )

    expected_values = [
        commitment.get("stated_value")
        for commitment in commitments
        if commitment.get("stated_value") is not None
    ]
    actual_values = [
        item.get("stated_value")
        for item in items
        if item.get("stated_value") is not None
    ]
    value_mismatches: dict[str, dict[str, Any]] = {}
    for commitment in commitments:
        key = commitment.get("key")
        item_id = resolutions.get(key) if isinstance(key, str) else None
        expected_value = commitment.get("stated_value")
        actual_value = items_by_id.get(item_id, {}).get("stated_value") if item_id else "<unresolved>"
        if actual_value != expected_value:
            value_mismatches[str(key)] = {
                "expected": expected_value,
                "actual": actual_value,
            }
    values_preserved = (
        not value_mismatches
        and Counter(actual_values) == Counter(expected_values)
        and len(resolutions) == len(commitments)
    )
    metrics.append(
        MetricResult(
            name="stated_values_preserved",
            passed=values_preserved,
            numerator=len(commitments) - len(value_mismatches),
            denominator=len(commitments),
            details={
                "mismatches": value_mismatches,
                "expected_multiset": _counter_as_rows(Counter(expected_values)),
                "actual_multiset": _counter_as_rows(Counter(actual_values)),
            },
        )
    )

    invented_values: list[dict[str, Any]] = []
    for item in items:
        value = item.get("stated_value")
        if value is not None and (not isinstance(value, str) or value not in braindump):
            invented_values.append({"id": item.get("id"), "value": value})
    invented_denominator = len(actual_values)
    invented_rate = len(invented_values) / invented_denominator if invented_denominator else 0.0
    metrics.append(
        MetricResult(
            name="invented_value_rate",
            passed=not invented_values,
            numerator=len(invented_values),
            denominator=invented_denominator,
            details={"rate": invented_rate, "invented_values": invented_values},
        )
    )

    ungrounded_evidence: list[Any] = []
    grounded_count = 0
    for row in scored:
        item_id = row.get("id")
        source = items_by_id.get(item_id, {}).get("source_text")
        evidence = row.get("evidence")
        grounded = (
            isinstance(source, str)
            and bool(source.strip())
            and source in braindump
            and isinstance(evidence, str)
            and bool(evidence.strip())
            and evidence in source
        )
        if grounded:
            grounded_count += 1
        else:
            ungrounded_evidence.append(item_id)
    evidence_passed = (
        id_integrity
        and grounded_count == len(scored)
        and len(scored) == len(items)
    )
    metrics.append(
        MetricResult(
            name="evidence_grounded",
            passed=evidence_passed,
            numerator=grounded_count,
            denominator=len(scored),
            details={"ungrounded_ids": ungrounded_evidence},
        )
    )

    invalid_scores: list[Any] = []
    wrong_priorities: list[dict[str, Any]] = []
    for row in scored:
        proximity = row.get("revenue_proximity")
        urgency = row.get("urgency")
        priority = row.get("priority")
        score_valid = (
            _strict_int(proximity)
            and 1 <= proximity <= 5
            and _strict_int(urgency)
            and 1 <= urgency <= 5
        )
        if not score_valid:
            invalid_scores.append(row.get("id"))
        expected_priority = proximity * 3 + urgency if score_valid else None
        if not _strict_int(priority) or priority != expected_priority:
            wrong_priorities.append(
                {
                    "id": row.get("id"),
                    "expected": expected_priority,
                    "actual": priority,
                }
            )
    metrics.append(
        MetricResult(
            name="score_ranges",
            passed=not invalid_scores,
            numerator=len(scored) - len(invalid_scores),
            denominator=len(scored),
            details={"invalid_ids": invalid_scores},
        )
    )
    metrics.append(
        MetricResult(
            name="priority_formula",
            passed=not wrong_priorities,
            numerator=len(scored) - len(wrong_priorities),
            denominator=len(scored),
            details={"mismatches": wrong_priorities},
        )
    )
    priorities = [row.get("priority") for row in scored]
    descending = all(_strict_int(value) for value in priorities) and all(
        left >= right for left, right in zip(priorities, priorities[1:])
    )
    metrics.append(
        MetricResult(
            name="priority_descending",
            passed=descending,
            numerator=sum(
                _strict_int(left) and _strict_int(right) and left >= right
                for left, right in zip(priorities, priorities[1:])
            ),
            denominator=max(len(priorities) - 1, 0),
            details={"priorities": priorities},
        )
    )

    bucket_rows = {"money_moves": money_moves, "park": park, "blocked": blocked}
    bucket_ids = {name: _ids(rows) for name, rows in bucket_rows.items()}
    all_bucket_ids = [item_id for ids in bucket_ids.values() for item_id in ids]
    partition_passed = (
        id_integrity
        and all(isinstance(item_id, str) and item_id for item_id in all_bucket_ids)
        and Counter(all_bucket_ids) == Counter(scored_ids)
        and not _duplicates(all_bucket_ids)
    )
    metrics.append(
        MetricResult(
            name="partition_exact",
            passed=partition_passed,
            numerator=len(set(all_bucket_ids) & set(scored_ids)),
            denominator=len(set(scored_ids)),
            details={
                "bucket_ids": bucket_ids,
                "missing_ids": sorted(set(scored_ids) - set(all_bucket_ids), key=repr),
                "unknown_ids": sorted(set(all_bucket_ids) - set(scored_ids), key=repr),
                "duplicate_or_overlapping_ids": _duplicates(all_bucket_ids),
            },
        )
    )

    expected_partition_value = expectations.get("partition", {})
    expected_partition = expected_partition_value if _is_mapping(expected_partition_value) else {}
    resolved_partition: dict[str, list[str]] = {}
    unresolved_partition: dict[str, list[Any]] = {}
    for bucket in ("money_moves", "park", "blocked"):
        resolved, unresolved = _resolve_keys(expected_partition.get(bucket, []), resolutions)
        resolved_partition[bucket] = resolved
        if unresolved:
            unresolved_partition[bucket] = unresolved
    semantic_partition_passed = not unresolved_partition and all(
        Counter(bucket_ids[bucket]) == Counter(resolved_partition[bucket])
        for bucket in ("money_moves", "park", "blocked")
    )
    metrics.append(
        MetricResult(
            name="expected_partition",
            passed=semantic_partition_passed,
            details={
                "expected_ids": resolved_partition,
                "actual_ids": bucket_ids,
                "unresolved_keys": unresolved_partition,
            },
        )
    )

    motion_mismatches: dict[str, dict[str, Any]] = {}
    for commitment in commitments:
        key = commitment.get("key")
        expected_motion = commitment.get("revenue_motion")
        item_id = resolutions.get(key) if isinstance(key, str) else None
        actual_motion = scored_by_id.get(item_id, {}).get("revenue_motion") if item_id else None
        if actual_motion != expected_motion:
            motion_mismatches[str(key)] = {
                "expected": expected_motion,
                "actual": actual_motion,
            }
    metrics.append(
        MetricResult(
            name="revenue_motions",
            passed=not motion_mismatches and len(resolutions) == len(commitments),
            numerator=len(commitments) - len(motion_mismatches),
            denominator=len(commitments),
            details={"mismatches": motion_mismatches},
        )
    )

    required_moves, unresolved_required = _resolve_keys(
        expectations.get("required_money_moves", []), resolutions
    )
    allowed_setting = expectations.get("allowed_money_moves")
    if allowed_setting is None:
        allowed_moves, unresolved_allowed = list(required_moves), []
    else:
        allowed_moves, unresolved_allowed = _resolve_keys(allowed_setting, resolutions)
    actual_move_ids = _ids(money_moves)
    actual_move_set = set(actual_move_ids)
    required_move_set = set(required_moves)
    allowed_move_set = set(allowed_moves)
    moves_passed = (
        not unresolved_required
        and not unresolved_allowed
        and not _duplicates(actual_move_ids)
        and required_move_set <= actual_move_set <= allowed_move_set
    )
    metrics.append(
        MetricResult(
            name="money_move_ids",
            passed=moves_passed,
            details={
                "required_ids": required_moves,
                "allowed_ids": allowed_moves,
                "actual_ids": actual_move_ids,
                "unresolved_required_keys": unresolved_required,
                "unresolved_allowed_keys": unresolved_allowed,
            },
        )
    )

    expected_blocked_ids = set(resolved_partition["blocked"])
    actual_blocked_ids = set(bucket_ids["blocked"])
    blocked_move_ids = sorted(
        actual_move_set & (expected_blocked_ids | actual_blocked_ids), key=repr
    )
    metrics.append(
        MetricResult(
            name="no_blocked_money_moves",
            passed=not blocked_move_ids and "blocked" not in unresolved_partition,
            details={"blocked_money_move_ids": blocked_move_ids},
        )
    )
    metrics.append(
        MetricResult(
            name="money_move_limit",
            passed=len(money_moves) <= 3,
            numerator=len(money_moves),
            denominator=3,
            details={"actual_count": len(money_moves), "maximum": 3},
        )
    )

    derived_targets: Counter[tuple[Any, Any]] = Counter()
    for move in money_moves:
        item_id = move.get("id")
        if items_by_id.get(item_id, {}).get("type") == "email_owed":
            derived_targets[(item_id, "money_move")] += 1
    for blocked_item in blocked:
        if blocked_item.get("message_needed") is True:
            derived_targets[(blocked_item.get("id"), "unblock")] += 1
    actual_targets = _counter_pairs(drafts)
    metrics.append(
        MetricResult(
            name="draft_target_consistency",
            passed=actual_targets == derived_targets,
            details={
                "derived_targets": _counter_as_rows(derived_targets),
                "actual_targets": _counter_as_rows(actual_targets),
            },
        )
    )

    expected_target_rows = _list_of_mappings(expectations.get("draft_targets", []))
    expected_targets: Counter[tuple[Any, Any]] = Counter()
    unresolved_draft_keys: list[Any] = []
    for target in expected_target_rows:
        key = target.get("key")
        item_id = resolutions.get(key) if isinstance(key, str) else None
        if item_id is None:
            unresolved_draft_keys.append(key)
        else:
            expected_targets[(item_id, target.get("purpose"))] += 1
    metrics.append(
        MetricResult(
            name="draft_targets",
            passed=not unresolved_draft_keys and actual_targets == expected_targets,
            details={
                "expected_targets": _counter_as_rows(expected_targets),
                "actual_targets": _counter_as_rows(actual_targets),
                "unresolved_keys": unresolved_draft_keys,
            },
        )
    )

    parked_draft_ids = sorted(set(bucket_ids["park"]) & {row.get("id") for row in drafts}, key=repr)
    metrics.append(
        MetricResult(
            name="no_parked_drafts",
            passed=not parked_draft_ids,
            details={"parked_draft_ids": parked_draft_ids},
        )
    )

    aggregation_mismatches: list[dict[str, Any]] = []
    for commitment in commitments:
        key = commitment.get("key")
        item_id = resolutions.get(key) if isinstance(key, str) else None
        if item_id is None:
            aggregation_mismatches.append({"key": key, "reason": "unresolved"})
            continue
        expected_value = commitment.get("stated_value")
        if expected_value is None:
            continue
        item = items_by_id.get(item_id, {})
        if item.get("stated_value") != expected_value or not isinstance(item.get("source_text"), str) or expected_value not in item["source_text"]:
            aggregation_mismatches.append(
                {
                    "key": key,
                    "expected": expected_value,
                    "actual": item.get("stated_value"),
                }
            )
    metrics.append(
        MetricResult(
            name="no_value_aggregation",
            passed=not aggregation_mismatches,
            details={"mismatches": aggregation_mismatches},
        )
    )

    missing_fact_value = expectations.get("missing_fact_contains", {})
    missing_fact_expectations = missing_fact_value if _is_mapping(missing_fact_value) else {}
    missing_fact_mismatches: dict[str, dict[str, Any]] = {}
    for key, raw_needles in missing_fact_expectations.items():
        needles = raw_needles if isinstance(raw_needles, list) else [raw_needles]
        item_id = resolutions.get(key) if isinstance(key, str) else None
        actual = scored_by_id.get(item_id, {}).get("missing_fact") if item_id else None
        valid_needles = [needle for needle in needles if isinstance(needle, str) and needle]
        if (
            not isinstance(actual, str)
            or not actual.strip()
            or not valid_needles
            or not any(needle.casefold() in actual.casefold() for needle in valid_needles)
        ):
            missing_fact_mismatches[str(key)] = {
                "expected_any": valid_needles,
                "actual": actual,
            }
    metrics.append(
        MetricResult(
            name="rank_changing_missing_fact",
            passed=not missing_fact_mismatches,
            denominator=len(missing_fact_expectations),
            numerator=len(missing_fact_expectations) - len(missing_fact_mismatches),
            details={"mismatches": missing_fact_mismatches},
        )
    )

    must_not_miss, unresolved_must_not_miss = _resolve_keys(
        expectations.get("must_not_miss", []), resolutions
    )
    omitted_must_not_miss = sorted(set(must_not_miss) - actual_move_set, key=repr)
    metrics.append(
        MetricResult(
            name="must_not_miss_considered",
            passed=not unresolved_must_not_miss and not omitted_must_not_miss,
            required=bool(expectations.get("must_not_miss")),
            numerator=len(must_not_miss) - len(omitted_must_not_miss),
            denominator=len(must_not_miss),
            details={
                "omitted_ids": omitted_must_not_miss,
                "unresolved_keys": unresolved_must_not_miss,
                "contract_note": "Uses the existing Money Moves bucket; no fourth bucket is introduced.",
            },
        )
    )

    return CaseReport(case_id=case_id, metrics=tuple(metrics))


def evaluate_benchmark(
    case_results: Iterable[tuple[Mapping[str, Any], Any]],
) -> BenchmarkReport:
    """Evaluate cases and expose a deterministic aggregate exit code."""

    return BenchmarkReport(
        cases=tuple(evaluate_case(case, result) for case, result in case_results)
    )


def execution_failure_report(case_id: str, exception_type: str, stage: str) -> CaseReport:
    """Create a safe report for a failed live execution without exception text."""

    return CaseReport(
        case_id=case_id,
        metrics=(
            MetricResult(
                name="pipeline_execution",
                passed=False,
                details={
                    "exception_type": exception_type,
                    "stage": stage,
                    "message": "Live pipeline execution failed; provider details were suppressed.",
                },
            ),
        ),
    )
