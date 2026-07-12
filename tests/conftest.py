from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

# The production module may construct the SDK client at import time.  A dummy key
# keeps collection hermetic; every SDK interaction is replaced by a test double.
os.environ.setdefault("OPENAI_API_KEY", "test-key-never-used")
sys.path.insert(0, str(BACKEND))


@pytest.fixture
def sample_braindump() -> str:
    return "\n".join(
        (
            "Acme asked for a S$12,000/year renewal quote today.",
            "Nordic invoice S$4,800 is overdue; email James about payment.",
            "Dave has not sent the logo files, so the redesign is blocked.",
            "Reply to the podcast invitation when there is time.",
        )
    )

