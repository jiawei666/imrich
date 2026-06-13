from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_db_path


class Base(DeclarativeBase):
    pass


def _make_engine():
    import os
    os.makedirs(os.path.dirname(get_db_path()) or ".", exist_ok=True)
    engine = create_engine(
        f"sqlite:///{get_db_path()}",
        future=True,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)


def init_db() -> None:
    """重建 engine 并按 IMRICH_DB_PATH 重新指向；SessionLocal 原地 reconfigure，
    使已 `from app.db import SessionLocal` 的模块也能用上新 engine。"""
    global engine
    engine = _make_engine()
    SessionLocal.configure(bind=engine)
    import app.models  # noqa: F401  确保模型已注册
    Base.metadata.create_all(engine)
