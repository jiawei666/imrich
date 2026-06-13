import sqlite3

from app.db import SessionLocal, init_db
from app.models import Forecast


OLD_FORECASTS_SCHEMA = """
CREATE TABLE forecasts (
    id INTEGER NOT NULL,
    code VARCHAR NOT NULL,
    report_date VARCHAR NOT NULL,
    source VARCHAR NOT NULL,
    indicator VARCHAR,
    change_desc VARCHAR,
    change_pct FLOAT,
    forecast_value FLOAT,
    prior_value FLOAT,
    net_profit FLOAT,
    net_profit_yoy FLOAT,
    revenue FLOAT,
    revenue_yoy FLOAT,
    notice_date VARCHAR,
    updated_at VARCHAR,
    PRIMARY KEY (id),
    CONSTRAINT uq_forecast UNIQUE (code, report_date, source)
)
"""


def test_migrate_forecasts_constraint_adds_indicator(db_path):
    """旧库 forecasts 唯一约束为 (code, report_date, source)，缺少 indicator，
    init_db() 应自动迁移为 (code, report_date, source, indicator)。"""
    conn = sqlite3.connect(db_path)
    conn.execute(OLD_FORECASTS_SCHEMA)
    conn.execute("CREATE INDEX ix_forecasts_code ON forecasts (code)")
    conn.execute("CREATE INDEX ix_forecasts_code_date ON forecasts (code, report_date)")
    conn.execute(
        "INSERT INTO forecasts (code, report_date, source, indicator, net_profit) "
        "VALUES ('sz001400', '2024-06-30', 'forecast', '净利润', 100.0)"
    )
    conn.commit()
    conn.close()

    init_db()

    with SessionLocal() as s:
        existing = (
            s.query(Forecast)
            .filter_by(code="sz001400", report_date="2024-06-30", source="forecast")
            .one()
        )
        assert existing.indicator == "净利润"
        assert existing.net_profit == 100.0

        # 迁移后，同一 (code, report_date, source) 不同 indicator 应可插入
        s.add(
            Forecast(
                code="sz001400",
                report_date="2024-06-30",
                source="forecast",
                indicator="扣除非经常性损益的净利润",
            )
        )
        s.commit()

    with SessionLocal() as s:
        rows = (
            s.query(Forecast)
            .filter_by(code="sz001400", report_date="2024-06-30", source="forecast")
            .all()
        )
        assert {r.indicator for r in rows} == {"净利润", "扣除非经常性损益的净利润"}
