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


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:5173", "http://127.0.0.1:5173"],
)
def test_cors_allows_only_configured_vite_origins(
    client: TestClient,
    origin: str,
) -> None:
    response = client.options(
        "/process",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].casefold()
    assert "access-control-allow-credentials" not in response.headers


def test_cors_rejects_an_unlisted_origin(client: TestClient) -> None:
    response = client.options(
        "/process",
        headers={
            "Origin": "http://localhost:4173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_process_endpoint_passes_valid_input_to_pipeline_and_returns_payload(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    expected = {
        "items": [],
        "scored": [],
        "plan": {"money_moves": [], "park": [], "blocked": []},
        "drafts": [],
    }
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
    caplog: pytest.LogCaptureFixture,
) -> None:
    request_text = "private request body marker"
    api_key = "sk-proj-secret-key-never-expose"
    provider_marker = "raw provider response marker"

    def fail_pipeline(braindump: str, today: str) -> dict[str, Any]:
        try:
            raise RuntimeError(f"{api_key} {provider_marker}")
        except RuntimeError as cause:
            raise PipelineError("SCORE", cause) from cause

    monkeypatch.setattr(main, "run_pipeline", fail_pipeline)

    response = client.post(
        "/process",
        json={"braindump": request_text, "today": "2026-07-12"},
    )

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {
        "error": "pipeline_failed",
        "stage": "SCORE",
        "message": "RuntimeError: pipeline stage failed",
        "detail": "SCORE stage failed: RuntimeError: pipeline stage failed",
    }
    rendered = json.dumps(response.json())
    for sensitive in (request_text, api_key, provider_marker, "Traceback"):
        assert sensitive not in rendered
        assert sensitive not in caplog.text


def test_process_endpoint_sanitizes_an_unexpected_error(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    request_text = "another private request marker"
    api_key = "sk-proj-another-secret-key"
    provider_marker = "provider payload must stay hidden"

    def fail_unexpectedly(braindump: str, today: str) -> dict[str, Any]:
        raise RuntimeError(f"{api_key} {braindump} {provider_marker}")

    monkeypatch.setattr(main, "run_pipeline", fail_unexpectedly)

    response = client.post(
        "/process",
        json={"braindump": request_text, "today": "2026-07-12"},
    )

    assert response.status_code == 500
    assert response.json() == {
        "error": "pipeline_failed",
        "stage": "UNKNOWN",
        "message": "Unexpected pipeline failure",
        "detail": "UNKNOWN stage failed: Unexpected pipeline failure",
    }
    rendered = json.dumps(response.json())
    for sensitive in (request_text, api_key, provider_marker, "Traceback"):
        assert sensitive not in rendered
        assert sensitive not in caplog.text


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
