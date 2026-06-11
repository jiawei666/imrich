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

    model_config = {"from_attributes": True}


class StockListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    data: List[StockListItem]
