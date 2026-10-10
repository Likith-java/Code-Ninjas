from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.user import UserRegister, UserLogin, AuthResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    return auth_service.register_user(
        db,
        name=payload.name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    return auth_service.authenticate_user(db, email=payload.email, password=payload.password)