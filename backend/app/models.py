from typing import Optional

from sqlalchemy import Float, Integer, String, Boolean, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Stock(Base):
    __tablename__ = "stocks"

    code: Mapped[str] = mapped_column(String, primary_key=True)  # 带市场前缀，如 sz000001
    name: Mapped[str] = mapped_column(String, default="")
    market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 亿元
    listed_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 申万行业，阶段2填充
    parent_industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 申万一级行业
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
        UniqueConstraint("code", "report_date", "source", "indicator", name="uq_forecast_indicator"),
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


class Industry(Base):
    __tablename__ = "industries"

    code: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    level: Mapped[int] = mapped_column(Integer)
    parent_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class FundamentalCandidate(Base):
    __tablename__ = "fundamental_candidates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    preset_id: Mapped[str] = mapped_column(String, index=True)
    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    industry: Mapped[str] = mapped_column(String, default="")
    score: Mapped[float] = mapped_column(Float)
    signals: Mapped[str] = mapped_column(String)
    extra_signals: Mapped[int] = mapped_column(Integer, default=0)
    net_profit_yoy: Mapped[float] = mapped_column(Float)
    revenue_yoy: Mapped[float] = mapped_column(Float)
    drawdown_from_high: Mapped[float] = mapped_column(Float)
    risks: Mapped[str] = mapped_column(String)
    params_json: Mapped[str] = mapped_column(String)
    rank: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[str] = mapped_column(String)

    __table_args__ = (
        Index("ix_fc_preset_code", "preset_id", "code"),
    )


class IndexConstituent(Base):
    __tablename__ = "index_constituents"

    index_code: Mapped[str] = mapped_column(String, primary_key=True)
    stock_code: Mapped[str] = mapped_column(String, primary_key=True)
    index_name: Mapped[str] = mapped_column(String)


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


class ScreenSnapshot(Base):
    __tablename__ = "screen_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    preset_id: Mapped[str] = mapped_column(String, index=True)
    data_date: Mapped[str] = mapped_column(String)  # 'YYYY-MM-DD'
    params_json: Mapped[str] = mapped_column(String, default="{}")
    candidates_json: Mapped[str] = mapped_column(String, default="[]")
    candidate_count: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("preset_id", "data_date", name="uq_screen_snapshot"),
        Index("ix_screen_snapshot_preset_date", "preset_id", "data_date"),
    )


class RefreshRun(Base):
    """刷新任务组的持久化状态，供进程重启后恢复进度与判定中断。"""

    __tablename__ = "refresh_runs"

    group_key: Mapped[str] = mapped_column(String, primary_key=True)  # kline|fundamental|all
    status: Mapped[str] = mapped_column(String, default="idle")
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    instance_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 写入它时的进程世代 token
    heartbeat_at: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 最近一次真实进度推进的 epoch 秒


class RefreshStepState(Base):
    """刷新任务组内单个步骤的持久化进度。"""

    __tablename__ = "refresh_steps"

    group_key: Mapped[str] = mapped_column(String, primary_key=True)
    idx: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="idle")
    error: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    done: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    elapsed: Mapped[str] = mapped_column(String, default="00:00")
    progress: Mapped[int] = mapped_column(Integer, default=0)
