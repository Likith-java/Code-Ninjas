import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
import qrcode
import qrcode.constants
from qrcode.image.pil import PilImage

ERROR_CORRECT_M = getattr(qrcode.constants, "ERROR_CORRECT_M", 0)

from app.models import MaterialLot, InventoryMovement
from app.schemas import MaterialLotDetailOut, InventoryMovementOut
from app.services.inventory import lot_balance


def get_application_base_url() -> str:
    """
    Returns configured application frontend base URL for resolving QR codes,
    falling back to environment variable or standard origin without hardcoded dev ports.
    """
    return (
        os.getenv("FRONTEND_URL")
        or os.getenv("APP_URL")
        or os.getenv("NEXT_PUBLIC_APP_URL")
        or ""
    ).rstrip("/")


def generate_lot_qr_code(
    lot: MaterialLot,
    base_url: str | None = None,
    image_format: str = "png",
) -> bytes:
    """
    Generates a valid, scannable QR code PNG referencing the specific yarn lot.
    Encodes application path /inventory/lots/{lot.id}?token={qr_token}.
    Does not encode mutable inventory quantities.
    """
    if base_url is None:
        base_url = get_application_base_url()

    # If lot has no qr_token, assign deterministic fallback
    token = lot.qr_token or (f"lot-{lot.id}-{lot.lot_code}" if lot.lot_code else f"lot-{lot.id}")

    # Encode stable application route
    if base_url:
        payload = f"{base_url}/inventory/lots/{lot.id}?token={token}"
    else:
        payload = f"/inventory/lots/{lot.id}?token={token}"

    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=3,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    img = qr.make_image(image_factory=PilImage, fill_color="#181816", back_color="#FFFFFF")
    buf = io.BytesIO()
    img.save(buf, format=image_format.upper())
    return buf.getvalue()


def resolve_lot_by_identifier(db: Session, identifier: str | int) -> MaterialLot:
    """
    Resolves a lot by numeric ID, qr_token, or lot_code safely.
    Handles scanned URLs, JSON strings, or raw tokens.
    """
    query_str = str(identifier).strip()

    # 1. Handle JSON encoded scan payloads (e.g., {"lot_id": 12} or {"token": "..."})
    if query_str.startswith("{") and query_str.endswith("}"):
        try:
            data = json.loads(query_str)
            if isinstance(data, dict):
                candidate = (
                    data.get("lot_id")
                    or data.get("id")
                    or data.get("token")
                    or data.get("qr_token")
                    or data.get("lot_code")
                )
                if candidate is not None:
                    return resolve_lot_by_identifier(db, candidate)
        except Exception:
            pass

    # 2. If scanned input is a URL or path, extract lot_id
    id_match = re.search(r"/inventory/lots/(\d+)", query_str)
    if id_match:
        lot_id = int(id_match.group(1))
        lot = db.scalar(
            select(MaterialLot)
            .options(
                selectinload(MaterialLot.material),
                selectinload(MaterialLot.supplier),
                selectinload(MaterialLot.intended_order),
                selectinload(MaterialLot.movements),
            )
            .where(MaterialLot.id == lot_id)
        )
        if lot:
            return lot

    # Query param match for lotId or id (e.g., ?lotId=123 or &id=123)
    param_id_match = re.search(r"[?&](?:lotId|lot_id|id)=(\d+)", query_str, re.IGNORECASE)
    if param_id_match:
        lot_id = int(param_id_match.group(1))
        lot = db.scalar(
            select(MaterialLot)
            .options(
                selectinload(MaterialLot.material),
                selectinload(MaterialLot.supplier),
                selectinload(MaterialLot.intended_order),
                selectinload(MaterialLot.movements),
            )
            .where(MaterialLot.id == lot_id)
        )
        if lot:
            return lot

    # Token match from URL query param ?token=...
    token_match = re.search(r"[?&]token=([a-zA-Z0-9_\-]+)", query_str)
    if token_match:
        token_val = token_match.group(1)
        lot = db.scalar(
            select(MaterialLot)
            .options(
                selectinload(MaterialLot.material),
                selectinload(MaterialLot.supplier),
                selectinload(MaterialLot.intended_order),
                selectinload(MaterialLot.movements),
            )
            .where(MaterialLot.qr_token == token_val)
        )
        if lot:
            return lot

    # 3. Handle deterministic token pattern (e.g., lot-12-LOT001 or lot-12)
    lot_prefix_match = re.match(r"^lot-(\d+)(?:-.*)?$", query_str)
    if lot_prefix_match:
        lot_id = int(lot_prefix_match.group(1))
        lot = db.scalar(
            select(MaterialLot)
            .options(
                selectinload(MaterialLot.material),
                selectinload(MaterialLot.supplier),
                selectinload(MaterialLot.intended_order),
                selectinload(MaterialLot.movements),
            )
            .where(MaterialLot.id == lot_id)
        )
        if lot:
            return lot

    # 4. Try integer ID
    if isinstance(identifier, int) or (isinstance(query_str, str) and query_str.isdigit()):
        lot_id = int(query_str)
        lot = db.scalar(
            select(MaterialLot)
            .options(
                selectinload(MaterialLot.material),
                selectinload(MaterialLot.supplier),
                selectinload(MaterialLot.intended_order),
                selectinload(MaterialLot.movements),
            )
            .where(MaterialLot.id == lot_id)
        )
        if lot:
            return lot

    # 5. Try exact qr_token
    lot = db.scalar(
        select(MaterialLot)
        .options(
            selectinload(MaterialLot.material),
            selectinload(MaterialLot.supplier),
            selectinload(MaterialLot.intended_order),
            selectinload(MaterialLot.movements),
        )
        .where(MaterialLot.qr_token == query_str)
    )
    if lot:
        return lot

    # 6. Try exact lot_code
    lot = db.scalar(
        select(MaterialLot)
        .options(
            selectinload(MaterialLot.material),
            selectinload(MaterialLot.supplier),
            selectinload(MaterialLot.intended_order),
            selectinload(MaterialLot.movements),
        )
        .where(MaterialLot.lot_code == query_str)
    )
    if lot:
        return lot

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Material lot not found for identifier '{query_str}'",
    )


def build_lot_detail_dto(db: Session, lot: MaterialLot) -> MaterialLotDetailOut:
    """
    Builds the complete lot details DTO with live balance and movement history.
    """
    available = lot_balance(db, lot.id)

    def get_movement_sort_key(m: InventoryMovement) -> datetime:
        if m.movement_date:
            return m.movement_date
        return datetime.min.replace(tzinfo=timezone.utc)

    # Sort movements descending by movement_date safely
    recent_movements = sorted(
        lot.movements,
        key=get_movement_sort_key,
        reverse=True,
    )[:20]

    movements_dto = [
        InventoryMovementOut(
            id=m.id,
            lot_id=m.lot_id,
            order_id=m.order_id,
            movement_type=m.movement_type,
            quantity_kg=m.quantity_kg,
            movement_date=m.movement_date,
            note=m.note,
        )
        for m in recent_movements
    ]

    base_url = get_application_base_url()
    qr_code_url = f"/inventory/lots/{lot.id}/qr" if not base_url else f"{base_url}/inventory/lots/{lot.id}/qr"

    return MaterialLotDetailOut(
        lot_id=lot.id,
        lot_code=lot.lot_code,
        qr_token=lot.qr_token,
        qr_code_url=qr_code_url,
        material_id=lot.material.id,
        material_type=lot.material.material_type,
        colour=lot.material.colour,
        specification=lot.material.specification,
        yarn_kg_per_metre=lot.material.yarn_kg_per_metre,
        supplier_id=lot.supplier.id if lot.supplier else lot.supplier_id,
        supplier_name=lot.supplier.name if lot.supplier else None,
        supplier_contact=lot.supplier.contact if lot.supplier else None,
        initial_received_kg=lot.initial_received_kg,
        available_kg=available,
        intended_order_id=lot.intended_order_id,
        intended_order_code=f"ORD-{lot.intended_order.id:03d}" if lot.intended_order else None,
        lot_cost=lot.lot_cost,
        unit="kg",
        received_at=lot.received_at,
        movements=movements_dto,
        quality_status="Released" if available > 0 else "Depleted",
    )
