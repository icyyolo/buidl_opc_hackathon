"""Live-key smoke test for the PLAN.md demo input.

Run from the repository root with OPENAI_API_KEY set:
    python -m scratch_test
"""

from __future__ import annotations

import json
from typing import Any

from backend.app.pipeline import run_pipeline

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


def assert_demo_result(result: dict[str, Any]) -> None:
    assert set(result) == {"items", "scored", "plan", "drafts"}
    assert len(result["items"]) == 9

    priorities = [item["priority"] for item in result["scored"]]
    assert priorities == sorted(priorities, reverse=True)
    assert all(item["source_text"] in SAMPLE_BRAINDUMP for item in result["items"])
    assert all(item["evidence"] in SAMPLE_BRAINDUMP for item in result["scored"])

    scored_by_id = {item["id"]: item for item in result["scored"]}
    move_ids = [entry["id"] for entry in result["plan"]["money_moves"]]
    blocked_ids = [entry["id"] for entry in result["plan"]["blocked"]]
    parked_ids = [entry["id"] for entry in result["plan"]["park"]]
    assert len(move_ids) == 3
    assert len(move_ids + blocked_ids + parked_ids) == len(set(move_ids + blocked_ids + parked_ids))
    assert set(move_ids + blocked_ids + parked_ids) == set(scored_by_id)

    def id_containing(needle: str) -> str:
        return next(
            item["id"]
            for item in result["items"]
            if needle.casefold() in (item["source_text"] + " " + item["context"]).casefold()
        )

    acme_id = id_containing("Acme")
    nordic_id = id_containing("Nordic Labs")
    meridian_id = id_containing("Meridian")
    dave_id = id_containing("Dave")
    assert set(move_ids) == {acme_id, nordic_id, meridian_id}
    assert scored_by_id[acme_id]["revenue_motion"] == "close"
    assert scored_by_id[nordic_id]["revenue_motion"] == "collect"
    assert scored_by_id[meridian_id]["revenue_motion"] == "close"
    assert dave_id in blocked_ids

    stated_values = {item["stated_value"] for item in result["items"] if item["stated_value"]}
    assert {"S$12,000/year", "S$4,800", "S$18,000"} <= stated_values

    drafts_by_id = {draft["id"]: draft for draft in result["drafts"]}
    acme_body = drafts_by_id[acme_id]["body"]
    for detail in ("Sarah", "S$12,000/year", "10%", "Friday"):
        assert detail in acme_body
    podcast_id = id_containing("podcast")
    recruiter_id = id_containing("recruiter")
    assert podcast_id not in drafts_by_id
    assert recruiter_id not in drafts_by_id


def main() -> None:
    result = run_pipeline(SAMPLE_BRAINDUMP, TODAY)
    assert_demo_result(result)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
