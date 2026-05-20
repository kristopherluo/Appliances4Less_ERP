from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


# Store
class StoreBase(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None


class StoreCreate(StoreBase):
    pass


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None


class StoreOut(StoreBase):
    id: int
    model_config = {"from_attributes": True}


# User
class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "employee"
    store_id: int


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    store_id: int
    is_active: bool
    model_config = {"from_attributes": True}


# Auth
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# Item
class ItemCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    store_id: int
    ac_code: Optional[str] = None
    name: str
    brand: Optional[str] = None
    appliance_type: Optional[str] = None
    model_name: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    grade: Optional[str] = None
    location: Optional[str] = None
    is_in_stock: bool = True
    kw_code: Optional[str] = None
    load_number: Optional[str] = None
    load_date: Optional[datetime] = None
    cost_price: float
    sale_price: float


class ItemUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}
    ac_code: Optional[str] = None
    name: Optional[str] = None
    brand: Optional[str] = None
    appliance_type: Optional[str] = None
    model_name: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    grade: Optional[str] = None
    location: Optional[str] = None
    is_in_stock: Optional[bool] = None
    kw_code: Optional[str] = None
    load_number: Optional[str] = None
    load_date: Optional[datetime] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None


class ItemOut(BaseModel):
    model_config = {"from_attributes": True, "protected_namespaces": ()}
    id: int
    store_id: int
    ac_code: Optional[str]
    name: str
    brand: Optional[str]
    appliance_type: Optional[str]
    model_name: Optional[str]
    model_number: Optional[str]
    serial_number: Optional[str]
    grade: Optional[str]
    location: Optional[str]
    is_in_stock: bool
    kw_code: Optional[str]
    load_number: Optional[str]
    load_date: Optional[datetime]
    cost_price: float
    sale_price: float
    created_at: datetime
    updated_at: datetime


# Invoice
class InvoiceItemCreate(BaseModel):
    item_id: Optional[int] = None
    appliance_type: Optional[str] = None
    description: str
    model_number: Optional[str] = None
    ac_code: Optional[str] = None
    kw_code: Optional[str] = None
    mfr_serial: Optional[str] = None
    quantity: int
    unit_price: float
    warranty_term: Optional[str] = "1 year"
    warranty_price: Optional[str] = "$0"
    warranty_id: Optional[str] = ""
    warranty_provider: Optional[str] = "ONPOINT"


class InvoiceItemOut(BaseModel):
    id: int
    item_id: Optional[int]
    appliance_type: Optional[str]
    description: str
    model_number: Optional[str]
    ac_code: Optional[str]
    kw_code: Optional[str]
    mfr_serial: Optional[str]
    quantity: int
    unit_price: float
    subtotal: float
    warranty_term: Optional[str]
    warranty_price: Optional[str]
    warranty_id: Optional[str]
    warranty_provider: Optional[str]
    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    store_id: int
    customer_name: str
    customer_address: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    delivery_address: Optional[str] = None
    payment_method: Optional[str] = None
    tax_rate: float = 0.0
    delivery_fee: float = 0.0
    notes: Optional[str] = None
    has_non_appliance_services: bool = False
    non_appliance_description: Optional[str] = None
    line_items: list[InvoiceItemCreate]


class InvoiceOut(BaseModel):
    id: int
    store_id: int
    created_by: int
    customer_name: str
    customer_address: Optional[str]
    customer_phone: Optional[str]
    customer_email: Optional[str]
    delivery_address: Optional[str]
    payment_method: Optional[str]
    tax_rate: float
    delivery_fee: float
    subtotal: float
    tax_amount: float
    total_amount: float
    notes: Optional[str]
    has_non_appliance_services: bool
    non_appliance_description: Optional[str]
    created_at: datetime
    line_items: list[InvoiceItemOut]
    model_config = {"from_attributes": True}
