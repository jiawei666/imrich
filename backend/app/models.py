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


class FinancialReport(Base):
    __tablename__ = "financial_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)
    report_date: Mapped[str] = mapped_column(String)
    net_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    net_profit_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    revenue_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gross_margin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("code", "report_date", name="uq_financial_report"),
        Index("ix_financial_reports_code_date", "code", "report_date"),
    )


class Forecast(Base):
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)
    report_date: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    indicator: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    change_desc: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    change_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    forecast_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    prior_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    net_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    net_profit_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    revenue_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notice_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("code", "report_date", "source", name="uq_forecast"),
        Index("ix_forecasts_code_date", "code", "report_date"),
    )


class IndustryIndex(Base):
    __tablename__ = "industry_index"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)
    open: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        UniqueConstraint("code", "date", name="uq_industry_index"),
        Index("ix_industry_index_code_date", "code", "date"),
    )


class ResearchReport(Base):
    __tablename__ = "research_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    report_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String)
    org: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    published_at: Mapped[str] = mapped_column(String, index=True)
    summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    content_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stage: Mapped[str] = mapped_column(String, default="metadata")
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (Index("ix_research_reports_code_date", "code", "published_at"),)
