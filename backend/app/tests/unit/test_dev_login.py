"""Tests for the local-only POST /auth/dev-login bypass."""

import os
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.api.routes import auth
from app.core.auth import verify_password
from app.models.user import User


def _request(host):
    return SimpleNamespace(client=SimpleNamespace(host=host))


def _db():
    db = MagicMock()
    db.users.update_one = AsyncMock()
    db.users.insert_one = AsyncMock(return_value=SimpleNamespace(inserted_id=ObjectId()))
    return db


class TestDevLoginGate(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_by_default_returns_404_without_db(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(auth, "get_database") as db:
            with self.assertRaises(HTTPException) as ctx:
                await auth.dev_login(_request("127.0.0.1"))
        self.assertEqual(ctx.exception.status_code, 404)
        db.assert_not_called()

    async def test_public_client_address_is_refused(self):
        with patch.dict(os.environ, {"ENABLE_DEV_LOGIN": "true"}), patch.object(auth, "get_database") as db:
            with self.assertRaises(HTTPException) as ctx:
                await auth.dev_login(_request("8.8.8.8"))
        self.assertEqual(ctx.exception.status_code, 404)
        db.assert_not_called()

    async def test_loopback_and_docker_gateway_are_allowed(self):
        for host in ("127.0.0.1", "::1", "172.17.0.1", "192.168.65.1"):
            with patch.dict(os.environ, {"ENABLE_DEV_LOGIN": "true"}), \
                 patch.object(auth, "get_database", return_value=_db()), \
                 patch.object(auth, "get_user_by_email", AsyncMock(return_value=None)):
                token = await auth.dev_login(_request(host))
            self.assertEqual(token.token_type, "bearer", host)


class TestDevUserPassword(unittest.IsolatedAsyncioTestCase):
    async def test_new_dev_user_cannot_log_in_with_the_public_password(self):
        db = _db()
        with patch.object(auth, "get_database", return_value=db), \
             patch.object(auth, "get_user_by_email", AsyncMock(return_value=None)):
            user = await auth._upsert_dev_user()
        self.assertFalse(verify_password("devpassword", user.hashed_password))

    async def test_existing_dev_user_with_public_password_is_rotated(self):
        existing = User(
            _id=ObjectId(), firstName="Dev", lastName="User", email="dev@example.com",
            hashed_password=auth.get_password_hash("devpassword"),
            is_active=True, created_at=datetime(2025, 1, 1),
        )
        db = _db()
        with patch.object(auth, "get_database", return_value=db), \
             patch.object(auth, "get_user_by_email", AsyncMock(return_value=existing)):
            user = await auth._upsert_dev_user()
        self.assertFalse(verify_password("devpassword", user.hashed_password))
        update = db.users.update_one.await_args.args[1]["$set"]
        self.assertIn("hashed_password", update)


if __name__ == "__main__":
    unittest.main()
