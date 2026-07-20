from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from pdf import generate_invoice_pdf

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

SYSTEM_USER_ID = 1


def _parse_warranty_price(wp: str | None) -> float:
    if not wp:
        return 0.0
    try:
        return float(str(wp).replace("$", "").strip())
    except (ValueError, TypeError):
        return 0.0


@router.get("/", response_model=list[schemas.InvoiceOut])
def list_invoices(store_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Invoice)
    if store_id:
        query = query.filter(models.Invoice.store_id == store_id)
    return query.order_by(models.Invoice.created_at.desc()).all()


@router.post("/", response_model=schemas.InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    item_subtotal = sum(li.quantity * li.unit_price for li in data.line_items)
    warranty_subtotal = sum(_parse_warranty_price(li.warranty_price) for li in data.line_items)
    subtotal = item_subtotal + warranty_subtotal
    tax_amount = round(subtotal * (data.tax_rate / 100), 2)
    total = round(subtotal + tax_amount + data.delivery_fee, 2)

    # Build combined delivery_address string from structured parts
    city_state_zip = f"{data.delivery_city or ''}, {data.delivery_state or ''} {data.delivery_zip or ''}".strip(", ")
    parts = [data.delivery_street or "", city_state_zip]
    delivery_address = ", ".join(p for p in parts if p.strip(", "))

    invoice = models.Invoice(
        store_id=data.store_id,
        created_by=SYSTEM_USER_ID,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_email=data.customer_email,
        salesman=data.salesman,
        delivery_address=delivery_address or None,
        delivery_street=data.delivery_street,
        delivery_city=data.delivery_city,
        delivery_zip=data.delivery_zip,
        delivery_state=data.delivery_state,
        invoice_date=data.invoice_date,
        is_split_payment=data.is_split_payment,
        payment_method=data.payment_method,
        payment_1_method=data.payment_1_method,
        payment_1_amount=data.payment_1_amount,
        payment_2_method=data.payment_2_method,
        payment_2_amount=data.payment_2_amount,
        payment_3_method=data.payment_3_method,
        payment_3_amount=data.payment_3_amount,
        tax_rate=data.tax_rate,
        delivery_fee=data.delivery_fee,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total,
        notes=data.notes,
        has_non_appliance_services=data.has_non_appliance_services,
        non_appliance_description=data.non_appliance_description,
    )
    db.add(invoice)
    db.flush()

    for li in data.line_items:
        item_cost = None
        if li.item_id:
            linked = db.query(models.Item).filter(models.Item.id == li.item_id).first()
            if linked:
                item_cost = linked.cost_price
        line = models.InvoiceItem(
            invoice_id=invoice.id,
            item_id=li.item_id,
            appliance_type=li.appliance_type,
            description=li.description,
            model_number=li.model_number,
            ac_code=li.ac_code,
            kw_code=li.kw_code,
            mfr_serial=li.mfr_serial,
            brand=li.brand,
            quantity=li.quantity,
            unit_price=li.unit_price,
            subtotal=li.quantity * li.unit_price + _parse_warranty_price(li.warranty_price),
            warranty_term=li.warranty_term,
            warranty_price=li.warranty_price,
            warranty_id=li.warranty_id,
            warranty_provider=li.warranty_provider,
            cost_price=item_cost,
        )
        db.add(line)

    for li in data.line_items:
        if li.item_id:
            item = db.query(models.Item).filter(models.Item.id == li.item_id).first()
            if item:
                item.is_in_stock = False

    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    store = db.query(models.Store).filter(models.Store.id == invoice.store_id).first()
    pdf_bytes = generate_invoice_pdf(invoice, store)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice.id}.pdf"},
    )


@router.patch("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(invoice_id: int, data: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(invoice, field, value)
    # Rebuild delivery_address string if structured fields changed
    if any(f in data.model_dump(exclude_unset=True) for f in ("delivery_street", "delivery_city", "delivery_state", "delivery_zip")):
        city_state_zip = f"{invoice.delivery_city or ''}, {invoice.delivery_state or ''} {invoice.delivery_zip or ''}".strip(", ")
        parts = [invoice.delivery_street or "", city_state_zip]
        invoice.delivery_address = ", ".join(p for p in parts if p.strip(", ")) or None
    db.commit()
    db.refresh(invoice)
    return invoice


def _recalculate_invoice(invoice: models.Invoice) -> None:
    """Recalculate subtotal, tax_amount, total_amount from current line items."""
    item_sub = sum(li.quantity * li.unit_price for li in invoice.line_items)
    warranty_sub = sum(_parse_warranty_price(li.warranty_price) for li in invoice.line_items)
    subtotal = item_sub + warranty_sub
    tax_amount = round(subtotal * ((invoice.tax_rate or 0) / 100), 2)
    invoice.subtotal = subtotal
    invoice.tax_amount = tax_amount
    invoice.total_amount = round(subtotal + tax_amount + (invoice.delivery_fee or 0), 2)


@router.patch("/{invoice_id}/line-items/{line_item_id}", response_model=schemas.InvoiceOut)
def update_line_item(
    invoice_id: int, line_item_id: int,
    data: schemas.InvoiceLineItemUpdate, db: Session = Depends(get_db)
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    line = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.id == line_item_id,
        models.InvoiceItem.invoice_id == invoice_id,
    ).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line item not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    if data.quantity is not None or data.unit_price is not None:
        line.subtotal = line.quantity * line.unit_price + _parse_warranty_price(line.warranty_price)
    _recalculate_invoice(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}/line-items/{line_item_id}", response_model=schemas.InvoiceOut)
def delete_line_item(invoice_id: int, line_item_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    line = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.id == line_item_id,
        models.InvoiceItem.invoice_id == invoice_id,
    ).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line item not found")
    if line.item_id:
        item = db.query(models.Item).filter(models.Item.id == line.item_id).first()
        if item:
            item.is_in_stock = True
    db.delete(line)
    db.flush()
    _recalculate_invoice(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/line-items", response_model=schemas.InvoiceOut, status_code=status.HTTP_201_CREATED)
def add_line_item(invoice_id: int, data: schemas.InvoiceItemCreate, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    item_cost = None
    if data.item_id:
        inv_item = db.query(models.Item).filter(models.Item.id == data.item_id).first()
        if inv_item:
            item_cost = inv_item.cost_price
            inv_item.is_in_stock = False
    line = models.InvoiceItem(
        invoice_id=invoice_id,
        item_id=data.item_id,
        appliance_type=data.appliance_type,
        description=data.description,
        model_number=data.model_number,
        ac_code=data.ac_code,
        kw_code=data.kw_code,
        mfr_serial=data.mfr_serial,
        brand=data.brand,
        quantity=data.quantity,
        unit_price=data.unit_price,
        subtotal=data.quantity * data.unit_price + _parse_warranty_price(data.warranty_price),
        warranty_term=data.warranty_term,
        warranty_price=data.warranty_price,
        warranty_id=data.warranty_id,
        warranty_provider=data.warranty_provider,
        cost_price=item_cost,
    )
    db.add(line)
    db.flush()
    _recalculate_invoice(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    for line in invoice.line_items:
        if line.item_id:
            item = db.query(models.Item).filter(models.Item.id == line.item_id).first()
            if item:
                item.is_in_stock = True

    db.delete(invoice)
    db.commit()
