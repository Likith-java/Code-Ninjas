"""Notification Service for Everest Textile Mills.

Coordinates recipient resolution, database idempotency tracking,
template rendering, and email dispatch across factory workflows.
"""
from datetime import datetime, timezone
from decimal import Decimal
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import email_config
from app.database import SessionLocal
from app.models import (
    Buyer,
    EmailNotification,
    FabricRoll,
    Material,
    Order,
    User,
    utc_now,
)
from app.services.dispatch import derive_order_status
from app.services.email_templates import (
    render_customer_order_placed,
    render_dispatcher_order_ready,
    render_pm_order_registered,
)

logger = logging.getLogger(__name__)


def send_email_transport(
    to_email: str,
    to_name: str | None,
    subject: str,
    body_text: str,
    body_html: str,
) -> tuple[bool, str | None]:
    """
    Sends an email using standard library smtplib or in-memory test outbox.
    Returns (success, error_message).
    """
    # 1. Automated testing mode
    if email_config.TEST_MODE:
        email_config.TEST_OUTBOX.append(
            {
                "to_email": to_email,
                "to_name": to_name,
                "subject": subject,
                "body_text": body_text,
                "body_html": body_html,
                "sent_at": datetime.now(timezone.utc),
            }
        )
        logger.info(f"[TestOutbox] Recorded mock email to {to_email}: {subject}")
        return True, None

    # 2. Check configuration
    if not email_config.is_smtp_configured():
        msg = "SMTP provider not configured (skipped)"
        logger.info(f"[EmailService] {msg}. Notification to {to_email} skipped.")
        return False, msg

    # 3. Deliver via SMTP
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{email_config.SMTP_FROM_NAME} <{email_config.SMTP_FROM_EMAIL}>"
        msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email

        # Attach text fallback first, then HTML
        part_text = MIMEText(body_text, "plain", "utf-8")
        part_html = MIMEText(body_html, "html", "utf-8")
        msg.attach(part_text)
        msg.attach(part_html)

        if email_config.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(email_config.SMTP_HOST, email_config.SMTP_PORT, timeout=12)
        else:
            server = smtplib.SMTP(email_config.SMTP_HOST, email_config.SMTP_PORT, timeout=12)

        with server:
            if email_config.SMTP_USE_TLS and not email_config.SMTP_USE_SSL:
                server.starttls()
            if email_config.SMTP_USERNAME and email_config.SMTP_PASSWORD:
                server.login(email_config.SMTP_USERNAME, email_config.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"[EmailService] Successfully sent email to {to_email}: {subject}")
        return True, None
    except Exception as exc:
        err_str = f"SMTP error: {exc.__class__.__name__}: {str(exc)}"
        logger.warning(f"[EmailService] Failed delivering email to {to_email}: {err_str}")
        return False, err_str


def resolve_customer_recipient(
    db: Session,
    order: Order,
    current_user: User | None = None,
) -> tuple[str | None, str]:
    """
    Resolves the customer recipient email and name for an order.
    Checks authenticated creator -> Customer user mapped to buyer -> Buyer profile.
    """
    buyer = order.buyer or db.get(Buyer, order.buyer_id)
    buyer_name = getattr(buyer, "name", "Valued Customer")

    # 1. If placed by customer account
    if current_user and current_user.role == "customer" and current_user.email:
        return current_user.email.strip(), current_user.name or buyer_name

    # 2. Look for active customer user account associated with this buyer
    cust_user = db.scalar(
        select(User).where(
            User.buyer_id == order.buyer_id,
            User.role == "customer",
            User.is_active.is_(True),
        ).limit(1)
    )
    if cust_user and cust_user.email:
        return cust_user.email.strip(), cust_user.name or buyer_name

    # 3. Fallback to email on Buyer entity
    if buyer and buyer.email and buyer.email.strip():
        return buyer.email.strip(), buyer.name

    return None, buyer_name


def resolve_production_managers(db: Session) -> list[tuple[str, str]]:
    """
    Resolves authorized active production managers.
    Falls back to active admins if no production manager exists.
    """
    pms = db.scalars(
        select(User).where(
            User.role == "production_manager",
            User.is_active.is_(True),
        )
    ).all()

    recipients = [(u.email.strip(), u.name) for u in pms if u.email and u.email.strip()]
    if recipients:
        return recipients

    # Fallback to active admin accounts
    admins = db.scalars(
        select(User).where(
            User.role == "admin",
            User.is_active.is_(True),
        )
    ).all()
    return [(u.email.strip(), u.name) for u in admins if u.email and u.email.strip()]


def resolve_dispatchers(db: Session) -> list[tuple[str, str]]:
    """
    Resolves authorized active dispatchers / dispatch managers.
    Falls back to active admins if no dispatcher exists.
    """
    dispatchers = db.scalars(
        select(User).where(
            User.role.in_(["dispatch_manager", "dispatcher"]),
            User.is_active.is_(True),
        )
    ).all()

    recipients = [
        (u.email.strip(), u.name)
        for u in dispatchers
        if u.email and u.email.strip()
    ]
    if recipients:
        return recipients

    # Fallback to active admin accounts
    admins = db.scalars(
        select(User).where(
            User.role == "admin",
            User.is_active.is_(True),
        )
    ).all()
    return [(u.email.strip(), u.name) for u in admins if u.email and u.email.strip()]


def send_or_record_notification(
    db: Session,
    order_id: int,
    notification_type: str,
    recipient_email: str | None,
    recipient_name: str,
    recipient_role: str,
    subject: str,
    body_text: str,
    body_html: str,
) -> EmailNotification | None:
    """
    Idempotently records and dispatches an email notification.
    Prevents duplicates through unique constraint and idempotency check.
    """
    # Safe handling of missing recipient email
    if not recipient_email or not recipient_email.strip():
        idempotency_key = f"order_{order_id}_{notification_type}_missing_email"
        existing = db.scalar(
            select(EmailNotification).where(
                EmailNotification.idempotency_key == idempotency_key
            )
        )
        if existing:
            return existing

        record = EmailNotification(
            order_id=order_id,
            notification_type=notification_type,
            recipient_email="unresolved@recipient.local",
            recipient_name=recipient_name,
            recipient_role=recipient_role,
            idempotency_key=idempotency_key,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            status="skipped",
            attempt_count=0,
            last_error="No registered email address found for recipient.",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    recipient_email = recipient_email.strip()
    idempotency_key = f"order_{order_id}_{notification_type}_{recipient_email.lower()}"

    # Check for existing record
    existing = db.scalar(
        select(EmailNotification).where(
            EmailNotification.order_id == order_id,
            EmailNotification.notification_type == notification_type,
            EmailNotification.recipient_email == recipient_email,
        )
    )
    if existing:
        if existing.status == "sent":
            logger.info(
                f"[EmailService] Skipping duplicate notification: {idempotency_key} already sent."
            )
            return existing
        notification = existing
    else:
        notification = EmailNotification(
            order_id=order_id,
            notification_type=notification_type,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            recipient_role=recipient_role,
            idempotency_key=idempotency_key,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            status="pending",
            attempt_count=0,
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)

    # Deliver via transport
    success, err_msg = send_email_transport(
        to_email=recipient_email,
        to_name=recipient_name,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )

    notification.attempt_count += 1
    if success:
        notification.status = "sent"
        notification.sent_at = datetime.now(timezone.utc)
        notification.last_error = None
    else:
        if err_msg and "skipped" in err_msg.lower():
            notification.status = "skipped"
        else:
            notification.status = "failed"
        notification.last_error = err_msg

    db.commit()
    db.refresh(notification)
    return notification


def dispatch_order_placed_notifications(
    order_id: int,
    current_user_id: int | None = None,
) -> None:
    """
    Background Task: Dispatches notifications after order registration commit:
    1. Customer confirmation
    2. Production Manager notification
    """
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            logger.warning(f"[EmailService] Order {order_id} not found for dispatch.")
            return

        buyer = order.buyer or db.get(Buyer, order.buyer_id)
        current_user = db.get(User, current_user_id) if current_user_id else None

        # 1. Customer Confirmation Notification
        cust_email, cust_name = resolve_customer_recipient(db, order, current_user)
        subject_c, text_c, html_c = render_customer_order_placed(
            order=order,
            buyer=buyer,
            customer_name=cust_name,
            frontend_url=email_config.FRONTEND_URL,
        )
        send_or_record_notification(
            db=db,
            order_id=order.id,
            notification_type="customer_order_placed",
            recipient_email=cust_email,
            recipient_name=cust_name,
            recipient_role="customer",
            subject=subject_c,
            body_text=text_c,
            body_html=html_c,
        )

        # 2. Production Manager Notification
        # Calculate yarn requirements summary
        materials = db.scalars(
            select(Material).where(
                Material.material_type.ilike(order.fabric_type),
                Material.colour.ilike(order.colour),
            )
        ).all()
        if materials:
            req_lines = [
                f"{m.specification} (~{Decimal(str(order.quantity_metres)) * Decimal(str(m.yarn_kg_per_metre)):,.2f} kg)"
                for m in materials
            ]
            yarn_summary = ", ".join(req_lines)
        else:
            yarn_summary = "Standard production yarn yarn allocation verified in ledger"

        pm_recipients = resolve_production_managers(db)
        if not pm_recipients:
            # Record skipped PM notification
            subject_pm, text_pm, html_pm = render_pm_order_registered(
                order=order,
                buyer=buyer,
                pm_name="Production Team",
                required_materials_desc=yarn_summary,
                frontend_url=email_config.FRONTEND_URL,
            )
            send_or_record_notification(
                db=db,
                order_id=order.id,
                notification_type="pm_order_registered",
                recipient_email=None,
                recipient_name="Production Team",
                recipient_role="production_manager",
                subject=subject_pm,
                body_text=text_pm,
                body_html=html_pm,
            )
        else:
            for pm_email, pm_name in pm_recipients:
                subject_pm, text_pm, html_pm = render_pm_order_registered(
                    order=order,
                    buyer=buyer,
                    pm_name=pm_name,
                    required_materials_desc=yarn_summary,
                    frontend_url=email_config.FRONTEND_URL,
                )
                send_or_record_notification(
                    db=db,
                    order_id=order.id,
                    notification_type="pm_order_registered",
                    recipient_email=pm_email,
                    recipient_name=pm_name,
                    recipient_role="production_manager",
                    subject=subject_pm,
                    body_text=text_pm,
                    body_html=html_pm,
                )
    except Exception as exc:
        logger.error(f"[EmailService] Error in dispatch_order_placed_notifications: {exc}")
    finally:
        db.close()


def dispatch_order_ready_for_dispatch_notification(order_id: int) -> None:
    """
    Background Task: Dispatches notification to Dispatchers when order reaches
    the verified business condition 'ready_for_dispatch'.
    """
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            return

        # CRITICAL VERIFICATION:
        # Check verified readiness state via derive_order_status
        current_status = derive_order_status(db, order)
        if current_status != "ready_for_dispatch":
            logger.info(
                f"[EmailService] Order {order_id} status is '{current_status}', not 'ready_for_dispatch'. Dispatcher notification skipped."
            )
            return

        # Fetch passed rolls for this order
        passed_rolls = db.scalars(
            select(FabricRoll).where(
                FabricRoll.order_id == order.id,
                FabricRoll.status == "passed",
            ).order_by(FabricRoll.id.asc())
        ).all()

        buyer = order.buyer or db.get(Buyer, order.buyer_id)
        dispatchers = resolve_dispatchers(db)

        if not dispatchers:
            subject_d, text_d, html_d = render_dispatcher_order_ready(
                order=order,
                buyer=buyer,
                dispatcher_name="Dispatch Team",
                passed_rolls=passed_rolls,
                frontend_url=email_config.FRONTEND_URL,
            )
            send_or_record_notification(
                db=db,
                order_id=order.id,
                notification_type="dispatcher_ready_for_dispatch",
                recipient_email=None,
                recipient_name="Dispatch Team",
                recipient_role="dispatch_manager",
                subject=subject_d,
                body_text=text_d,
                body_html=html_d,
            )
        else:
            for d_email, d_name in dispatchers:
                subject_d, text_d, html_d = render_dispatcher_order_ready(
                    order=order,
                    buyer=buyer,
                    dispatcher_name=d_name,
                    passed_rolls=passed_rolls,
                    frontend_url=email_config.FRONTEND_URL,
                )
                send_or_record_notification(
                    db=db,
                    order_id=order.id,
                    notification_type="dispatcher_ready_for_dispatch",
                    recipient_email=d_email,
                    recipient_name=d_name,
                    recipient_role="dispatch_manager",
                    subject=subject_d,
                    body_text=text_d,
                    body_html=html_d,
                )
    except Exception as exc:
        logger.error(
            f"[EmailService] Error in dispatch_order_ready_for_dispatch_notification: {exc}"
        )
    finally:
        db.close()


def retry_failed_notification(db: Session, notification_id: int) -> EmailNotification:
    """
    Manually retries a failed or skipped email notification.
    Authorized for admin users.
    """
    notification = db.get(EmailNotification, notification_id)
    if not notification:
        raise ValueError(f"Notification {notification_id} not found")

    if not notification.recipient_email or notification.recipient_email == "unresolved@recipient.local":
        raise ValueError("Cannot retry notification with missing recipient email address")

    success, err_msg = send_email_transport(
        to_email=notification.recipient_email,
        to_name=notification.recipient_name,
        subject=notification.subject,
        body_text=notification.body_text,
        body_html=notification.body_html,
    )

    notification.attempt_count += 1
    if success:
        notification.status = "sent"
        notification.sent_at = datetime.now(timezone.utc)
        notification.last_error = None
    else:
        if err_msg and "skipped" in err_msg.lower():
            notification.status = "skipped"
        else:
            notification.status = "failed"
        notification.last_error = err_msg

    db.commit()
    db.refresh(notification)
    return notification
