from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import inventory, orders, rolls

app = FastAPI(
    title="Everest Textile Intelligence API",
    description="Orders, yarn inventory, fabric quality and traceability",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Everest Textile Intelligence API"}


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(orders.router)
app.include_router(inventory.router)
app.include_router(rolls.router)