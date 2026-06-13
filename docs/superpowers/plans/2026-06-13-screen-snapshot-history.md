# 双线/B2 战法筛选结果按天快照 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技术面战法筛选结果按 (战法, 数据日期) 缓存到数据库，同参数命中缓存秒回，前端可回选历史日期的结果。

**Architecture:** 在 `screen.py` 中新增快照读写函数，改造 `run_technical_screen` 先查缓存再计算再写缓存；新增两个只读 API 供前端拉取历史列表和指定日期结果；前端在 `StockListCard` 卡头增加历史日期下拉框。

**Tech Stack:** SQLite + SQLAlchemy (后端), React + TypeScript (前端)

---

## 文件变更地图

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/app/models.py` | 修改 | 新增 `ScreenSnapshot` ORM 模型 |
| `backend/app/screen.py` | 修改 | 新增 `_latest_kline_date`/`_load_snapshot`/`_save_snapshot`/`list_screen_snapshots`/`get_screen_snapshot`，改造 `run_technical_screen` |
| `backend/app/schemas.py` | 修改 | 新增 `ScreenSnapshotMeta` |
| `backend/app/main.py` | 修改 | 新增 `/screen/history` 和 `/screen/history/{date}` 路由 |
| `backend/tests/test_screen.py` | 修改 | 新增快照缓存/覆盖/空结果测试 |
| `backend/tests/test_api.py` | 修改 | 新增历史 API 测试 |
| `frontend/src/types.ts` | 修改 | 新增 `ScreenSnapshotMeta` 接口 |
| `frontend/src/lib/api.ts` | 修改 | 新增 `screenHistory`/`screenHistoryDetail` |
| `frontend/src/components/screener/StockListCard.tsx` | 修改 | 新增历史日期下拉框 props + 渲染 |
| `frontend/src/components/technical/TechnicalScreenView.tsx` | 修改 | 新增 `historyList`/`historyDate` 状态与交互逻辑 |

---

### Task 1: ScreenSnapshot ORM 模型

**Files:**
- Modify: `backend/app/models.py`

- [ ] **Step 1: 在 `models.py` 末尾添加 `ScreenSnapshot` 类**

在 `ResearchReport` 类之后追加：

```python
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
```

- [ ] **Step 2: 验证模型可被 import 无报错**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && python -c "from app.models import ScreenSnapshot; print(ScreenSnapshot.__tablename__)"`

Expected: `screen_snapshots`

- [ ] **Step 3: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add backend/app/models.py && git commit -m "feat: 新增 ScreenSnapshot ORM 模型"
```

---

### Task 2: 快照读写辅助函数 + run_technical_screen 改造

**Files:**
- Modify: `backend/app/screen.py`

- [ ] **Step 1: 写快照缓存命中与空结果写入的测试**

在 `tests/test_screen.py` 末尾追加：

```python
import json
from app.models import ScreenSnapshot


def _seed_with_date(code, closes, vols, start="2025-01-01"):
    dates = pd.date_range(start, periods=len(closes), freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name=code.upper(), industry="测试业", is_st=False, is_bj=False))
        for d, c, v in zip(dates, closes, vols):
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.3, low=c - 0.3, volume=v))
        s.commit()


def test_screen_saves_snapshot(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    result = run_technical_screen("b2", {})

    with SessionLocal() as s:
        snap = s.query(ScreenSnapshot).filter_by(preset_id="b2").one()
        assert snap.candidate_count == len(result)
        assert json.loads(snap.candidates_json) == result
        assert json.loads(snap.params_json) == {}
        assert snap.updated_at is not None


def test_screen_returns_cached_result_on_same_params(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    first = run_technical_screen("b2", {})
    second = run_technical_screen("b2", {})

    assert first == second
    with SessionLocal() as s:
        assert s.query(ScreenSnapshot).filter_by(preset_id="b2").count() == 1


def test_screen_overwrites_snapshot_on_different_params(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    run_technical_screen("b2", {})
    run_technical_screen("b2", {"up_threshold": 3.0})

    with SessionLocal() as s:
        assert s.query(ScreenSnapshot).filter_by(preset_id="b2").count() == 1
        snap = s.query(ScreenSnapshot).filter_by(preset_id="b2").one()
        assert json.loads(snap.params_json) == {"up_threshold": 3.0}


def test_screen_saves_empty_candidates_snapshot(db_path):
    init_db()
    _seed_with_date("sz000001", [10.0] * 50, [1000.0] * 50)

    result = run_technical_screen("b2", {})
    assert result == []

    with SessionLocal() as s:
        snap = s.query(ScreenSnapshot).filter_by(preset_id="b2").one()
        assert snap.candidate_count == 0
        assert json.loads(snap.candidates_json) == []

    # 缓存命中
    second = run_technical_screen("b2", {})
    assert second == []


def test_list_and_get_screen_snapshots(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    from app.screen import list_screen_snapshots, get_screen_snapshot
    run_technical_screen("b2", {})

    history = list_screen_snapshots("b2")
    assert len(history) == 1
    assert "date" in history[0]
    assert history[0]["count"] >= 0

    date = history[0]["date"]
    detail = get_screen_snapshot("b2", date)
    assert detail is not None
    assert isinstance(detail, list)

    assert get_screen_snapshot("b2", "2099-01-01") is None
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest tests/test_screen.py::test_screen_saves_snapshot -v`

Expected: FAIL — `ScreenSnapshot` not found / `list_screen_snapshots` not found

- [ ] **Step 3: 在 `screen.py` 中添加 import 和辅助函数**

将 `screen.py` 顶部 import 改为：

```python
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay, ScreenSnapshot
from app.presets import build_selector, _NAMES
from app.fundamental_screen import run_fundamental_screen
from app.pool_filters import filter_default_pool

logger = logging.getLogger(__name__)
```

在 `_stock_meta()` 函数之后、`run_technical_screen` 之前插入：

```python
def _latest_kline_date() -> Optional[str]:
    with SessionLocal() as s:
        return s.query(KlineDay.date).order_by(KlineDay.date.desc()).limit(1).scalar()


def _load_snapshot(preset_id: str, data_date: str) -> Optional[ScreenSnapshot]:
    with SessionLocal() as s:
        return s.query(ScreenSnapshot).filter_by(
            preset_id=preset_id, data_date=data_date
        ).first()


def _save_snapshot(preset_id: str, data_date: str, params_json: str,
                   candidates: List[dict]) -> None:
    try:
        with SessionLocal() as s:
            snap = s.query(ScreenSnapshot).filter_by(
                preset_id=preset_id, data_date=data_date
            ).first()
            if snap is None:
                snap = ScreenSnapshot(preset_id=preset_id, data_date=data_date)
                s.add(snap)
            snap.params_json = params_json
            snap.candidates_json = json.dumps(candidates, ensure_ascii=False)
            snap.candidate_count = len(candidates)
            snap.updated_at = datetime.now().isoformat()
            s.commit()
    except Exception:
        logger.exception("保存筛选快照失败")


def list_screen_snapshots(preset_id: str) -> List[dict]:
    with SessionLocal() as s:
        rows = (s.query(ScreenSnapshot)
                .filter_by(preset_id=preset_id)
                .order_by(ScreenSnapshot.data_date.desc())
                .all())
        return [
            {"date": r.data_date, "count": r.candidate_count, "updatedAt": r.updated_at or ""}
            for r in rows
        ]


def get_screen_snapshot(preset_id: str, data_date: str) -> Optional[List[dict]]:
    with SessionLocal() as s:
        snap = s.query(ScreenSnapshot).filter_by(
            preset_id=preset_id, data_date=data_date
        ).first()
        if snap is None:
            return None
        return json.loads(snap.candidates_json)
```

- [ ] **Step 4: 改造 `run_technical_screen` 函数**

替换 `run_technical_screen` 为：

```python
def run_technical_screen(preset_id: str, params: Dict[str, Any]) -> List[dict]:
    data_date = _latest_kline_date()
    if data_date is None:
        return []

    params_json = json.dumps(params or {}, sort_keys=True)
    snap = _load_snapshot(preset_id, data_date)
    if snap is not None and snap.params_json == params_json:
        return json.loads(snap.candidates_json)

    selector = build_selector(preset_id, params)
    data = _load_kline_data()
    if not data:
        return []
    date = pd.Timestamp(data_date)
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

    _save_snapshot(preset_id, data_date, params_json, candidates)
    return candidates
```

注意与原函数的差异：
1. 新增 `_latest_kline_date()` 查询和缓存命中判断在函数顶部
2. `date` 改为 `pd.Timestamp(data_date)`（原先用 `max(df["date"].max() ...)` 计算）
3. 末尾新增 `_save_snapshot` 调用

- [ ] **Step 5: 运行测试验证通过**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest tests/test_screen.py -v`

Expected: 所有测试 PASS（包括原有的 3 个 + 新增的 5 个）

- [ ] **Step 6: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add backend/app/screen.py backend/tests/test_screen.py && git commit -m "feat: 筛选快照缓存 — run_technical_screen 先查缓存再计算再写缓存"
```

---

### Task 3: ScreenSnapshotMeta schema + 历史 API 端点

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 写历史 API 的测试**

在 `tests/test_api.py` 末尾追加：

```python
from app.models import ScreenSnapshot


def test_screen_history_endpoint_empty(client):
    r = client.get("/screen/history", params={"preset": "b2"})
    assert r.status_code == 200
    assert r.json() == []


def test_screen_history_endpoint_returns_snapshots(client):
    _seed_one()
    # 先触发一次筛选以产生快照
    client.get("/screen", params={"preset": "b2", "params": json.dumps({})})

    r = client.get("/screen/history", params={"preset": "b2"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 1
    assert "date" in body[0]
    assert "count" in body[0]
    assert "updatedAt" in body[0]


def test_screen_history_detail_endpoint(client):
    _seed_one()
    client.get("/screen", params={"preset": "b2", "params": json.dumps({})})

    # 获取历史列表
    history = client.get("/screen/history", params={"preset": "b2"}).json()
    assert len(history) >= 1
    date = history[0]["date"]

    r = client.get(f"/screen/history/{date}", params={"preset": "b2"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_screen_history_detail_404(client):
    r = client.get("/screen/history/2099-01-01", params={"preset": "b2"})
    assert r.status_code == 404
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest tests/test_api.py::test_screen_history_endpoint_empty -v`

Expected: FAIL — 404 (路由不存在)

- [ ] **Step 3: 在 `schemas.py` 末尾添加 `ScreenSnapshotMeta`**

```python
class ScreenSnapshotMeta(BaseModel):
    date: str
    count: int
    updatedAt: str
```

- [ ] **Step 4: 在 `main.py` 中添加两个新路由**

在 `@app.get("/screen")` 路由之后插入：

```python
@app.get("/screen/history")
def screen_history(preset: str):
    from app.screen import list_screen_snapshots
    return list_screen_snapshots(preset)


@app.get("/screen/history/{date}")
def screen_history_detail(date: str, preset: str):
    from app.screen import get_screen_snapshot
    result = get_screen_snapshot(preset, date)
    if result is None:
        raise HTTPException(status_code=404, detail="未找到该日期的筛选结果")
    return result
```

- [ ] **Step 5: 运行 API 测试验证通过**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest tests/test_api.py -v`

Expected: 所有测试 PASS（包括原有的 + 新增的 4 个）

- [ ] **Step 6: 运行全量后端测试确保无回归**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest -v`

Expected: 所有测试 PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add backend/app/schemas.py backend/app/main.py backend/tests/test_api.py && git commit -m "feat: 新增 /screen/history 和 /screen/history/{date} API 端点"
```

---

### Task 4: 前端类型与 API 方法

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 `types.ts` 末尾添加 `ScreenSnapshotMeta` 接口**

```typescript
export interface ScreenSnapshotMeta {
  date: string
  count: number
  updatedAt: string
}
```

- [ ] **Step 2: 在 `api.ts` 中添加 import 和两个新方法**

在 `api.ts` 顶部 import 中追加 `ScreenSnapshotMeta`：

```typescript
import type {
  Candidate,
  MetaResponse,
  Preset,
  RefreshStatus,
  ScreenSnapshotMeta,
  StockDetail,
  StockKlineResponse,
  StockListResponse,
  StockSearchResponse,
  TechnicalCandidate,
  KlineTimeframe,
} from '@/types'
```

在 `api` 对象中 `searchStocks` 之后追加：

```typescript
  screenHistory: (preset: string) =>
    get<ScreenSnapshotMeta[]>(`/screen/history?preset=${encodeURIComponent(preset)}`),
  screenHistoryDetail: (preset: string, date: string) =>
    get<TechnicalCandidate[]>(`/screen/history/${date}?preset=${encodeURIComponent(preset)}`),
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add frontend/src/types.ts frontend/src/lib/api.ts && git commit -m "feat: 前端新增 ScreenSnapshotMeta 类型与 screenHistory/screenHistoryDetail API"
```

---

### Task 5: StockListCard 历史日期下拉框

**Files:**
- Modify: `frontend/src/components/screener/StockListCard.tsx`

- [ ] **Step 1: 新增 import 和 props**

在 `StockListCard.tsx` 顶部的类型 import 中追加 `ScreenSnapshotMeta`：

```typescript
import type { StockListItem, StockSortField, SortOrder, StockSearchItem, TechnicalCandidate, ScreenSnapshotMeta } from '@/types'
```

修改 `StockListCardProps` 接口，在 `onFirstLoad` 之后追加三个 props：

```typescript
interface StockListCardProps {
  /** 筛选结果（有值→筛选模式，空→全市场模式） */
  screenedData?: TechnicalCandidate[]
  /** 当前选中的股票代码 */
  selectedCode?: string
  /** 点击行回调（code, name） */
  onSelectCode?: (code: string, name: string) => void
  /** 清除筛选回调 */
  onClearScreen?: () => void
  /** 首次加载完成回调（code, name） */
  onFirstLoad?: (code: string, name: string) => void
  /** 历史快照日期列表 */
  historyList?: ScreenSnapshotMeta[]
  /** 当前选中的历史日期 */
  selectedHistoryDate?: string
  /** 选择历史日期回调 */
  onSelectHistoryDate?: (date: string) => void
}
```

修改组件函数签名，解构新 props：

```typescript
export function StockListCard({
  screenedData,
  selectedCode,
  onSelectCode,
  onClearScreen,
  onFirstLoad,
  historyList,
  selectedHistoryDate,
  onSelectHistoryDate,
}: StockListCardProps) {
```

- [ ] **Step 2: 在卡头的「清除筛选」按钮左侧渲染历史日期下拉框**

找到卡头 `<CardHeader>` 内的 `<div className="flex items-center gap-2">` 区域，在 `{isScreened && onClearScreen && (` 之前插入：

```tsx
          {isScreened && historyList && historyList.length > 0 && (
            <select
              value={selectedHistoryDate ?? ''}
              onChange={(e) => onSelectHistoryDate?.(e.target.value)}
              className="rounded-lg border border-line-soft bg-paper-2/50 px-2 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              {historyList.map((h) => (
                <option key={h.date} value={h.date}>
                  {h.date}（{h.count}只）
                </option>
              ))}
            </select>
          )}
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add frontend/src/components/screener/StockListCard.tsx && git commit -m "feat: StockListCard 新增历史日期下拉框"
```

---

### Task 6: TechnicalScreenView 历史状态与交互

**Files:**
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx`

- [ ] **Step 1: 新增 import 和状态**

在 `TechnicalScreenView.tsx` 顶部的类型 import 中追加 `ScreenSnapshotMeta`：

```typescript
import type { ActivityStatus, Kline, KlineTimeframe, Preset, StrategyId, TechnicalCandidate, ScreenSnapshotMeta } from '@/types'
```

在组件内部，`const screeningRef = useRef(false)` 之后新增：

```typescript
  const [historyList, setHistoryList] = useState<ScreenSnapshotMeta[]>([])
  const [historyDate, setHistoryDate] = useState<string | null>(null)
```

- [ ] **Step 2: 改造 `runScreen`，成功后刷新历史列表**

找到 `runScreen` 的 `try` 块中 `onActivity('technical-screen', 'done', ...)` 那一行之后、`catch` 之前插入：

```typescript
      // 刷新历史列表并自动选中最新日期
      try {
        const hList = await api.screenHistory(strategy)
        setHistoryList(hList)
        if (hList.length > 0) {
          setHistoryDate(hList[0].date)
        }
      } catch {
        setHistoryList([])
        setHistoryDate(null)
      }
```

- [ ] **Step 3: 新增 `onSelectHistoryDate` 回调**

在 `const showScreenedData = ...` 之前插入：

```typescript
  const handleSelectHistoryDate = async (date: string) => {
    if (date === historyDate) return
    try {
      const res = await api.screenHistoryDetail(strategy, date)
      setCandidates(res)
      setScreenMode('screened')
      setHistoryDate(date)
      if (res[0]) {
        setSelectedCode(res[0].code)
        setSelectedName(res[0].name)
      }
    } catch {
      // 请求失败时不切换
    }
  }
```

- [ ] **Step 4: 在切换策略的 effect 和 `clearScreen` 中重置历史状态**

找到切换策略的 `useEffect`（依赖 `[preset]`），在 `setFilterOpen(false)` 之后追加：

```typescript
    setHistoryList([])
    setHistoryDate(null)
```

找到 `clearScreen` 函数，在 `setScreenMode('market')` 之后追加：

```typescript
    setHistoryList([])
    setHistoryDate(null)
```

- [ ] **Step 5: 将历史 props 传给 `StockListCard`**

找到 `<StockListCard` 标签，在现有 props 末尾追加：

```tsx
            historyList={historyList.length > 0 ? historyList : undefined}
            selectedHistoryDate={historyDate ?? undefined}
            onSelectHistoryDate={handleSelectHistoryDate}
```

- [ ] **Step 6: 验证 TypeScript 编译通过**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 7: 运行前端 lint**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npm run lint`

Expected: 无错误

- [ ] **Step 8: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add frontend/src/components/technical/TechnicalScreenView.tsx && git commit -m "feat: TechnicalScreenView 历史快照交互 — 运行筛选后自动刷新历史、下拉框切换加载历史结果"
```

---

### Task 7: 端到端验证

**Files:** 无新文件

- [ ] **Step 1: 运行后端全量测试**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest -v`

Expected: 所有测试 PASS

- [ ] **Step 2: 运行前端类型检查与 lint**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit && npm run lint`

Expected: 无错误

- [ ] **Step 3: 手动验证（浏览器）**

启动前后端服务后验证：

1. 选择「双线战法」→ 调整参数 → 点「运行筛选」→ 结果展示后，卡头出现历史日期下拉框，自动选中当天日期
2. 再次点「运行筛选」（相同参数）→ 响应明显更快（命中缓存）
3. 从下拉框切换日期 → 候选列表更新为该日快照（网络面板只请求 `/screen/history/{date}`）
4. 切换到「B2战法」→ 下拉框消失
5. 运行 B2 筛选 → 下拉框出现，显示 B2 的历史
6. 点「清除筛选」→ 下拉框消失

- [ ] **Step 4: 最终 Commit（如有手动修复）**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich && git add -A && git commit -m "chore: 筛选快照功能端到端验证通过"
```
