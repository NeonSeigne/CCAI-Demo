#!/usr/bin/env python3
"""Mint a long-lived dev JWT and print a browser snippet that skips the login screen.

This is a standalone dev utility (not part of the app runtime). It ensures a
dev user exists in MongoDB and issues a JWT for it using the backend's own
signing secret/algorithm, so the token is accepted by ``GET /auth/me``.

Run it inside the backend container so it shares the live JWT secret and
MongoDB connection:

    docker compose exec backend python /ccai/scripts/make_dev_token.py

Then paste the printed snippet into the browser DevTools console at
http://localhost:3000 and press Enter. The app reloads straight into chat.
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# The ``app`` package lives under backend/. Make it importable
# whether this script is run from the repo root or inside the container.
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
for candidate in (BACKEND_DIR, REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core.auth import create_access_token, get_password_hash  # noqa: E402

DEFAULT_EMAIL = "dev@example.com"
DEFAULT_PASSWORD = "devpassword"
DEFAULT_FIRST_NAME = "Dev"
DEFAULT_LAST_NAME = "User"


async def upsert_dev_user(db, *, email, password, first_name, last_name):
    """Return the dev user's document, creating it if it does not exist."""
    existing = await db.users.find_one({"email": email})
    if existing:
        # Make sure the account is usable for login.
        if not existing.get("is_active", False):
            await db.users.update_one(
                {"_id": existing["_id"]}, {"$set": {"is_active": True}}
            )
            existing["is_active"] = True
        return existing, False

    now = datetime.utcnow()
    doc = {
        "firstName": first_name,
        "lastName": last_name,
        "email": email,
        "hashed_password": get_password_hash(password),
        "academicStage": None,
        "researchArea": None,
        "created_at": now,
        "last_login": None,
        "is_active": True,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc, True


def build_user_response(doc) -> dict:
    """Shape the user doc like the backend's UserResponse model."""
    created_at = doc.get("created_at")
    last_login = doc.get("last_login")
    return {
        "id": str(doc["_id"]),
        "firstName": doc.get("firstName", ""),
        "lastName": doc.get("lastName", ""),
        "email": doc.get("email", ""),
        "academicStage": doc.get("academicStage"),
        "researchArea": doc.get("researchArea"),
        "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
        "last_login": last_login.isoformat() if isinstance(last_login, datetime) else last_login,
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Dev user email")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Dev user password")
    parser.add_argument("--first-name", default=DEFAULT_FIRST_NAME)
    parser.add_argument("--last-name", default=DEFAULT_LAST_NAME)
    parser.add_argument(
        "--days", type=int, default=3650, help="Token lifetime in days (default: 3650)"
    )
    args = parser.parse_args()

    settings = get_settings()
    mongo_url = settings.mongodb.connection_string
    if not mongo_url:
        print(
            "ERROR: MongoDB connection string is not configured. "
            "Run this inside the backend container so MONGODB_CONNECTION_STRING is set.",
            file=sys.stderr,
        )
        return 1

    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[settings.mongodb.database_name]
        await db.command("ping")

        doc, created = await upsert_dev_user(
            db,
            email=args.email,
            password=args.password,
            first_name=args.first_name,
            last_name=args.last_name,
        )
    finally:
        client.close()

    user = build_user_response(doc)
    token = create_access_token(
        data={"sub": user["id"]}, expires_delta=timedelta(days=args.days)
    )

    user_json = json.dumps(user)
    snippet = (
        f"localStorage.setItem('authToken', {json.dumps(token)});\n"
        f"localStorage.setItem('user', {json.dumps(user_json)});\n"
        f"location.reload();"
    )

    status = "Created" if created else "Reusing existing"
    print("=" * 72)
    print(f"{status} dev user: {user['email']}  (id={user['id']})")
    print(f"Token valid for ~{args.days} days (until "
          f"{(datetime.utcnow() + timedelta(days=args.days)).date().isoformat()}).")
    print("=" * 72)
    print("\nJWT:\n" + token)
    print("\nUser JSON:\n" + user_json)
    print("\n--- Paste this into the browser DevTools console at http://localhost:3000 ---\n")
    print(snippet)
    print("\n--- Optional: verify the token from your host shell ---")
    print(
        "curl -s -o /dev/null -w '%{http_code}\\n' "
        "http://localhost:8000/auth/me "
        f"-H 'Authorization: Bearer {token}'"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
