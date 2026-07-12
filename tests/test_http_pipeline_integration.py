from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main, pipeline
from app.pipeline import (
    DecideOutput,
    Draft,
    DraftOutput,
    ExtractOutput,
    Item,
    MoneyMove,
    ScoreOutput,
    ScoredItem,
)


def test_process_route_runs_the_complete_pipeline_with_scripted_model_outputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    braindump = "Send Pat the S$500 renewal quote today."
    item = Item(
        id="i1",
        item="Send Pat the renewal quote",
        type="email_owed",
        due_date="2026-07-12",
        stated_value="S$500",
        source_text=braindump,
        context="Pat needs the S$500 renewal quote today.",
    )
    outputs: dict[type[Any], Any] = {
        ExtractOutput: ExtractOutput(items=[item]),
        ScoreOutput: ScoreOutput(
            scored=[
                ScoredItem(
                    **item.model_dump(mode="python"),
                    revenue_motion="close",
                    revenue_proximity=5,
                    urgency=5,
                    evidence="renewal quote today",
                    cost_of_delay="Waiting could delay the renewal decision.",
                    missing_fact=None,
                )
            ]
        ),
        DecideOutput: DecideOutput(
            money_moves=[
                MoneyMove(
                    id="i1",
                    why_today="This advances a live renewal due today.",
                    next_action="Send Pat the S$500 quote.",
                    done_when="The quote is sent.",
                )
            ],
            park=[],
            blocked=[],
        ),
        DraftOutput: DraftOutput(
            drafts=[
                Draft(
                    id="i1",
                    purpose="money_move",
                    subject="Re: Renewal quote",
                    body="Hi Pat, here is the S$500 renewal quote you requested today. Best, Founder",
                )
            ]
        ),
    }
    calls: list[type[Any]] = []

    def fake_call(system: str, user: str, schema: type[Any]) -> Any:
        calls.append(schema)
        return outputs[schema]

    monkeypatch.setattr(pipeline, "_call", fake_call)

    with TestClient(main.app, raise_server_exceptions=False) as client:
        response = client.post(
            "/process",
            json={"braindump": braindump, "today": "2026-07-12"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert list(payload) == ["items", "scored", "plan", "drafts"]
    assert payload["scored"][0]["priority"] == 20
    assert payload["plan"]["money_moves"][0]["id"] == "i1"
    assert payload["drafts"][0]["purpose"] == "money_move"
    assert calls == [ExtractOutput, ScoreOutput, DecideOutput, DraftOutput]
