from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Material
from app.schemas import MaterialCreate, MaterialOut

router = APIRouter(prefix="/materials", tags=["Materials"])


@router.post(
    "",
    response_model=MaterialOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create yarn material specification",
    description="Registers a new yarn material with specification, threshold, and conversion factor.",
)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
):
    mat_type = payload.material_type.strip()
    col = payload.colour.strip()
    spec = payload.specification.strip()

    existing = db.scalar(
        select(Material.id).where(
            func.lower(Material.material_type) == mat_type.lower(),
            func.lower(Material.colour) == col.lower(),
            func.lower(Material.specification) == spec.lower(),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Material with type '{mat_type}', colour '{col}', and spec '{spec}' already exists",
        )

    try:
        material = Material(
            material_type=mat_type,
            colour=col,
            specification=spec,
            reorder_threshold_kg=payload.reorder_threshold_kg,
            yarn_kg_per_metre=payload.yarn_kg_per_metre,
        )
        db.add(material)
        db.commit()
        db.refresh(material)
        return material
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database integrity constraint violation: duplicate material specification",
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[MaterialOut],
    summary="List materials",
    description="Retrieves a paginated list of yarn materials with optional type and colour filters.",
)
def list_materials(
    material_type: str | None = Query(default=None, description="Filter by fabric/material type"),
    colour: str | None = Query(default=None, description="Filter by colour"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=200, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    query = select(Material)
    if material_type:
        query = query.where(func.lower(Material.material_type) == material_type.strip().lower())
    if colour:
        query = query.where(func.lower(Material.colour) == colour.strip().lower())

    return db.scalars(
        query.order_by(Material.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.get(
    "/{material_id}",
    response_model=MaterialOut,
    summary="Get material by ID",
    description="Retrieves details of a specific yarn material specification.",
)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
):
    material = db.get(Material, material_id)
    if material is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Material {material_id} not found",
        )
    return material
