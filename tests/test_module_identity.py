"""Regression test for duplicate recurring expenses (issue #74).

services/bank_sync.py does `from app import ...` lazily inside a function,
specifically to dodge a circular import at module-load time. When app.py is
launched directly (`python app.py`), Python caches it in sys.modules only as
"__main__". That deferred import used to find no "app" entry in sys.modules
and re-execute the whole app.py file under a second module identity —
creating a second Flask app, DB engine, and BackgroundScheduler that
independently fires the same cron jobs, racing the duplicate-expense check
in apply_due_recurring_expenses() and producing duplicate Expense rows.

This spawns the real app the way production does (`python app.py`) and
triggers the lazy import via the manual bank-sync endpoint, then asserts the
module only ever executed once.
"""

import os
import shutil
import socket
import subprocess
import sys
import time

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_port(port, proc, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        if _port_in_use(port):
            return True
        time.sleep(0.1)
    return False


@pytest.fixture
def isolated_app_copy(tmp_path):
    """Copy app.py/services/static into a scratch dir so instance_path
    (derived from __file__) points at a throwaway SQLite db, never the real
    dev database."""
    for name in ("app.py", "services", "static", "requirements.txt"):
        src = os.path.join(REPO_ROOT, name)
        dst = tmp_path / name
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    return tmp_path


def test_lazy_self_import_does_not_duplicate_scheduler(isolated_app_copy):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    env = {**os.environ, "FLASK_ENV": "production", "APP_PORT": str(port)}
    log_path = isolated_app_copy / "startup.log"
    log_file = log_path.open("w")
    proc = subprocess.Popen(
        [sys.executable, "app.py"],
        cwd=str(isolated_app_copy),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        assert _wait_for_port(port, proc), (
            f"app did not start listening on port {port}; "
            f"exit code: {proc.poll()}\n" + log_path.read_text()
        )

        # Give the scheduler a moment to finish its startup log lines.
        time.sleep(0.5)

        # Triggers services/bank_sync.py's deferred `from app import ...`.
        import urllib.request

        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/bank/sync", method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 200

        time.sleep(0.5)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        log_file.close()
        output = log_path.read_text()

    assert output.count("Database initialized successfully") == 1, (
        "app.py's module-level code ran more than once — the deferred "
        "'from app import ...' in services/bank_sync.py re-executed the "
        "file under a second module identity instead of reusing the "
        "already-running one.\n\n" + output
    )
    assert " - app - " not in output, (
        "logger under module name 'app' appeared — app.py was imported "
        "as a second, independent module instead of reusing '__main__'.\n\n" + output
    )
