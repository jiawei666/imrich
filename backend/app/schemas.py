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
