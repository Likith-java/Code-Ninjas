"""Email templates for Everest Textile Mills notifications.

Provides HTML and plaintext templates for:
1. Customer order confirmation
2. Production manager order registration
3. Dispatcher order ready for dispatch
"""
from datetime import datetime
from decimal import Decimal
from typing import Any, Sequence


def _format_datetime(dt: datetime | None) -> str:
    if not dt:
        return "N/A"
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def _format_date(dt: datetime | None) -> str:
    if not dt:
        return "N/A"
    return dt.strftime("%Y-%m-%d")


def _format_currency(amount: Decimal | float | None) -> str:
    if amount is None:
        return "N/A"
    return f"${Decimal(str(amount)):,.2f}"


def _format_metres(qty: Decimal | float | None) -> str:
    if qty is None:
        return "0.00"
    return f"{Decimal(str(qty)):,.2f} m"


def render_customer_order_placed(
    order: Any,
    buyer: Any,
    customer_name: str,
    frontend_url: str,
) -> tuple[str, str, str]:
    """
    Renders Customer Confirmation Email:
    Trigger: When a new customer order is successfully created and committed.
    """
    order_id = order.id
    order_ref = f"ETM-ORD-{order_id:06d}"
    order_date_str = _format_datetime(order.order_date)
    deadline_str = _format_date(order.deadline)
    rate_str = _format_currency(order.agreed_rate)
    total_amount = Decimal(str(order.quantity_metres)) * Decimal(str(order.agreed_rate))
    total_str = _format_currency(total_amount)
    qty_str = _format_metres(order.quantity_metres)
    dashboard_link = f"{frontend_url}/orders"

    subject = f"Order Confirmation — Order #{order_id}"

    text_body = f"""EVEREST TEXTILE MILLS — ORDER CONFIRMATION
============================================================

Dear {customer_name},

Thank you for your order. We are pleased to confirm that your order #{order_id} ({order_ref}) has been successfully registered in our factory production system.

ORDER SUMMARY:
------------------------------------------------------------
Order ID:            #{order_id} ({order_ref})
Date Placed:         {order_date_str}
Current Status:      Order Registered (Pending Production)
Fabric Specification:{order.fabric_type}
Colour:              {order.colour}
Ordered Quantity:    {qty_str}
Agreed Rate:         {rate_str} / metre
Estimated Total:     {total_str}
Target Delivery:     {deadline_str}

TRACK YOUR ORDER:
You can track real-time weaving and finishing status anytime in your customer portal:
{dashboard_link}

Thank you for choosing Everest Textile Mills.
For inquiries, please reply to this email or contact support@everesttextiles.com.
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F0E3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #181816;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F5F0E3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border: 2px solid #181816; border-radius: 12px; overflow: hidden; box-shadow: 4px 4px 0px #181816;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0E4B3E; padding: 24px 28px; text-align: left;">
              <div style="color: #FAF7F0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Everest Textile Mills</div>
              <h1 style="color: #FFFFFF; font-size: 20px; font-weight: 700; margin: 4px 0 0 0;">Order Confirmation — Order #{order_id}</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; margin: 0 0 16px 0; color: #181816;">
                Dear <strong>{customer_name}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.5; margin: 0 0 20px 0; color: #374151;">
                Thank you for your order. We are pleased to confirm that your order <strong>#{order_id}</strong> (<span style="font-family: monospace; font-weight: 600; color: #0E4B3E;">{order_ref}</span>) has been successfully verified, committed, and registered into our production schedule.
              </p>

              <!-- Status Badge -->
              <div style="margin-bottom: 24px; padding: 12px 16px; background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #065F46; text-transform: uppercase; letter-spacing: 0.5px;">Status:</span>
                <span style="font-size: 13px; font-weight: 600; color: #047857; margin-left: 6px;">Order Registered &amp; Feasibility Confirmed</span>
              </div>

              <!-- Order Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Order Reference</td>
                  <td style="padding: 10px 0; text-align: right; font-weight: 700; font-family: monospace; color: #0E4B3E;">{order_ref}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Date Placed</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937;">{order_date_str}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Fabric Specification</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937;"><strong>{order.fabric_type}</strong> ({order.colour})</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Ordered Quantity</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937; font-weight: 700;">{qty_str}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Unit Rate</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937;">{rate_str} / m</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Estimated Total</td>
                  <td style="padding: 10px 0; text-align: right; color: #0E4B3E; font-size: 15px; font-weight: 800;">{total_str}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Target Delivery Date</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937; font-weight: 600;">{deadline_str}</td>
                </tr>
              </table>

              <!-- Call to action button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="{dashboard_link}" style="display: inline-block; background-color: #0E4B3E; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; border: 1px solid #0B382F; box-shadow: 2px 2px 0px #181816;">
                      View Order in Customer Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; color: #6B7280; text-align: center; margin: 12px 0 0 0;">
                Direct link: <a href="{dashboard_link}" style="color: #0E4B3E;">{dashboard_link}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF7F0; border-top: 1px solid #E5E7EB; padding: 20px 28px; text-align: center; font-size: 11px; color: #6B7280;">
              <strong>Everest Textile Mills</strong> · Manufacturing Intelligence Platform<br>
              Reference scenario build. Automated system notification.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return subject, text_body, html_body


def render_pm_order_registered(
    order: Any,
    buyer: Any,
    pm_name: str,
    required_materials_desc: str,
    frontend_url: str,
) -> tuple[str, str, str]:
    """
    Renders Production Manager Notification:
    Trigger: Whenever a new order is successfully registered.
    """
    order_id = order.id
    order_ref = f"ETM-ORD-{order_id:06d}"
    order_date_str = _format_datetime(order.order_date)
    deadline_str = _format_date(order.deadline)
    qty_str = _format_metres(order.quantity_metres)
    priority_str = order.priority.upper()
    buyer_name = getattr(buyer, "name", f"Buyer #{order.buyer_id}")
    production_link = f"{frontend_url}/orders"

    subject = f"New Order Registered — Order #{order_id}"

    text_body = f"""EVEREST TEXTILE MILLS — PRODUCTION NOTICE
============================================================

Hello {pm_name},

A new order #{order_id} ({order_ref}) has been successfully placed by {buyer_name} and requires production scheduling.

ORDER SPECIFICATIONS:
------------------------------------------------------------
Order ID:            #{order_id} ({order_ref})
Customer / Buyer:    {buyer_name}
Registration Date:   {order_date_str}
Delivery Deadline:   {deadline_str}
Production Priority: {priority_str}
Current Status:      Pending Machine Allocation & Scheduling

PRODUCT & MATERIAL REQUIREMENTS:
Fabric Type:         {order.fabric_type}
Colour:              {order.colour}
Production Target:   {qty_str}
Yarn Requirements:   {required_materials_desc}

NEXT ACTIONS:
Allocate weaving and finishing looms via the Scheduler / Operations Dashboard:
{production_link}
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F0E3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #181816;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F5F0E3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border: 2px solid #181816; border-radius: 12px; overflow: hidden; box-shadow: 4px 4px 0px #181816;">
          <!-- Header -->
          <tr>
            <td style="background-color: #181816; padding: 24px 28px; text-align: left;">
              <div style="color: #FAF7F0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Production Management Alert</div>
              <h1 style="color: #FFFFFF; font-size: 20px; font-weight: 700; margin: 4px 0 0 0;">New Order Registered — Order #{order_id}</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; margin: 0 0 16px 0; color: #181816;">
                Hello <strong>{pm_name}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.5; margin: 0 0 20px 0; color: #374151;">
                A new order has been confirmed and added to the factory registry for customer <strong>{buyer_name}</strong>. Please review yarn allocations and initialize machine scheduling.
              </p>

              <!-- Priority & Status Banner -->
              <div style="margin-bottom: 24px; padding: 12px 16px; background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; display: flex; justify-content: space-between;">
                <div>
                  <span style="font-size: 11px; font-weight: 700; color: #92400E; text-transform: uppercase;">Priority:</span>
                  <strong style="font-size: 12px; color: #B45309; margin-left: 4px;">{priority_str}</strong>
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 11px; font-weight: 700; color: #92400E; text-transform: uppercase;">Status:</span>
                  <strong style="font-size: 12px; color: #B45309; margin-left: 4px;">Pending Scheduling</strong>
                </div>
              </div>

              <!-- Specs Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Order ID &amp; Ref</td>
                  <td style="padding: 10px 0; text-align: right; font-weight: 700; font-family: monospace; color: #0E4B3E;">#{order_id} ({order_ref})</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Customer / Buyer</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937; font-weight: 600;">{buyer_name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Fabric Spec</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937;">{order.fabric_type} ({order.colour})</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Target Volume</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937; font-weight: 700;">{qty_str}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Yarn Feasibility</td>
                  <td style="padding: 10px 0; text-align: right; color: #0E4B3E; font-weight: 600;">{required_materials_desc}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Delivery Deadline</td>
                  <td style="padding: 10px 0; text-align: right; color: #DC2626; font-weight: 700;">{deadline_str}</td>
                </tr>
              </table>

              <!-- Action button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="{production_link}" style="display: inline-block; background-color: #0E4B3E; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; border: 1px solid #0B382F; box-shadow: 2px 2px 0px #181816;">
                      Open Operations &amp; Scheduling Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF7F0; border-top: 1px solid #E5E7EB; padding: 20px 28px; text-align: center; font-size: 11px; color: #6B7280;">
              <strong>Everest Textile Mills</strong> · Manufacturing Intelligence Platform<br>
              Automated internal notification for authorized production management.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return subject, text_body, html_body


def render_dispatcher_order_ready(
    order: Any,
    buyer: Any,
    dispatcher_name: str,
    passed_rolls: Sequence[Any],
    frontend_url: str,
) -> tuple[str, str, str]:
    """
    Renders Dispatcher Notification:
    Trigger: When the order reaches verified business state 'ready_for_dispatch'
             (passed inspected rolls >= order.quantity_metres).
    """
    order_id = order.id
    order_ref = f"ETM-ORD-{order_id:06d}"
    buyer_name = getattr(buyer, "name", f"Buyer #{order.buyer_id}")
    delivery_address = getattr(buyer, "address", None) or "Standard Destination On File"
    total_passed_metres = sum(Decimal(str(r.metres)) for r in passed_rolls)
    qty_str = _format_metres(order.quantity_metres)
    passed_str = _format_metres(total_passed_metres)
    dispatch_link = f"{frontend_url}/dispatches"

    # Roll codes summary
    roll_codes = [r.roll_code for r in passed_rolls]
    roll_list_desc = ", ".join(roll_codes) if roll_codes else "All required rolls passed inspection"

    subject = f"Order Ready for Dispatch — Order #{order_id}"

    text_body = f"""EVEREST TEXTILE MILLS — DISPATCH READINESS NOTICE
============================================================

Hello {dispatcher_name},

Production and quality inspections are complete for Order #{order_id} ({order_ref}).
The order has achieved full quality approval and is verified READY FOR DISPATCH.

DISPATCH SPECIFICATIONS:
------------------------------------------------------------
Order ID:            #{order_id} ({order_ref})
Customer / Buyer:    {buyer_name}
Delivery Address:    {delivery_address}
Fabric Specification:{order.fabric_type} ({order.colour})
Order Volume:        {qty_str}
Passed Roll Volume:  {passed_str} ({len(passed_rolls)} rolls inspected and passed)
Quality Status:      100% Inspected & Passed (Dispatch Eligible)

PASSED FABRIC ROLLS:
{roll_list_desc}

ACTION REQUIRED:
Please generate the dispatch manifest, record vehicle details, and confirm the shipment:
{dispatch_link}
"""

    # Table rows for fabric rolls
    roll_rows_html = ""
    for r in passed_rolls[:8]:  # show up to 8 rolls in table
        roll_rows_html += f"""
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 8px 0; font-family: monospace; font-weight: 700; color: #0E4B3E;">{r.roll_code}</td>
          <td style="padding: 8px 0; text-align: center; color: #065F46; font-weight: 600;">PASSED</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">{_format_metres(r.metres)}</td>
        </tr>
        """
    if len(passed_rolls) > 8:
        remaining_count = len(passed_rolls) - 8
        roll_rows_html += f"""
        <tr>
          <td colspan="3" style="padding: 8px 0; text-align: center; font-size: 11px; color: #6B7280; font-style: italic;">
            + {remaining_count} additional inspected roll(s) in lot
          </td>
        </tr>
        """

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F0E3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #181816;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F5F0E3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border: 2px solid #181816; border-radius: 12px; overflow: hidden; box-shadow: 4px 4px 0px #181816;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0E4B3E; padding: 24px 28px; text-align: left;">
              <div style="color: #FAF7F0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Dispatch Operations Notice</div>
              <h1 style="color: #FFFFFF; font-size: 20px; font-weight: 700; margin: 4px 0 0 0;">Order Ready for Dispatch — Order #{order_id}</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; margin: 0 0 16px 0; color: #181816;">
                Hello <strong>{dispatcher_name}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.5; margin: 0 0 20px 0; color: #374151;">
                Fabric production and quality inspection gates have been completed for Order <strong>#{order_id}</strong> (<span style="font-family: monospace; font-weight: 600; color: #0E4B3E;">{order_ref}</span>). The order has achieved verified readiness for packaging and logistics dispatch.
              </p>

              <!-- Readiness Gate Badge -->
              <div style="margin-bottom: 24px; padding: 12px 16px; background-color: #ECFDF5; border: 1px solid #10B981; border-radius: 8px;">
                <div style="font-size: 11px; font-weight: 700; color: #065F46; text-transform: uppercase;">Quality Gate Status:</div>
                <div style="font-size: 14px; font-weight: 800; color: #047857; margin-top: 2px;">
                  &#10003; 100% Quality Inspected &amp; Approved for Dispatch
                </div>
              </div>

              <!-- Order Overview -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Customer / Buyer</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937; font-weight: 700;">{buyer_name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Destination Address</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937;">{delivery_address}</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Product Specification</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937;">{order.fabric_type} ({order.colour})</td>
                </tr>
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Target Volume</td>
                  <td style="padding: 10px 0; text-align: right; color: #1F2937; font-weight: 700;">{qty_str}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6B7280; font-weight: 600;">Ready Metres (Passed)</td>
                  <td style="padding: 10px 0; text-align: right; color: #0E4B3E; font-weight: 800; font-size: 14px;">{passed_str}</td>
                </tr>
              </table>

              <!-- Verified Rolls Table -->
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #374151; margin-bottom: 8px;">
                Inspected Rolls Ready for Manifest:
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 24px; font-size: 12px; background-color: #F9FAFB; padding: 8px; border-radius: 6px;">
                <thead>
                  <tr style="border-bottom: 1px solid #D1D5DB; color: #6B7280; font-size: 11px;">
                    <th align="left" style="padding: 6px 0;">Roll Code</th>
                    <th align="center" style="padding: 6px 0;">Inspection</th>
                    <th align="right" style="padding: 6px 0;">Metres</th>
                  </tr>
                </thead>
                <tbody>
                  {roll_rows_html}
                </tbody>
              </table>

              <!-- Dispatch Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="{dispatch_link}" style="display: inline-block; background-color: #0E4B3E; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; border: 1px solid #0B382F; box-shadow: 2px 2px 0px #181816;">
                      Open Dispatch Dashboard to Create Shipment &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF7F0; border-top: 1px solid #E5E7EB; padding: 20px 28px; text-align: center; font-size: 11px; color: #6B7280;">
              <strong>Everest Textile Mills</strong> · Manufacturing Intelligence Platform<br>
              Automated logistics dispatch readiness notification.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return subject, text_body, html_body
