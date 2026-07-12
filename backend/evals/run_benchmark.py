"""Command-line Revenue Triage benchmark.

Offline mode is the default: it evaluates saved synthetic results and never
imports the production pipeline.  Passing ``--live`` is the only path that can
call OpenAI.
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from .metrics import (
    BenchmarkReport,
    CaseReport,
    evaluate_case,
    execution_failure_report,
)


CASES_PATH = Path(__file__).with_name("cases.json")
PipelineRunner = Callable[[str, str], Mapping[str, Any]]


class BenchmarkConfigurationError(ValueError):
    """Raised when a benchmark fixture is unsafe or internally inconsistent."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise BenchmarkConfigurationError(message)


def load_cases(path: Path = CASES_PATH) -> list[Mapping[str, Any]]:
    """Load and validate the synthetic fixture document."""

    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BenchmarkConfigurationError(
            f"could not load benchmark fixture ({type(exc).__name__})"
        ) from None

    _require(isinstance(document, dict), "fixture root must be an object")
    _require(document.get("schema_version") == 1, "fixture schema_version must be 1")
    cases = document.get("cases")
    _require(isinstance(cases, list) and cases, "fixture must contain a non-empty cases list")
    _require(all(isinstance(case, dict) for case in cases), "every case must be an object")

    case_ids = [case.get("id") for case in cases]
    _require(
        all(isinstance(case_id, str) and case_id for case_id in case_ids),
        "every case id must be a nonblank string",
    )
    _require(len(case_ids) == len(set(case_ids)), "case ids must be unique")

    for case in cases:
        _validate_case(case)
    return cases


def _validate_case(case: Mapping[str, Any]) -> None:
    case_id = case["id"]
    _require(case.get("synthetic") is True, f"{case_id}: synthetic must be true")
    _require(
        isinstance(case.get("description"), str) and bool(case["description"].strip()),
        f"{case_id}: description must be nonblank",
    )
    _require(
        isinstance(case.get("today"), str) and bool(case["today"]),
        f"{case_id}: today must be present",
    )
    braindump = case.get("braindump")
    _require(isinstance(braindump, str) and bool(braindump.strip()), f"{case_id}: braindump must be nonblank")
    _require(isinstance(case.get("saved_result"), dict), f"{case_id}: saved_result must be an object")

    expectations = case.get("expectations")
    _require(isinstance(expectations, dict), f"{case_id}: expectations must be an object")
    commitments = expectations.get("commitments")
    _require(isinstance(commitments, list) and commitments, f"{case_id}: commitments must be non-empty")
    _require(all(isinstance(item, dict) for item in commitments), f"{case_id}: commitments must be objects")

    keys = [item.get("key") for item in commitments]
    markers = [item.get("marker") for item in commitments]
    _require(all(isinstance(key, str) and key for key in keys), f"{case_id}: commitment keys must be nonblank")
    _require(len(keys) == len(set(keys)), f"{case_id}: commitment keys must be unique")
    _require(
        all(isinstance(marker, str) and marker for marker in markers),
        f"{case_id}: commitment markers must be nonblank",
    )
    _require(len(markers) == len(set(markers)), f"{case_id}: commitment markers must be unique")

    for commitment in commitments:
        key = commitment["key"]
        marker = commitment["marker"]
        _require(marker in braindump, f"{case_id}/{key}: marker must occur in braindump")
        _require("stated_value" in commitment, f"{case_id}/{key}: stated_value must be explicit")
        value = commitment["stated_value"]
        _require(
            value is None or isinstance(value, str),
            f"{case_id}/{key}: stated_value must be a string or null",
        )
        if value is not None:
            _require(value in braindump, f"{case_id}/{key}: stated_value must occur verbatim")
        _require(
            commitment.get("revenue_motion")
            in {"collect", "close", "deliver", "retain", "grow", "operate"},
            f"{case_id}/{key}: invalid revenue_motion",
        )

    known_keys = set(keys)
    partition = expectations.get("partition")
    _require(isinstance(partition, dict), f"{case_id}: partition must be an object")
    partition_keys: list[Any] = []
    for bucket in ("money_moves", "park", "blocked"):
        bucket_keys = partition.get(bucket)
        _require(isinstance(bucket_keys, list), f"{case_id}: partition.{bucket} must be a list")
        partition_keys.extend(bucket_keys)
    _require(
        Counter(partition_keys) == Counter(keys),
        f"{case_id}: expected partition must contain every commitment key exactly once",
    )

    required = expectations.get("required_money_moves")
    allowed = expectations.get("allowed_money_moves")
    _require(isinstance(required, list), f"{case_id}: required_money_moves must be a list")
    _require(isinstance(allowed, list), f"{case_id}: allowed_money_moves must be a list")
    _require(set(required) <= known_keys, f"{case_id}: required_money_moves contains an unknown key")
    _require(set(allowed) <= known_keys, f"{case_id}: allowed_money_moves contains an unknown key")
    _require(set(required) <= set(allowed), f"{case_id}: required moves must be allowed")

    targets = expectations.get("draft_targets")
    _require(isinstance(targets, list), f"{case_id}: draft_targets must be a list")
    for target in targets:
        _require(isinstance(target, dict), f"{case_id}: draft target must be an object")
        _require(target.get("key") in known_keys, f"{case_id}: draft target contains an unknown key")
        _require(
            target.get("purpose") in {"money_move", "unblock"},
            f"{case_id}: draft target has an invalid purpose",
        )

    missing_fact = expectations.get("missing_fact_contains", {})
    _require(isinstance(missing_fact, dict), f"{case_id}: missing_fact_contains must be an object")
    _require(set(missing_fact) <= known_keys, f"{case_id}: missing_fact_contains has an unknown key")
    must_not_miss = expectations.get("must_not_miss", [])
    _require(isinstance(must_not_miss, list), f"{case_id}: must_not_miss must be a list")
    _require(set(must_not_miss) <= known_keys, f"{case_id}: must_not_miss has an unknown key")


def _safe_stage(exc: Exception) -> str:
    stage = getattr(exc, "stage", None)
    allowed = {"INPUT", "EXTRACT", "SCORE", "DECIDE", "PREPARE"}
    return stage if stage in allowed else "UNKNOWN"


def run_cases(
    cases: Sequence[Mapping[str, Any]],
    *,
    live: bool = False,
    pipeline_runner: PipelineRunner | None = None,
) -> BenchmarkReport:
    """Evaluate saved results or explicitly run synthetic inputs through a pipeline."""

    if live and pipeline_runner is None:
        raise BenchmarkConfigurationError("live mode requires a pipeline runner")

    reports: list[CaseReport] = []
    for case in cases:
        case_id = str(case.get("id", "<unknown-case>"))
        if not live:
            # Deliberately ignore pipeline_runner in offline mode.  This is the
            # network boundary tested by the unit suite.
            result = case.get("saved_result")
        else:
            try:
                result = pipeline_runner(str(case["braindump"]), str(case["today"]))
            except Exception as exc:
                reports.append(
                    execution_failure_report(
                        case_id=case_id,
                        exception_type=type(exc).__name__,
                        stage=_safe_stage(exc),
                    )
                )
                continue
        try:
            reports.append(evaluate_case(case, result))
        except Exception as exc:
            # An evaluator bug or severely malformed result must fail cleanly,
            # without echoing raw model/provider data.
            reports.append(
                execution_failure_report(
                    case_id=case_id,
                    exception_type=type(exc).__name__,
                    stage="EVALUATE",
                )
            )
    return BenchmarkReport(cases=tuple(reports))


def _usable_api_key() -> bool:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    lowered = key.casefold()
    return (
        len(key) >= 20
        and key.startswith("sk-")
        and "test-key" not in lowered
        and "placeholder" not in lowered
        and "your-key" not in lowered
    )


def _print_report(report: BenchmarkReport) -> None:
    for case in report.cases:
        failures = case.required_failures
        advisories = case.advisory_failures
        if failures:
            print(f"FAIL {case.case_id}")
            for metric in failures:
                rendered = json.dumps(metric.details, ensure_ascii=False, sort_keys=True, default=repr)
                print(f"  - {metric.name}: {rendered}")
        elif advisories:
            print(f"WARN {case.case_id}")
            for metric in advisories:
                rendered = json.dumps(metric.details, ensure_ascii=False, sort_keys=True, default=repr)
                print(f"  - {metric.name}: {rendered}")
        else:
            print(f"PASS {case.case_id}")

    print(
        "Summary: "
        f"{report.passed_cases}/{len(report.cases)} cases passed; "
        f"{len(report.required_failures)} required failures; "
        f"{len(report.advisory_failures)} advisory failures."
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the Revenue Radar synthetic benchmark.")
    parser.add_argument(
        "--live",
        action="store_true",
        help="send the synthetic cases to OpenAI instead of using saved results",
    )
    args = parser.parse_args(argv)

    try:
        cases = load_cases()
    except BenchmarkConfigurationError as exc:
        print(f"Configuration error: {exc}")
        return 2

    if not args.live:
        print("OFFLINE MODE: evaluating saved synthetic results; no API key or network request is used.")
        report = run_cases(cases)
        _print_report(report)
        return report.exit_code

    # Importing the production module loads .env, but the lazy client means no
    # request occurs before the explicit key check below.
    from backend.app import pipeline

    if not _usable_api_key():
        print("Live mode requires a non-placeholder OPENAI_API_KEY (the key is never printed).")
        return 2

    print(
        "LIVE MODE: the eight synthetic, anonymized case texts will be sent to OpenAI "
        "and API credits will be used. No repository or private user data is included."
    )
    report = run_cases(cases, live=True, pipeline_runner=pipeline.run_pipeline)
    _print_report(report)
    return report.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
