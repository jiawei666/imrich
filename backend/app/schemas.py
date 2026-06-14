from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class TechnicalCandidate(BaseModel):
    code: str
    name: str
    industry: str
    close: float
    pctChg: float
    strategyName: str
    triggerDate: str
    diagnostics: Dict[str, float]
    sortKey: str


class KlinePoint(BaseModel):
    date: str
    open: float
    close: float
    high: float
    low: float
    volume: Optional[float] = None
    k: Optional[float] = None
    d: Optional[float] = None
    j: Optional[float] = None
    whiteLine: Optional[float] = None
    yellowLine: Optional[float] = None


class KlineResponse(BaseModel):
    data: List[KlinePoint]
    highLine: float
    highLabel: str


class StockListItem(BaseModel):
    code: str
    name: str
    market_cap: Optional[float] = None
    industry: Optional[str] = None
    is_st: bool = False
    is_bj: bool = False
    listed_at: Optional[str] = None
    updated_at: Optional[str] = None
    close: Optional[float] = None
    pct_chg: Optional[float] = None

    model_config = {"from_attributes": True}


class StockListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    data: List[StockListItem]


class StockSearchItem(BaseModel):
    code: str
    name: str
    close: Optional[float] = None
    pct_chg: Optional[float] = None


class StockSearchResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    data: List[StockSearchItem]


class ScreenSnapshotMeta(BaseModel):
    date: str
    count: int
    updatedAt: str


class StockRow(BaseModel):
    """统一的股票行数据，全市场/搜索/筛选结果共用"""
    code: str
    name: str
    industry: Optional[str] = None
    # 二级行业（即 industry）对应的一级行业，仅筛选结果填充
    parent_industry: Optional[str] = None
    market_cap: Optional[float] = None
    close: Optional[float] = None
    pct_chg: Optional[float] = None
    # 以下仅筛选结果有值
    diagnostics: Optional[Dict[str, float]] = None
    sort_key: Optional[str] = None
    trigger_date: Optional[str] = None


class ScreenResultResponse(BaseModel):
    items: List[StockRow]
    total: int
