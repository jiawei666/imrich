# i'mRich 选股器 · 阶段1（基础设施 + 技术面战法全链路）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通 SQLite ↔ FastAPI ↔ React 整条链路，交付一个独立可用的「技术面战法」选股器（双线战法 / B2 战法），含日/周/月/季 K 线全量刷新与统一 K 线图表。

**Architecture:** 后端 FastAPI + SQLAlchemy(2.0) ORM + 单文件 SQLite，从旧项目 `STOCKTRADEBYZ-m` 原样移植行情抓取（`fetch_kline.py`）与两个技术面 Selector 及其指标纯函数，输入源由 CSV 改为读 `kline_day` 表；行情刷新（任务组A）每日全量删除重抓日K + 重采样出周/月/季K。前端在「全局导航 | 主内容区」之间插入常驻「策略选择侧栏」变三栏，技术面战法选中时主内容区切换为「参数+候选列表 | 统一 PriceChart」两栏。

**Tech Stack:** Python 3.9（通过 `pyenv` 本地已安装 3.9.19，venv 用此版本创建——见 Task 1 Step 2）、FastAPI、uvicorn、SQLAlchemy 2.0、pandas、numpy、scipy、requests、akshare、pytest、httpx（TestClient）；前端 React 19 + Vite + Tailwind + echarts（已有）。全部类型注解使用 `typing.Optional`/`typing.List` 等旧式写法（兼容 3.8/3.9），不使用 PEP 604 的 `X | None` 语法。

**范围说明：** 本计划仅覆盖 spec 第7节的**阶段1**。基本面数据层（阶段2）、研报爬虫与策略1/2（阶段3）、收尾打磨（阶段4）后续各出独立计划。阶段1交付的端点为 `POST /refresh/kline`、`GET /refresh/status`、`GET /presets`（仅技术面预设）、`GET /screen?preset=trend-support|b2`、`GET /stock/{code}/kline`。

**测试约定：** 后端严格 TDD（pytest，先写失败测试）。前端当前**无测试框架**，按 spec 第8节约定 v1 不引入前端测试基础设施——前端任务的验证步骤为 `npm run build` 通过 + 浏览器手动走查；`data/mock.ts` 作为离线 fixture。

**已知前端 lint 基线（与本计划无关，范围外）：** `npm run lint` 在 master 上已有 10 个预存在错误——`select.tsx`/`tabs.tsx` 各2个 `react-refresh/only-export-components`（shadcn风格组件文件本身导出了非组件的辅助项），`PriceChart.tsx` 6个 `react-hooks/refs`（用 `zoomRef`/`asLineRef` 同步 ECharts 缩放状态的既有写法，被新版 `eslint-plugin-react-hooks` 规则标记）。这些与本次集成无关，**不在本计划修复范围**。Task 17 重写 `PriceChart.tsx` 时会保留同样的 ref 模式（同等数量的此类错误），不算新增问题。前端任务不要求 `npm run lint` 全绿，只需 `npm run build` 通过且不引入新的 TS 编译错误。

---

## 文件结构

### 后端（全部新建于 `backend/`）

| 文件 | 职责 |
|---|---|
| `backend/requirements.txt` | Python 依赖锁定 |
| `backend/app/__init__.py` | 包标记（空） |
| `backend/app/config.py` | DB 路径（支持 `IMRICH_DB_PATH` 环境变量覆盖，便于测试） |
| `backend/app/db.py` | SQLAlchemy engine / SessionLocal / Base / `init_db()` |
| `backend/app/models.py` | ORM 模型：`Stock` + `KlineDay/Week/Month/Quarter`（共用 mixin） |
| `backend/app/indicators.py` | 移植指标纯函数（KDJ/BBI/RSV/DIF/知行白线黄线/bbi_deriv_uptrend） |
| `backend/app/selectors.py` | 移植 `TrendSupportSelector`/`B2Selector` + `diagnose`/`evaluate` |
| `backend/app/data/__init__.py` | 包标记（空） |
| `backend/app/data/fetch_kline.py` | 移植 `normalize_stock_code_for_sina`/`stock_zh_a_hist_tx`/`get_kline_ak_tx`/`get_constituents` |
| `backend/app/data/resample.py` | 日K → 周/月/季K 的 OHLCV 重采样 |
| `backend/app/refresh.py` | 任务组A 编排 + 进度状态（内存单例） |
| `backend/app/presets.py` | 技术面预设参数 schema（默认值取自旧项目 configs.json） |
| `backend/app/screen.py` | 读 DB → 跑 Selector → 组装 `TechnicalCandidate` |
| `backend/app/kline_service.py` | 单股 K 线 + 现算指标（KDJ/白黄线） |
| `backend/app/schemas.py` | Pydantic 响应模型 |
| `backend/app/main.py` | FastAPI app + 路由 |
| `backend/tests/*` | pytest 用例 + fixtures |

### 前端（基于现有 `frontend/src/`）

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/types.ts` | 改 | `StrategyId` 扩到4个；`Kline` 增 `k/d/j/whiteLine/yellowLine`；新增 `TechnicalCandidate`/`RefreshStatus`/`Preset` |
| `src/lib/api.ts` | 建 | 后端 API 客户端 |
| `src/components/layout/StrategySidebar.tsx` | 建 | 第二列常驻「策略选择侧栏」（分组+分隔线） |
| `src/components/layout/TopBar.tsx` | 改 | 去掉策略 Tabs，改两个刷新按钮 + 更新时间 |
| `src/components/screener/DataRefreshProgress.tsx` | 改 | 改为任务组A/B 两个分组卡片 |
| `src/components/detail/PriceChart.tsx` | 改 | 统一组件：K线 + KDJ 副图 + 白黄线叠加 |
| `src/components/technical/TechnicalCandidateList.tsx` | 建 | 技术面候选列表 + 精简参数面板 |
| `src/components/technical/TechnicalScreenView.tsx` | 建 | 技术面战法页面（两栏） |
| `src/App.tsx` | 改 | 三栏布局 + 按策略切换主内容区 |
| `src/data/mock.ts` | 改 | `REFRESH_TASKS` 改分组结构；新增技术面候选 mock |

---

# 后端

## Task 1: 后端脚手架 + FastAPI 健康检查

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: 创建依赖文件**

`backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn==0.30.6
SQLAlchemy==2.0.34
pandas==2.0.3
numpy==1.24.4
scipy==1.10.1
requests==2.31.0
akshare==1.17.16
pydantic==2.9.2
pytest==8.3.2
httpx==0.27.2
```

- [ ] **Step 2: 创建虚拟环境并安装依赖**

> 注：本机 `python3`（pyenv `system`）为 3.8.10，而 `akshare==1.17.16` 依赖 `aiohttp>=3.11.13`，该版本在 PyPI 上无 cp38 wheel，3.8 环境下会安装失败。本机已通过 `pyenv install 3.9.19` 安装好 3.9.19（无需联网重装），请用它创建 venv。

Run:
```bash
cd backend && /home/yuanjiawei/.pyenv/versions/3.9.19/bin/python3 -m venv venv && ./venv/bin/pip install -U pip && ./venv/bin/pip install -r requirements.txt
```
Expected: 安装成功，无报错（akshare 及其依赖较多，安装可能需要几分钟）。

- [ ] **Step 3: 创建包标记与配置**

`backend/app/__init__.py`: 空文件。

`backend/app/config.py`:
```python
import os
from pathlib import Path

# DB 文件路径，测试通过 IMRICH_DB_PATH 覆盖到临时文件
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "imrich.db"


def get_db_path() -> str:
    return os.environ.get("IMRICH_DB_PATH", str(DEFAULT_DB_PATH))
```

`backend/pytest.ini`:
```ini
[pytest]
testpaths = tests
pythonpath = .
```

- [ ] **Step 4: 写失败测试**

`backend/tests/__init__.py`: 空文件。

`backend/tests/conftest.py`:
```python
import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def db_path(tmp_path):
    path = tmp_path / "test.db"
    os.environ["IMRICH_DB_PATH"] = str(path)
    yield str(path)
    os.environ.pop("IMRICH_DB_PATH", None)


@pytest.fixture()
def client(db_path):
    from app.main import app
    from app.db import init_db
    init_db()
    return TestClient(app)
```

`backend/tests/test_health.py`:
```python
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 5: 运行测试确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_health.py -v`
Expected: FAIL（`app.main` 或 `app.db` 不存在 / 导入错误）。

- [ ] **Step 6: 写最小实现**

`backend/app/db.py`（占位，Task 2 扩展）:
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_db_path


class Base(DeclarativeBase):
    pass


def _make_engine():
    import os
    os.makedirs(os.path.dirname(get_db_path()) or ".", exist_ok=True)
    return create_engine(f"sqlite:///{get_db_path()}", future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)


def init_db() -> None:
    global engine, SessionLocal
    engine = _make_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)
    import app.models  # noqa: F401  确保模型已注册
    Base.metadata.create_all(engine)
```

`backend/app/models.py`（占位，Task 2 填充）:
```python
# 模型在 Task 2 定义
```

`backend/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="i'mRich 选股器")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
cd backend && git add requirements.txt pytest.ini app tests && git commit -m "feat(backend): FastAPI 脚手架 + 健康检查"
```

---

## Task 2: SQLAlchemy 模型与建表

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_models.py`:
```python
from sqlalchemy import inspect

from app.db import init_db, engine, SessionLocal


def test_tables_created(db_path):
    init_db()
    names = set(inspect(engine).get_table_names())
    assert {"stocks", "kline_day", "kline_week", "kline_month", "kline_quarter"} <= names


def test_insert_stock_and_kline(db_path):
    init_db()
    from app.models import Stock, KlineDay
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", is_st=False, is_bj=False))
        s.add(KlineDay(code="sz000001", date="2025-01-02",
                       open=10.0, close=10.5, high=10.6, low=9.9, volume=1000.0))
        s.commit()
    with SessionLocal() as s:
        assert s.get(Stock, "sz000001").name == "平安银行"
        rows = s.query(KlineDay).filter_by(code="sz000001").all()
        assert len(rows) == 1 and rows[0].close == 10.5
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_models.py -v`
Expected: FAIL（`Stock`/`KlineDay` 未定义）。

- [ ] **Step 3: 实现模型**

`backend/app/models.py`:
```python
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
```

> 注：后端 venv 使用 Python 3.9.19（见 Task 1 Step 2），但全部类型注解仍统一使用 `typing.Optional` 而非 PEP 604 的 `X | None` 语法（后者需 3.10+），与 3.8/3.9 均兼容，避免环境差异导致的隐患。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/models.py tests/test_models.py && git commit -m "feat(backend): SQLAlchemy 模型与建表"
```

---

## Task 3: 移植指标纯函数

**Files:**
- Create: `backend/app/indicators.py`
- Test: `backend/tests/test_indicators.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_indicators.py`:
```python
import numpy as np
import pandas as pd

from app.indicators import (
    compute_kdj, compute_bbi, compute_dif,
    compute_zhixing_short_trend, compute_zhixing_bull_bear,
)


def _df(closes):
    n = len(closes)
    return pd.DataFrame({
        "close": closes,
        "high": [c + 0.5 for c in closes],
        "low": [c - 0.5 for c in closes],
        "open": closes,
        "volume": [1000.0] * n,
    })


def test_kdj_first_row_is_50():
    out = compute_kdj(_df([10.0, 10.0, 10.0]))
    assert out.iloc[0]["K"] == 50.0
    assert out.iloc[0]["D"] == 50.0
    assert out.iloc[0]["J"] == 50.0


def test_dif_constant_series_is_zero():
    dif = compute_dif(_df([10.0] * 30))
    assert abs(float(dif.iloc[-1])) < 1e-6


def test_bull_bear_constant_series_equals_price():
    s = compute_zhixing_bull_bear(_df([10.0] * 120))
    assert abs(float(s.iloc[-1]) - 10.0) < 1e-9


def test_short_trend_constant_series_equals_price():
    s = compute_zhixing_short_trend(_df([10.0] * 30), span=10)
    assert abs(float(s.iloc[-1]) - 10.0) < 1e-9


def test_bbi_needs_24_points():
    s = compute_bbi(_df([float(i) for i in range(30)]))
    assert not np.isnan(float(s.iloc[-1]))
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_indicators.py -v`
Expected: FAIL（`app.indicators` 不存在）。

- [ ] **Step 3: 移植实现**

`backend/app/indicators.py`（原样移植自 `STOCKTRADEBYZ-m/Selector.py` 第11–225行的指标函数）:
```python
from __future__ import annotations

from typing import Optional, Any

import numpy as np
import pandas as pd
from scipy.signal import find_peaks


def compute_zhixing_short_trend(df: pd.DataFrame, span: int = 10) -> pd.Series:
    """知行短期趋势线（白线）: EMA(EMA(C, span), span)"""
    ema1 = df["close"].ewm(span=span, adjust=False).mean()
    ema2 = ema1.ewm(span=span, adjust=False).mean()
    return ema2


def compute_zhixing_bull_bear(
    df: pd.DataFrame, m1: int = 14, m2: int = 28, m3: int = 57, m4: int = 114,
) -> pd.Series:
    """知行多空线（黄线）: (MA(C,M1)+MA(C,M2)+MA(C,M3)+MA(C,M4))/4"""
    ma1 = df["close"].rolling(window=m1, min_periods=1).mean()
    ma2 = df["close"].rolling(window=m2, min_periods=1).mean()
    ma3 = df["close"].rolling(window=m3, min_periods=1).mean()
    ma4 = df["close"].rolling(window=m4, min_periods=1).mean()
    return (ma1 + ma2 + ma3 + ma4) / 4


def compute_kdj(df: pd.DataFrame, n: int = 9) -> pd.DataFrame:
    if df.empty:
        return df.assign(K=np.nan, D=np.nan, J=np.nan)
    low_n = df["low"].rolling(window=n, min_periods=1).min()
    high_n = df["high"].rolling(window=n, min_periods=1).max()
    rsv = (df["close"] - low_n) / (high_n - low_n + 1e-9) * 100
    K = np.zeros_like(rsv, dtype=float)
    D = np.zeros_like(rsv, dtype=float)
    for i in range(len(df)):
        if i == 0:
            K[i] = D[i] = 50.0
        else:
            K[i] = 2 / 3 * K[i - 1] + 1 / 3 * rsv.iloc[i]
            D[i] = 2 / 3 * D[i - 1] + 1 / 3 * K[i]
    J = 3 * K - 2 * D
    return df.assign(K=K, D=D, J=J)


def compute_bbi(df: pd.DataFrame) -> pd.Series:
    ma3 = df["close"].rolling(3).mean()
    ma6 = df["close"].rolling(6).mean()
    ma12 = df["close"].rolling(12).mean()
    ma24 = df["close"].rolling(24).mean()
    return (ma3 + ma6 + ma12 + ma24) / 4


def compute_rsv(df: pd.DataFrame, n: int) -> pd.Series:
    low_n = df["low"].rolling(window=n, min_periods=1).min()
    high_close_n = df["close"].rolling(window=n, min_periods=1).max()
    rsv = (df["close"] - low_n) / (high_close_n - low_n + 1e-9) * 100.0
    return rsv


def compute_dif(df: pd.DataFrame, fast: int = 12, slow: int = 26) -> pd.Series:
    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    return ema_fast - ema_slow


def _find_peaks(
    df: pd.DataFrame, *, column: str = "high", distance: Optional[int] = None,
    prominence: Optional[float] = None, height: Optional[float] = None,
    width: Optional[float] = None, rel_height: float = 0.5, **kwargs: Any,
) -> pd.DataFrame:
    if column not in df.columns:
        raise KeyError(f"'{column}' not found in DataFrame columns: {list(df.columns)}")
    y = df[column].to_numpy()
    indices, props = find_peaks(
        y, distance=distance, prominence=prominence, height=height,
        width=width, rel_height=rel_height, **kwargs,
    )
    peaks_df = df.iloc[indices].copy()
    peaks_df["is_peak"] = True
    for key, arr in props.items():
        if isinstance(arr, (list, np.ndarray)) and len(arr) == len(indices):
            peaks_df[f"peak_{key}"] = arr
    return peaks_df


def bbi_deriv_uptrend(
    bbi: pd.Series, *, min_window: int, max_window: Optional[int] = None,
    q_threshold: float = 0.0,
) -> bool:
    """判断 BBI 是否整体上升（自最长窗口向下搜索，任一窗口满足即通过）。"""
    if not 0.0 <= q_threshold <= 1.0:
        raise ValueError("q_threshold 必须位于 [0, 1] 区间内")
    bbi = bbi.dropna()
    if len(bbi) < min_window:
        return False
    longest = min(len(bbi), max_window or len(bbi))
    for w in range(longest, min_window - 1, -1):
        seg = bbi.iloc[-w:]
        norm = seg / seg.iloc[0]
        diffs = np.diff(norm.values)
        if np.quantile(diffs, q_threshold) >= 0:
            return True
    return False
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_indicators.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/indicators.py tests/test_indicators.py && git commit -m "feat(backend): 移植技术指标纯函数"
```

---

## Task 4: 移植 TrendSupportSelector / B2Selector

**Files:**
- Create: `backend/app/selectors.py`
- Test: `backend/tests/test_selectors.py`

`evaluate(hist)` 返回诊断字典（通过时）或 `None`（不通过）；`diagnose(hist)` 提取关键中间指标（即 `TechnicalCandidate.diagnostics` 的字段）；`_passes_filters` 原样移植以保证与旧项目逻辑一致；`needed_len` 与 `_hist_for` 供 screen 层复用。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_selectors.py`:
```python
import numpy as np
import pandas as pd

from app.selectors import TrendSupportSelector, B2Selector, SELECTOR_REGISTRY


def _hist(closes, volumes=None):
    n = len(closes)
    volumes = volumes or [1000.0] * n
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({
        "date": dates,
        "open": closes,
        "close": closes,
        "high": [c + 0.3 for c in closes],
        "low": [c - 0.3 for c in closes],
        "volume": volumes,
    })


def test_registry_has_both_strategies():
    assert set(SELECTOR_REGISTRY) == {"trend-support", "b2"}


def test_trend_support_rejects_big_jump():
    # 最后一天 +10%，超出 pct_chg_max=1.8 → 必被拒
    closes = [10.0] * 120 + [11.0]
    sel = TrendSupportSelector()
    assert sel._passes_filters(_hist(closes)) is False


def test_trend_support_rejects_flat_series():
    # 全常数 → 白线 == 黄线，条件「白线>黄线」不满足 → 拒
    sel = TrendSupportSelector()
    assert sel._passes_filters(_hist([10.0] * 130)) is False


def test_b2_rejects_without_volume_expansion():
    # 最后一天涨 5% 但量没放大 → 拒
    closes = [10.0] * 10 + [10.5]
    vols = [1000.0] * 11
    sel = B2Selector()
    assert sel._passes_filters(_hist(closes, vols)) is False


def test_b2_rejects_when_not_up_enough():
    # 最后一天只涨 1%（< up_threshold=4）→ 拒
    closes = [10.0] * 10 + [10.1]
    vols = [1000.0] * 10 + [5000.0]
    sel = B2Selector()
    assert sel._passes_filters(_hist(closes, vols)) is False


def test_evaluate_returns_none_when_rejected():
    sel = TrendSupportSelector()
    assert sel.evaluate(_hist([10.0] * 130)) is None


def test_select_returns_list():
    sel = B2Selector()
    data = {"sz000001": _hist([10.0] * 50)}
    picks = sel.select(pd.Timestamp("2024-02-19"), data)
    assert isinstance(picks, list)
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_selectors.py -v`
Expected: FAIL（`app.selectors` 不存在）。

- [ ] **Step 3: 移植实现**

`backend/app/selectors.py`（移植自 `STOCKTRADEBYZ-m/Selector.py` 第864–1007、1204–1328行；`_passes_filters` 逻辑逐行保留，新增 `needed_len`/`_hist_for`/`diagnose`/`evaluate`）:
```python
from __future__ import annotations

from typing import Dict, List, Optional, Any

import pandas as pd

from app.indicators import (
    compute_kdj, compute_zhixing_short_trend, compute_zhixing_bull_bear,
)


class TrendSupportSelector:
    """双线战法：涨跌幅过滤 + KDJ J 值低位 + 白线>黄线 + 股价在区间内。"""

    def __init__(
        self, pct_chg_min: float = -2.0, pct_chg_max: float = 1.8,
        j_threshold: float = -5.0, j_q_threshold: float = 0.10,
        max_window: int = 90, tolerance: float = 0.01, white_span: int = 10,
        yellow_m_args: Optional[List[int]] = None,
    ) -> None:
        self.pct_chg_min = pct_chg_min
        self.pct_chg_max = pct_chg_max
        self.j_threshold = j_threshold
        self.j_q_threshold = j_q_threshold
        self.max_window = max_window
        self.tolerance = tolerance
        self.white_span = white_span
        self.yellow_m_args = yellow_m_args if yellow_m_args else [14, 28, 57, 114]
        self.needed_len = max(self.max_window, self.yellow_m_args[-1] + 20)

    def _passes_filters(self, hist: pd.DataFrame) -> bool:
        if hist.empty or len(hist) < 2:
            return False
        hist = hist.copy()
        close_today = hist["close"].iloc[-1]
        close_prev = hist["close"].iloc[-2]
        if close_prev == 0:
            return False
        pct_chg = (close_today - close_prev) / close_prev * 100
        if not (self.pct_chg_min <= pct_chg <= self.pct_chg_max):
            return False
        kdj = compute_kdj(hist)
        j_today = float(kdj.iloc[-1]["J"])
        j_window = kdj["J"].tail(self.max_window).dropna()
        if j_window.empty:
            return False
        j_quantile = float(j_window.quantile(self.j_q_threshold))
        if not (j_today < self.j_threshold or j_today <= j_quantile):
            return False
        white_line = compute_zhixing_short_trend(hist, span=self.white_span)
        yellow_line = compute_zhixing_bull_bear(
            hist, m1=self.yellow_m_args[0], m2=self.yellow_m_args[1],
            m3=self.yellow_m_args[2], m4=self.yellow_m_args[3],
        )
        val_white = white_line.iloc[-1]
        val_yellow = yellow_line.iloc[-1]
        if pd.isna(val_white) or pd.isna(val_yellow):
            return False
        if val_white <= val_yellow:
            return False
        lower_bound = val_yellow * (1 - self.tolerance)
        if not (lower_bound <= close_today):
            return False
        return True

    def diagnose(self, hist: pd.DataFrame) -> Dict[str, float]:
        hist = hist.copy()
        close_today = float(hist["close"].iloc[-1])
        close_prev = float(hist["close"].iloc[-2])
        pct_chg = (close_today - close_prev) / close_prev * 100
        kdj = compute_kdj(hist)
        j_today = float(kdj.iloc[-1]["J"])
        white = compute_zhixing_short_trend(hist, span=self.white_span)
        yellow = compute_zhixing_bull_bear(
            hist, m1=self.yellow_m_args[0], m2=self.yellow_m_args[1],
            m3=self.yellow_m_args[2], m4=self.yellow_m_args[3],
        )
        return {
            "pctChg": round(pct_chg, 2),
            "j": round(j_today, 2),
            "whiteLine": round(float(white.iloc[-1]), 3),
            "yellowLine": round(float(yellow.iloc[-1]), 3),
        }

    def _hist_for(self, df: pd.DataFrame, date: pd.Timestamp) -> Optional[pd.DataFrame]:
        hist = df[df["date"] <= date]
        if hist.empty:
            return None
        return hist.tail(self.needed_len)

    def evaluate(self, hist: pd.DataFrame) -> Optional[Dict[str, float]]:
        if not self._passes_filters(hist):
            return None
        return self.diagnose(hist)

    def select(self, date: pd.Timestamp, data: Dict[str, pd.DataFrame]) -> List[str]:
        picks: List[str] = []
        for code, df in data.items():
            hist = self._hist_for(df, date)
            if hist is not None and self._passes_filters(hist):
                picks.append(code)
        return picks


class B2Selector:
    """B2 战法：放量 + 涨幅>阈值 + J 值过滤。"""

    def __init__(
        self, vol_ratio: float = 1.0, up_threshold: float = 4.0, j_ceil: float = 65.0,
        j_prev_threshold: float = -5.0, j_prev_q_threshold: float = 0.10,
        max_window: int = 90, trend_params: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.vol_ratio = vol_ratio
        self.up_threshold = up_threshold
        self.j_ceil = j_ceil
        self.j_prev_threshold = j_prev_threshold
        self.j_prev_q_threshold = j_prev_q_threshold
        self.max_window = max_window
        self.trend_selector = TrendSupportSelector(**(trend_params or {}))
        ts_req = max(self.trend_selector.max_window,
                     self.trend_selector.yellow_m_args[-1] + 20)
        self.needed_len = max(ts_req + 10, self.max_window + 20)

    def _passes_filters(self, hist: pd.DataFrame) -> bool:
        if len(hist) < 5:
            return False
        row_curr = hist.iloc[-1]
        row_prev = hist.iloc[-2]
        if row_prev["close"] <= 0:
            return False
        pct_chg = (row_curr["close"] - row_prev["close"]) / row_prev["close"] * 100
        if pct_chg <= self.up_threshold:
            return False
        if row_prev["volume"] <= 0:
            return False
        if row_curr["volume"] <= row_prev["volume"] * self.vol_ratio:
            return False
        kdj = compute_kdj(hist)
        j_curr = float(kdj.iloc[-1]["J"])
        if j_curr >= self.j_ceil:
            return False
        j_prev = float(kdj.iloc[-2]["J"])
        j_window = kdj["J"].tail(self.max_window).dropna()
        if j_window.empty:
            return False
        j_quantile = float(j_window.quantile(self.j_prev_q_threshold))
        if not (j_prev < self.j_prev_threshold or j_prev <= j_quantile):
            return False
        return True

    def diagnose(self, hist: pd.DataFrame) -> Dict[str, float]:
        row_curr = hist.iloc[-1]
        row_prev = hist.iloc[-2]
        pct_chg = (row_curr["close"] - row_prev["close"]) / row_prev["close"] * 100
        vol_ratio = row_curr["volume"] / row_prev["volume"] if row_prev["volume"] else 0.0
        kdj = compute_kdj(hist)
        return {
            "pctChg": round(pct_chg, 2),
            "volRatio": round(float(vol_ratio), 2),
            "j": round(float(kdj.iloc[-1]["J"]), 2),
            "jPrev": round(float(kdj.iloc[-2]["J"]), 2),
        }

    def _hist_for(self, df: pd.DataFrame, date: pd.Timestamp) -> Optional[pd.DataFrame]:
        hist = df[df["date"] <= date]
        if hist.empty:
            return None
        return hist.tail(self.needed_len)

    def evaluate(self, hist: pd.DataFrame) -> Optional[Dict[str, float]]:
        if not self._passes_filters(hist):
            return None
        return self.diagnose(hist)

    def select(self, date: pd.Timestamp, data: Dict[str, pd.DataFrame]) -> List[str]:
        picks: List[str] = []
        for code, df in data.items():
            hist = self._hist_for(df, date)
            if hist is not None and self._passes_filters(hist):
                picks.append(code)
        return picks


SELECTOR_REGISTRY = {
    "trend-support": TrendSupportSelector,
    "b2": B2Selector,
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_selectors.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/selectors.py tests/test_selectors.py && git commit -m "feat(backend): 移植双线/B2 Selector + 诊断字段"
```

---

## Task 5: 移植行情抓取（fetch_kline）

**Files:**
- Create: `backend/app/data/__init__.py`, `backend/app/data/fetch_kline.py`
- Test: `backend/tests/test_fetch_kline.py`

仅移植阶段1需要的 4 个函数：`normalize_stock_code_for_sina`、`stock_zh_a_hist_tx`、`get_kline_ak_tx`、`get_constituents`。网络/akshare 调用在测试中 mock。`get_constituents` 去掉旧项目对 `appendix.json` 的依赖（自选股池属阶段4），并额外返回名称用于 `stocks` 表。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_fetch_kline.py`:
```python
import json

import pandas as pd

from app.data import fetch_kline


def test_normalize_code():
    assert fetch_kline.normalize_stock_code_for_sina("600000") == "sh600000"
    assert fetch_kline.normalize_stock_code_for_sina("000001") == "sz000001"
    assert fetch_kline.normalize_stock_code_for_sina("300750") == "sz300750"
    assert fetch_kline.normalize_stock_code_for_sina("688256") == "sh688256"
    assert fetch_kline.normalize_stock_code_for_sina("sz000001") == "sz000001"


def test_get_kline_ak_tx_parses_tencent_json(monkeypatch):
    fake = {"data": {"sz000001": {"day": [
        ["2025-01-02", "10.0", "10.5", "10.6", "9.9", "120.0"],
        ["2025-01-03", "10.5", "10.2", "10.7", "10.1", "100.0"],
    ]}}}

    class _Resp:
        text = json.dumps(fake)

    monkeypatch.setattr(fetch_kline.requests, "get", lambda *a, **k: _Resp())
    df = fetch_kline.get_kline_ak_tx("000001", "", "")
    assert list(df.columns) == ["date", "open", "close", "high", "low", "volume"]
    assert len(df) == 2
    # amount(手) * 100 = volume(股)
    assert df.iloc[0]["volume"] == 12000.0
    assert df.iloc[0]["close"] == 10.5


def test_get_constituents_filters_by_mktcap(monkeypatch):
    spot = pd.DataFrame({"代码": ["000001", "600000", "300750"],
                         "名称": ["平安银行", "浦发银行", "宁德时代"],
                         "总市值": [5e9, 5e10, 1e12]})
    monkeypatch.setattr(fetch_kline.ak, "stock_zh_a_spot_em", lambda: spot)
    rows = fetch_kline.get_constituents(min_cap=1e10)
    codes = [r["code"] for r in rows]
    assert "sz000001" not in codes  # 50亿 < 100亿门槛
    assert "sh600000" in codes
    assert "sz300750" in codes
    assert dict(zip(codes, [r["name"] for r in rows]))["sz300750"] == "宁德时代"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_kline.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/data/__init__.py`: 空文件。

`backend/app/data/fetch_kline.py`:
```python
from __future__ import annotations

import json
import logging
from typing import List, Optional

import pandas as pd
import requests
import akshare as ak  # type: ignore

logger = logging.getLogger(__name__)


def normalize_stock_code_for_sina(code: str) -> str:
    """为腾讯/新浪接口添加市场前缀（sh/sz/bj）。"""
    if code.startswith(("sh", "sz", "bj")):
        return code
    code = code.zfill(6)
    if code.startswith(("600", "601", "603", "605")):
        return f"sh{code}"
    if code.startswith(("000", "001", "002", "003")):
        return f"sz{code}"
    if code.startswith(("300", "301")):
        return f"sz{code}"
    if code.startswith("688"):
        return f"sh{code}"
    if code.startswith(("430", "830", "831", "832", "833", "834", "835", "836",
                        "837", "838", "839", "870", "871", "872", "873", "874",
                        "875", "876", "877", "878", "879", "9")):
        return f"bj{code}"
    logger.warning("无法确定股票 %s 的市场，默认当作北京市场", code)
    return f"bj{code}"


def stock_zh_a_hist_tx(symbol: str = "sz000001", adjust: str = "qfq",
                       timeout: Optional[float] = None) -> pd.DataFrame:
    """腾讯证券-日频-股票历史数据（默认前复权，近1095天）。"""
    url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
    params = {"param": f"{symbol},day,,,1095,{adjust}", "r": "0.8205512681390605"}
    r = requests.get(url, params=params, timeout=timeout)
    data_json = json.loads(r.text)
    result = data_json["data"][symbol]
    if "day" in result:
        temp_df = pd.DataFrame(result["day"])
    elif "hfqday" in result:
        temp_df = pd.DataFrame(result["hfqday"])
    else:
        temp_df = pd.DataFrame(result["qfqday"])
    big_df = temp_df.iloc[:, :6]
    big_df.columns = ["date", "open", "close", "high", "low", "amount"]
    big_df["date"] = pd.to_datetime(big_df["date"], errors="coerce").dt.date
    for col in ["open", "close", "high", "low", "amount"]:
        big_df[col] = pd.to_numeric(big_df[col], errors="coerce")
    big_df.drop_duplicates(inplace=True, ignore_index=True)
    return big_df


def get_kline_ak_tx(code: str, start: str, end: str, adjust: str = "qfq") -> pd.DataFrame:
    """返回字段：date(Timestamp), open, close, high, low, volume(股)。"""
    normalized_code = normalize_stock_code_for_sina(code)
    raw = stock_zh_a_hist_tx(symbol=normalized_code, adjust=adjust)
    if raw.empty:
        return raw
    df = raw.assign(date=lambda x: pd.to_datetime(x["date"]))
    numeric_cols = [c for c in df.columns if c != "date"]
    df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
    if "amount" in df.columns:
        df["volume"] = df["amount"] * 100  # 1手 = 100股
        df = df.drop(columns=["amount"])
    df = df[["date", "open", "close", "high", "low", "volume"]]
    return df.sort_values("date").reset_index(drop=True)


def get_constituents(min_cap: float) -> List[dict]:
    """按总市值筛全市场A股，返回 [{code(带前缀), name, market_cap(亿)}]。

    min_cap 单位为元；market_cap 字段单位为亿元。
    """
    df = ak.stock_zh_a_spot_em()
    df = df[["代码", "名称", "总市值"]].rename(
        columns={"代码": "code", "名称": "name", "总市值": "mktcap"})
    df["mktcap"] = pd.to_numeric(df["mktcap"], errors="coerce")
    df = df[df["mktcap"] >= min_cap]
    rows = []
    for _, row in df.iterrows():
        raw_code = str(row["code"]).zfill(6)
        rows.append({
            "code": normalize_stock_code_for_sina(raw_code),
            "name": str(row["name"]),
            "market_cap": round(float(row["mktcap"]) / 1e8, 2),
        })
    logger.info("筛选市值≥ %.0f 亿，共 %d 只", min_cap / 1e8, len(rows))
    return rows
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_kline.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/data tests/test_fetch_kline.py && git commit -m "feat(backend): 移植腾讯K线抓取与全市场股票池"
```

---

## Task 6: 周/月/季 K 线重采样

**Files:**
- Create: `backend/app/data/resample.py`
- Test: `backend/tests/test_resample.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_resample.py`:
```python
import pandas as pd

from app.data.resample import resample_ohlcv


def _daily():
    # 2025-01 两周：1/6(周一)~1/10，1/13~1/17，每天 OHLCV 已知
    dates = pd.to_datetime([
        "2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10",
        "2025-01-13", "2025-01-14", "2025-01-15", "2025-01-16", "2025-01-17",
    ])
    return pd.DataFrame({
        "date": dates,
        "open": [10, 11, 12, 13, 14, 20, 21, 22, 23, 24],
        "high": [15, 16, 17, 18, 19, 25, 26, 27, 28, 29],
        "low": [5, 6, 7, 8, 9, 15, 16, 17, 18, 19],
        "close": [11, 12, 13, 14, 15, 21, 22, 23, 24, 25],
        "volume": [100, 100, 100, 100, 100, 200, 200, 200, 200, 200],
    })


def test_weekly_resample_aggregates_correctly():
    wk = resample_ohlcv(_daily(), "week").reset_index(drop=True)
    assert len(wk) == 2
    # 第一周：open=首(10) high=max(19) low=min(5) close=末(15) vol=求和(500)
    assert wk.iloc[0]["open"] == 10
    assert wk.iloc[0]["high"] == 19
    assert wk.iloc[0]["low"] == 5
    assert wk.iloc[0]["close"] == 15
    assert wk.iloc[0]["volume"] == 500
    # 第二周
    assert wk.iloc[1]["open"] == 20
    assert wk.iloc[1]["close"] == 25
    assert wk.iloc[1]["volume"] == 1000


def test_monthly_and_quarterly_keys():
    m = resample_ohlcv(_daily(), "month").reset_index(drop=True)
    assert len(m) == 1
    assert m.iloc[0]["open"] == 10 and m.iloc[0]["close"] == 25
    q = resample_ohlcv(_daily(), "quarter").reset_index(drop=True)
    assert len(q) == 1
    assert q.iloc[0]["volume"] == 1500


def test_empty_input_returns_empty():
    out = resample_ohlcv(pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"]), "week")
    assert out.empty
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_resample.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/data/resample.py`:
```python
from __future__ import annotations

import pandas as pd

# pandas resample 频率别名：周/月/季末
_RULE = {"week": "W", "month": "ME", "quarter": "QE"}


def resample_ohlcv(daily: pd.DataFrame, period: str) -> pd.DataFrame:
    """日K → 周/月/季K：open=首, high=max, low=min, close=末, volume=求和。

    输入 daily 含列 date(可转 datetime), open, high, low, close, volume。
    输出列：date(周期末日期, 'YYYY-MM-DD' 字符串), open, close, high, low, volume。
    """
    if daily.empty:
        return daily.copy()
    if period not in _RULE:
        raise ValueError(f"period 仅支持 {list(_RULE)}")
    df = daily.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    agg = df.resample(_RULE[period]).agg(
        open=("open", "first"), high=("high", "max"),
        low=("low", "min"), close=("close", "last"), volume=("volume", "sum"),
    ).dropna(subset=["open"])
    agg = agg.reset_index()
    agg["date"] = agg["date"].dt.strftime("%Y-%m-%d")
    return agg[["date", "open", "close", "high", "low", "volume"]]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_resample.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/data/resample.py tests/test_resample.py && git commit -m "feat(backend): 周/月/季K线重采样"
```

---

## Task 7: 任务组A 刷新编排 + 进度状态

**Files:**
- Create: `backend/app/refresh.py`
- Test: `backend/tests/test_refresh.py`

`run_kline_refresh(constituents_fn, kline_fn)` 通过依赖注入接收抓取函数，便于测试。步骤：①股票列表 diff（新增/更新、退市软删除）；②逐股票全量删除重抓日K + 重采样写周/月/季K。进度写入内存单例 `STATE`。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_refresh.py`:
```python
import pandas as pd

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay, KlineWeek
from app import refresh


def _fake_kline(code):
    dates = pd.date_range("2025-01-06", periods=10, freq="D")
    return pd.DataFrame({
        "date": dates,
        "open": [10.0 + i for i in range(10)],
        "close": [10.5 + i for i in range(10)],
        "high": [11.0 + i for i in range(10)],
        "low": [9.5 + i for i in range(10)],
        "volume": [1000.0] * 10,
    })


def test_refresh_writes_stocks_and_kline(db_path):
    init_db()
    refresh.reset_state()
    constituents = lambda: [
        {"code": "sz000001", "name": "平安银行", "market_cap": 5000.0},
        {"code": "sz300750", "name": "宁德时代", "market_cap": 10000.0},
    ]
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.query(Stock).count() == 2
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
        assert s.query(KlineWeek).filter_by(code="sz000001").count() >= 2
    assert refresh.STATE["kline"].status == "done"
    assert all(step.done == step.total for step in refresh.STATE["kline"].steps)


def test_refresh_softdeletes_missing_stock(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000002", name="退市股", is_st=False, is_bj=False))
        s.commit()
    constituents = lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}]
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.get(Stock, "sz000002").delisted_at is not None
        assert s.get(Stock, "sz000001").delisted_at is None


def test_refresh_is_full_refetch(db_path):
    init_db()
    refresh.reset_state()
    constituents = lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}]
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    with SessionLocal() as s:
        # 第二次全量重抓不应产生重复行
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh.py -v`
Expected: FAIL（`app.refresh` 不存在）。

- [ ] **Step 3: 实现**

`backend/app/refresh.py`:
```python
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, List, Optional

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay, KlineWeek, KlineMonth, KlineQuarter
from app.data.resample import resample_ohlcv

DEFAULT_MIN_CAP = 5e9  # 50亿元市值门槛


@dataclass
class RefreshStep:
    label: str
    done: int = 0
    total: int = 0
    elapsed: str = "00:00"
    progress: int = 0


@dataclass
class RefreshGroup:
    status: str = "idle"  # idle|running|done|error
    updatedAt: Optional[str] = None
    steps: List[RefreshStep] = field(default_factory=list)


def _new_state():
    return {
        "kline": RefreshGroup(steps=[
            RefreshStep("股票列表"), RefreshStep("K线数据（日+周+月+季）")]),
        "fundamental": RefreshGroup(steps=[
            RefreshStep("财报数据"), RefreshStep("业绩预告快报"),
            RefreshStep("申万行业指数"), RefreshStep("研报-全市场元数据"),
            RefreshStep("研报-候选池解析")]),
    }


STATE = _new_state()


def reset_state() -> None:
    global STATE
    STATE = _new_state()


def _fmt(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


_PERIOD_MODELS = {"week": KlineWeek, "month": KlineMonth, "quarter": KlineQuarter}


def run_kline_refresh(
    constituents_fn: Optional[Callable[[], list]] = None,
    kline_fn: Optional[Callable[[str], pd.DataFrame]] = None,
) -> None:
    """任务组A：股票列表 diff + 日K全量重抓 + 周/月/季K重采样。"""
    if constituents_fn is None:
        from app.data.fetch_kline import get_constituents
        constituents_fn = lambda: get_constituents(DEFAULT_MIN_CAP)
    if kline_fn is None:
        from app.data.fetch_kline import get_kline_ak_tx
        kline_fn = lambda code: get_kline_ak_tx(code, "", "")

    group = STATE["kline"]
    group.status = "running"
    started = time.time()

    try:
        # —— 步骤1：股票列表 ——
        step1 = group.steps[0]
        rows = constituents_fn()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with SessionLocal() as s:
            current_codes = set()
            for r in rows:
                current_codes.add(r["code"])
                obj = s.get(Stock, r["code"])
                if obj is None:
                    obj = Stock(code=r["code"])
                    s.add(obj)
                obj.name = r["name"]
                obj.market_cap = r.get("market_cap")
                obj.delisted_at = None
                obj.updated_at = now
            # 退市软删除
            for obj in s.query(Stock).all():
                if obj.code not in current_codes and obj.delisted_at is None:
                    obj.delisted_at = now
            s.commit()
        step1.total = step1.done = len(rows)
        step1.progress = 100
        step1.elapsed = _fmt(time.time() - started)

        # —— 步骤2：K线全量重抓 + 重采样 ——
        step2 = group.steps[1]
        active = [r["code"] for r in rows]
        step2.total = len(active)
        t0 = time.time()
        for i, code in enumerate(active, 1):
            df = kline_fn(code)
            with SessionLocal() as s:
                s.query(KlineDay).filter_by(code=code).delete()
                if df is not None and not df.empty:
                    s.bulk_save_objects([
                        KlineDay(code=code, date=pd.Timestamp(row.date).strftime("%Y-%m-%d"),
                                 open=float(row.open), close=float(row.close),
                                 high=float(row.high), low=float(row.low),
                                 volume=float(row.volume))
                        for row in df.itertuples(index=False)
                    ])
                for period, model in _PERIOD_MODELS.items():
                    s.query(model).filter_by(code=code).delete()
                    if df is not None and not df.empty:
                        rs = resample_ohlcv(df, period)
                        s.bulk_save_objects([
                            model(code=code, date=row.date, open=float(row.open),
                                  close=float(row.close), high=float(row.high),
                                  low=float(row.low), volume=float(row.volume))
                            for row in rs.itertuples(index=False)
                        ])
                s.commit()
            step2.done = i
            step2.progress = int(i / step2.total * 100) if step2.total else 100
            step2.elapsed = _fmt(time.time() - t0)

        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        group.status = "error"
        raise
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/refresh.py tests/test_refresh.py && git commit -m "feat(backend): 任务组A刷新编排与进度状态"
```

---

## Task 8: 技术面预设（presets）

**Files:**
- Create: `backend/app/presets.py`
- Test: `backend/tests/test_presets.py`

默认值取自旧项目 `configs.json`（见 spec 4.2）。仅暴露标量参数为可调 `NumberField`；`yellow_m_args`/`trend_params` 作为服务端固定默认，不进 UI。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_presets.py`:
```python
from app.presets import get_presets, build_selector


def test_get_presets_returns_two_technical():
    presets = get_presets()
    ids = {p["id"] for p in presets}
    assert ids == {"trend-support", "b2"}
    for p in presets:
        assert p["category"] == "technical"
        assert isinstance(p["params"], list) and len(p["params"]) > 0
        for param in p["params"]:
            assert {"key", "label", "value"} <= set(param)


def test_trend_support_default_values():
    p = next(p for p in get_presets() if p["id"] == "trend-support")
    by_key = {x["key"]: x["value"] for x in p["params"]}
    assert by_key["pct_chg_min"] == -2.0
    assert by_key["pct_chg_max"] == 1.8
    assert by_key["j_threshold"] == 15


def test_build_selector_overrides_params():
    sel = build_selector("b2", {"up_threshold": 6.0})
    assert sel.up_threshold == 6.0
    assert sel.j_ceil == 85.0  # 默认仍生效


def test_build_selector_unknown_raises():
    import pytest
    with pytest.raises(KeyError):
        build_selector("nope", {})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_presets.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/presets.py`:
```python
from __future__ import annotations

from typing import Any, Dict, List

from app.selectors import SELECTOR_REGISTRY

# 标量可调参数 schema + 默认值（取自旧项目 configs.json）
_PARAM_SPECS: Dict[str, List[dict]] = {
    "trend-support": [
        {"key": "pct_chg_min", "label": "涨跌幅下限", "value": -2.0, "min": -10, "max": 0, "step": 0.1, "unit": "%"},
        {"key": "pct_chg_max", "label": "涨跌幅上限", "value": 1.8, "min": 0, "max": 10, "step": 0.1, "unit": "%"},
        {"key": "j_threshold", "label": "J 值绝对阈值", "value": 15, "min": -20, "max": 50, "step": 1},
        {"key": "j_q_threshold", "label": "J 值分位阈值", "value": 0.1, "min": 0, "max": 1, "step": 0.05},
        {"key": "max_window", "label": "回溯窗口", "value": 90, "min": 30, "max": 250, "step": 5, "unit": "日"},
        {"key": "tolerance", "label": "价格容差", "value": 0.01, "min": 0, "max": 0.1, "step": 0.005},
        {"key": "white_span", "label": "白线周期", "value": 10, "min": 3, "max": 30, "step": 1},
    ],
    "b2": [
        {"key": "vol_ratio", "label": "放量倍数", "value": 1.0, "min": 0.5, "max": 3, "step": 0.1},
        {"key": "up_threshold", "label": "涨幅阈值", "value": 4.0, "min": 0, "max": 10, "step": 0.5, "unit": "%"},
        {"key": "j_ceil", "label": "J 值上限", "value": 85.0, "min": 50, "max": 100, "step": 1},
        {"key": "j_prev_threshold", "label": "前日 J 阈值", "value": -5.0, "min": -20, "max": 20, "step": 1},
        {"key": "j_prev_q_threshold", "label": "前日 J 分位", "value": 0.1, "min": 0, "max": 1, "step": 0.05},
        {"key": "max_window", "label": "回溯窗口", "value": 90, "min": 30, "max": 250, "step": 5, "unit": "日"},
    ],
}

# 不进 UI 的固定默认（嵌套结构）
_FIXED_DEFAULTS: Dict[str, dict] = {
    "trend-support": {"yellow_m_args": [14, 28, 57, 114]},
    "b2": {"trend_params": {
        "pct_chg_min": -2.0, "pct_chg_max": 1.8, "j_threshold": -5.0,
        "j_q_threshold": 0.10, "max_window": 90, "tolerance": 0.01,
        "white_span": 10, "yellow_m_args": [14, 28, 57, 114]}},
}

_NAMES = {"trend-support": "双线战法", "b2": "B2战法"}


def get_presets() -> List[dict]:
    out = []
    for pid, specs in _PARAM_SPECS.items():
        out.append({
            "id": pid, "category": "technical", "name": _NAMES[pid],
            "params": [dict(s) for s in specs],
        })
    return out


def build_selector(preset_id: str, params: Dict[str, Any]):
    if preset_id not in SELECTOR_REGISTRY:
        raise KeyError(f"未知预设: {preset_id}")
    kwargs = {s["key"]: s["value"] for s in _PARAM_SPECS[preset_id]}
    kwargs.update(_FIXED_DEFAULTS.get(preset_id, {}))
    for k, v in (params or {}).items():
        if k in kwargs:
            kwargs[k] = v
    return SELECTOR_REGISTRY[preset_id](**kwargs)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_presets.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/presets.py tests/test_presets.py && git commit -m "feat(backend): 技术面预设 schema 与 selector 构造"
```

---

## Task 9: 技术面筛选服务（screen）

**Files:**
- Create: `backend/app/screen.py`
- Test: `backend/tests/test_screen.py`

读 DB 中所有未退市股票的 `kline_day` → 构造 `Dict[code, df]` → 跑 selector → 组装 `TechnicalCandidate`（dict）。`sortKey` = 触发日期倒序（同日按 code）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_screen.py`:
```python
import pandas as pd

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay
from app.selectors import B2Selector
from app.screen import run_technical_screen


def _seed(code, closes, vols):
    dates = pd.date_range("2025-01-01", periods=len(closes), freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name=code.upper(), industry="测试业", is_st=False, is_bj=False))
        for d, c, v in zip(dates, closes, vols):
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.3, low=c - 0.3, volume=v))
        s.commit()


def test_screen_returns_candidate_when_selector_passes(db_path):
    init_db()
    # 构造一只必然通过 B2 的股票：先连续下跌压低 J，最后一日放量大涨
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed("sz000001", closes, vols)
    # 用同一 selector 现算 picks 作为期望（验证 DB↔screen 串联，而非重算指标）
    df = pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=len(closes), freq="D"),
        "open": closes, "close": closes,
        "high": [c + 0.3 for c in closes], "low": [c - 0.3 for c in closes],
        "volume": vols,
    })
    sel = B2Selector()
    expected = sel.select(df["date"].max(), {"sz000001": df})

    cands = run_technical_screen("b2", {})
    codes = [c["code"] for c in cands]
    assert codes == expected
    if cands:
        c = cands[0]
        assert c["name"] == "SZ000001"
        assert c["industry"] == "测试业"
        assert c["strategyName"] == "B2战法"
        assert "pctChg" in c["diagnostics"] and "volRatio" in c["diagnostics"]
        assert c["triggerDate"] == "2025-02-09"


def test_screen_excludes_delisted(db_path):
    init_db()
    _seed("sz000001", [10.0] * 50, [1000.0] * 50)
    with SessionLocal() as s:
        s.get(Stock, "sz000001").delisted_at = "2025-01-01 00:00:00"
        s.commit()
    cands = run_technical_screen("b2", {})
    assert cands == []
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_screen.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/screen.py`:
```python
from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay
from app.presets import build_selector, _NAMES


def _load_kline_data() -> Dict[str, pd.DataFrame]:
    """读所有未退市股票的日K，返回 {code: df(date,open,close,high,low,volume)}。"""
    data: Dict[str, pd.DataFrame] = {}
    with SessionLocal() as s:
        active = [code for (code,) in s.query(Stock.code).filter(Stock.delisted_at.is_(None)).all()]
        rows = (s.query(KlineDay.code, KlineDay.date, KlineDay.open, KlineDay.close,
                        KlineDay.high, KlineDay.low, KlineDay.volume)
                .filter(KlineDay.code.in_(active)).order_by(KlineDay.code, KlineDay.date).all())
    if not rows:
        return data
    df = pd.DataFrame(rows, columns=["code", "date", "open", "close", "high", "low", "volume"])
    df["date"] = pd.to_datetime(df["date"])
    for code, grp in df.groupby("code"):
        data[code] = grp.drop(columns=["code"]).reset_index(drop=True)
    return data


def _stock_meta() -> Dict[str, Dict[str, Any]]:
    with SessionLocal() as s:
        return {st.code: {"name": st.name, "industry": st.industry or ""}
                for st in s.query(Stock).all()}


def run_technical_screen(preset_id: str, params: Dict[str, Any]) -> List[dict]:
    selector = build_selector(preset_id, params)
    data = _load_kline_data()
    if not data:
        return []
    date = max(df["date"].max() for df in data.values())
    meta = _stock_meta()
    name = _NAMES.get(preset_id, preset_id)

    candidates: List[dict] = []
    for code, df in data.items():
        hist = selector._hist_for(df, date)
        if hist is None:
            continue
        diagnostics = selector.evaluate(hist)
        if diagnostics is None:
            continue
        close = float(hist["close"].iloc[-1])
        prev = float(hist["close"].iloc[-2])
        pct_chg = round((close - prev) / prev * 100, 2) if prev else 0.0
        trigger = pd.Timestamp(hist["date"].iloc[-1]).strftime("%Y-%m-%d")
        candidates.append({
            "code": code,
            "name": meta.get(code, {}).get("name", code),
            "industry": meta.get(code, {}).get("industry", ""),
            "close": round(close, 2),
            "pctChg": pct_chg,
            "strategyName": name,
            "triggerDate": trigger,
            "diagnostics": diagnostics,
            "sortKey": trigger,
        })
    candidates.sort(key=lambda c: (c["sortKey"], c["code"]), reverse=True)
    return candidates
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_screen.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/screen.py tests/test_screen.py && git commit -m "feat(backend): 技术面筛选服务"
```

---

## Task 10: 单股K线服务（现算指标）

**Files:**
- Create: `backend/app/kline_service.py`
- Test: `backend/tests/test_kline_service.py`

读某股某周期 K 线，现算 KDJ(k/d/j) 与白/黄线，返回 `{data, highLine, highLabel}`。`highLine` = 序列最高 high。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_kline_service.py`:
```python
import pandas as pd
import pytest

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay
from app.kline_service import get_stock_kline


def _seed(code="sz000001", n=60):
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name="测试", is_st=False, is_bj=False))
        for i, d in enumerate(dates):
            c = 10.0 + i * 0.1
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.5, low=c - 0.5, volume=1000.0))
        s.commit()


def test_kline_service_returns_indicators(db_path):
    init_db()
    _seed()
    out = get_stock_kline("sz000001", "day")
    assert "data" in out and len(out["data"]) == 60
    first = out["data"][0]
    assert {"date", "open", "close", "high", "low", "k", "d", "j", "whiteLine", "yellowLine"} <= set(first)
    assert out["highLine"] == max(p["high"] for p in out["data"])
    assert out["highLabel"]


def test_kline_service_unknown_period_raises(db_path):
    init_db()
    _seed()
    with pytest.raises(ValueError):
        get_stock_kline("sz000001", "year")


def test_kline_service_empty_for_unknown_code(db_path):
    init_db()
    _seed()
    out = get_stock_kline("sz999999", "day")
    assert out["data"] == []
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_kline_service.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`backend/app/kline_service.py`:
```python
from __future__ import annotations

from typing import Any, Dict

import pandas as pd

from app.db import SessionLocal
from app.models import KlineDay, KlineWeek, KlineMonth, KlineQuarter
from app.indicators import (
    compute_kdj, compute_zhixing_short_trend, compute_zhixing_bull_bear,
)

_MODELS = {"day": KlineDay, "week": KlineWeek, "month": KlineMonth, "quarter": KlineQuarter}


def get_stock_kline(code: str, period: str) -> Dict[str, Any]:
    if period not in _MODELS:
        raise ValueError(f"period 仅支持 {list(_MODELS)}")
    model = _MODELS[period]
    with SessionLocal() as s:
        rows = (s.query(model.date, model.open, model.close, model.high, model.low, model.volume)
                .filter_by(code=code).order_by(model.date).all())
    if not rows:
        return {"data": [], "highLine": 0.0, "highLabel": "历史高点"}
    df = pd.DataFrame(rows, columns=["date", "open", "close", "high", "low", "volume"])
    kdj = compute_kdj(df)
    white = compute_zhixing_short_trend(df, span=10)
    yellow = compute_zhixing_bull_bear(df)

    def _round(x):
        return None if pd.isna(x) else round(float(x), 3)

    data = []
    for i in range(len(df)):
        data.append({
            "date": df["date"].iloc[i],
            "open": round(float(df["open"].iloc[i]), 2),
            "close": round(float(df["close"].iloc[i]), 2),
            "high": round(float(df["high"].iloc[i]), 2),
            "low": round(float(df["low"].iloc[i]), 2),
            "k": _round(kdj["K"].iloc[i]),
            "d": _round(kdj["D"].iloc[i]),
            "j": _round(kdj["J"].iloc[i]),
            "whiteLine": _round(white.iloc[i]),
            "yellowLine": _round(yellow.iloc[i]),
        })
    high_line = round(float(df["high"].max()), 2)
    return {"data": data, "highLine": high_line, "highLabel": "历史高点"}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_kline_service.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/kline_service.py tests/test_kline_service.py && git commit -m "feat(backend): 单股K线+现算指标服务"
```

---

## Task 11: API 路由组装 + CORS

**Files:**
- Create: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api.py`

端点：`POST /refresh/kline`（后台任务）、`GET /refresh/status`、`GET /presets`、`GET /screen`、`GET /stock/{code}/kline`。`GET /screen` 的 `params` 以 JSON 字符串传入。开启 CORS 供 Vite dev server（5173）访问。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_api.py`:
```python
import json

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay
from app import refresh


def _seed_one(code="sz000001", n=50):
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name="测试股", industry="测试业", is_st=False, is_bj=False))
        for i, d in enumerate(dates):
            c = 10.0 + i * 0.1
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.5, low=c - 0.5, volume=1000.0))
        s.commit()


def test_presets_endpoint(client):
    r = client.get("/presets")
    assert r.status_code == 200
    assert {p["id"] for p in r.json()} == {"trend-support", "b2"}


def test_refresh_status_initial(client):
    refresh.reset_state()
    r = client.get("/refresh/status")
    body = r.json()
    assert body["kline"]["status"] == "idle"
    assert "fundamental" in body
    assert isinstance(body["kline"]["steps"], list)


def test_screen_endpoint(client):
    _seed_one()
    r = client.get("/screen", params={"preset": "b2", "params": json.dumps({})})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_screen_unknown_preset_returns_400(client):
    r = client.get("/screen", params={"preset": "nope"})
    assert r.status_code == 400


def test_stock_kline_endpoint(client):
    _seed_one()
    r = client.get("/stock/sz000001/kline", params={"period": "day"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 50
    assert "highLine" in body


def test_refresh_kline_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_kline_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/kline")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_api.py -v`
Expected: FAIL（路由未定义 / schemas 不存在）。

- [ ] **Step 3: 实现 schemas**

`backend/app/schemas.py`:
```python
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
```

- [ ] **Step 4: 实现路由**

`backend/app/main.py`（替换整个文件）:
```python
import json

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app import refresh
from app.presets import get_presets
from app.screen import run_technical_screen
from app.kline_service import get_stock_kline

app = FastAPI(title="i'mRich 选股器")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/presets")
def presets():
    return get_presets()


@app.post("/refresh/kline", status_code=202)
def refresh_kline(background: BackgroundTasks):
    refresh.run_kline_refresh  # 引用便于测试 monkeypatch
    background.add_task(refresh.run_kline_refresh)
    return {"status": "accepted"}


@app.get("/refresh/status")
def refresh_status():
    def _grp(g):
        return {"status": g.status, "updatedAt": g.updatedAt,
                "steps": [vars(s) for s in g.steps]}
    return {k: _grp(v) for k, v in refresh.STATE.items()}


@app.get("/screen")
def screen(preset: str, params: str = Query(default="{}")):
    try:
        parsed = json.loads(params) if params else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params 不是合法 JSON")
    try:
        return run_technical_screen(preset, parsed)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/stock/{code}/kline")
def stock_kline(code: str, period: str = "day"):
    try:
        return get_stock_kline(code, period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

> 注：测试 `test_refresh_kline_triggers_background` monkeypatch 了 `refresh.run_kline_refresh`，而路由通过 `refresh.run_kline_refresh`（模块属性）引用，BackgroundTasks 在响应后同步执行，故能捕获调用。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_api.py -v`
Expected: PASS

- [ ] **Step 6: 运行全部后端测试**

Run: `cd backend && ./venv/bin/pytest -v`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
cd backend && git add app/schemas.py app/main.py tests/test_api.py && git commit -m "feat(backend): API 路由组装 + CORS"
```

---

# 前端

> 前端无自动化测试。每个前端任务的验证步骤统一为：
> `cd frontend && npm run build` 通过，并按步骤所述在浏览器手动走查。
> 若尚未安装依赖：`cd frontend && npm install`（本次会话已执行过一次）。
> `npm run lint` 存在与本计划无关的预存在错误（见上方"已知前端 lint 基线"），不作为通过标准。

## Task 12: types.ts 类型扩展

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 扩展 StrategyId 与 Kline**

将 `frontend/src/types.ts` 末尾的 `StrategyId` 定义替换为：
```typescript
export type StrategyId =
  | 'super-growth'
  | 'oversold-bluechip'
  | 'trend-support'
  | 'b2'

export const STRATEGY_CATEGORY: Record<StrategyId, 'fundamental' | 'technical'> = {
  'super-growth': 'fundamental',
  'oversold-bluechip': 'fundamental',
  'trend-support': 'technical',
  'b2': 'technical',
}
```

将 `Kline` 接口替换为（新增可选指标字段）：
```typescript
export interface Kline {
  date: string
  open: number
  close: number
  low: number
  high: number
  k?: number | null
  d?: number | null
  j?: number | null
  whiteLine?: number | null
  yellowLine?: number | null
}
```

- [ ] **Step 2: 新增 TechnicalCandidate / Preset / RefreshStatus**

在 `frontend/src/types.ts` 末尾追加：
```typescript
export interface TechnicalCandidate {
  code: string
  name: string
  industry: string
  close: number
  pctChg: number
  strategyName: string
  triggerDate: string
  diagnostics: Record<string, number>
  sortKey: string
}

export interface PresetParam {
  key: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface Preset {
  id: StrategyId
  category: 'fundamental' | 'technical'
  name: string
  params: PresetParam[]
  warning?: string
}

export interface RefreshStep {
  label: string
  done: number
  total: number
  elapsed: string
  progress: number
}

export interface RefreshGroup {
  status: 'idle' | 'running' | 'done' | 'error'
  updatedAt: string | null
  steps: RefreshStep[]
}

export interface RefreshStatus {
  kline: RefreshGroup
  fundamental: RefreshGroup
}

export interface StockKlineResponse {
  data: Kline[]
  highLine: number
  highLabel: string
}
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误（已有引用 `StrategyId` 的文件仍兼容，因为是扩展而非删除）。

- [ ] **Step 4: 提交**

```bash
cd frontend && git add src/types.ts && git commit -m "feat(frontend): 扩展类型（4策略/技术指标K线/TechnicalCandidate）"
```

---

## Task 13: API 客户端

**Files:**
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: 实现 api.ts**

`frontend/src/lib/api.ts`:
```typescript
import type {
  Preset,
  RefreshStatus,
  StockKlineResponse,
  TechnicalCandidate,
  KlineTimeframe,
} from '@/types'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

export const api = {
  presets: () => get<Preset[]>('/presets'),
  refreshStatus: () => get<RefreshStatus>('/refresh/status'),
  refreshKline: async () => {
    const r = await fetch(`${BASE}/refresh/kline`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
  refreshFundamental: async () => {
    // 阶段1后端暂未实现，占位以保证按钮可点（阶段2接入）
    const r = await fetch(`${BASE}/refresh/fundamental`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
  screenTechnical: (preset: string, params: Record<string, number> = {}) =>
    get<TechnicalCandidate[]>(
      `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    ),
  stockKline: (code: string, period: KlineTimeframe) =>
    get<StockKlineResponse>(`/stock/${encodeURIComponent(code)}/kline?period=${period}`),
}
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/lib/api.ts && git commit -m "feat(frontend): 后端 API 客户端"
```

---

## Task 14: 策略选择侧栏（第二列）

**Files:**
- Create: `frontend/src/components/layout/StrategySidebar.tsx`

常驻第二列，分两组：基本面（创新高超级成长 / 低位错杀蓝筹）+ 分隔线 + 技术面战法（双线战法 / B2战法）。选中项高亮。

- [ ] **Step 1: 实现 StrategySidebar**

`frontend/src/components/layout/StrategySidebar.tsx`:
```tsx
import { cn } from '@/lib/utils'
import type { StrategyId } from '@/types'

const FUNDAMENTAL: { id: StrategyId; label: string }[] = [
  { id: 'super-growth', label: '创新高超级成长' },
  { id: 'oversold-bluechip', label: '低位错杀蓝筹' },
]

const TECHNICAL: { id: StrategyId; label: string }[] = [
  { id: 'trend-support', label: '双线战法' },
  { id: 'b2', label: 'B2战法' },
]

function Item({
  id, label, active, indent, onSelect,
}: {
  id: StrategyId
  label: string
  active: boolean
  indent?: boolean
  onSelect: (s: StrategyId) => void
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
        indent && 'pl-6',
        active
          ? 'bg-brand-soft font-medium text-brand-strong'
          : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
      )}
    >
      <span>{label}</span>
      {active && <span className="size-1.5 rounded-full bg-brand" />}
    </button>
  )
}

export function StrategySidebar({
  strategy, onSelect,
}: {
  strategy: StrategyId
  onSelect: (s: StrategyId) => void
}) {
  return (
    <aside className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-line bg-paper/40 px-3 py-5">
      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        策略选择
      </div>
      {FUNDAMENTAL.map((s) => (
        <Item key={s.id} {...s} active={strategy === s.id} onSelect={onSelect} />
      ))}

      <div className="my-2 border-t border-line-soft" />
      <div className="px-3 pb-1 text-[12px] font-medium text-ink-soft">技术面战法</div>
      {TECHNICAL.map((s) => (
        <Item key={s.id} {...s} active={strategy === s.id} indent onSelect={onSelect} />
      ))}
    </aside>
  )
}
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误（组件尚未被引用，但应能独立通过类型检查）。

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/components/layout/StrategySidebar.tsx && git commit -m "feat(frontend): 策略选择侧栏"
```

---

## Task 15: TopBar 改为双刷新按钮

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`

去掉策略 Tabs，改为「刷新行情」「刷新基本面」两个按钮 + 更新时间。按钮带 hover 文案（`title` 属性）。

- [ ] **Step 1: 替换 TopBar 实现**

`frontend/src/components/layout/TopBar.tsx`（替换整个文件）:
```tsx
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'

export function TopBar({
  updatedAt,
  onRefreshKline,
  onRefreshFundamental,
}: {
  updatedAt: string
  onRefreshKline: () => void
  onRefreshFundamental: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[13px] text-ink-soft">
          数据更新于 <span className="tnum">{updatedAt}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshKline}
          title="更新股票列表与全市场K线数据（日/周/月/季），建议每日收盘后执行"
        >
          <RotateCw className="size-3.5" />
          刷新行情
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshFundamental}
          title="更新财报、业绩预告快报、行业指数与研报数据，财报季前后建议执行"
        >
          <RotateCw className="size-3.5" />
          刷新基本面
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: 验证（App.tsx 暂未更新，类型检查会在 Task 20 收口）**

Run: `cd frontend && npx tsc --noEmit src/components/layout/TopBar.tsx 2>&1 | head` — 单文件无语法错误即可（App.tsx 的 props 不匹配将在 Task 20 修复，此处忽略 App.tsx 报错）。

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/components/layout/TopBar.tsx && git commit -m "feat(frontend): TopBar 改双刷新按钮"
```

---

## Task 16: DataRefreshProgress 改两组卡片

**Files:**
- Modify: `frontend/src/components/screener/DataRefreshProgress.tsx`
- Modify: `frontend/src/data/mock.ts`

改为接收 `RefreshStatus`，渲染任务组A/B 两个分组卡片；无数据时回退到 mock。

- [ ] **Step 1: 更新 mock 数据结构**

将 `frontend/src/data/mock.ts` 顶部 import 改为：
```typescript
import type { Candidate, StockDetail, RefreshStatus, Kline, TechnicalCandidate } from '@/types'
```

将文件末尾的 `REFRESH_TASKS` 定义整体替换为：
```typescript
export const REFRESH_STATUS: RefreshStatus = {
  kline: {
    status: 'done',
    updatedAt: '2025-06-16 10:30:00',
    steps: [
      { label: '股票列表', done: 2500, total: 2500, elapsed: '00:18', progress: 100 },
      { label: 'K线数据（日+周+月+季）', done: 2500, total: 2500, elapsed: '03:42', progress: 100 },
    ],
  },
  fundamental: {
    status: 'idle',
    updatedAt: null,
    steps: [
      { label: '财报数据', done: 0, total: 0, elapsed: '00:00', progress: 0 },
      { label: '业绩预告快报', done: 0, total: 0, elapsed: '00:00', progress: 0 },
      { label: '申万行业指数', done: 0, total: 0, elapsed: '00:00', progress: 0 },
      { label: '研报-全市场元数据', done: 0, total: 0, elapsed: '00:00', progress: 0 },
      { label: '研报-候选池解析', done: 0, total: 0, elapsed: '00:00', progress: 0 },
    ],
  },
}

export const TECH_CANDIDATES: TechnicalCandidate[] = [
  {
    code: 'sz300750', name: '宁德时代', industry: '电力设备', close: 243.58,
    pctChg: 1.2, strategyName: '双线战法', triggerDate: '2025-06-16',
    diagnostics: { j: 8.3, whiteLine: 240.1, yellowLine: 232.5, pctChg: 1.2 },
    sortKey: '2025-06-16',
  },
  {
    code: 'sz002371', name: '北方华创', industry: '半导体', close: 412.0,
    pctChg: 5.6, strategyName: 'B2战法', triggerDate: '2025-06-16',
    diagnostics: { volRatio: 2.1, pctChg: 5.6, j: 62.0, jPrev: -7.2 },
    sortKey: '2025-06-16',
  },
]
```

- [ ] **Step 2: 替换 DataRefreshProgress 实现**

`frontend/src/components/screener/DataRefreshProgress.tsx`（替换整个文件）:
```tsx
import { Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress'
import { REFRESH_STATUS } from '@/data/mock'
import type { RefreshGroup, RefreshStatus } from '@/types'

function Group({ title, group }: { title: string; group: RefreshGroup }) {
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-ink-soft">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {group.steps.map((t) => {
          const done = t.progress >= 100 && t.total > 0
          return (
            <div
              key={t.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-paper-2/50 p-3.5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium text-ink">{t.label}</span>
                <span className="tnum text-[12px] text-ink-soft">{t.done} / {t.total}</span>
                <span className="tnum text-[11px] text-ink-faint">耗时 {t.elapsed}</span>
              </div>
              {done ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-up/12 text-up">
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
              ) : (
                <div className="relative grid shrink-0 place-items-center">
                  <ProgressRing value={t.progress} />
                  <span className="tnum absolute text-[10px] font-semibold text-brand">{t.progress}%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DataRefreshProgress({ status }: { status?: RefreshStatus }) {
  const s = status ?? REFRESH_STATUS
  return (
    <Card>
      <CardHeader>
        <CardTitle>数据刷新进度</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Group title="任务组A · 行情" group={s.kline} />
        <Group title="任务组B · 基本面" group={s.fundamental} />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit src/components/screener/DataRefreshProgress.tsx src/data/mock.ts 2>&1 | grep -v App.tsx | head` — 这两个文件无错误即可。

- [ ] **Step 4: 提交**

```bash
cd frontend && git add src/components/screener/DataRefreshProgress.tsx src/data/mock.ts && git commit -m "feat(frontend): 刷新进度改任务组A/B两组卡片"
```

---

## Task 17: 统一 PriceChart（KDJ 副图 + 白黄线）

**Files:**
- Modify: `frontend/src/components/detail/PriceChart.tsx`

在现有 K 线主图基础上叠加白线/黄线（来自 `Kline.whiteLine/yellowLine`），并新增 KDJ 副图（k/d/j 三线）。组件改为接收单一周期数据数组 + 周期切换由父级或内部控制。为同时服务策略1/2下钻页（四周期数据）与技术面右栏（按 code 拉取），保留原有「四周期 props + 内部 Tabs 切换」的对外签名，仅增强 ChartBody。

- [ ] **Step 1: 替换 PriceChart 实现**

`frontend/src/components/detail/PriceChart.tsx`（替换整个文件）:
```tsx
import { useEffect, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Kline, KlineTimeframe } from '@/types'

const UP = '#c0392b'
const DOWN = '#2f8f6f'
const INK_SOFT = '#8b96a1'
const WHITE_LINE = '#2b6cb0'
const YELLOW_LINE = '#c79a3a'
const LINE_THRESHOLD = 120

const PERIODS: { key: KlineTimeframe; label: string }[] = [
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
  { key: 'quarter', label: '季K' },
]

const INITIAL_SHOW: Record<KlineTimeframe, number> = { day: 60, week: 52, month: 36, quarter: 20 }

function ChartBody({
  data, period, highLine, highLabel,
}: {
  data: Kline[]
  period: KlineTimeframe
  highLine: number
  highLabel: string
}) {
  const initCount = Math.min(INITIAL_SHOW[period], data.length)
  const initStart = data.length > 0 ? ((data.length - initCount) / data.length) * 100 : 0

  const zoomRef = useRef({ start: initStart, end: 100 })
  const asLineRef = useRef(initCount > LINE_THRESHOLD)
  const [asLine, setAsLine] = useState(asLineRef.current)
  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDataZoom = (params: { start?: number; end?: number; batch?: { start?: number; end?: number }[] }) => {
    const p = params.batch?.[0] ?? params
    const start = p.start ?? zoomRef.current.start
    const end = p.end ?? zoomRef.current.end
    zoomRef.current = { start, end }
    const visible = Math.round(((end - start) / 100) * data.length)
    const line = visible > LINE_THRESHOLD
    if (line !== asLineRef.current) {
      asLineRef.current = line
      setAsLine(line)
    }
  }

  useEffect(() => {
    const el = containerRef.current
    const chart = chartRef.current?.getEchartsInstance()
    if (!el || !chart) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      e.stopPropagation()
      const { start, end } = zoomRef.current
      const range = end - start
      const shift = (e.deltaX / el.clientWidth) * range
      let newStart = start + shift
      let newEnd = end + shift
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      chart.dispatchAction({ type: 'dataZoom', start: newStart, end: newEnd })
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  const hasKdj = data.some((d) => d.j != null)

  const markLine = {
    symbol: 'none',
    lineStyle: { color: '#2b3a4d', type: 'dashed' as const, width: 1 },
    label: { position: 'insideStartTop' as const, color: '#2b3a4d', fontSize: 11, formatter: `${highLabel} ${highLine}` },
    data: [{ yAxis: highLine }],
  }

  const priceSeries = asLine
    ? [{
        type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '收盘',
        data: data.map((d) => d.close), smooth: true, symbol: 'none',
        lineStyle: { color: UP, width: 1.5 },
        areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: 'rgba(192,57,43,0.12)' }, { offset: 1, color: 'rgba(192,57,43,0)' }] } },
        markLine,
      }]
    : [{
        type: 'candlestick' as const, xAxisIndex: 0, yAxisIndex: 0, name: 'K线',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
        markLine,
      }]

  const overlaySeries = [
    { type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '白线', data: data.map((d) => d.whiteLine ?? null),
      smooth: true, symbol: 'none', lineStyle: { color: WHITE_LINE, width: 1 }, connectNulls: true },
    { type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '黄线', data: data.map((d) => d.yellowLine ?? null),
      smooth: true, symbol: 'none', lineStyle: { color: YELLOW_LINE, width: 1 }, connectNulls: true },
  ]

  const kdjSeries = hasKdj
    ? [
        { type: 'line' as const, xAxisIndex: 1, yAxisIndex: 1, name: 'K', data: data.map((d) => d.k ?? null),
          symbol: 'none', lineStyle: { color: '#5b8def', width: 1 }, connectNulls: true },
        { type: 'line' as const, xAxisIndex: 1, yAxisIndex: 1, name: 'D', data: data.map((d) => d.d ?? null),
          symbol: 'none', lineStyle: { color: '#c79a3a', width: 1 }, connectNulls: true },
        { type: 'line' as const, xAxisIndex: 1, yAxisIndex: 1, name: 'J', data: data.map((d) => d.j ?? null),
          symbol: 'none', lineStyle: { color: '#c0392b', width: 1 }, connectNulls: true },
      ]
    : []

  const xCommon = {
    type: 'category' as const,
    data: data.map((d) => d.date),
    boundaryGap: true,
    axisLine: { lineStyle: { color: '#e9e0c9' } },
    axisTick: { show: false },
  }

  const option: EChartsOption = {
    animation: false,
    legend: { show: true, top: 0, right: 8, textStyle: { color: INK_SOFT, fontSize: 10 },
      data: hasKdj ? ['白线', '黄线', 'K', 'D', 'J'] : ['白线', '黄线'] },
    grid: hasKdj
      ? [{ left: 8, right: 12, top: 28, height: '58%', containLabel: true },
         { left: 8, right: 12, top: '74%', height: '18%', containLabel: true }]
      : [{ left: 8, right: 12, top: 28, bottom: 20, containLabel: true }],
    tooltip: { trigger: 'axis', axisPointer: { type: asLine ? 'line' : 'cross' },
      backgroundColor: '#fffdf7', borderColor: '#e9e0c9', textStyle: { color: '#2b3a4d', fontSize: 12 } },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    dataZoom: [{ type: 'inside', xAxisIndex: hasKdj ? [0, 1] : [0],
      start: zoomRef.current.start, end: zoomRef.current.end,
      zoomOnMouseWheel: true, moveOnMouseMove: true }],
    xAxis: hasKdj
      ? [{ ...xCommon, axisLabel: { show: false }, gridIndex: 0 },
         { ...xCommon, gridIndex: 1, axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7) } }]
      : [{ ...xCommon, axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7), interval: 'auto' } }],
    yAxis: hasKdj
      ? [{ scale: true, position: 'right', gridIndex: 0, splitLine: { lineStyle: { color: '#f0e8d4' } },
           axisLabel: { color: INK_SOFT, fontSize: 10 } },
         { scale: true, position: 'right', gridIndex: 1, splitNumber: 2, splitLine: { lineStyle: { color: '#f0e8d4' } },
           axisLabel: { color: INK_SOFT, fontSize: 10 } }]
      : [{ scale: true, position: 'right', splitLine: { lineStyle: { color: '#f0e8d4' } },
           axisLabel: { color: INK_SOFT, fontSize: 10 } }],
    series: [...priceSeries, ...overlaySeries, ...kdjSeries],
  }

  return (
    <div ref={containerRef}>
      <ReactECharts ref={chartRef} option={option} style={{ height: hasKdj ? 360 : 260 }}
        notMerge onEvents={{ datazoom: handleDataZoom }} />
    </div>
  )
}

export function PriceChart({
  klineDay, klineWeek, klineMonth, klineQuarter, highLine, highLabel,
}: {
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
  highLine: number
  highLabel: string
}) {
  const [period, setPeriod] = useState<KlineTimeframe>('day')
  const dataMap: Record<KlineTimeframe, Kline[]> = {
    day: klineDay, week: klineWeek, month: klineMonth, quarter: klineQuarter,
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">股价走势</span>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as KlineTimeframe)}>
          <TabsList className="h-7 p-0.5">
            {PERIODS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="px-2.5 py-1 text-xs">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <ChartBody key={period} data={dataMap[period]} period={period} highLine={highLine} highLabel={highLabel} />
    </div>
  )
}
```

- [ ] **Step 2: 验证 + 浏览器走查**

Run: `cd frontend && npx tsc --noEmit src/components/detail/PriceChart.tsx 2>&1 | grep PriceChart | head`
Expected: 无 PriceChart 相关错误。
浏览器走查推迟到 Task 19/20 整体联调时进行（届时确认白黄线与 KDJ 副图渲染正常）。

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/components/detail/PriceChart.tsx && git commit -m "feat(frontend): 统一PriceChart叠加白黄线与KDJ副图"
```

---

## Task 18: 技术面候选列表 + 参数面板

**Files:**
- Create: `frontend/src/components/technical/TechnicalCandidateList.tsx`

顶部精简参数面板（按当前预设的 `params` 用 `NumberField` 渲染），下方候选列表渲染 `TechnicalCandidate[]`，点击行回调选中 code。

- [ ] **Step 1: 实现组件**

`frontend/src/components/technical/TechnicalCandidateList.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import type { Preset, TechnicalCandidate } from '@/types'

export function TechnicalCandidateList({
  preset,
  paramValues,
  onParamChange,
  onApply,
  candidates,
  selectedCode,
  onSelect,
}: {
  preset: Preset | null
  paramValues: Record<string, number>
  onParamChange: (key: string, value: number) => void
  onApply: () => void
  candidates: TechnicalCandidate[]
  selectedCode: string
  onSelect: (code: string) => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{preset?.name ?? '技术面战法'}</CardTitle>
        <Button variant="primary" size="sm" onClick={onApply}>运行筛选</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 精简参数面板 */}
        {preset && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line-soft pb-4 sm:grid-cols-3">
            {preset.params.map((p) => (
              <NumberField
                key={p.key}
                label={p.label}
                op="="
                unit={p.unit ?? ''}
                value={paramValues[p.key] ?? p.value}
                onChange={(v) => onParamChange(p.key, v)}
              />
            ))}
          </div>
        )}

        {/* 候选列表 */}
        <div className="flex flex-col gap-1.5">
          {candidates.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-faint">暂无候选，点击「运行筛选」</div>
          )}
          {candidates.map((c) => {
            const on = c.code === selectedCode
            return (
              <button
                key={c.code}
                onClick={() => onSelect(c.code)}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                  on ? 'border-brand bg-brand-soft' : 'border-line-soft hover:bg-paper-2',
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                  <span className="tnum text-[11px] text-ink-faint">{c.code} · {c.industry || '—'}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="tnum text-sm text-ink">{c.close}</span>
                  <span className={cn('tnum text-[11px]', c.pctChg >= 0 ? 'text-up' : 'text-down')}>
                    {c.pctChg >= 0 ? '+' : ''}{c.pctChg}%
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npx tsc --noEmit src/components/technical/TechnicalCandidateList.tsx 2>&1 | grep Technical | head`
Expected: 无 TechnicalCandidateList 相关错误。（若 `CardHeader` 不支持 `flex-row` 等 className，改用外层 div 包裹标题与按钮——先查看 `src/components/ui/card.tsx` 确认 `CardHeader` 透传 className，本仓库 Card 组件均透传 className。）

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/components/technical/TechnicalCandidateList.tsx && git commit -m "feat(frontend): 技术面候选列表与参数面板"
```

---

## Task 19: 技术面战法页面（TechnicalScreenView）

**Files:**
- Create: `frontend/src/components/technical/TechnicalScreenView.tsx`

左栏：`TechnicalCandidateList` + `DataRefreshProgress`；右栏：统一 `PriceChart`（数据来自 `/stock/{code}/kline`，四周期分别拉取，失败回退 mock）。不展示财报/研报/风险卡片。

- [ ] **Step 1: 实现页面**

`frontend/src/components/technical/TechnicalScreenView.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { DataRefreshProgress } from '@/components/screener/DataRefreshProgress'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalCandidateList } from './TechnicalCandidateList'
import { api } from '@/lib/api'
import { TECH_CANDIDATES } from '@/data/mock'
import type { Kline, KlineTimeframe, Preset, RefreshStatus, StrategyId, TechnicalCandidate } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

export function TechnicalScreenView({
  strategy,
  preset,
  refreshStatus,
}: {
  strategy: StrategyId
  preset: Preset | null
  refreshStatus?: RefreshStatus
}) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [candidates, setCandidates] = useState<TechnicalCandidate[]>(TECH_CANDIDATES)
  const [selectedCode, setSelectedCode] = useState<string>(TECH_CANDIDATES[0]?.code ?? '')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [highLine, setHighLine] = useState(0)
  const [highLabel, setHighLabel] = useState('历史高点')

  // 切换策略时重置参数为预设默认
  useEffect(() => {
    if (preset) setParamValues(Object.fromEntries(preset.params.map((p) => [p.key, p.value])))
  }, [preset])

  const runScreen = useMemo(() => async () => {
    try {
      const res = await api.screenTechnical(strategy, paramValues)
      setCandidates(res)
      if (res[0]) setSelectedCode(res[0].code)
    } catch {
      setCandidates(TECH_CANDIDATES)
    }
  }, [strategy, paramValues])

  // 选中股票 → 拉取四周期K线
  useEffect(() => {
    if (!selectedCode) return
    let cancelled = false
    const load = async () => {
      try {
        const periods: KlineTimeframe[] = ['day', 'week', 'month', 'quarter']
        const results = await Promise.all(periods.map((p) => api.stockKline(selectedCode, p)))
        if (cancelled) return
        setKline({
          day: results[0].data, week: results[1].data,
          month: results[2].data, quarter: results[3].data,
        })
        setHighLine(results[0].highLine)
        setHighLabel(results[0].highLabel)
      } catch {
        if (!cancelled) setKline(EMPTY_KLINE)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCode])

  return (
    <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <TechnicalCandidateList
          preset={preset}
          paramValues={paramValues}
          onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
          onApply={runScreen}
          candidates={candidates}
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
        />
        <DataRefreshProgress status={refreshStatus} />
      </div>

      <div className="min-w-0">
        <Card>
          <CardContent className="pt-5">
            <PriceChart
              klineDay={kline.day} klineWeek={kline.week}
              klineMonth={kline.month} klineQuarter={kline.quarter}
              highLine={highLine} highLabel={highLabel}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npx tsc --noEmit src/components/technical/TechnicalScreenView.tsx 2>&1 | grep Technical | head`
Expected: 无 TechnicalScreenView 相关错误。

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/components/technical/TechnicalScreenView.tsx && git commit -m "feat(frontend): 技术面战法页面两栏布局"
```

---

## Task 20: App.tsx 三栏整合 + 视图切换

**Files:**
- Modify: `frontend/src/App.tsx`

插入 `StrategySidebar` 变三栏；按 `STRATEGY_CATEGORY[strategy]` 切换主内容区：technical → `TechnicalScreenView`，fundamental → 原策略1/2视图。TopBar 改用新双刷新按钮。拉取 `/presets` 与 `/refresh/status`。

- [ ] **Step 1: 替换 App.tsx**

`frontend/src/App.tsx`（替换整个文件）:
```tsx
import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { TopBar } from '@/components/layout/TopBar'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { CandidateResults } from '@/components/screener/CandidateResults'
import { DataRefreshProgress } from '@/components/screener/DataRefreshProgress'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { TechnicalScreenView } from '@/components/technical/TechnicalScreenView'
import { CANDIDATES, STOCK_DETAIL } from '@/data/mock'
import { KEYWORDS } from '@/data/signals'
import { api } from '@/lib/api'
import { STRATEGY_CATEGORY, type Preset, type RefreshStatus, type StrategyId } from '@/types'

const DEFAULT_FILTER: FilterState = {
  netProfitYoY: 30, revenueYoY: 20, priceFromHigh: 25, keywordWindow: '30',
  sectorThreshold: 60, keywords: Object.fromEntries(KEYWORDS.map((k) => [k, true])),
  pool: 'all', industry: 'all',
}

export default function App() {
  const [strategy, setStrategy] = useState<StrategyId>('trend-support')
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [selectedCode, setSelectedCode] = useState<string>(STOCK_DETAIL.code)
  const [presets, setPresets] = useState<Preset[]>([])
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | undefined>(undefined)

  useEffect(() => {
    api.presets().then(setPresets).catch(() => setPresets([]))
    api.refreshStatus().then(setRefreshStatus).catch(() => setRefreshStatus(undefined))
  }, [])

  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const activePreset = presets.find((p) => p.id === strategy) ?? null
  const updatedAt = refreshStatus?.kline.updatedAt ?? '—'

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar />
      <StrategySidebar strategy={strategy} onSelect={setStrategy} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          updatedAt={updatedAt}
          onRefreshKline={() => api.refreshKline().catch(() => {})}
          onRefreshFundamental={() => api.refreshFundamental().catch(() => {})}
        />

        {isTechnical ? (
          <TechnicalScreenView strategy={strategy} preset={activePreset} refreshStatus={refreshStatus} />
        ) : (
          <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <FilterPanel
                strategy={strategy}
                state={filter}
                onChange={setFilter}
                onApply={() => {}}
                onReset={() => setFilter(DEFAULT_FILTER)}
              />
              <CandidateResults candidates={CANDIDATES} selectedCode={selectedCode} onSelect={setSelectedCode} />
              <DataRefreshProgress status={refreshStatus} />
            </div>
            <div className="min-w-0">
              <StockDetailPanel detail={STOCK_DETAIL} onClose={() => setSelectedCode('')} />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
```

> 注：`FilterPanel` 的 `strategy` prop 仅在 `'super-growth' | 'oversold-bluechip'` 语境使用，此分支只在 `isTechnical === false` 时渲染，传入值必为基本面策略，类型兼容（`StrategyId` 是其超集，无需改 FilterPanel）。

- [ ] **Step 2: 全量类型检查 + 构建**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 类型检查与构建均通过。

- [ ] **Step 3: 浏览器联调走查**

启动后端：`cd backend && ./venv/bin/uvicorn app.main:app --port 8000`（首次需先点「刷新行情」灌数据，或用少量股票测试）。
启动前端：`cd frontend && npm run dev`，浏览器打开。
走查清单：
- 三栏布局正常，策略选择侧栏显示基本面2项 + 分隔线 + 技术面战法2项。
- 点「双线战法/B2战法」→ 主内容区切换为「参数+候选列表 | K线图」两栏。
- 点「创新高超级成长/低位错杀蓝筹」→ 切回原筛选+详情两栏。
- 技术面下点候选股票 → 右侧 PriceChart 显示 K线 + 白黄线 + KDJ 副图，周期 Tabs 可切换。
- TopBar 两个刷新按钮 hover 显示文案；刷新进度卡片显示任务组A/B两组。

- [ ] **Step 4: 提交**

```bash
cd frontend && git add src/App.tsx && git commit -m "feat(frontend): 三栏布局与技术面/基本面视图切换"
```

---

## 收尾验证

- [ ] **后端全量测试**

Run: `cd backend && ./venv/bin/pytest -v`
Expected: 全部 PASS。

- [ ] **前端构建**

Run: `cd frontend && npm run build`
Expected: 通过。（`npm run lint` 的10个预存在错误见前文"已知前端 lint 基线"说明，非本计划范围，不要求清零。）

- [ ] **端到端冒烟（可选，需网络）**

启动后端后 `curl -X POST localhost:8000/refresh/kline`，轮询 `curl localhost:8000/refresh/status` 观察任务组A两步从 running → done；随后 `curl "localhost:8000/screen?preset=b2&params=%7B%7D"` 应返回 JSON 数组。

---

## 自检对照（spec 阶段1覆盖）

- SQLite 建库 + FastAPI 骨架 → Task 1、2、11 ✓
- 移植 `fetch_kline.py`（日K全量重抓 + 周/月/季K重采样）→ Task 5、6、7 ✓
- 移植 `TrendSupportSelector`/`B2Selector` 及指标函数（输入改读 `kline_day`）→ Task 3、4、9 ✓
- 端点 `/refresh/kline`、`/refresh/status`、`/presets`、`/screen?preset=trend-support|b2`、`/stock/{code}/kline` → Task 11 ✓
- 前端策略选择侧栏 + 技术面两栏布局 + 统一 `PriceChart` → Task 14–20 ✓
- `TechnicalCandidate.diagnostics` 字段（未决事项1）→ 已在 Task 4 从 Selector 计算逻辑提取确定（双线：pctChg/j/whiteLine/yellowLine；B2：pctChg/volRatio/j/jPrev）✓
- 技术面参数面板（未决事项2）→ Task 8 定义可调标量 + Task 18 渲染 ✓
- 类型变更（`StrategyId` 4值 / `Kline` 增指标 / `TechnicalCandidate`）→ Task 12 ✓
