from fpdf import FPDF
import models

STORE_NAME = "APPLIANCES 4 LESS"

TERMS_AND_CONDITIONS = (
    "GE AS IS PRODUCTS\n\n"
    "Warranty within 7 Days After Purchase:\n"
    "Please contact your store. Above delivery and service fees are not refundable. For reasons other than "
    "functional issues, customers are responsible for sending appliances back to the store by themselves. "
    "After the goods are received, the payment will be refunded according to the customer's payment method "
    "(if customer need merchant pick up the returned goods at home, additional shipping fees will be charged). "
    "Customers are responsible for any service fee / processing fee that may occur during the refund.\n\n"
    "After 7 days:\n"
    "All warranty service will be provided by GE Consumer Service Centers or by GE's authorized CustomerCare."
)


def generate_invoice_pdf(invoice: models.Invoice, store: models.Store) -> bytes:
    pdf = FPDF(format="Letter")
    pdf.add_page()
    pdf.set_margins(14, 12, 14)
    pdf.set_auto_page_break(auto=True, margin=12)

    # ── HEADER ────────────────────────────────────────────────────────────────
    left_w = 110

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(left_w, 8, STORE_NAME, ln=False)
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 8, "INVOICE", ln=True, align="R")

    pdf.set_font("Helvetica", "", 9)
    pdf.cell(left_w, 5, store.address or "", ln=False)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, f"#{invoice.id:05d}  |  {invoice.created_at.strftime('%m/%d/%Y, %-I:%M:%S %p')}", ln=True, align="R")

    if store.phone:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(left_w, 5, f"Phone: {store.phone}", ln=True)

    pdf.ln(3)
    pdf.set_draw_color(0, 0, 0)
    pdf.line(14, pdf.get_y(), 202, pdf.get_y())
    pdf.ln(3)

    # ── BILL TO / BILL FOR ────────────────────────────────────────────────────
    y_bill = pdf.get_y()

    # Left: Bill To
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(left_w, 6, "BILL TO:", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(left_w, 5, invoice.customer_name, ln=True)
    if invoice.customer_address:
        for ln_text in invoice.customer_address.splitlines():
            pdf.cell(left_w, 4, ln_text, ln=True)
    if invoice.customer_phone:
        pdf.cell(left_w, 4, f"Phone: {invoice.customer_phone}", ln=True)
    if invoice.customer_email:
        pdf.cell(left_w, 4, f"Email: {invoice.customer_email}", ln=True)
    y_after_left = pdf.get_y()

    # Right: Bill For
    pdf.set_xy(left_w + 14, y_bill)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, "BILL FOR:", ln=True)
    pdf.set_xy(left_w + 14, pdf.get_y())
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, "Appliances and Services (listed below)", ln=True)
    y_after_right = pdf.get_y()

    pdf.set_y(max(y_after_left, y_after_right))
    pdf.ln(4)
    pdf.line(14, pdf.get_y(), 202, pdf.get_y())
    pdf.ln(3)

    # ── ITEMS TABLE ───────────────────────────────────────────────────────────
    # Columns: # | Type | Model | A4L/Serial # | Price | Warranty Details
    # Total usable width: 215.9 - 14*2 = 187.9 ≈ 188mm
    col_w = [8, 36, 36, 36, 36, 36]
    headers = ["#", "Type", "Model", "A4L/Serial #", "Price", "Warranty Details"]
    aligns = ["C", "L", "L", "L", "C", "L"]

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(0, 0, 0)
    pdf.set_text_color(255, 255, 255)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 6, f" {h}" if aligns[i] == "L" else h, border=0, ln=False, align=aligns[i], fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)

    row_fill = False
    row_h = 6
    sub_h = 5

    for idx, line in enumerate(invoice.line_items, start=1):
        pdf.set_fill_color(248, 248, 248)

        ac = line.ac_code or line.mfr_serial or ""
        kw = f"({line.kw_code})" if line.kw_code else ""
        w_line1 = f"Term: {line.warranty_term or ''}  Price: {line.warranty_price or ''}"
        w_line2 = f"ID: {line.warranty_id or ''}"
        w_line3 = f"Provider: {line.warranty_provider or ''}"

        # Main row
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(col_w[0], row_h, str(idx), border=0, ln=False, align="C", fill=row_fill)
        pdf.cell(col_w[1], row_h, f" {line.appliance_type or ''}", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[2], row_h, f" {line.model_number or ''}", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[3], row_h, f" {ac}", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[4], row_h, f"${line.unit_price:,.0f}", border=0, ln=False, align="C", fill=row_fill)
        pdf.set_font("Helvetica", "", 7)
        pdf.cell(col_w[5], row_h, f" {w_line1}", border=0, ln=True, fill=row_fill)

        # Sub-row 1: kw code + warranty ID
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(110, 110, 110)
        pdf.cell(col_w[0], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[1], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[2], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[3], sub_h, f" {kw}", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[4], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[5], sub_h, f" {w_line2}", border=0, ln=True, fill=row_fill)

        # Sub-row 2: provider
        pdf.cell(col_w[0], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[1], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[2], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[3], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[4], sub_h, "", border=0, ln=False, fill=row_fill)
        pdf.cell(col_w[5], sub_h, f" {w_line3}", border=0, ln=True, fill=row_fill)
        pdf.set_text_color(0, 0, 0)

        row_fill = not row_fill

    pdf.ln(3)
    pdf.line(14, pdf.get_y(), 202, pdf.get_y())
    pdf.ln(3)

    # ── OTHER SERVICES ────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, "Other Services or Items (Non-Appliance):", ln=True)
    pdf.set_font("Helvetica", "", 9)
    answer = "YES" if invoice.has_non_appliance_services else "NO"
    if invoice.has_non_appliance_services and invoice.non_appliance_description:
        pdf.cell(0, 5, f"{answer} — {invoice.non_appliance_description}", ln=True)
    else:
        pdf.cell(0, 5, answer, ln=True)

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, "Tax Rate:", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, f"{invoice.tax_rate:.0f}%" if invoice.tax_rate else "None", ln=True)
    pdf.ln(3)

    # ── TOTALS (right-aligned) ────────────────────────────────────────────────
    label_w = 152
    val_w = 32

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(label_w, 6, "Subtotal :", align="R")
    pdf.cell(val_w, 6, f"$ {invoice.subtotal:,.2f}", align="R", ln=True)

    if invoice.delivery_fee:
        pdf.cell(label_w, 6, "Delivery Fee :", align="R")
        pdf.cell(val_w, 6, f"$ {invoice.delivery_fee:,.2f}", align="R", ln=True)

    if invoice.tax_amount:
        pdf.cell(label_w, 6, f"Tax :", align="R")
        pdf.cell(val_w, 6, f"$ {invoice.tax_amount:,.2f}", align="R", ln=True)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(label_w, 7, "Total :", align="R")
    pdf.cell(val_w, 7, f"$ {invoice.total_amount:,.2f}", align="R", ln=True)

    pdf.ln(3)
    pdf.line(14, pdf.get_y(), 202, pdf.get_y())
    pdf.ln(3)

    # ── NOTES ─────────────────────────────────────────────────────────────────
    has_notes = (
        invoice.payment_method or invoice.notes or invoice.delivery_address or invoice.salesman
        or invoice.is_split_payment
    )
    if has_notes:
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5, "Notes:", ln=True)
        pdf.set_font("Helvetica", "", 8)
        if invoice.salesman:
            pdf.cell(0, 4, f"- Sold by: {invoice.salesman}", ln=True)
        if invoice.is_split_payment:
            for i, (method, amount) in enumerate([
                (invoice.payment_1_method, invoice.payment_1_amount),
                (invoice.payment_2_method, invoice.payment_2_amount),
                (invoice.payment_3_method, invoice.payment_3_amount),
            ], start=1):
                if method or amount:
                    amt_str = f"${amount:,.2f}" if amount is not None else ""
                    pdf.cell(0, 4, f"- Payment {i}: {method or ''} {amt_str}".strip(), ln=True)
        elif invoice.payment_method:
            pdf.cell(0, 4, f"- Payment Method: {invoice.payment_method}", ln=True)
        if invoice.notes:
            for note_line in invoice.notes.splitlines():
                pdf.cell(0, 4, f"- {note_line}", ln=True)
        if invoice.delivery_address:
            pdf.cell(0, 4, f"- Delivery Address: {invoice.delivery_address}", ln=True)
        pdf.ln(3)

    pdf.line(14, pdf.get_y(), 202, pdf.get_y())
    pdf.ln(3)

    # ── TERMS AND CONDITIONS ──────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(0, 5, "- GE AS IS PRODUCTS -", ln=True)
    pdf.set_font("Helvetica", "", 6.5)
    pdf.multi_cell(0, 3.5, TERMS_AND_CONDITIONS)

    pdf.ln(4)
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(0, 5, "Customer Signature: ___________________________", ln=True, align="R")

    return pdf.output()
