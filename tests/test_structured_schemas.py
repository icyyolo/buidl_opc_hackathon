from __future__ import annotations

import json

import pytest
from openai.lib._pydantic import to_strict_json_schema

from app.pipeline import DecideOutput, DraftOutput, ExtractOutput, ScoreOutput


@pytest.mark.parametrize(
    "schema",
    [ExtractOutput, ScoreOutput, DecideOutput, DraftOutput],
)
def test_openai_structured_output_schemas_convert_to_strict_json(schema: type) -> None:
    strict_schema = to_strict_json_schema(schema)

    assert strict_schema["additionalProperties"] is False
    assert set(strict_schema["required"]) == set(strict_schema["properties"])
    # The Responses API supports `pattern`, but not JSON Schema string-length
    # keywords. Nonblank text is therefore enforced by Pydantic validators.
    rendered = json.dumps(strict_schema)
    assert "minLength" not in rendered
    assert "maxLength" not in rendered


def test_score_schema_only_generates_the_judgment_delta() -> None:
    strict_schema = to_strict_json_schema(ScoreOutput)

    assert set(strict_schema["$defs"]["ScoreJudgment"]["properties"]) == {
        "id",
        "revenue_motion",
        "revenue_proximity",
        "urgency",
        "evidence",
        "cost_of_delay",
        "missing_fact",
    }
