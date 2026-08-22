from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Creates dayflow.db in your root folder
SQLALCHEMY_DATABASE_URL = "sqlite:///./dayflow.db"

# check_same_thread=False is required for SQLite + FastAPI
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False} 
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# This is the single source of truth for your models
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()