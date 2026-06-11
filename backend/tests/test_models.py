from sqlalchemy import inspect

import app.db
from app.db import init_db


def test_tables_created(db_path):
    init_db()
    # 注意：init_db() 会重新赋值 app.db.engine/SessionLocal，
    # 因此需通过模块属性访问，避免拿到初始化前的旧引用
    names = set(inspect(app.db.engine).get_table_names())
    assert {"stocks", "kline_day", "kline_week", "kline_month", "kline_quarter"} <= names


def test_insert_stock_and_kline(db_path):
    init_db()
    from app.models import Stock, KlineDay
    with app.db.SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", is_st=False, is_bj=False))
        s.add(KlineDay(code="sz000001", date="2025-01-02",
                       open=10.0, close=10.5, high=10.6, low=9.9, volume=1000.0))
        s.commit()
    with app.db.SessionLocal() as s:
        assert s.get(Stock, "sz000001").name == "平安银行"
        rows = s.query(KlineDay).filter_by(code="sz000001").all()
        assert len(rows) == 1 and rows[0].close == 10.5


def test_fundamental_tables_created(db_path):
    init_db()
    names = set(inspect(app.db.engine).get_table_names())
    assert {"financial_reports", "forecasts", "industry_index"} <= names


def test_insert_fundamental_rows(db_path):
    init_db()
    from app.models import FinancialReport, Forecast, IndustryIndex
    with app.db.SessionLocal() as s:
        s.add(FinancialReport(
            code="sz000001",
            report_date="2025-03-31",
            net_profit=1.0e9,
            net_profit_yoy=60.0,
            revenue=5.0e9,
            revenue_yoy=30.0,
            gross_margin=25.0,
            updated_at="2025-04-20 10:00:00",
        ))
        s.add(Forecast(
            code="sz000001",
            report_date="2025-03-31",
            source="forecast",
            indicator="净利润",
            change_desc="预增",
            change_pct=80.0,
            forecast_value=1.2e9,
            prior_value=6.6e8,
            notice_date="2025-04-10",
            updated_at="2025-04-20 10:00:00",
        ))
        s.add(IndustryIndex(
            code="850111",
            name="银行",
            date="2025-01-02",
            open=100.0,
            close=101.0,
            high=102.0,
            low=99.0,
            volume=1000.0,
        ))
        s.commit()
    with app.db.SessionLocal() as s:
        fr = s.query(FinancialReport).filter_by(code="sz000001").one()
        assert fr.net_profit_yoy == 60.0
        fc = s.query(Forecast).filter_by(code="sz000001").one()
        assert fc.source == "forecast" and fc.change_pct == 80.0
        ii = s.query(IndustryIndex).filter_by(code="850111").one()
        assert ii.name == "银行" and ii.close == 101.0
