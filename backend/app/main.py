from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.routers import inventory, materials, orders, rolls, suppliers

app = FastAPI(
    title="Everest Textile Intelligence API",
    description="Orders, buyers, yarn inventory, suppliers, materials, quality inspection and traceability",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


@app.get("/")
def root():
    return {"message": "Everest Textile Intelligence API"}


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(orders.router)
app.include_router(suppliers.router)
app.include_router(materials.router)
app.include_router(inventory.router)
app.include_router(rolls.router)