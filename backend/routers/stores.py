from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/stores", tags=["stores"])


@router.get("/", response_model=list[schemas.StoreOut])
def list_stores(db: Session = Depends(get_db)):
    return db.query(models.Store).all()


@router.post("/", response_model=schemas.StoreOut)
def create_store(data: schemas.StoreCreate, db: Session = Depends(get_db)):
    store = models.Store(**data.model_dump())
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.patch("/{store_id}", response_model=schemas.StoreOut)
def update_store(store_id: int, data: schemas.StoreUpdate, db: Session = Depends(get_db)):
    store = db.query(models.Store).filter(models.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(store, field, value)
    db.commit()
    db.refresh(store)
    return store


@router.delete("/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_store(store_id: int, db: Session = Depends(get_db)):
    store = db.query(models.Store).filter(models.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    db.delete(store)
    db.commit()
