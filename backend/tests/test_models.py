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
