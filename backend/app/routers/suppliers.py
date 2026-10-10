from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Supplier
from app.schemas import SupplierCreate, SupplierOut

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.post(
    "",
    response_model=SupplierOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create yarn supplier",
    description="Registers a new yarn supplier. Rejects duplicate supplier names.",
)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
):
    clean_name = payload.name.strip()
    existing = db.scalar(
        select(Supplier.id).where(func.lower(Supplier.name) == clean_name.lower())
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Supplier with name '{clean_name}' already exists",
        )

    try:
        supplier = Supplier(
            name=clean_name,
            contact=payload.contact.strip() if payload.contact else None,
            email=payload.email.strip() if payload.email else None,
        )
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
        return supplier
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database integrity constraint violation during supplier creation",
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[SupplierOut],
    summary="List yarn suppliers",
    description="Retrieves a paginated list of yarn suppliers.",
)
def list_suppliers(
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=200, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Supplier)
        .order_by(Supplier.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.get(
    "/{supplier_id}",
    response_model=SupplierOut,
    summary="Get supplier by ID",
    description="Retrieves details of a specific yarn supplier.",
)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
):
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplier {supplier_id} not found",
        )
    return supplier
