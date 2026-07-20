from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from database import Base


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    address = Column(String(255))
    phone = Column(String(50))
    fax = Column(String(50))

    users = relationship("User", back_populates="store")
    items = relationship("Item", back_populates="store")
    invoices = relationship("Invoice", back_populates="store")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="employee")  # admin | employee
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    is_active = Column(Boolean, default=True)

    store = relationship("Store", back_populates="users")
    invoices = relationship("Invoice", back_populates="created_by_user")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)

    # Identification
    ac_code = Column(String(100), index=True)          # internal A/C code
    name = Column(String(255), nullable=False)
    brand = Column(String(100))
    appliance_type = Column(String(100))               # Dryer, Washer, Refrigerator, etc.
    model_name = Column(String(255))                   # marketing name, e.g. "Duet"
    model_number = Column(String(100))                 # mfr model #, e.g. "WFW9600TW"
    serial_number = Column(String(150))                # serial # of this specific unit

    # Condition & location
    grade = Column(String(100))                        # condition category, e.g. "k_jade"
    location = Column(String(100))                     # warehouse/store location
    is_in_stock = Column(Boolean, default=True)

    # Shipment tracking
    kw_code = Column(String(100))                      # internal lot/purchase code
    load_number = Column(String(100))
    load_date = Column(DateTime)

    # Pricing
    cost_price = Column(Float, nullable=False, default=0.0)
    sale_price = Column(Float, nullable=False, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = relationship("Store", back_populates="items")
    invoice_items = relationship("InvoiceItem", back_populates="item")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Customer
    customer_name = Column(String(255), nullable=False)
    customer_address = Column(Text)
    customer_phone = Column(String(50))
    customer_email = Column(String(255))

    # Delivery
    delivery_address = Column(Text)

    # Financials
    tax_rate = Column(Float, default=0.0)      # percentage, e.g. 10.25
    delivery_fee = Column(Float, default=0.0)
    subtotal = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)

    # Salesman
    salesman = Column(String(100), nullable=True)

    # Structured delivery address
    delivery_street = Column(String(255), nullable=True)
    delivery_city = Column(String(100), nullable=True)
    delivery_zip = Column(String(20), nullable=True)
    delivery_state = Column(String(50), nullable=True)

    # Invoice date (can differ from created_at)
    invoice_date = Column(DateTime, nullable=True)

    # Split payment
    is_split_payment = Column(Boolean, default=False)
    payment_1_method = Column(String(50), nullable=True)
    payment_1_amount = Column(Float, nullable=True)
    payment_2_method = Column(String(50), nullable=True)
    payment_2_amount = Column(Float, nullable=True)
    payment_3_method = Column(String(50), nullable=True)
    payment_3_amount = Column(Float, nullable=True)

    # Other
    payment_method = Column(String(50), nullable=True)
    notes = Column(Text)
    has_non_appliance_services = Column(Boolean, default=False)
    non_appliance_description = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)

    store = relationship("Store", back_populates="invoices")
    created_by_user = relationship("User", back_populates="invoices")
    line_items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)

    # Item snapshot at time of sale
    appliance_type = Column(String(100))
    description = Column(String(255), nullable=False)
    model_number = Column(String(100))
    ac_code = Column(String(100))              # A4L internal code
    kw_code = Column(String(100))              # KW code shown in parens on invoice
    mfr_serial = Column(String(150))
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)

    # Brand snapshot
    brand = Column(String(100), nullable=True)

    # Warranty
    warranty_term = Column(String(100), default="1 year")
    warranty_price = Column(String(50), default="$0")
    warranty_id = Column(String(100), default="")
    warranty_provider = Column(String(100), default="ONPOINT")

    # Cost snapshot for profit tracking
    cost_price = Column(Float, nullable=True)

    invoice = relationship("Invoice", back_populates="line_items")
    item = relationship("Item", back_populates="invoice_items")
