# 自选功能 & 技术面详情卡增强 设计文档

日期：2026-06-22

## 概述

本文档涵盖两个独立但关联的功能：

1. **自选功能**：允许用户将技术面/基本面筛选结果中的股票加入自选，支持按战法分组管理。
2. **技术面详情卡增强**：将技术面战法的股票详情从纯 K 线图扩展为与基本面一致的完整详情面板（去除得分/信号/风险提示）。

---

## 一、自选功能

### 1.1 数据模型（后端）

新增两张表，在 `app/models.py` 中定义：

```python
class WatchlistGroup(Base):
    __tablename__ = 'watchlist_groups'
    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(Text, nullable=False, unique=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(Text)
    items      = relationship('WatchlistItem', back_populates='group',
                              cascade='all, delete-orphan')

class WatchlistItem(Base):
    __tablename__ = 'watchlist_items'
    id          = Column(Integer, primary_key=True, autoincrement=True)
    group_id    = Column(Integer, ForeignKey('watchlist_groups.id'), nullable=False)
    stock_code  = Column(Text, nullable=False)
    stock_name  = Column(Text, nullable=False)
    industry    = Column(Text)          # 添加时存入，避免列表展示时额外查询
    strategy_id = Column(Text)          # 来源战法，仅记录，不约束分组
    sort_order  = Column(Integer, default=0)
    added_at    = Column(Text)
    group       = relationship('WatchlistGroup', back_populates='items')
    __table_args__ = (UniqueConstraint('group_id', 'stock_code'),)
```

`init_db()` 调用 `Base.metadata.create_all()` 时自动建表，无需迁移脚本。

### 1.2 后端 API

新建 `app/watchlist.py`，挂载到 `/watchlist`，在 `app/main.py` 中 `include_router`。

| Method | Path | 请求体 / 参数 | 说明 |
|---|---|---|---|
| GET | `/watchlist/groups` | — | 返回所有分组及其成员列表 |
| POST | `/watchlist/groups` | `{name: str}` | 新建分组 |
| PATCH | `/watchlist/groups/{id}` | `{name?: str, sort_order?: int}` | 重命名或调整排序 |
| DELETE | `/watchlist/groups/{id}` | — | 删除分组（级联删除成员） |
| POST | `/watchlist/items` | `{group_id, stock_code, stock_name, strategy_id?}` | 添加股票；若目标战法分组不存在则自动创建 |
| DELETE | `/watchlist/items/{id}` | — | 删除单只股票 |
| PATCH | `/watchlist/items/{id}` | `{group_id?: int, sort_order?: int}` | 移动到其他分组或调整排序 |

**响应结构**（GET `/watchlist/groups`）：

```json
[
  {
    "id": 1,
    "name": "双线战法",
    "sort_order": 0,
    "items": [
      { "id": 10, "stock_code": "sz000001", "stock_name": "平安银行",
        "strategy_id": "trend-support", "sort_order": 0, "added_at": "2026-06-22T10:00:00" }
    ]
  }
]
```

**特殊规则**：
- POST `/watchlist/items` 请求体新增可选字段 `industry?: str`，一并存入。
- POST `/watchlist/items` 时，若 `strategy_id` 对应分组名不存在，后端自动创建该分组（用战法中文名，见 `STRATEGY_NAMES` 映射）。
- 同一只股票可加入多个不同分组；同一分组内不允许重复（UNIQUE 约束），重复添加返回 409（前端静默忽略）。

### 1.3 前端 — 类型定义

在 `src/types.ts` 新增：

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

### 1.4 前端 — API 层

在 `src/lib/api.ts` 新增 `api.watchlist` 命名空间：

```typescript
watchlist: {
  groups: () => get<WatchlistGroup[]>('/watchlist/groups'),
  createGroup: (name: string) => post('/watchlist/groups', { name }),
  renameGroup: (id: number, name: string) => patch(`/watchlist/groups/${id}`, { name }),
  reorderGroup: (id: number, sort_order: number) => patch(`/watchlist/groups/${id}`, { sort_order }),
  deleteGroup: (id: number) => del(`/watchlist/groups/${id}`),
  addItem: (payload: { group_id: number; stock_code: string; stock_name: string; strategy_id?: string }) =>
    post('/watchlist/items', payload),
  removeItem: (id: number) => del(`/watchlist/items/${id}`),
  moveItem: (id: number, group_id: number) => patch(`/watchlist/items/${id}`, { group_id }),
  reorderItem: (id: number, sort_order: number) => patch(`/watchlist/items/${id}`, { sort_order }),
}
```

### 1.5 前端 — 页面结构

**App.tsx**：`view` 类型扩展为 `'home' | 'screen' | 'watchlist'`，增加 `<WatchlistPage>` 分支。`StrategySidebar` 仅在 `screen` 视图显示。

**Sidebar.tsx**：`onNavigate` 参数类型扩展，"自选股"按钮接入导航。

**WatchlistPage（新建 `src/pages/WatchlistPage.tsx`）**：

- 桌面端：左列 `WatchlistGroupPanel`（宽约 320px），右列 `StockDetailPanel`（`candidate=null`）
- 移动端：左列全屏；点击股票弹出全屏详情覆盖层，复用 TechnicalScreenView 的移动端模式

**WatchlistGroupPanel（新建 `src/components/watchlist/WatchlistGroupPanel.tsx`）**：

- 顶部"自选管理"按钮，打开 `WatchlistManageOverlay`
- 分组列表，每组标题可折叠展开
- 每条股票行：名称、代码、行业（需从 `StockDetail` 或本地缓存补充）；点击选中，右列加载详情
- 底部状态栏：共 N 只

**AddToWatchlistModal（新建 `src/components/watchlist/AddToWatchlistModal.tsx`）**：

- 从 `StockDetailPanel` 头部"加入自选"按钮触发，传入 `stock_code`、`stock_name`、`industry`、`strategy_id`
- 弹出 Modal，展示分组单选列表，默认高亮当前战法分组（若该分组不存在则标注"添加后自动创建"）
- 若股票已在某分组，该条目显示"已添加"角标（仅提示，允许再次选中确认——幂等，后端返回 409 前端静默忽略）
- **Modal 只做加入操作**（一只股票可同时在多个分组）；跨组移动只在"自选管理"中操作
- 内嵌"+ 新建分组"：点击展开输入框，输入名称后该分组自动进入选中态
- 底部：取消 / 确认加入

**WatchlistManageOverlay（新建 `src/components/watchlist/WatchlistManageOverlay.tsx`）**：

- 全屏覆盖层（不新建路由）
- 分组列表：每个分组标题可内联重命名（点击进入编辑态）；上下箭头调整排序；删除（含二次确认）
- 每个分组可折叠，成员行有"移动到"下拉选择目标分组 + 删除按钮
- 顶部"+ 新建分组"按钮

### 1.6 StockDetailPanel 改造

新增 `onAddToWatchlist?: (code: string, name: string, strategyId?: string) => void` prop。头部"加入自选"按钮调用此回调，由父组件（`ScreenPage`、`WatchlistPage`）控制 Modal 的显隐和传参。

---

## 二、技术面详情卡增强

### 2.1 目标

将 `TechnicalScreenView` 右列（桌面）和移动端覆盖层从纯 `PriceChart` 卡替换为完整的 `StockDetailPanel`，展示内容：K 线图 + 财报营收图 + 研报列表。不展示：综合得分、命中信号、风险提示。

`StockDetailPanel` 的条件逻辑已满足此需求：
- `candidate` 不传时，得分/信号行不渲染
- `candidate?.risks` 为空时，风险清单不渲染

### 2.2 改动范围

**`TechnicalScreenView.tsx`**：

1. 新增状态：`stockDetail: StockDetail | null`、`detailLoading: boolean`
2. 选中股票时（`handleSelectCode`）调用 `api.stockDetail(code)`，结果存入 `stockDetail`
3. 桌面右列：从裸 `<Card><PriceChart /></Card>` 替换为 `<StockDetailPanel detail={stockDetail} candidate={null} onClose={...} loading={detailLoading} onAddToWatchlist={...} />`
4. 移动端覆盖层：同理替换
5. 删除不再使用的 `kline` / `klineLoading` 状态（K 线数据改由 `StockDetailPanel` 内部通过 `StockDetail` 获取）

**注意**：`StockDetail` 中已包含 `klineDay/Week/Month/Quarter`，因此加载 `stockDetail` 后无需单独再拉 K 线。

### 2.3 StockDetailPanel 兼容性

`StockDetailPanel` 的 `onClose` prop 在技术面场景下改为清空选中股票（`setSelectedCode('')`），不影响基本面场景。

---

## 三、测试

**后端**：新建 `tests/test_watchlist.py`，覆盖：
- 新建/重命名/排序/删除分组
- 添加股票、重复添加（409）、移动、删除成员
- 删除分组时成员级联删除

**前端**：手动验证以下主流程：
- 从技术面/基本面选股结果中添加股票，Modal 正确显示分组列表
- 自选列表页左右列联动
- 自选管理覆盖层增删改排序
- 技术面详情卡展示财报图 + 研报 + K 线

---

## 四、文件改动汇总

### 后端
- `app/models.py`：新增 `WatchlistGroup`、`WatchlistItem`
- `app/watchlist.py`：新建路由文件
- `app/main.py`：注册 watchlist router
- `tests/test_watchlist.py`：新建测试文件

### 前端
- `src/types.ts`：新增 `WatchlistGroup`、`WatchlistItem`
- `src/lib/api.ts`：新增 watchlist API
- `src/App.tsx`：扩展 view 类型，渲染 WatchlistPage
- `src/components/layout/Sidebar.tsx`：扩展 onNavigate 类型
- `src/components/detail/StockDetailPanel.tsx`：新增 `onAddToWatchlist` prop
- `src/components/technical/TechnicalScreenView.tsx`：加载 stockDetail，替换右列
- `src/pages/WatchlistPage.tsx`：新建
- `src/components/watchlist/WatchlistGroupPanel.tsx`：新建
- `src/components/watchlist/AddToWatchlistModal.tsx`：新建
- `src/components/watchlist/WatchlistManageOverlay.tsx`：新建
