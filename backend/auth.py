from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# auto_error=False so missing token doesn't immediately 401
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    # No token → return the first admin user (open access mode)
    if not token:
        user = db.query(models.User).filter(models.User.role == "admin", models.User.is_active == True).first()
        if user:
            return user
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No admin user found. Run seed.py.")

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: int = payload.get("sub")
    except JWTError:
        user_id = None

    if user_id:
        user = db.query(models.User).filter(models.User.id == user_id, models.User.is_active == True).first()
        if user:
            return user

    # Invalid token → fall back to admin
    user = db.query(models.User).filter(models.User.role == "admin", models.User.is_active == True).first()
    if user:
        return user
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No admin user found.")


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    return current_user  # open access: everyone is treated as admin
