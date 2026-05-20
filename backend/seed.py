"""Run once to create initial admin user and first store."""
from database import SessionLocal, Base, engine
from models import Store, User
from auth import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

store = Store(name="Main Store", address="123 Main St, Your City, ST 00000")
db.add(store)
db.flush()

admin = User(
    email="admin@store.com",
    name="Admin",
    password_hash=hash_password("changeme123"),
    role="admin",
    store_id=store.id,
)
db.add(admin)
db.commit()
print(f"Created store id={store.id}, admin email=admin@store.com password=changeme123")
db.close()
