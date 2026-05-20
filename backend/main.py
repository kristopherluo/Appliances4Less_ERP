from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from database import Base, engine
from routers import auth, inventory, invoices, stores, users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Appliance Store ERP", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stores.router)
app.include_router(users.router)
app.include_router(inventory.router)
app.include_router(invoices.router)

# Serve React frontend (after build)
static_path = Path(__file__).parent / "static"
assets_path = static_path / "assets"
if assets_path.exists():
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(static_path / "index.html")
