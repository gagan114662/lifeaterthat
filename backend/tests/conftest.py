"""Shared pytest fixtures.

Most existing tests (upload contracts, streaming bumpers) were written
before the Supabase JWT dependency landed and don't care about auth —
they exercise business logic only. An autouse fixture here installs a
`get_current_user` override so those tests continue to hit the
handlers without wiring a token on every request.

``tests/bumpers/test_data_isolation.py`` explicitly clears this
override so it can exercise the real 401 / RLS paths.
"""
from __future__ import annotations

import pytest

from app.api.deps import get_current_user
from app.main import app


DEFAULT_TEST_USER = {"id": "test-user-id", "email": "test@example.com"}


@pytest.fixture(autouse=True)
def _default_auth_override():
    app.dependency_overrides[get_current_user] = lambda: DEFAULT_TEST_USER
    try:
        yield DEFAULT_TEST_USER
    finally:
        app.dependency_overrides.pop(get_current_user, None)
