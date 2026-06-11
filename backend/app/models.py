from typing import Optional

from sqlalchemy import Float, String, Boolean, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Stock(Base):
    __tablename__ = "stocks"

    code: Mapped[str] = mapped_column(String, primary_key=True)  # 带市场前缀，如 sz000001
    name: Mapped[str] = mapped_column(String, default="")
    market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 亿元
    listed_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 申万行业，阶段2填充
    is_st: Mapped[bool] = mapped_column(Boolean, default=False)
    is_bj: Mapped[bool] = mapped_column(Boolean, default=False)
    delisted_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class _KlineMixin:
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[str] = mapped_column(String)  # 'YYYY-MM-DD'
    open: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)


class KlineDay(_KlineMixin, Base):
    __tablename__ = "kline_day"
    __table_args__ = (UniqueConstraint("code", "date", name="uq_kline_day"),
                      Index("ix_kline_day_code_date", "code", "date"))


class KlineWeek(_KlineMixin, Base):
    __tablename__ = "kline_week"
    __table_args__ = (UniqueConstraint("code", "date", name="uq_kline_week"),)


class KlineMonth(_KlineMixin, Base):
    __tablename__ = "kline_month"
    __table_args__ = (UniqueConstraint("code", "date", name="uq_kline_month"),)


class KlineQuarter(_KlineMixin, Base):
    __tablename__ = "kline_quarter"
    __table_args__ = (UniqueConstraint("code", "date", name="uq_kline_quarter"),)
