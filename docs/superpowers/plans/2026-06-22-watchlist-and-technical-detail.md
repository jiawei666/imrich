# 自选功能 & 技术面详情卡增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现自选股功能（SQLite 两张表 + 完整 CRUD API + 前端页面/Modal/管理覆盖层）并将技术面战法的股票详情从纯 K 线图扩展为与基本面一致的完整详情面板（无得分/信号/风险提示）。

**Architecture:** 后端新增 `WatchlistGroup`/`WatchlistItem` 模型和 `/watchlist` 路由（独立 `app/watchlist.py`），挂载到 `main.py`。前端新建 `WatchlistPage` + 三个子组件（`WatchlistGroupPanel` / `AddToWatchlistModal` / `WatchlistManageOverlay`），通过 `onAddToWatchlist` prop 回调串联 `StockDetailPanel`。技术面增强只改 `TechnicalScreenView`，将原 kline 加载替换为 `api.stockDetail(code)` 并复用 `StockDetailPanel`。

**Tech Stack:** Python/FastAPI/SQLAlchemy 2.0/SQLite（后端），React 19/TypeScript/Tailwind v4/shadcn-ui/lucide-react（前端）

**Spec:** `docs/superpowers/specs/2026-06-22-watchlist-and-technical-detail-design.md`

---

## 文件改动汇总

### 后端（`backend/`）
| 操作 | 文件 | 说明 |
|---|---|---|
| 修改 | `app/models.py` | 新增 `WatchlistGroup`、`WatchlistItem` 模型 |
| 新建 | `app/watchlist.py` | 所有 `/watchlist/*` 路由 |
| 修改 | `app/main.py` | `app.include_router(watchlist.router)` |
| 新建 | `tests/test_watchlist.py` | CRUD 全链路测试 |

### 前端（`frontend/src/`）
| 操作 | 文件 | 说明 |
|---|---|---|
| 修改 | `types.ts` | 新增 `WatchlistGroup`、`WatchlistItem` 类型 |
| 修改 | `lib/api.ts` | 添加 `post`/`patch`/`del` 辅助函数 + `api.watchlist` 命名空间 |
| 修改 | `components/detail/StockDetailPanel.tsx` | 新增可选 `onAddToWatchlist` prop |
| 修改 | `components/technical/TechnicalScreenView.tsx` | 替换 kline 加载为 stockDetail，复用 `StockDetailPanel` |
| 新建 | `components/watchlist/WatchlistGroupPanel.tsx` | 左列分组+股票列表 |
| 新建 | `components/watchlist/AddToWatchlistModal.tsx` | 加入自选弹窗 |
| 新建 | `components/watchlist/WatchlistManageOverlay.tsx` | 全屏自选管理覆盖层 |
| 新建 | `pages/WatchlistPage.tsx` | 自选主页面 |
| 修改 | `App.tsx` | 扩展 `view` 类型，渲染 `WatchlistPage` |
| 修改 | `components/layout/Sidebar.tsx` | 扩展 `onNavigate` 类型 |
| 修改 | `pages/ScreenPage.tsx` | 传入 `onAddToWatchlist` + `AddToWatchlistModal` |

---

## Task 1: 后端数据模型

**Files:**
- Modify: `backend/app/models.py`

- [ ] **Step 1: 在 `models.py` 头部补充导入**

在 `backend/app/models.py` 现有 import 行末尾追加：

```python
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
```

完整 import 区域变为：

```python
from typing import Optional

from sqlalchemy import Float, Integer, String, Boolean, UniqueConstraint, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
```

- [ ] **Step 2: 在 `models.py` 末尾追加两个新模型**

在文件最末尾（`RefreshStepState` 类之后）添加：

```python
class WatchlistGroup(Base):
    __tablename__ = "watchlist_groups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    items: Mapped[list["WatchlistItem"]] = relationship(
        "WatchlistItem", back_populates="group", cascade="all, delete-orphan"
    )


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("watchlist_groups.id"), nullable=False)
    stock_code: Mapped[str] = mapped_column(String, nullable=False)
    stock_name: Mapped[str] = mapped_column(String, nullable=False)
    industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    strategy_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    group: Mapped["WatchlistGroup"] = relationship("WatchlistGroup", back_populates="items")

    __table_args__ = (UniqueConstraint("group_id", "stock_code", name="uq_watchlist_item"),)
```

- [ ] **Step 3: 验证模型可导入**

```bash
cd backend && source venv/bin/activate
python -c "from app.models import WatchlistGroup, WatchlistItem; print('OK')"
```

预期输出：`OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add WatchlistGroup and WatchlistItem models"
```

---

## Task 2: 后端 Watchlist CRUD API

**Files:**
- Create: `backend/app/watchlist.py`
- Create: `backend/tests/test_watchlist.py`

- [ ] **Step 1: 写测试（先写后跑，验证失败）**

新建 `backend/tests/test_watchlist.py`：

```python
import pytest
from app.db import init_db
from app.models import WatchlistGroup, WatchlistItem


# ---------- 分组 CRUD ----------

def test_create_group(client):
    r = client.post("/watchlist/groups", json={"name": "双线战法"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "双线战法"
    assert data["items"] == []


def test_create_group_duplicate_returns_409(client):
    client.post("/watchlist/groups", json={"name": "双线战法"})
    r = client.post("/watchlist/groups", json={"name": "双线战法"})
    assert r.status_code == 409


def test_list_groups_empty(client):
    r = client.get("/watchlist/groups")
    assert r.status_code == 200
    assert r.json() == []


def test_rename_group(client):
    g = client.post("/watchlist/groups", json={"name": "旧名"}).json()
    r = client.patch(f"/watchlist/groups/{g['id']}", json={"name": "新名"})
    assert r.status_code == 200
    assert r.json()["name"] == "新名"


def test_delete_group(client):
    g = client.post("/watchlist/groups", json={"name": "临时组"}).json()
    r = client.delete(f"/watchlist/groups/{g['id']}")
    assert r.status_code == 204
    assert client.get("/watchlist/groups").json() == []


def test_reorder_group(client):
    a = client.post("/watchlist/groups", json={"name": "A"}).json()
    b = client.post("/watchlist/groups", json={"name": "B"}).json()
    client.patch(f"/watchlist/groups/{a['id']}", json={"sort_order": 10})
    client.patch(f"/watchlist/groups/{b['id']}", json={"sort_order": 5})
    groups = client.get("/watchlist/groups").json()
    assert groups[0]["name"] == "B"
    assert groups[1]["name"] == "A"


# ---------- 成员 CRUD ----------

def test_add_item_with_group_id(client):
    g = client.post("/watchlist/groups", json={"name": "双线战法"}).json()
    r = client.post("/watchlist/items", json={
        "group_id": g["id"],
        "stock_code": "sz000001",
        "stock_name": "平安银行",
        "industry": "银行",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["stock_code"] == "sz000001"
    assert data["industry"] == "银行"


def test_add_item_auto_creates_group_from_strategy(client):
    r = client.post("/watchlist/items", json={
        "stock_code": "sz000001",
        "stock_name": "平安银行",
        "strategy_id": "trend-support",
    })
    assert r.status_code == 201
    groups = client.get("/watchlist/groups").json()
    assert any(g["name"] == "双线战法" for g in groups)


def test_add_item_duplicate_returns_409(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"})
    r = client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"})
    assert r.status_code == 409


def test_same_stock_in_multiple_groups(client):
    g1 = client.post("/watchlist/groups", json={"name": "G1"}).json()
    g2 = client.post("/watchlist/groups", json={"name": "G2"}).json()
    r1 = client.post("/watchlist/items", json={"group_id": g1["id"], "stock_code": "sz000001", "stock_name": "A"})
    r2 = client.post("/watchlist/items", json={"group_id": g2["id"], "stock_code": "sz000001", "stock_name": "A"})
    assert r1.status_code == 201
    assert r2.status_code == 201


def test_delete_item(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    item = client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"}).json()
    r = client.delete(f"/watchlist/items/{item['id']}")
    assert r.status_code == 204
    groups = client.get("/watchlist/groups").json()
    assert groups[0]["items"] == []


def test_move_item_to_other_group(client):
    g1 = client.post("/watchlist/groups", json={"name": "G1"}).json()
    g2 = client.post("/watchlist/groups", json={"name": "G2"}).json()
    item = client.post("/watchlist/items", json={"group_id": g1["id"], "stock_code": "sz000001", "stock_name": "A"}).json()
    r = client.patch(f"/watchlist/items/{item['id']}", json={"group_id": g2["id"]})
    assert r.status_code == 200
    groups = client.get("/watchlist/groups").json()
    g1_data = next(g for g in groups if g["id"] == g1["id"])
    g2_data = next(g for g in groups if g["id"] == g2["id"])
    assert g1_data["items"] == []
    assert len(g2_data["items"]) == 1


def test_delete_group_cascades_items(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"})
    client.delete(f"/watchlist/groups/{g['id']}")
    assert client.get("/watchlist/groups").json() == []


def test_items_appear_in_group_list(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "平安银行"})
    groups = client.get("/watchlist/groups").json()
    assert groups[0]["items"][0]["stock_code"] == "sz000001"
```

- [ ] **Step 2: 跑测试确认全部失败**

```bash
cd backend && source venv/bin/activate
pytest tests/test_watchlist.py -v 2>&1 | head -30
```

预期：全部 FAILED（路由不存在，404/ImportError）

- [ ] **Step 3: 实现 `app/watchlist.py`**

新建 `backend/app/watchlist.py`：

```python
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import WatchlistGroup, WatchlistItem

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

STRATEGY_NAMES: dict[str, str] = {
    "super-growth": "创新高超级成长",
    "oversold-bluechip": "低位错杀蓝筹",
    "trend-support": "双线战法",
    "b2": "B2战法",
}


def get_db():
    with SessionLocal() as db:
        yield db


# ---------- Pydantic schemas ----------

class GroupCreate(BaseModel):
    name: str


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class ItemCreate(BaseModel):
    group_id: Optional[int] = None
    stock_code: str
    stock_name: str
    industry: Optional[str] = None
    strategy_id: Optional[str] = None


class ItemUpdate(BaseModel):
    group_id: Optional[int] = None
    sort_order: Optional[int] = None


# ---------- Response helpers ----------

def _item_dict(item: WatchlistItem) -> dict:
    return {
        "id": item.id,
        "stock_code": item.stock_code,
        "stock_name": item.stock_name,
        "industry": item.industry,
        "strategy_id": item.strategy_id,
        "sort_order": item.sort_order,
        "added_at": item.added_at,
    }


def _group_dict(group: WatchlistGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "sort_order": group.sort_order,
        "items": [_item_dict(i) for i in sorted(group.items, key=lambda x: x.sort_order)],
    }


# ---------- Routes ----------

@router.get("/groups")
def list_groups(db: Session = Depends(get_db)):
    groups = (
        db.query(WatchlistGroup)
        .order_by(WatchlistGroup.sort_order, WatchlistGroup.id)
        .all()
    )
    return [_group_dict(g) for g in groups]


@router.post("/groups", status_code=201)
def create_group(body: GroupCreate, db: Session = Depends(get_db)):
    existing = db.query(WatchlistGroup).filter_by(name=body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="分组名已存在")
    max_order = db.query(func.max(WatchlistGroup.sort_order)).scalar() or 0
    group = WatchlistGroup(
        name=body.name,
        sort_order=max_order + 1,
        created_at=datetime.now().isoformat(),
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_dict(group)


@router.patch("/groups/{group_id}")
def update_group(group_id: int, body: GroupUpdate, db: Session = Depends(get_db)):
    group = db.get(WatchlistGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="分组不存在")
    if body.name is not None:
        group.name = body.name
    if body.sort_order is not None:
        group.sort_order = body.sort_order
    db.commit()
    db.refresh(group)
    return _group_dict(group)


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.get(WatchlistGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="分组不存在")
    db.delete(group)
    db.commit()


@router.post("/items", status_code=201)
def add_item(body: ItemCreate, db: Session = Depends(get_db)):
    # Resolve target group
    if body.group_id is not None:
        group = db.get(WatchlistGroup, body.group_id)
        if group is None:
            raise HTTPException(status_code=404, detail="分组不存在")
    elif body.strategy_id is not None:
        group_name = STRATEGY_NAMES.get(body.strategy_id, body.strategy_id)
        group = db.query(WatchlistGroup).filter_by(name=group_name).first()
        if group is None:
            max_order = db.query(func.max(WatchlistGroup.sort_order)).scalar() or 0
            group = WatchlistGroup(
                name=group_name,
                sort_order=max_order + 1,
                created_at=datetime.now().isoformat(),
            )
            db.add(group)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="group_id 或 strategy_id 必须提供其一")

    # Check duplicate
    existing = db.query(WatchlistItem).filter_by(
        group_id=group.id, stock_code=body.stock_code
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="该股票已在此分组中")

    item = WatchlistItem(
        group_id=group.id,
        stock_code=body.stock_code,
        stock_name=body.stock_name,
        industry=body.industry,
        strategy_id=body.strategy_id,
        sort_order=0,
        added_at=datetime.now().isoformat(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_dict(item)


@router.delete("/items/{item_id}", status_code=204)
def remove_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(WatchlistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    db.delete(item)
    db.commit()


@router.patch("/items/{item_id}")
def update_item(item_id: int, body: ItemUpdate, db: Session = Depends(get_db)):
    item = db.get(WatchlistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    if body.group_id is not None:
        target = db.get(WatchlistGroup, body.group_id)
        if target is None:
            raise HTTPException(status_code=404, detail="目标分组不存在")
        conflict = db.query(WatchlistItem).filter_by(
            group_id=body.group_id, stock_code=item.stock_code
        ).first()
        if conflict and conflict.id != item_id:
            raise HTTPException(status_code=409, detail="目标分组已有该股票")
        item.group_id = body.group_id
    if body.sort_order is not None:
        item.sort_order = body.sort_order
    db.commit()
    db.refresh(item)
    return _item_dict(item)
```

- [ ] **Step 4: 注册路由到 main.py**

在 `backend/app/main.py` 现有 import 区域（`from app.meta import get_meta` 之后）追加：

```python
from app import watchlist as watchlist_router
```

在 `app.add_middleware(...)` 调用之后（约第 40 行，`@app.on_event("startup")` 之前）追加：

```python
app.include_router(watchlist_router.router)
```

- [ ] **Step 5: 跑测试确认全部通过**

```bash
cd backend && source venv/bin/activate
pytest tests/test_watchlist.py -v
```

预期：全部 PASSED

- [ ] **Step 6: Commit**

```bash
git add backend/app/watchlist.py backend/app/main.py backend/app/models.py backend/tests/test_watchlist.py
git commit -m "feat: add watchlist CRUD backend (models + API)"
```

---

## Task 3: 前端类型定义 + API 层

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 `types.ts` 末尾追加新类型**

```typescript
export interface WatchlistItem {
  id: number
  stock_code: string
  stock_name: string
  industry: string | null
  strategy_id: string | null
  sort_order: number
  added_at: string
}

export interface WatchlistGroup {
  id: number
  name: string
  sort_order: number
  items: WatchlistItem[]
}
```

- [ ] **Step 2: 在 `api.ts` 顶部 `get` 辅助函数之后添加 `post`/`patch`/`del` 辅助函数**

在 `api.ts` 的 `async function get<T>` 函数之后、`export const api` 之前插入：

```typescript
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>)
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>)
}

async function deleteReq(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
}
```

- [ ] **Step 3: 在 `api.ts` 的 `import` 中补充新类型**

在文件头部的 `import type { ... } from '@/types'` 中追加 `WatchlistGroup, WatchlistItem`：

```typescript
import type {
  Candidate,
  FundamentalScreenResultResponse,
  IndexInfo,
  MetaResponse,
  Preset,
  RefreshStatus,
  ScreenResultResponse,
  ScreenSnapshotMeta,
  StockDetail,
  StockKlineResponse,
  StockListResponse,
  StockSearchResponse,
  TechnicalCandidate,
  KlineTimeframe,
  WatchlistGroup,
  WatchlistItem,
} from '@/types'
```

- [ ] **Step 4: 在 `api` 对象末尾（`screenResult` 之后的 `}` 前）追加 `watchlist` 命名空间**

```typescript
  watchlist: {
    groups: () => get<WatchlistGroup[]>('/watchlist/groups'),
    createGroup: (name: string) =>
      postJson<WatchlistGroup>('/watchlist/groups', { name }),
    updateGroup: (id: number, body: { name?: string; sort_order?: number }) =>
      patchJson<WatchlistGroup>(`/watchlist/groups/${id}`, body),
    deleteGroup: (id: number) => deleteReq(`/watchlist/groups/${id}`),
    addItem: (body: {
      group_id?: number
      stock_code: string
      stock_name: string
      industry?: string | null
      strategy_id?: string
    }) => postJson<WatchlistItem>('/watchlist/items', body),
    removeItem: (id: number) => deleteReq(`/watchlist/items/${id}`),
    updateItem: (id: number, body: { group_id?: number; sort_order?: number }) =>
      patchJson<WatchlistItem>(`/watchlist/items/${id}`, body),
  },
```

- [ ] **Step 5: 检查 TypeScript 编译**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

预期：无类型错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: add watchlist types and API client"
```

---

## Task 4: StockDetailPanel — 接入 onAddToWatchlist prop

**Files:**
- Modify: `frontend/src/components/detail/StockDetailPanel.tsx`

- [ ] **Step 1: 扩展 props 类型并接入回调**

将 `StockDetailPanel` 的 props 类型从：

```typescript
export function StockDetailPanel({
  detail,
  candidate,
  onClose,
  loading,
}: {
  detail: StockDetail
  candidate?: Candidate | null
  onClose: () => void
  loading?: boolean
}) {
```

改为：

```typescript
export function StockDetailPanel({
  detail,
  candidate,
  onClose,
  loading,
  onAddToWatchlist,
}: {
  detail: StockDetail
  candidate?: Candidate | null
  onClose: () => void
  loading?: boolean
  onAddToWatchlist?: (code: string, name: string, industry?: string) => void
}) {
```

- [ ] **Step 2: 将"加入自选"按钮接入回调**

找到现有的（位于 header 区域的）"加入自选"按钮：

```tsx
<Button variant="outline" size="sm">
  <Star className="size-3.5" />
  <span className="hidden sm:inline">加入自选</span>
</Button>
```

改为：

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => onAddToWatchlist?.(detail.code, detail.name, detail.industry || undefined)}
>
  <Star className="size-3.5" />
  <span className="hidden sm:inline">加入自选</span>
</Button>
```

- [ ] **Step 3: 检查 TypeScript 编译**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

预期：无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/detail/StockDetailPanel.tsx
git commit -m "feat: add onAddToWatchlist callback to StockDetailPanel"
```

---

## Task 5: 技术面详情卡增强

**Files:**
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx`

- [ ] **Step 1: 更新 import 区域**

找到文件顶部 import 区域，做以下修改：

1. 从 `'@/types'` 的 import 中**移除** `Kline, KlineTimeframe`，**添加** `StockDetail`
2. **移除** `import { PriceChart } from '@/components/detail/PriceChart'`（不再直接使用）
3. **添加** `import { StockDetailPanel } from '@/components/detail/StockDetailPanel'`

最终 import 区域示例（只展示变化的行）：

```typescript
// 删除这行：
// import type { Kline, KlineTimeframe, Preset, StrategyId, ... } from '@/types'
// 替换为（移除 Kline, KlineTimeframe，添加 StockDetail）：
import type { StockDetail, Preset, StrategyId, StockRow, ScreenSnapshotMeta, StockSortField, SortOrder } from '@/types'

// 删除：
// import { PriceChart } from '@/components/detail/PriceChart'

// 添加：
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
```

- [ ] **Step 2: 更新组件 props 类型，添加 `onAddToWatchlist`**

将 `TechnicalScreenView` 的 props 从：

```typescript
export const TechnicalScreenView = forwardRef<TechnicalScreenViewHandle, {
  strategy: StrategyId
  preset: Preset | null
}>(function TechnicalScreenView({
  strategy,
  preset,
}, ref) {
```

改为：

```typescript
export const TechnicalScreenView = forwardRef<TechnicalScreenViewHandle, {
  strategy: StrategyId
  preset: Preset | null
  onAddToWatchlist?: (code: string, name: string, industry?: string) => void
}>(function TechnicalScreenView({
  strategy,
  preset,
  onAddToWatchlist,
}, ref) {
```

- [ ] **Step 3: 替换 kline 状态为 stockDetail 状态**

找到并删除以下代码块：

```typescript
const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }
```

（这行在文件顶部，`forwardRef` 之前）

找到并**删除**组件内的 kline 状态（约在 `useState` 区域）：

```typescript
const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
const [klineLoading, setKlineLoading] = useState(false)
```

在它们原来的位置**添加**：

```typescript
const [stockDetail, setStockDetail] = useState<StockDetail | null>(null)
const [detailLoading, setDetailLoading] = useState(false)
```

- [ ] **Step 4: 替换 kline 加载 useEffect 为 stockDetail 加载**

找到并**删除**加载 kline 的 `useEffect`（约 20 行，内含 `api.stockKline` 调用）：

```typescript
useEffect(() => {
  if (!selectedCode) return
  let cancelled = false
  setKlineLoading(true)
  const load = async () => {
    try {
      const periods: KlineTimeframe[] = ['day', 'week', 'month', 'quarter']
      const results = await Promise.all(periods.map((p) => api.stockKline(selectedCode, p)))
      if (cancelled) return
      setKline({
        day: results[0].data, week: results[1].data,
        month: results[2].data, quarter: results[3].data,
      })
    } catch {
      if (!cancelled) setKline(EMPTY_KLINE)
    } finally {
      if (!cancelled) setKlineLoading(false)
    }
  }
  load()
  return () => { cancelled = true }
}, [selectedCode])
```

在原位置**添加**：

```typescript
useEffect(() => {
  if (!selectedCode) {
    setStockDetail(null)
    return
  }
  let cancelled = false
  setDetailLoading(true)
  api.stockDetail(selectedCode)
    .then((d) => { if (!cancelled) setStockDetail(d) })
    .catch(() => { if (!cancelled) setStockDetail(null) })
    .finally(() => { if (!cancelled) setDetailLoading(false) })
  return () => { cancelled = true }
}, [selectedCode])
```

- [ ] **Step 5: 在策略切换 useEffect 中重置 stockDetail**

找到策略切换的 `useEffect`（监听 `preset` 的那个），在 `setSelectedCode('')` 之后追加：

```typescript
setStockDetail(null)
```

- [ ] **Step 6: 替换桌面右列**

找到桌面右列区域（`{isDesktop && (` 包裹的 Card + PriceChart），替换整个块：

```tsx
{isDesktop && selectedCode && (
  <div className="min-w-0">
    {stockDetail ? (
      <StockDetailPanel
        detail={stockDetail}
        candidate={null}
        onClose={() => { setSelectedCode(''); setSelectedName(''); setStockDetail(null) }}
        loading={detailLoading}
        onAddToWatchlist={onAddToWatchlist}
      />
    ) : detailLoading ? (
      <Card className="relative">
        <CardContent className="pt-5">
          <ChartSkeleton />
        </CardContent>
      </Card>
    ) : null}
  </div>
)}
```

- [ ] **Step 7: 替换移动端覆盖层**

找到移动端覆盖层（`{!isDesktop && mobileChartOpen && selectedCode && (` 包裹的区域），替换为：

```tsx
{!isDesktop && mobileChartOpen && selectedCode && (
  <div
    data-mobile-detail-overlay
    className="fixed inset-0 z-[70] overflow-y-auto bg-cream p-3 lg:hidden"
  >
    {stockDetail ? (
      <StockDetailPanel
        detail={stockDetail}
        candidate={null}
        onClose={() => setMobileChartOpen(false)}
        loading={detailLoading}
        onAddToWatchlist={onAddToWatchlist}
      />
    ) : detailLoading ? (
      <Card className="relative min-h-full">
        <CardContent className="px-3 pt-4">
          <ChartSkeleton />
        </CardContent>
      </Card>
    ) : null}
  </div>
)}
```

- [ ] **Step 8: 检查 TypeScript 编译**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

预期：无错误（若有 `Card` 未 import，在 import 区补充）

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/technical/TechnicalScreenView.tsx
git commit -m "feat: replace TechnicalScreenView kline panel with full StockDetailPanel"
```

---

## Task 6: WatchlistGroupPanel

**Files:**
- Create: `frontend/src/components/watchlist/WatchlistGroupPanel.tsx`

- [ ] **Step 1: 新建组件文件**

新建 `frontend/src/components/watchlist/WatchlistGroupPanel.tsx`：

```tsx
import { useState } from 'react'
import { Settings, ChevronDown, ChevronRight, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WatchlistGroup } from '@/types'

interface WatchlistGroupPanelProps {
  groups: WatchlistGroup[]
  selectedCode: string | null
  onSelectStock: (code: string, name: string) => void
  onManageClick: () => void
}

export function WatchlistGroupPanel({
  groups,
  selectedCode,
  onSelectStock,
  onManageClick,
}: WatchlistGroupPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0)

  const toggleGroup = (id: number) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="flex h-full flex-col border-r border-line bg-paper/40">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">自选股</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onManageClick}
          className="h-8 gap-1 text-[12px] text-ink-soft"
        >
          <Settings className="size-3.5" />
          管理
        </Button>
      </div>

      {/* group list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Star className="size-7 text-ink-faint/50" strokeWidth={1.5} />
            <p className="text-sm text-ink-faint">暂无自选股</p>
            <p className="text-[12px] text-ink-faint/70">在选股页点击"加入自选"添加</p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = !!collapsed[group.id]
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-paper-2/50"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-ink-faint" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-ink-faint" />
                  )}
                  <span className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                    {group.name}
                  </span>
                  <span className="text-[11px] text-ink-faint/60">{group.items.length}</span>
                </button>
                {!isCollapsed &&
                  group.items.map((item) => {
                    const on = item.stock_code === selectedCode
                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectStock(item.stock_code, item.stock_name)}
                        className={cn(
                          'flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors hover:bg-paper-2/70',
                          on && 'bg-brand-soft',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-ink">
                            {item.stock_name}
                          </div>
                          <div className="flex gap-2 text-[11px] text-ink-faint">
                            <span className="tnum">{item.stock_code}</span>
                            {item.industry && <span>{item.industry}</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            )
          })
        )}
      </div>

      {/* footer */}
      <div className="shrink-0 border-t border-line-soft px-4 py-2 text-[12px] text-ink-faint">
        共 {totalCount} 只
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 检查编译**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/watchlist/WatchlistGroupPanel.tsx
git commit -m "feat: add WatchlistGroupPanel component"
```

---

## Task 7: AddToWatchlistModal

**Files:**
- Create: `frontend/src/components/watchlist/AddToWatchlistModal.tsx`

- [ ] **Step 1: 新建组件文件**

新建 `frontend/src/components/watchlist/AddToWatchlistModal.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { X, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { WatchlistGroup } from '@/types'

const STRATEGY_NAMES: Record<string, string> = {
  'super-growth': '创新高超级成长',
  'oversold-bluechip': '低位错杀蓝筹',
  'trend-support': '双线战法',
  'b2': 'B2战法',
}

interface AddToWatchlistModalProps {
  open: boolean
  stockCode: string
  stockName: string
  industry?: string | null
  strategyId?: string
  onClose: () => void
  onAdded: () => void
}

export function AddToWatchlistModal({
  open,
  stockCode,
  stockName,
  industry,
  strategyId,
  onClose,
  onAdded,
}: AddToWatchlistModalProps) {
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [useAutoCreate, setUseAutoCreate] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setShowNewGroup(false)
    setNewGroupName('')
    api.watchlist.groups().then((gs) => {
      setGroups(gs)
      const defaultName = strategyId ? STRATEGY_NAMES[strategyId] ?? strategyId : null
      const match = defaultName ? gs.find((g) => g.name === defaultName) : null
      if (match) {
        setSelectedGroupId(match.id)
        setUseAutoCreate(false)
      } else if (defaultName) {
        setSelectedGroupId(null)
        setUseAutoCreate(true)
      } else {
        setSelectedGroupId(gs[0]?.id ?? null)
        setUseAutoCreate(false)
      }
    }).catch(() => setGroups([]))
  }, [open, strategyId])

  if (!open) return null

  const defaultGroupName = strategyId ? STRATEGY_NAMES[strategyId] ?? strategyId : null
  const defaultGroupExists = defaultGroupName ? groups.some((g) => g.name === defaultGroupName) : true

  const isAlreadyIn = (groupId: number) =>
    groups.find((g) => g.id === groupId)?.items.some((i) => i.stock_code === stockCode) ?? false

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      if (showNewGroup && newGroupName.trim()) {
        const group = await api.watchlist.createGroup(newGroupName.trim())
        await api.watchlist.addItem({
          group_id: group.id,
          stock_code: stockCode,
          stock_name: stockName,
          industry,
          strategy_id: strategyId,
        }).catch(() => {})
      } else if (useAutoCreate && strategyId) {
        await api.watchlist.addItem({
          stock_code: stockCode,
          stock_name: stockName,
          industry,
          strategy_id: strategyId,
        }).catch(() => {})
      } else if (selectedGroupId != null) {
        await api.watchlist.addItem({
          group_id: selectedGroupId,
          stock_code: stockCode,
          stock_name: stockName,
          industry,
          strategy_id: strategyId,
        }).catch(() => {})
      }
      onAdded()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const canConfirm =
    !submitting &&
    (showNewGroup ? newGroupName.trim().length > 0 : selectedGroupId != null || useAutoCreate)

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-paper shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">加入自选</h3>
            <p className="text-[12px] text-ink-faint">
              {stockName} <span className="tnum">{stockCode}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* group list */}
        <div className="max-h-60 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-[12px] text-ink-faint">选择分组</p>

          {/* existing groups */}
          {groups.map((g) => {
            const already = isAlreadyIn(g.id)
            const on = selectedGroupId === g.id && !showNewGroup && !useAutoCreate
            return (
              <button
                key={g.id}
                onClick={() => {
                  setSelectedGroupId(g.id)
                  setShowNewGroup(false)
                  setUseAutoCreate(false)
                }}
                className={cn(
                  'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                  on
                    ? 'bg-brand-soft text-brand-strong'
                    : 'text-ink hover:bg-paper-2',
                )}
              >
                <span className="text-[13px]">{g.name}</span>
                {already && (
                  <span className="flex items-center gap-0.5 rounded-full bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-soft">
                    <Check className="size-2.5" /> 已添加
                  </span>
                )}
              </button>
            )
          })}

          {/* auto-create option (shown when strategy group doesn't exist yet) */}
          {!defaultGroupExists && defaultGroupName && (
            <button
              onClick={() => {
                setUseAutoCreate(true)
                setSelectedGroupId(null)
                setShowNewGroup(false)
              }}
              className={cn(
                'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                useAutoCreate && !showNewGroup
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink hover:bg-paper-2',
              )}
            >
              <span className="text-[13px]">{defaultGroupName}</span>
              <span className="text-[11px] text-ink-faint/60">自动创建</span>
            </button>
          )}
        </div>

        {/* new group */}
        <div className="border-t border-line-soft px-4 py-2.5">
          {showNewGroup ? (
            <input
              autoFocus
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canConfirm && handleConfirm()}
              placeholder="输入分组名称..."
              className="w-full rounded-lg border border-brand bg-paper-2/50 px-3 py-1.5 text-[13px] text-ink focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setShowNewGroup(true)
                setSelectedGroupId(null)
                setUseAutoCreate(false)
              }}
              className="flex items-center gap-1.5 text-[13px] text-brand hover:text-brand-strong"
            >
              <Plus className="size-3.5" />
              新建分组
            </button>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? '保存中...' : '确认加入'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 检查编译**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/watchlist/AddToWatchlistModal.tsx
git commit -m "feat: add AddToWatchlistModal component"
```

---

## Task 8: WatchlistManageOverlay

**Files:**
- Create: `frontend/src/components/watchlist/WatchlistManageOverlay.tsx`

- [ ] **Step 1: 新建组件文件**

新建 `frontend/src/components/watchlist/WatchlistManageOverlay.tsx`：

```tsx
import { useState } from 'react'
import { X, Plus, ChevronUp, ChevronDown, Trash2, PenLine, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import type { WatchlistGroup } from '@/types'

interface WatchlistManageOverlayProps {
  groups: WatchlistGroup[]
  onClose: () => void
  onChanged: () => void
}

export function WatchlistManageOverlay({
  groups,
  onClose,
  onChanged,
}: WatchlistManageOverlayProps) {
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [newGroupInput, setNewGroupInput] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)

  const toggleCollapse = (id: number) =>
    setCollapsed((p) => ({ ...p, [id]: !p[id] }))

  const handleRenameStart = (id: number, name: string) => {
    setEditingGroupId(id)
    setEditingName(name)
  }

  const handleRenameConfirm = async () => {
    if (editingGroupId == null || !editingName.trim()) return
    await api.watchlist.updateGroup(editingGroupId, { name: editingName.trim() })
    setEditingGroupId(null)
    onChanged()
  }

  const handleDeleteGroup = async (id: number) => {
    if (!confirm('删除该分组将同时删除其中所有股票，确认吗？')) return
    await api.watchlist.deleteGroup(id)
    onChanged()
  }

  const handleMoveGroupUp = async (idx: number) => {
    if (idx === 0) return
    const sorted = [...groups]
    const temp = sorted[idx - 1]
    sorted[idx - 1] = sorted[idx]
    sorted[idx] = temp
    await Promise.all(sorted.map((g, i) => api.watchlist.updateGroup(g.id, { sort_order: i })))
    onChanged()
  }

  const handleMoveGroupDown = async (idx: number) => {
    if (idx === groups.length - 1) return
    const sorted = [...groups]
    const temp = sorted[idx + 1]
    sorted[idx + 1] = sorted[idx]
    sorted[idx] = temp
    await Promise.all(sorted.map((g, i) => api.watchlist.updateGroup(g.id, { sort_order: i })))
    onChanged()
  }

  const handleDeleteItem = async (itemId: number) => {
    await api.watchlist.removeItem(itemId)
    onChanged()
  }

  const handleMoveItem = async (itemId: number, targetGroupId: number) => {
    await api.watchlist.updateItem(itemId, { group_id: targetGroupId })
    onChanged()
  }

  const handleCreateGroup = async () => {
    if (!newGroupInput.trim()) return
    await api.watchlist.createGroup(newGroupInput.trim())
    setNewGroupInput('')
    setShowNewGroup(false)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-cream/95 backdrop-blur">
      {/* sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-cream/95 px-4 py-3 backdrop-blur">
        <h2 className="text-[16px] font-bold text-ink">自选管理</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewGroup(true)}
          >
            <Plus className="size-3.5" />
            新建分组
          </Button>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-faint hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {/* new group input */}
        {showNewGroup && (
          <div className="mb-4 flex gap-2 rounded-xl border border-brand bg-paper p-3">
            <input
              autoFocus
              type="text"
              value={newGroupInput}
              onChange={(e) => setNewGroupInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder="输入新分组名称..."
              className="flex-1 bg-transparent text-[14px] text-ink focus:outline-none"
            />
            <Button
              size="sm"
              onClick={handleCreateGroup}
              disabled={!newGroupInput.trim()}
            >
              创建
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowNewGroup(false); setNewGroupInput('') }}
            >
              取消
            </Button>
          </div>
        )}

        {groups.length === 0 && !showNewGroup && (
          <p className="py-10 text-center text-sm text-ink-faint">暂无自选分组</p>
        )}

        {groups.map((group, idx) => (
          <div
            key={group.id}
            className="mb-3 overflow-hidden rounded-xl border border-line-soft bg-paper"
          >
            {/* group header */}
            <div className="flex items-center gap-1.5 px-3 py-2.5">
              <button
                onClick={() => toggleCollapse(group.id)}
                className="min-w-0 flex-1 text-left"
              >
                {editingGroupId === group.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameConfirm()
                      if (e.key === 'Escape') setEditingGroupId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded border border-brand bg-paper-2/50 px-2 py-0.5 text-[14px] font-semibold text-ink focus:outline-none"
                  />
                ) : (
                  <span className="text-[14px] font-semibold text-ink">{group.name}</span>
                )}
              </button>
              <span className="shrink-0 text-[12px] text-ink-faint">
                {group.items.length} 只
              </span>
              {editingGroupId === group.id ? (
                <button
                  onClick={handleRenameConfirm}
                  className="rounded p-1 text-brand hover:bg-brand-soft"
                >
                  <Check className="size-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => handleRenameStart(group.id, group.name)}
                  className="rounded p-1 text-ink-faint hover:bg-paper-2 hover:text-ink"
                >
                  <PenLine className="size-3.5" />
                </button>
              )}
              <button
                onClick={() => handleMoveGroupUp(idx)}
                disabled={idx === 0}
                className="rounded p-1 text-ink-faint hover:bg-paper-2 hover:text-ink disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                onClick={() => handleMoveGroupDown(idx)}
                disabled={idx === groups.length - 1}
                className="rounded p-1 text-ink-faint hover:bg-paper-2 hover:text-ink disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                onClick={() => handleDeleteGroup(group.id)}
                className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {/* items */}
            {!collapsed[group.id] &&
              group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 border-t border-line-soft px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-ink">
                      {item.stock_name}
                    </span>
                    <span className="tnum ml-2 text-[11px] text-ink-faint">
                      {item.stock_code}
                    </span>
                    {item.industry && (
                      <span className="ml-2 text-[11px] text-ink-faint">{item.industry}</span>
                    )}
                  </div>
                  {groups.length > 1 && (
                    <Select
                      key={`${item.id}-${group.id}`}
                      onValueChange={(v) => handleMoveItem(item.id, Number(v))}
                    >
                      <SelectTrigger className="h-7 w-24 text-[12px]">
                        <SelectValue placeholder="移动到" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups
                          .filter((g) => g.id !== group.id)
                          .map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>
                              {g.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 检查编译**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/watchlist/WatchlistManageOverlay.tsx
git commit -m "feat: add WatchlistManageOverlay component"
```

---

## Task 9: WatchlistPage

**Files:**
- Create: `frontend/src/pages/WatchlistPage.tsx`

- [ ] **Step 1: 新建页面文件**

新建 `frontend/src/pages/WatchlistPage.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react'
import { WatchlistGroupPanel } from '@/components/watchlist/WatchlistGroupPanel'
import { AddToWatchlistModal } from '@/components/watchlist/AddToWatchlistModal'
import { WatchlistManageOverlay } from '@/components/watchlist/WatchlistManageOverlay'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { api } from '@/lib/api'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { StockDetail, WatchlistGroup } from '@/types'

interface WatchlistModalState {
  code: string
  name: string
  industry?: string | null
  strategyId?: string
}

export function WatchlistPage() {
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [modalState, setModalState] = useState<WatchlistModalState | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const fetchGroups = useCallback(async () => {
    try {
      setGroups(await api.watchlist.groups())
    } catch {
      setGroups([])
    }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  useEffect(() => {
    if (!selectedCode) { setStockDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    api.stockDetail(selectedCode)
      .then((d) => { if (!cancelled) setStockDetail(d) })
      .catch(() => { if (!cancelled) setStockDetail(null) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedCode])

  const handleSelectStock = useCallback((code: string, name: string) => {
    setSelectedCode(code)
    setMobileDetailOpen(true)
  }, [])

  const handleAddToWatchlist = useCallback((code: string, name: string, industry?: string) => {
    setModalState({ code, name, industry })
  }, [])

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* left panel */}
        <div className={isDesktop ? 'w-72 shrink-0 overflow-hidden' : 'min-w-0 flex-1 overflow-hidden'}>
          <WatchlistGroupPanel
            groups={groups}
            selectedCode={selectedCode}
            onSelectStock={handleSelectStock}
            onManageClick={() => setManageOpen(true)}
          />
        </div>

        {/* right panel (desktop only) */}
        {isDesktop && (
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {selectedCode && stockDetail ? (
              <StockDetailPanel
                detail={stockDetail}
                candidate={null}
                onClose={() => { setSelectedCode(null); setStockDetail(null) }}
                loading={detailLoading}
                onAddToWatchlist={handleAddToWatchlist}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-ink-faint">点击左侧股票查看详情</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* mobile detail overlay */}
      {!isDesktop && mobileDetailOpen && selectedCode && stockDetail && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-cream p-3">
          <StockDetailPanel
            detail={stockDetail}
            candidate={null}
            onClose={() => setMobileDetailOpen(false)}
            loading={detailLoading}
            onAddToWatchlist={handleAddToWatchlist}
          />
        </div>
      )}

      {/* manage overlay */}
      {manageOpen && (
        <WatchlistManageOverlay
          groups={groups}
          onClose={() => setManageOpen(false)}
          onChanged={fetchGroups}
        />
      )}

      {/* add modal */}
      {modalState && (
        <AddToWatchlistModal
          open={!!modalState}
          stockCode={modalState.code}
          stockName={modalState.name}
          industry={modalState.industry}
          strategyId={modalState.strategyId}
          onClose={() => setModalState(null)}
          onAdded={fetchGroups}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 检查编译**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

预期：无错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WatchlistPage.tsx
git commit -m "feat: add WatchlistPage"
```

---

## Task 10: 接入导航 + ScreenPage 自选弹窗

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/pages/ScreenPage.tsx`

- [ ] **Step 1: 修改 `App.tsx`**

将 `App.tsx` 完整替换为：

```tsx
import { useCallback, useRef, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { HomePage } from '@/pages/HomePage'
import { ScreenPage, type ScreenPageHandle } from '@/pages/ScreenPage'
import { WatchlistPage } from '@/pages/WatchlistPage'
import type { StrategyId } from '@/types'

export default function App() {
  const [view, setView] = useState<'home' | 'screen' | 'watchlist'>('home')
  const [strategy, setStrategy] = useState<StrategyId>('super-growth')
  const screenPageRef = useRef<ScreenPageHandle>(null)

  const handleNavigate = useCallback((key: 'home' | 'screen' | 'watchlist') => {
    setView(key)
  }, [])

  return (
    <div className="min-h-dvh bg-cream pb-20 text-ink lg:flex lg:h-screen lg:overflow-hidden lg:pb-0">
      <Sidebar active={view} onNavigate={handleNavigate} />
      {view === 'screen' && (
        <StrategySidebar
          strategy={strategy}
          onSelect={(s) => { setStrategy(s); setView('screen') }}
          onFilterClick={() => screenPageRef.current?.toggleFilter()}
        />
      )}
      {view === 'home' && <HomePage />}
      {view === 'screen' && <ScreenPage ref={screenPageRef} strategy={strategy} />}
      {view === 'watchlist' && <WatchlistPage />}
    </div>
  )
}
```

- [ ] **Step 2: 修改 `Sidebar.tsx`**

将 `Sidebar` 的 props 类型改为：

```tsx
export function Sidebar({
  active,
  onNavigate,
}: {
  active: 'home' | 'screen' | 'watchlist'
  onNavigate: (key: 'home' | 'screen' | 'watchlist') => void
}) {
```

将 `button` 的 `onClick` 改为：

```tsx
onClick={() => {
  if (key === 'home' || key === 'screen' || key === 'watchlist') onNavigate(key)
}}
```

- [ ] **Step 3: 修改 `ScreenPage.tsx`：添加 watchlist modal 状态**

在 `ScreenPage` 组件内现有状态声明区域（`const [detailOpen, setDetailOpen] = useState(false)` 之后）添加：

```tsx
const [watchlistModalOpen, setWatchlistModalOpen] = useState(false)
const [watchlistModalStock, setWatchlistModalStock] = useState<{
  code: string
  name: string
  industry?: string
  strategyId?: string
} | null>(null)

const handleAddToWatchlist = useCallback((code: string, name: string, industry?: string) => {
  setWatchlistModalStock({ code, name, industry, strategyId: strategy })
  setWatchlistModalOpen(true)
}, [strategy])
```

- [ ] **Step 4: 在 `ScreenPage.tsx` 中传入 `onAddToWatchlist` 到 TechnicalScreenView**

找到 `<TechnicalScreenView` 的 JSX，改为：

```tsx
<TechnicalScreenView
  ref={technicalRef}
  strategy={strategy}
  preset={activePreset}
  onAddToWatchlist={handleAddToWatchlist}
/>
```

- [ ] **Step 5: 在 `ScreenPage.tsx` 中给两处 `StockDetailPanel` 传入 `onAddToWatchlist`**

找到桌面 `<StockDetailPanel`（约 `{selectedCode ? (` 内），改为：

```tsx
<StockDetailPanel
  detail={stockDetail}
  candidate={selectedCandidate}
  onClose={() => setSelectedCode('')}
  loading={detailLoading}
  onAddToWatchlist={handleAddToWatchlist}
/>
```

找到移动端 `<StockDetailPanel`（`data-mobile-detail-overlay` div 内），改为：

```tsx
<StockDetailPanel
  detail={stockDetail}
  candidate={selectedCandidate}
  onClose={() => setDetailOpen(false)}
  loading={detailLoading}
  onAddToWatchlist={handleAddToWatchlist}
/>
```

- [ ] **Step 6: 在 `ScreenPage.tsx` 中引入 `AddToWatchlistModal` 并渲染**

在 `ScreenPage.tsx` 顶部 import 区域添加：

```tsx
import { AddToWatchlistModal } from '@/components/watchlist/AddToWatchlistModal'
```

在 `ScreenPage` 的 JSX 最末尾（`</div>` 关闭标签之前）添加：

```tsx
{watchlistModalOpen && watchlistModalStock && (
  <AddToWatchlistModal
    open={watchlistModalOpen}
    stockCode={watchlistModalStock.code}
    stockName={watchlistModalStock.name}
    industry={watchlistModalStock.industry}
    strategyId={watchlistModalStock.strategyId}
    onClose={() => setWatchlistModalOpen(false)}
    onAdded={() => {}}
  />
)}
```

- [ ] **Step 7: 检查 TypeScript 编译**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

预期：无类型错误

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/pages/ScreenPage.tsx
git commit -m "feat: wire watchlist navigation and AddToWatchlistModal in ScreenPage"
```

---

## Task 11: 手动验证

- [ ] **Step 1: 启动服务**

```bash
./dev.sh
```

在浏览器打开 `http://localhost:5173`

- [ ] **Step 2: 验证技术面详情卡增强**

1. 点击左侧导航"选股"
2. 点击"双线战法"或"B2战法"
3. 在股票列表点击任意一只股票
4. 确认右侧（桌面）或弹出覆盖层（移动端）展示：K 线图 + 财报营收图 + 研报列表
5. 确认无"综合得分"、无"命中信号"、无"风险提示"

- [ ] **Step 3: 验证自选添加流程**

1. 在技术面或基本面详情面板，点击头部"加入自选"
2. 确认 Modal 弹出，显示分组列表（默认高亮当前战法分组）
3. 选择分组后点击"确认加入"，确认 Modal 关闭

- [ ] **Step 4: 验证自选列表页**

1. 点击左侧导航"自选股"
2. 确认分组和股票显示在左侧列表
3. 点击股票，确认右侧详情面板加载

- [ ] **Step 5: 验证自选管理**

1. 在自选页点击"管理"
2. 新建分组，重命名分组，调整分组顺序
3. 移动股票到其他分组，删除股票
4. 删除分组（含二次确认）

- [ ] **Step 6: 验证重复添加**

1. 再次对已添加的股票点击"加入自选"
2. 确认 Modal 中对应分组显示"已添加"角标
3. 再次确认不报错（409 静默忽略）
