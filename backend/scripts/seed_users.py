#!/usr/bin/env python
"""
Seed script for synthetic demo users.
Run after applying migrations to create demo accounts for each role.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import engine, SessionLocal
from app.models.user import User
from app.core.security import hash_password


DEMO_USERS = [
    {
        "email": "owner@everesttextiles.com",
        "password": "owner123",
        "name": "Owner Demo",
        "role": "owner",
    },
    {
        "email": "planner@everesttextiles.com",
        "password": "planner123",
        "name": "Planner Demo",
        "role": "planner",
    },
    {
        "email": "store@everesttextiles.com",
        "password": "store123",
        "name": "Storekeeper Demo",
        "role": "storekeeper",
    },
    {
        "email": "supervisor@everesttextiles.com",
        "password": "super123",
        "name": "Supervisor Demo",
        "role": "supervisor",
    },
    {
        "email": "inspector@everesttextiles.com",
        "password": "inspect123",
        "name": "Inspector Demo",
        "role": "inspector",
    },
    {
        "email": "accounts@everesttextiles.com",
        "password": "accounts123",
        "name": "Accounts Demo",
        "role": "accounts",
    },
]


def seed_users(db: Session) -> None:
    print("=" * 70)
    print("SEEDING SYNTHETIC DEMO ACCOUNTS — HACKATHON BUILD ONLY")
    print("NOT FOR PRODUCTION USE")
    print("=" * 70)

    for user_data in DEMO_USERS:
        existing = db.query(User).filter(User.email == user_data["email"]).first()
        if existing:
            print(f"⏭  Skipping {user_data['email']} — already exists")
            continue

        user = User(
            name=user_data["name"],
            email=user_data["email"],
            password_hash=hash_password(user_data["password"]),
            role=user_data["role"],
            is_active=True,
        )
        db.add(user)
        print(f"✅  Created {user_data['role'].upper():12} | {user_data['email']} | password: {user_data['password']}")

    db.commit()

    print("=" * 70)
    print("SYNTHETIC DEMO ACCOUNTS CREATED")
    print("These accounts are for demonstration purposes only.")
    print("Do not use in production.")
    print("=" * 70)


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()