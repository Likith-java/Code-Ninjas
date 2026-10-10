from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User

# Four platform roles. admin is NOT self-assignable.
ALLOWED_SELF_SIGNUP_ROLES = {"production_manager", "dispatch_manager", "customer"}
DEFAULT_ROLE = "production_manager"


def _normalise_role(requested: str | None) -> str:
    return requested if requested in ALLOWED_SELF_SIGNUP_ROLES else DEFAULT_ROLE


def register_user(db: Session, *, name: str, email: str, password: str, role: str | None):
    email = email.strip().lower()

    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(400, "An account with this email already exists.")

    user = User(
        name=name.strip(),
        email=email,
        password_hash=hash_password(password),
        role=_normalise_role(role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_access_token(user), "user": user}


def authenticate_user(db: Session, *, email: str, password: str):
    email = email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")

    return {"token": create_access_token(user), "user": user}