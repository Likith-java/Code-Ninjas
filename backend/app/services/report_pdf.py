"""
Professional PDF report generator for Everest Textile Intelligence using ReportLab.
Renders clean A4 layouts with running headers, footers, KPI cards, and data tables.
"""
import io
from typing import Any
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.report_service import ReportData

# Platform design palette
COLOR_PRIMARY = colors.HexColor("#0E4B3E")      # Rich Mill Forest Green
COLOR_SECONDARY = colors.HexColor("#7D988B")    # Sage Accent
COLOR_ACCENT_BG = colors.HexColor("#FAF7F0")    # Cream Tint
COLOR_DARK_TEXT = colors.HexColor("#181816")    # Charcoal
COLOR_MUTED_TEXT = colors.HexColor("#555550")   # Medium Gray
COLOR_BORDER = colors.HexColor("#D8D0C0")       # Border Sand
COLOR_ALT_ROW = colors.HexColor("#F7F5EE")      # Soft Sand Zebra


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and draw 'Page X of Y'."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(COLOR_MUTED_TEXT)

        width, height = self._pagesize

        # Running Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(36, height - 28, "EVEREST TEXTILE MILLS — OPERATIONAL INTELLIGENCE")
            self.drawRightString(width - 36, height - 28, "CONFIDENTIAL & AUTHORIZED")
            self.setStrokeColor(COLOR_BORDER)
            self.setLineWidth(0.5)
            self.line(36, height - 32, width - 36, height - 32)

        # Running Footer
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(36, 36, width - 36, 36)

        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawString(36, 24, "System Generated Audit Report • Synthetic Evaluation Data • Everest Textile Mills")
        self.drawRightString(width - 36, 24, footer_text)

        self.restoreState()


def generate_pdf_report(data: ReportData) -> bytes:
    """Generate a high-quality PDF report from ReportData in memory."""
    buffer = io.BytesIO()

    # Landscape A4 for wide table legibility
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=36,
        rightMargin=36,
        topMargin=40,
        bottomMargin=44,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=COLOR_PRIMARY,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=COLOR_DARK_TEXT,
    )

    meta_label_style = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=COLOR_MUTED_TEXT,
    )

    meta_val_style = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=COLOR_DARK_TEXT,
    )

    kpi_val_style = ParagraphStyle(
        "KPIVal",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=18,
        alignment=1,  # Centered
        textColor=COLOR_PRIMARY,
    )

    kpi_lbl_style = ParagraphStyle(
        "KPILbl",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        alignment=1,
        textColor=COLOR_MUTED_TEXT,
    )

    kpi_sub_style = ParagraphStyle(
        "KPISub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=9,
        alignment=1,
        textColor=COLOR_MUTED_TEXT,
    )

    th_style = ParagraphStyle(
        "THStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
    )

    td_style = ParagraphStyle(
        "TDStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=COLOR_DARK_TEXT,
    )

    section_hdr_style = ParagraphStyle(
        "SectionHdr",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=COLOR_PRIMARY,
    )

    story = []

    # 1. Header Banner
    brand_para = Paragraph("EVEREST TEXTILE MILLS", ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=9, textColor=COLOR_SECONDARY, leading=11))
    title_para = Paragraph(data.title, title_style)
    
    header_data = [
        [brand_para, Paragraph(f"Generated: {data.generated_at.strftime('%Y-%m-%d %H:%M UTC')}", meta_val_style)],
        [title_para, Paragraph(f"Target: {data.audience}", meta_val_style)],
    ]
    header_table = Table(header_data, colWidths=[520, 250])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6))

    # Meta bar
    meta_box_data = [[
        Paragraph("<b>Scope Window:</b>", meta_label_style),
        Paragraph(data.date_range_str, meta_val_style),
        Paragraph("<b>Authorized Operator:</b>", meta_label_style),
        Paragraph(data.generated_by, meta_val_style),
        Paragraph("<b>Classification:</b>", meta_label_style),
        Paragraph("INTERNAL USE ONLY", ParagraphStyle("Cls", fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#962C0B"))),
    ]]
    meta_table = Table(meta_box_data, colWidths=[80, 180, 110, 180, 80, 140])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_ACCENT_BG),
        ("BOX", (0, 0), (-1, -1), 1, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # 2. Executive KPI Summary Cards
    if data.kpis:
        kpi_cells = []
        col_w = int(770 / len(data.kpis))
        col_widths = [col_w] * len(data.kpis)

        for k in data.kpis:
            card_content = [
                Paragraph(k.label.upper(), kpi_lbl_style),
                Spacer(1, 2),
                Paragraph(f"{k.value} <font size=8>{k.unit}</font>", kpi_val_style),
                Spacer(1, 2),
                Paragraph(k.subtext, kpi_sub_style),
            ]
            kpi_cells.append(card_content)

        kpi_table = Table([kpi_cells], colWidths=col_widths)
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_ACCENT_BG),
            ("BOX", (0, 0), (-1, -1), 1, COLOR_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 12))

    # 3. Primary Data Table
    story.append(Paragraph("Detailed Operational Records", section_hdr_style))
    story.append(Spacer(1, 4))

    if not data.rows:
        empty_table = Table([[Paragraph("<i>No data records found matching the specified date window and criteria.</i>", td_style)]], colWidths=[770])
        empty_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_ACCENT_BG),
            ("BOX", (0, 0), (-1, -1), 1, COLOR_BORDER),
            ("PADDING", (0, 0), (-1, -1), 14),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        story.append(empty_table)
    else:
        # Compute column widths evenly or proportionally
        num_cols = len(data.headers)
        avail_w = 770
        col_width = int(avail_w / num_cols)
        col_widths = [col_width] * num_cols

        table_rows = []
        # Header row
        hdr_row = [Paragraph(h, th_style) for h in data.headers]
        table_rows.append(hdr_row)

        for row in data.rows:
            formatted_row = [Paragraph(str(cell), td_style) for cell in row]
            table_rows.append(formatted_row)

        t = Table(table_rows, colWidths=col_widths, repeatRows=1)
        t_style = [
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ]
        # Alternating row background
        for r_idx in range(1, len(table_rows)):
            if r_idx % 2 == 0:
                t_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), COLOR_ALT_ROW))

        t.setStyle(TableStyle(t_style))
        story.append(t)

    # 4. Secondary Breakdown Table (if provided)
    if data.secondary_headers and data.secondary_rows:
        story.append(Spacer(1, 14))
        story.append(Paragraph(data.secondary_title or "Supplemental Breakdown", section_hdr_style))
        story.append(Spacer(1, 4))

        sec_cols = len(data.secondary_headers)
        sec_w = int(770 / sec_cols)
        sec_widths = [sec_w] * sec_cols

        sec_table_rows = []
        sec_hdr = [Paragraph(h, th_style) for h in data.secondary_headers]
        sec_table_rows.append(sec_hdr)

        for row in data.secondary_rows:
            formatted_row = [Paragraph(str(cell), td_style) for cell in row]
            sec_table_rows.append(formatted_row)

        sec_table = Table(sec_table_rows, colWidths=sec_widths, repeatRows=1)
        sec_t_style = [
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_SECONDARY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ]
        for r_idx in range(1, len(sec_table_rows)):
            if r_idx % 2 == 0:
                sec_t_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), COLOR_ALT_ROW))
        sec_table.setStyle(TableStyle(sec_t_style))
        story.append(sec_table)

    # 5. Notes / Disclaimers
    if data.notes:
        story.append(Spacer(1, 12))
        notes_content = [Paragraph("<b>Audit & Calculation Notes:</b>", meta_label_style)]
        for n in data.notes:
            notes_content.append(Paragraph(f"• {n}", td_style))
        notes_table = Table([[notes_content]], colWidths=[770])
        notes_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_ACCENT_BG),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(notes_table)

    # Build PDF with dynamic NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)

    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
