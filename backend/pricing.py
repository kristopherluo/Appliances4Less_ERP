def parse_warranty_price(wp: str | None) -> float:
    if not wp:
        return 0.0
    try:
        return float(str(wp).replace("$", "").strip())
    except (ValueError, TypeError):
        return 0.0


def compute_totals(line_items, tax_rate: float | None, delivery_fee: float | None) -> dict:
    """Warranties and delivery are not taxed; tax applies to item prices only."""
    items_total = sum(li.quantity * li.unit_price for li in line_items)
    warranty_total = sum(parse_warranty_price(li.warranty_price) for li in line_items)
    tax_amount = round(items_total * ((tax_rate or 0) / 100), 2)
    return {
        "subtotal": items_total + warranty_total,
        "tax_amount": tax_amount,
        "total_amount": round(items_total + warranty_total + tax_amount + (delivery_fee or 0), 2),
    }


def balance_due(invoice) -> float:
    if not invoice.is_split_payment:
        return 0.0
    paid = sum(
        a or 0 for a in (invoice.payment_1_amount, invoice.payment_2_amount, invoice.payment_3_amount)
    )
    return max(round((invoice.total_amount or 0) - paid, 2), 0.0)
