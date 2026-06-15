# Stock 表新增 parent_industry 字段

## 背景

当前系统中，`Stock` 表只存了二级行业（`industry`），一级行业需要运行时查 `Industry` 维度表（`parent_name`）反查。这导致多处代码重复查询 `Industry` 表，且技术面走势卡片上方加了一个独立 header 来展示行业信息，位置不够自然。

## 目标

1. `Stock` 表新增 `parent_industry` 字段，刷新时同步写入一级行业
2. 删除所有运行时查 `Industry` 表反查一级行业的代码
3. 技术面走势卡片：去掉上方独立 header，把股票代码 + 一级行业·二级行业放到 `PriceChart` 股票名称旁边

## 改动清单

### 1. Model：`Stock` 加字段

`backend/app/models.py` — `Stock` 类新增：

```python
parent_industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 申万一级行业
```

### 2. 刷新：写入一级行业

`backend/app/refresh.py` — `_refresh_industry_index` 函数中，写 `stock.industry` 的地方（约行 398）同时写 `stock.parent_industry`：

```python
stock.industry = industry["name"]
stock.parent_industry = industry.get("parent_name")  # 新增
```

刷新时 `industry` 字典已包含 `parent_name`（来自 `industries_fn()` 返回的二级行业列表），无需额外查询。

### 3. screen.py：删掉反查逻辑

`backend/app/screen.py` — `run_screen_result` 函数：

- 删掉 `from app.models import ... Industry as _Industry` 的 import
- 删掉构建 `parent_map` 的代码块（约行 193-201）
- `items` 构建中 `parent_industry` 改为从 `cap_map` 同一批查询中取 `stock.parent_industry`，或单独查 `Stock` 表时一并取出

具体：把补充 `market_cap` 的查询从只取 `code, market_cap` 扩展为取 `code, market_cap, parent_industry`，用 `cap_map` 改名为 `stock_info_map` 存 `(market_cap, parent_industry)` 元组。

### 4. stock_detail.py：删掉反查逻辑

`backend/app/stock_detail.py` — `get_stock_detail` 函数：

- 删掉行 98-106 查 `Industry` 表的代码
- `parent_industry_name` 直接用 `stock.parent_industry`
- 删掉 `from app.models import Industry` 的 import（如无其他引用）

### 5. 前端：技术面走势卡片调整

`frontend/src/components/technical/TechnicalScreenView.tsx`：

- 删掉 `selectedCode && (...)` 的独立 header div（行 287-296）
- 删掉 `selectedRow` 的 `useMemo`
- 在 `PriceChart` 组件的股票名称旁边展示：股票代码 + 一级行业·二级行业

需要确认 `PriceChart` 组件是否支持在标题旁追加内容，或通过 props 传入副标题信息。

### 6. 存量数据

不写迁移脚本。已有数据的 `parent_industry` 为空，下次刷新行业指数时自动补齐。

## 不改的

- `Industry` 维度表保留（维度数据，其他场景可能用到）
- `fundamental_rows.py` 中 `stock.industry` 的使用不变（只读二级行业）
- 前端 `types.ts` 的 `parent_industry` 字段保留
- 基本面详情页的行业展示逻辑不变（已通过 `stock_detail.py` 返回 `industry` + `subIndustry`）
