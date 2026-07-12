import sys
from pathlib import Path

_here = Path(__file__).resolve().parent
for _cand in (_here.parent / "backend", _here / "backend"):
    if (_cand / "app" / "main.py").is_file():
        sys.path.insert(0, str(_cand))
        break

from fastapi import FastAPI  # noqa: E402
from app.main import app as backend_app  # noqa: E402

app = FastAPI()
app.mount("/api", backend_app)
