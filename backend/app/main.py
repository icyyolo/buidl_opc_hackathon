"""FastAPI routes for Revenue Chief."""

from __future__ import annotations

import logging
import re
from datetime import date

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, field_validator

from .pipeline import PipelineError, run_pipeline

logger = logging.getLogger(__name__)
_ISO_DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")

app = FastAPI(title="Revenue Chief API")


class ProcessIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    braindump: str
    today: str

    @field_validator("braindump")
    @classmethod
    def braindump_cannot_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("braindump must not be blank")
        return value

    @field_validator("today")
    @classmethod
    def today_must_be_iso(cls, value: str) -> str:
        if not _ISO_DATE_RE.fullmatch(value):
            raise ValueError("today must use YYYY-MM-DD format")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("today must be a real ISO calendar date") from exc
        if parsed.isoformat() != value:
            raise ValueError("today must use canonical YYYY-MM-DD format")
        return value


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process", response_model=None)
def process(body: ProcessIn) -> dict | JSONResponse:
    try:
        return run_pipeline(body.braindump, body.today)
    except PipelineError as exc:
        logger.exception("Revenue Chief pipeline failed in %s", exc.stage)
        return JSONResponse(
            status_code=500,
            content={
                "error": "pipeline_failed",
                "stage": exc.stage,
                "message": exc.message,
            },
        )
    except Exception:
        logger.exception("Unexpected Revenue Chief pipeline failure")
        return JSONResponse(
            status_code=500,
            content={
                "error": "pipeline_failed",
                "stage": "UNKNOWN",
                "message": "Unexpected pipeline failure",
            },
        )
