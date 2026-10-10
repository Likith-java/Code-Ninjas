import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers import (
    dispatches,
    downtimes,
    inventory,
    machines,
    materials,
    orders,
    production_runs,
    rolls,
    suppliers,
)

app = FastAPI(
    title="Everest Textile Intelligence API",
    description="Orders, buyers, yarn inventory, machines, production operations, downtime tracking, quality inspection, finished-goods dispatches and traceability",
    version="1.0.0",
)

# Configure CORS origins from environment (comma-separated if multiple)
raw_frontend_origins = os.getenv("FRONTEND_ORIGINS") or os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000"
allowed_origins = [origin.strip() for origin in raw_frontend_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
def integrity_error_handler(request: Request, exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={"detail": "Database integrity constraint violation"},
    )


@app.exception_handler(SQLAlchemyError)
def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    return JSONResponse(
        status_code=500,
        content={"detail": "A database error occurred while processing the request."},
    )


@app.get("/", tags=["System"])
def root():
    return {"message": "Everest Textile Intelligence API"}


@app.get("/health", tags=["System"])
def health():
    return {"status": "ok"}


@app.get("/ready", tags=["System"])
def readiness(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "unavailable"},
        )


app.include_router(orders.router)
app.include_router(suppliers.router)
app.include_router(materials.router)
app.include_router(inventory.router)
app.include_router(machines.router)
app.include_router(production_runs.router)
app.include_router(downtimes.router)
app.include_router(rolls.router)
app.include_router(dispatches.router)