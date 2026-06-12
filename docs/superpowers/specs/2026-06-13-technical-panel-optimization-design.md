# 技术面战法前端面板优化设计

日期：2026-06-13

## 概述

对技术面战法的前端面板进行 11 项优化，涵盖布局重构、K线图交互修复、数据展示增强和搜索功能新增。采用最小改动方案，逐项修改对应文件，不改变整体架构。

## 需求清单

| # | 需求 | 涉及文件 |
|---|------|---------|
| 1 | 删除刷新进度卡片，进度信息移到 TopBar 右侧 | TopBar.tsx, TechnicalScreenView.tsx, 基本面视图 |
| 2 | 刷新按钮按策略类别显示 | TopBar.tsx, App.tsx |
| 3 | K线图 x 轴加大间隔 | PriceChart.tsx |
| 4 | 筛选卡片改为左侧抽屉（挤压式） | StrategySidebar.tsx, TechnicalFilterCard.tsx, TechnicalScreenView.tsx |
| 5 | 股票名字与K线卡片联动修复 | TechnicalScreenView.tsx, StockListCard.tsx |
| 6 | tooltip 改为鼠标离开才消失，移除点击固定，恢复滑动流畅 | PriceChart.tsx |
| 7 | tooltip 字体颜色区分，收盘价跟随涨跌色显示在右上角 | PriceChart.tsx |
| 8 | 股票列表增加收盘价、涨跌幅列 | StockListCard.tsx, 后端 /stocks 接口 |
| 9 | 成交量独立区域（K线下方、KDJ上方） | PriceChart.tsx |
| 10 | KDJ 只显示 J 线 | PriceChart.tsx |
| 11 | 股票搜索（code/名称/拼音首字母），独立搜索跳转 | StockListCard.tsx, 后端新增 /stocks/search 接口 |

附加：修复筛选按钮点击无反应；页面默认加载股票列表第一条展示在K线卡片。

---

## 1. TopBar 与进度/按钮重构

### 当前状态
- TopBar 同时显示"刷新行情"和"刷新基本面"两个按钮
- 进度信息在主内容区的 DataRefreshProgress 独立卡片中

### 改动

**进度信息移入 TopBar**：在 TopBar 右侧（更新时间旁边）用紧凑行内进度展示替代独立卡片。
- 运行中：显示进度条 + 百分比文字，如 `行情: 刷新中 67% ━━━░░░`
- 已完成：显示 `行情: 已完成 ✓`
- 空闲：显示 `行情: 待执行`

**按钮按策略类别显示**：
- 技术面策略：只显示"刷新行情"按钮（含完整刷新/仅K线下拉）
- 基本面策略：只显示"刷新基本面"按钮

**删除 DataRefreshProgress 卡片**：从 TechnicalScreenView 和基本面视图中移除。

**修复筛选按钮点击无反应**：检查 `onApply` 回调链路，确保点击"运行筛选"能正确触发 `screenTechnical` API 调用。

---

## 2. 筛选卡片改为左侧抽屉

### 当前状态
TechnicalFilterCard 是主内容区左侧的独立 Card，始终展开。

### 改动

**抽屉位置**：在 StrategySidebar 中每个技术面策略项旁增加筛选图标按钮，点击后从左侧展开抽屉。

**抽屉规格**：
- 宽度与 StrategySidebar 一致（约 180px）
- 筛选项竖向排列
- 包含"运行筛选"按钮

**抽屉交互**：
- 收起状态：只显示 StrategySidebar 原有策略列表 + 筛选图标按钮
- 展开状态：抽屉挤压主内容区（K线图+股票列表），主内容区仍可用
- 收起触发：再次点击筛选按钮、点击"运行筛选"后自动收起、点击抽屉外区域

**不同战法不同筛选项**：由 `preset.params` 自动驱动，双线战法和 B2 战法参数不同，无需特殊处理。

**移除原 TechnicalFilterCard**：从 TechnicalScreenView 主内容区删除。

---

## 3. K线图 x 轴加大间隔

### 当前状态
x 轴 formatter 为 `v.slice(0, 7)` 只显示年-月，间隔为 `auto`。

### 改动
保持月份格式，但加大标签间隔，避免密集重叠。调整 `axisLabel.interval` 为更大值（如每 3-5 个标签显示一个），或使用 ECharts 的 `axisLabel.rotate` 微调角度。

---

## 4. 股票名字与K线卡片联动修复

### 当前状态
`handleSelectCode` 只从 `candidates`（筛选结果/mock 数据）中查找名称。全市场模式下点击 MarketTable 行时，candidates 中找不到对应股票 → 名称不更新。

### 改动
- `handleSelectCode` 同时从全市场列表数据和筛选结果中查找名称
- StockListCard 的 `onSelectCode` 回调扩展为 `(code: string, name: string)`，行点击时直接传递当前行的 name
- 页面加载后，股票列表首次加载完成时，自动选中第一条并加载K线（替代 mock 数据初始化）

---

## 5. tooltip 行为修复

### 当前状态
- `triggerOn: 'mousemove|click'`
- 有 `pinnedRef` / `setPinnedIndex` 点击固定逻辑
- 有 `click` 事件监听器
- 长按K线图左右滑动不流畅

### 改动
- 移除 `pinnedRef`、`setPinnedIndex` 及所有相关 useEffect
- `triggerOn` 改为 `'mousemove'`（鼠标移动触发，鼠标离开自动消失）
- 删除 `click` 事件监听器
- 恢复 dataZoom（左右滑动）流畅度

---

## 6. tooltip 样式优化

### 当前状态
tooltip 中所有文字统一颜色，无涨跌区分，收盘价无特殊显示。

### 改动
- 涨跌颜色区分：收盘 > 开盘（涨）时收盘价红色，收盘 < 开盘（跌）时绿色
- 收盘价放大加粗，显示在 tooltip 右上角
- 其他字段（开盘/最高/最低）用灰色或浅色
- 成交量用独立颜色标识
- KDJ 区域只显示 J 值，用对应颜色

---

## 7. 成交量独立区域

### 当前状态
K线图只有 K线 + KDJ 双区域布局，无成交量。

### 改动
新增独立 grid 区域，三区域布局：
- K线区域：约 50% 高度
- 成交量区域：约 18% 高度，位于 K线下方
- KDJ 区域：约 16% 高度，位于成交量下方
- 间距约 8%

成交量用红绿柱状图（涨红跌绿），与 K线涨跌对应。需要三组 xAxis 联动，dataZoom 同时控制三个区域。

---

## 8. KDJ 只显示 J 线

### 当前状态
KDJ 区域显示 K、D、J 三条线。

### 改动
- 移除 K、D 系列配置，只保留 J 线
- 区域标签仍保留"KDJ"
- tooltip 中只显示 J 值
- J 线颜色保持现有配色

---

## 9. 股票列表增加收盘价、涨跌幅列

### 当前状态
全市场模式 MarketTable 只有代码/名称/行业/市值/状态列。

### 改动
- MarketTable 新增"收盘价"和"涨跌幅"列
- 后端 `/stocks` 接口扩展返回 `close` 和 `pct_chg` 字段
- 涨跌幅用红绿色区分（涨红跌绿）
- StockListItem 类型新增 `close: number | null` 和 `pct_chg: number | null`

---

## 10. 股票搜索功能

### 当前状态
无搜索功能。

### 改动

**前端**：
- StockListCard 顶部增加搜索输入框
- 输入 code/名称/拼音首字母后，调用后端搜索接口
- 搜索结果在同一卡片内替换原列表内容
- 点击搜索结果中的股票 → 选中该股票，右侧K线图更新
- 清空搜索框 → 恢复原列表

**后端新增接口**：`GET /stocks/search?q=xxx`
- 支持按 code、名称、拼音首字母模糊匹配
- 返回匹配的股票列表（code、name、close、pct_chg）
- 拼音首字母映射：后端维护 code→pinyin 映射，或使用 pinyin 库生成

---

## 涉及文件汇总

| 文件 | 改动内容 |
|------|---------|
| `frontend/src/components/layout/TopBar.tsx` | 进度信息移入、按钮按类别显示 |
| `frontend/src/components/layout/StrategySidebar.tsx` | 增加筛选按钮、抽屉展开逻辑 |
| `frontend/src/components/technical/TechnicalScreenView.tsx` | 移除进度卡片和筛选卡片、抽屉状态管理、名字联动修复、默认选中第一条 |
| `frontend/src/components/technical/TechnicalFilterCard.tsx` | 适配抽屉布局（竖向排列） |
| `frontend/src/components/detail/PriceChart.tsx` | x轴间隔、tooltip行为/样式、成交量区域、KDJ只显示J线 |
| `frontend/src/components/screener/StockListCard.tsx` | 新增列、搜索框、onSelectCode 传递 name |
| `frontend/src/components/screener/DataRefreshProgress.tsx` | 删除组件，功能已移入 TopBar |
| `frontend/src/types.ts` | StockListItem 新增 close/pct_chg 字段 |
| `frontend/src/lib/api.ts` | 新增 searchStocks 接口 |
| `backend/app/main.py` | 新增 /stocks/search 路由、/stocks 扩展返回字段 |
| `backend/app/models.py` | Stock 模型可能需要新增字段 |
