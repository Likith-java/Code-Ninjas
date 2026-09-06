"""
Dayflow HRMS - Backend FastAPI Application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 1. Import your database tools and models
from backend.database import engine, SessionLocal
from backend import models
from backend.routers import payroll, salary, reports

# 2. Force SQLAlchemy to build all tables instantly on startup
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Dayflow HRMS API",
    version="1.0.0",
    description="Backend API for Dayflow Human Resource Management System",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Include your routers
app.include_router(salary.router)
app.include_router(payroll.router)
app.include_router(reports.router)

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "healthy", "service": "Dayflow HRMS API"}

# --- QUICK MOCK USER INJECTION ---
with SessionLocal() as db:
    if not db.query(models.User).filter(models.User.id == 1).first():
        mock_user = models.User(
            id=1,
            login_id="employee1",
            role="EMPLOYEE",
            requires_password_change=False,
        )
        db.add(mock_user)
        db.commit()
# ---------------------------------