#!/usr/bin/env python
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv


def main():
    repo_dir = Path(__file__).resolve().parent.parent
    backend_dir = repo_dir / "backend"

    # Ensure backend directory is in sys.path
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    # If invoked with system Python, transparently delegate to project's .venv python
    venv_python = repo_dir / ".venv" / "Scripts" / "python.exe"
    if venv_python.exists() and sys.executable.lower() != str(venv_python).lower():
        sys.exit(subprocess.call([str(venv_python), *sys.argv]))

    # Load .env from project root
    env_path = repo_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
