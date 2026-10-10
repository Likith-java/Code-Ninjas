"""Notification delivery history and retry router.

Exposes endpoints for auditing email deliveries and retrying failed deliveries.
Access restricted by role-based authorization.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.database import get_db
from app.models import EmailNotification, Order, User
from app.schemas import EmailNotificationOut
from app.services.notification_service import retry_failed_notification

router = APIRouter(prefix="/notifications", tags=["Email Notifications"])


@router.get(
    "",
    response_model=list[EmailNotificationOut],
    summary="List email notification delivery records with filtering",
)
def list_notifications(
    order_id: int | None = Query(None, description="Filter by Order ID"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status (sent, failed, skipped, pending)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(EmailNotification).order_by(EmailNotification.id.desc())

    # Role-based scoping: Customers can strictly only view notifications for their own orders
    if current_user.role == "customer":
        if not current_user.buyer_id:
            return []
        query = query.join(Order, EmailNotification.order_id == Order.id).where(
            Order.buyer_id == current_user.buyer_id
        )
    elif current_user.role not in ("admin", "production_manager", "dispatch_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role not authorized to access notification logs",
        )

    if order_id is not None:
        query = query.where(EmailNotification.order_id == order_id)
    if status_filter is not None:
        query = query.where(EmailNotification.status == status_filter)

    records = db.scalars(query.offset(offset).limit(limit)).all()
    return records


@router.post(
    "/{notification_id}/retry",
    response_model=EmailNotificationOut,
    summary="Retry a failed email notification (Admin only)",
)
def retry_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    record = db.get(EmailNotification, notification_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification record #{notification_id} not found",
        )

    try:
        updated = retry_failed_notification(db, notification_id)
        return updated
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed retrying notification: {str(exc)}",
        )
