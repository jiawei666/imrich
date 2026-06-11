from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_db_path


class Base(DeclarativeBase):
    pass


def _make_engine():
    import os
    os.makedirs(os.path.dirname(get_db_path()) or ".", exist_ok=True)
    return create_engine(f"sqlite:///{get_db_path()}", future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)


def init_db() -> None:
    global engine, SessionLocal
    engine = _make_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)
    import app.models  # noqa: F401  确保模型已注册
    Base.metadata.create_all(engine)
