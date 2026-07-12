from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main
from app.pipeline import PipelineError


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app, raise_server_exceptions=False)


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_process_endpoint_passes_valid_input_to_pipeline_and_returns_payload(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    expected = {"items": [], "scored": [], "plan": {"money_moves": [], "park": [], "blocked": []}, "drafts": []}
    seen: dict[str, str] = {}

    def fake_run_pipeline(braindump: str, today: str) -> dict[str, Any]:
        seen.update(braindump=braindump, today=today)
        return expected

    monkeypatch.setattr(main, "run_pipeline", fake_run_pipeline)

    response = client.post(
        "/process",
        json={"braindump": "A real founder commitment", "today": "2026-07-12"},
    )

    assert response.status_code == 200
    assert response.json() == expected
    assert seen == {
        "braindump": "A real founder commitment",
        "today": "2026-07-12",
    }


def test_process_endpoint_returns_clean_500_naming_the_failing_stage(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    def fail_pipeline(braindump: str, today: str) -> dict[str, Any]:
        try:
            raise RuntimeError("super-secret upstream details")
        except RuntimeError as cause:
            raise PipelineError("SCORE", cause) from cause

    monkeypatch.setattr(main, "run_pipeline", fail_pipeline)

    response = client.post(
        "/process",
        json={"braindump": "A real founder commitment", "today": "2026-07-12"},
    )

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    rendered = json.dumps(response.json()).upper()
    assert "SCORE" in rendered
    assert "SUPER-SECRET" not in rendered


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"today": "2026-07-12"},
        {"braindump": "A commitment"},
        {"braindump": "", "today": "2026-07-12"},
        {"braindump": "  \n\t", "today": "2026-07-12"},
        {"braindump": "A commitment", "today": ""},
        {"braindump": "A commitment", "today": "07/12/2026"},
        {"braindump": "A commitment", "today": "2026-7-2"},
        {"braindump": "A commitment", "today": "2026-02-30"},
        {"braindump": 123, "today": "2026-07-12"},
        {"braindump": "A commitment", "today": 20260712},
    ],
    ids=[
        "missing_both",
        "missing_braindump",
        "missing_today",
        "empty_braindump",
        "whitespace_braindump",
        "empty_date",
        "non_iso_date",
        "non_padded_date",
        "impossible_date",
        "non_string_braindump",
        "non_string_date",
    ],
)
def test_process_endpoint_rejects_invalid_input_without_running_pipeline(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    payload: dict[str, Any],
) -> None:
    called = False

    def should_not_run(braindump: str, today: str) -> dict[str, Any]:
        nonlocal called
        called = True
        raise AssertionError("invalid requests must not reach the pipeline")

    monkeypatch.setattr(main, "run_pipeline", should_not_run)

    response = client.post("/process", json=payload)

    assert response.status_code == 422
    assert called is False

