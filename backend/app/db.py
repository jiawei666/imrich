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
    _migrate_forecasts_constraint(engine)


def _migrate_forecasts_constraint(engine):
    """将 forecasts 表唯一约束从 (code,report_date,source) 迁移到 (code,report_date,source,indicator)。"""
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='forecasts'"
        ))
        if result.fetchone() is None:
            return

        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='uq_forecast' AND tbl_name='forecasts'"
        ))
        if result.fetchone() is not None:
            conn.execute(text(
                "DELETE FROM forecasts WHERE id NOT IN ("
                "  SELECT MIN(id) FROM forecasts GROUP BY code, report_date, source, indicator"
                ")"
            ))
            conn.execute(text("DROP INDEX uq_forecast"))
            conn.execute(text(
                "CREATE UNIQUE INDEX uq_forecast_indicator ON forecasts (code, report_date, source, indicator)"
            ))
            conn.commit()
