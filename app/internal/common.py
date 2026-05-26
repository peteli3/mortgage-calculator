from fastapi.templating import Jinja2Templates
from datetime import datetime, timezone
import os

templates = Jinja2Templates(directory="app/templates")

# Get version information
VERSION = os.environ.get("VERSION", "unknown")
GIT_COMMIT = os.environ.get("GIT_COMMIT", "unknown")
RESTART_TIME = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
