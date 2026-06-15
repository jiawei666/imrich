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
    _migrate_stocks_parent_industry(engine)


def _migrate_stocks_parent_industry(engine):
    """旧库 stocks 表缺少 parent_industry 列（模型新增字段后未随 create_all 补全），
    SQLite 支持 ALTER TABLE ADD COLUMN，直接补列即可。"""
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(stocks)"))
        columns = {row[1] for row in result.fetchall()}
        if "parent_industry" in columns:
            return
        conn.execute(text("ALTER TABLE stocks ADD COLUMN parent_industry VARCHAR"))
        conn.commit()


def _migrate_forecasts_constraint(engine):
    """将 forecasts 表唯一约束从 (code,report_date,source) 迁移到 (code,report_date,source,indicator)。

    旧约束由 SQLAlchemy 的 UniqueConstraint(name="uq_forecast") 生成，在 SQLite 中
    是 CREATE TABLE 内的表级约束，对应索引是自动生成的 sqlite_autoindex_*，并不存在
    名为 uq_forecast 的索引，只能通过表的 CREATE 语句文本判断；且 SQLite 不支持
    ALTER TABLE 修改/删除约束，需要重建表。"""
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='forecasts'"
        ))
        row = result.fetchone()
        if row is None or row[0] is None or "uq_forecast_indicator" in row[0]:
            return

        conn.execute(text("ALTER TABLE forecasts RENAME TO forecasts_old"))
        # ALTER TABLE RENAME 不会重命名已有索引，需先释放旧索引名再建新表上的同名索引
        conn.execute(text("DROP INDEX IF EXISTS ix_forecasts_code"))
        conn.execute(text("DROP INDEX IF EXISTS ix_forecasts_code_date"))
        conn.execute(text(
            "CREATE TABLE forecasts ("
            "id INTEGER NOT NULL, "
            "code VARCHAR NOT NULL, "
            "report_date VARCHAR NOT NULL, "
            "source VARCHAR NOT NULL, "
            "indicator VARCHAR, "
            "change_desc VARCHAR, "
            "change_pct FLOAT, "
            "forecast_value FLOAT, "
            "prior_value FLOAT, "
            "net_profit FLOAT, "
            "net_profit_yoy FLOAT, "
            "revenue FLOAT, "
            "revenue_yoy FLOAT, "
            "notice_date VARCHAR, "
            "updated_at VARCHAR, "
            "PRIMARY KEY (id), "
            "CONSTRAINT uq_forecast_indicator UNIQUE (code, report_date, source, indicator)"
            ")"
        ))
        conn.execute(text("CREATE INDEX ix_forecasts_code ON forecasts (code)"))
        conn.execute(text("CREATE INDEX ix_forecasts_code_date ON forecasts (code, report_date)"))
        conn.execute(text(
            "INSERT INTO forecasts SELECT id, code, report_date, source, indicator, "
            "change_desc, change_pct, forecast_value, prior_value, net_profit, "
            "net_profit_yoy, revenue, revenue_yoy, notice_date, updated_at FROM forecasts_old"
        ))
        conn.execute(text("DROP TABLE forecasts_old"))
        conn.commit()
