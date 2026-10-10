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
from app.models import User
from app.core.security import hash_password


DEMO_USERS = [
    {
        "email": "admin@everesttextiles.com",
        "password": "admin123",
        "name": "Admin Demo",
        "role": "admin",
    },
    {
        "email": "production@everesttextiles.com",
        "password": "prod123",
        "name": "Production Manager Demo",
        "role": "production_manager",
    },
    {
        "email": "dispatch@everesttextiles.com",
        "password": "dispatch123",
        "name": "Dispatch Manager Demo",
        "role": "dispatch_manager",
    },
    {
        "email": "customer@everesttextiles.com",
        "password": "customer123",
        "name": "Customer Demo",
        "role": "customer",
        "buyer_id": 1,
    },
]


def seed_users(db: Session) -> None:
    print("=" * 70)
    print("SEEDING SYNTHETIC DEMO ACCOUNTS - HACKATHON BUILD ONLY")
    print("NOT FOR PRODUCTION USE")
    print("=" * 70)

    for user_data in DEMO_USERS:
        existing = db.query(User).filter(User.email == user_data["email"]).first()
        if existing:
            if user_data.get("buyer_id") and existing.buyer_id != user_data["buyer_id"]:
                existing.buyer_id = user_data["buyer_id"]
                db.commit()
            print(f"[SKIP] Skipping {user_data['email']} - already exists")
            continue

        user = User(
            name=user_data["name"],
            email=user_data["email"],
            password_hash=hash_password(user_data["password"]),
            role=user_data["role"],
            buyer_id=user_data.get("buyer_id"),
            is_active=True,
        )
        db.add(user)
        print(f"[OK] Created {user_data['role'].upper():20} | {user_data['email']} | password: {user_data['password']}")

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