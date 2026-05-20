# Appliances4Less ERP

Internal ERP for an appliance resale business. Tracks inventory, creates invoices, generates PDFs.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python), SQLAlchemy ORM |
| Frontend | React + Vite + Tailwind CSS |
| Database | SQLite (local dev) / PostgreSQL (production via Neon) |
| PDF | fpdf2 |
| Auth | JWT (python-jose) + bcrypt |
| State / Data fetching | React Query (@tanstack/react-query) |
| Forms | react-hook-form |
| Deployment | Render (web service) + Neon (PostgreSQL) |

---

## Project Structure

```
appliance-erp/
├── backend/
│   ├── main.py           # FastAPI app, mounts routers, serves built React frontend from /static
│   ├── models.py         # SQLAlchemy ORM models (source of truth for DB schema)
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── database.py       # DB engine + session (auto-detects SQLite vs PostgreSQL)
│   ├── config.py         # Reads env vars: DATABASE_URL, SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES
│   ├── auth.py           # JWT creation/verification helpers
│   ├── pdf.py            # Invoice PDF generation (fpdf2)
│   ├── seed.py           # Dev seed data script
│   ├── requirements.txt
│   ├── .env              # Local only — never committed
│   └── routers/
│       ├── auth.py       # POST /api/token (login)
│       ├── stores.py     # CRUD /api/stores
│       ├── users.py      # CRUD /api/users
│       ├── inventory.py  # CRUD /api/items
│       └── invoices.py   # CRUD /api/invoices + GET /api/invoices/{id}/pdf
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Router: / → Inventory, /invoices → InvoiceList, /invoices/new → NewInvoice
│   │   ├── main.jsx              # React entry point
│   │   ├── lib/api.js            # Axios instance (base URL /api, attaches JWT from localStorage)
│   │   ├── context/
│   │   │   └── StoreContext.jsx  # Fetches all stores, exposes via useStore()
│   │   ├── components/
│   │   │   ├── Navbar.jsx        # Top nav with store switcher
│   │   │   ├── ItemModal.jsx     # Add/edit inventory item modal
│   │   │   ├── StoreModal.jsx    # Add/edit store modal
│   │   │   └── LocationsModal.jsx
│   │   └── pages/
│   │       ├── Login.jsx         # JWT login form
│   │       ├── Inventory.jsx     # Inventory list (in-stock by default; out-of-stock current month only)
│   │       ├── InvoiceList.jsx   # Monthly sales view with stat cards
│   │       └── NewInvoice.jsx    # Invoice creation form
│   ├── vite.config.js    # Dev proxy: /api → http://localhost:8000
│   └── package.json
├── render.yaml           # Render deployment config
└── .gitignore
```

---

## Database Models

### Store
Represents a physical store location. All other records belong to a store.
- `id`, `name`, `address`, `phone`, `fax`

### User
Employee or admin account.
- `email`, `name`, `password_hash`
- `role`: `"admin"` or `"employee"`
- `store_id` → Store

### Item
One physical appliance unit in inventory.
- `ac_code` — internal A/C tracking code
- `kw_code` — lot/purchase batch code (shown in parens on invoice PDF)
- `appliance_type`, `brand`, `model_number`, `serial_number`
- `grade` — condition (e.g. "k_jade")
- `is_in_stock` — flips to False when sold, True when invoice is deleted
- `cost_price`, `sale_price`

### Invoice
One sales transaction.
- Customer info: `customer_name`, `customer_address`, `customer_phone`, `customer_email`
- Financials: `subtotal`, `tax_rate`, `tax_amount`, `delivery_fee`, `total_amount`
- `payment_method` — Cash / Debit / Credit / Check / Financing / Other
- `has_non_appliance_services`, `non_appliance_description`
- `delivery_address`, `notes`
- `line_items` → list of InvoiceItem (cascade delete)

### InvoiceItem
Snapshot of one item at the time of sale. Preserves history even if Item is later edited.
- `item_id` → Item (nullable — allows non-inventory line items)
- Copied fields: `appliance_type`, `description`, `model_number`, `ac_code`, `kw_code`, `mfr_serial`
- `quantity`, `unit_price`, `subtotal`
- Warranty: `warranty_term`, `warranty_price`, `warranty_id`, `warranty_provider`

**Key behavior:** Deleting an Invoice restores all linked Items to `is_in_stock = True`.

---

## API Routes

All routes prefixed with `/api`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/token` | Login → returns JWT |
| GET/POST | `/api/stores` | List / create stores |
| GET/POST | `/api/users` | List / create users |
| GET/POST/DELETE | `/api/items` | Inventory CRUD |
| GET/POST | `/api/invoices/` | List all / create invoice |
| DELETE | `/api/invoices/{id}` | Delete invoice + restore items to stock |
| GET | `/api/invoices/{id}/pdf` | Stream invoice as PDF |

---

## Key Frontend Patterns

- **API calls**: all go through `src/lib/api.js` (Axios), which attaches `Authorization: Bearer <token>` from `localStorage`
- **Data fetching**: React Query with query keys `["items"]`, `["invoices"]`, `["stores"]`
- **Cache invalidation**: mutations call `qc.invalidateQueries(...)` — deleting an invoice invalidates both `["invoices"]` AND `["items"]`
- **Store filter**: `StoreContext` provides all stores; pages filter client-side by `store_id`
- **Inventory display**: defaults to in-stock; out-of-stock items shown for current month only

---

## Local Development

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in DATABASE_URL and SECRET_KEY
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # proxies /api to localhost:8000
```

`.env` example:
```
DATABASE_URL=sqlite:///./erp.db
SECRET_KEY=any-random-string
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

---

## Adding a New Column

SQLAlchemy `create_all` does NOT add columns to existing tables — only creates tables that don't exist yet.

**Local (SQLite):**
```bash
sqlite3 backend/erp.db "ALTER TABLE <table> ADD COLUMN <col> <type>;"
```

**Production (Neon) — do this BEFORE pushing code:**
1. Neon dashboard → your project → **SQL Editor**
2. Run: `ALTER TABLE <table> ADD COLUMN <col> <type>;`
3. Then push your code changes

If you push first and deploy before running the migration, the app will crash.

---

## Deployment (Render + Neon)

- **Web service**: Render free tier — Python 3.11.9 (pinned via `.python-version`)
- **Database**: Neon free PostgreSQL — never expires, 0.5GB limit (years of runway at current volume)
- **Keep-alive**: UptimeRobot pings `https://appliances4less-erp.onrender.com` every 5 min to prevent free tier sleep
- On first boot, `create_all()` in `main.py` creates all tables automatically
- Vite builds frontend directly into `backend/static/` — FastAPI serves it for all non-API routes

**Environment variables set in Render dashboard:**
| Key | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (`postgresql://...`) |
| `SECRET_KEY` | Random hex string — **save this somewhere safe** (if you ever delete and recreate the Render service, regenerate with `python3 -c "import secrets; print(secrets.token_hex(32))"` and update Render) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` |

**If you delete and recreate the Render service:** all logged-in users get signed out (new SECRET_KEY invalidates old JWTs). Not a data loss — just a forced logout.

**UptimeRobot setup:** [uptimerobot.com](https://uptimerobot.com) → New Monitor → HTTP(S) → URL: `https://appliances4less-erp.onrender.com` → Interval: 5 minutes

---

## PDF Generation (`backend/pdf.py`)

Uses fpdf2 (Letter size). Layout per invoice:
1. Header: store name + address / invoice # + date
2. Bill To (customer) + Bill For (appliances and services)
3. Items table: # | Type | Model | A4L/Serial # | Price | Warranty Details
   - Each item spans 3 rows: main row + 2 sub-rows for warranty ID and provider
4. Other services / tax rate
5. Totals: Subtotal → Delivery Fee → Tax → **Total**
6. Notes (payment method, delivery address, freeform notes)
7. Delivery acceptance sign-off with signature lines
8. Terms and conditions
