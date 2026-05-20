from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth import get_current_user
from pdf import generate_invoice_pdf

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("/", response_model=list[schemas.InvoiceOut])
def list_invoices(
    store_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Invoice)
    if current_user.role != "admin":
        query = query.filter(models.Invoice.store_id == current_user.store_id)
    elif store_id:
        query = query.filter(models.Invoice.store_id == store_id)
    return query.order_by(models.Invoice.created_at.desc()).all()


@router.post("/", response_model=schemas.InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    data: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "admin" and data.store_id != current_user.store_id:
        raise HTTPException(status_code=403, detail="Cannot create invoice for another store")

    subtotal = sum(li.quantity * li.unit_price for li in data.line_items)
    tax_amount = round(subtotal * (data.tax_rate / 100), 2)
    total = round(subtotal + tax_amount + data.delivery_fee, 2)

    invoice = models.Invoice(
        store_id=data.store_id,
        created_by=current_user.id,
        customer_name=data.customer_name,
        customer_address=data.customer_address,
        customer_phone=data.customer_phone,
        customer_email=data.customer_email,
        delivery_address=data.delivery_address,
        payment_method=data.payment_method,
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
        line = models.InvoiceItem(
            invoice_id=invoice.id,
            item_id=li.item_id,
            appliance_type=li.appliance_type,
            description=li.description,
            model_number=li.model_number,
            ac_code=li.ac_code,
            kw_code=li.kw_code,
            mfr_serial=li.mfr_serial,
            quantity=li.quantity,
            unit_price=li.unit_price,
            subtotal=li.quantity * li.unit_price,
            warranty_term=li.warranty_term,
            warranty_price=li.warranty_price,
            warranty_id=li.warranty_id,
            warranty_provider=li.warranty_provider,
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
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role != "admin" and invoice.store_id != current_user.store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return invoice


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role != "admin" and invoice.store_id != current_user.store_id:
        raise HTTPException(status_code=403, detail="Access denied")

    store = db.query(models.Store).filter(models.Store.id == invoice.store_id).first()
    pdf_bytes = generate_invoice_pdf(invoice, store)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice.id}.pdf"},
    )


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role != "admin" and invoice.store_id != current_user.store_id:
        raise HTTPException(status_code=403, detail="Access denied")

    for line in invoice.line_items:
        if line.item_id:
            item = db.query(models.Item).filter(models.Item.id == line.item_id).first()
            if item:
                item.is_in_stock = True

    db.delete(invoice)
    db.commit()
