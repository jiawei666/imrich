# i'mRich 选股器设计文档 — 集成与扩展附录（v1.1）

- 日期：2026-06-11
- 关联文档：[`2026-06-08-jingshui2008-stock-screener-design.md`](./2026-06-08-jingshui2008-stock-screener-design.md)（以下简称"主文档"）
- 本文档定位：主文档定义了"做什么"（投资体系提炼、信号库、策略1/2、API与前端轮廓）。本文档是它的**落地附录**——把旧项目 `StockTradebyZ-改` 中可复用的代码整合进来，并把整体架构、数据层细节、新增的"技术面战法"策略、后端API、前端联动和实施路线图全部钉死。主文档第1节（投资体系）、第8节（默认股票池）、第9节（测试策略）、第11节（风险与免责）继续有效，本文档不重复。

---

## 0. 整合范围

从旧项目 `/Users/yuanjiawei/PycharmProjects/StockTradebyZ-改` 复用：

- `fetch_kline.py`：`get_kline_ak_tx`（腾讯接口抓日K，前复权）、`get_constituents`（按市值筛全市场股票池）及配套的代码归一化函数。
- `Selector.py`：`TrendSupportSelector`（双线战法）、`B2Selector`（B2战法），及其依赖的指标纯函数：`compute_kdj`、`compute_bbi`、`compute_rsv`、`compute_dif`、`compute_zhixing_short_trend`（白线）、`compute_zhixing_bull_bear`（黄线）、`bbi_deriv_uptrend`。

按用户决定，本次**不做范围收窄**，整体v1框架（行情数据层、基本面数据层、信号库、策略1/2/3、后端API、前端联动）一次性设计完成，实施时再分阶段推进（见第7节）。

---

## 1. 总体架构（细化）

```
┌───────────────────────────┐   ┌───────────────────────────────┐
│ 任务组A（行情/高频，每日）   │   │ 任务组B（基本面/低频）          │
│ - 股票列表（增减量）         │   │ - 财报 / 业绩预告快报           │
│ - 日K（全量重抓，qfq复权）   │   │ - 申万行业指数                  │
│ - 周/月/季K（重采样）        │   │ - 研报（两阶段：元数据→PDF解析） │
└──────────────┬──────────────┘   └───────────────┬─────────────────┘
               ↓                                   ↓
        ┌───────────────────────────────────────────────┐
        │           SQLite（本地单文件缓存DB）             │
        └──────────────────────┬──────────────────────────┘
                                ↓
                  信号层（纯函数，输入DB数据→信号值）
                                ↓
        策略引擎：策略1/2（硬过滤+加权打分+避雷） / 策略3（技术面布尔判定）
                                ↓
                       FastAPI ←→ React 前端
```

**SQLite 选型说明**（呼应此前讨论）：单文件、零运维、对未来"接入Agent/MCP"友好（Agent工具普遍原生支持SQLite单文件查询），同时具备完整SQL能力，满足"按数据类型+更新日期"组织缓存、增量更新去重等需求。单用户本地工具场景下不需要RDS的并发写入/多租户能力；如未来确有需要，SQLite文件可平滑导入Postgres。

**两个独立刷新任务组**：行情数据（K线）需要每天手动点一次（前复权价格会随除权变化，必须全量重抓，不能增量）；基本面数据（财报/业绩预告/行业指数/研报）更新频率低、且各自的"增量维度"不同（见2.2），与行情数据完全解耦，对应前端两个独立的刷新按钮。

---

## 2. 数据层

### 2.1 任务组A：行情数据

| 步骤 | 内容 | 更新方式 |
|---|---|---|
| ① 股票列表 | `get_constituents`（按市值筛选全市场A股，含上市日期/是否ST/北交所标记） | 每日全量抓取，与本地 `stocks` 表做增量+减量diff（新增写入，退市标的软删除：置 `delisted_at`） |
| ② 日K | `get_kline_ak_tx`（腾讯接口，qfq前复权，逐股票抓 date/open/close/high/low/volume） | 每日**全量删除重抓**（前复权价格会因除权重新计算，不能增量） |
| ③ 周/月/季K | 基于刚写入的日K做OHLCV重采样（open取首/high取max/low取min/close取末/volume求和） | 每日随①②一起**全量覆盖重算**（源头日K已变，重采样结果必须跟着变，不引入额外增量逻辑） |

数据库表：`stocks`、`kline_day`、`kline_week`、`kline_month`、`kline_quarter`（后三者与 `kline_day` 同构：`code, date, open, close, high, low, volume`）。

KDJ、知行白线/黄线等技术指标**不入库**，在 `/stock/{code}/kline` 响应时基于对应周期的OHLC现算（pandas向量化，几百行数据量级近乎瞬时），保持数据库结构简单。

### 2.2 任务组B：基本面数据

| 数据 | akshare接口 | 增量维度 | 更新频率 |
|---|---|---|---|
| 财报（单季/累计净利润、营收、同比、毛利率） | `stock_yjbb_em(date=report_date)` | 按 `report_date`（仅 `0331/0630/0930/1231` 四个合法值，传其他日期会报错） | 财报季前后（1/4/7/10月），全市场批量按最新 `report_date` 增量写入 |
| 业绩预告/快报 | `stock_yjyg_em` / `stock_yjkb_em` | 同上，按 `report_date` | 同上 |
| 申万行业指数 | `index_hist_sw` | 按指数代码增量追加最新交易日 | 每日（行业景气度判断依赖最新行情，且数据量小，增量成本低） |
| 研报 Stage1（全市场元数据） | `stock_research_report_em` | 按发布日期增量追加 | 低频（如每周），作为策略1硬过滤的代理信号 |
| 研报 Stage2（候选池PDF解析） | 东财下载PDF + `pdfplumber` 解析正文 | 仅对策略筛选出的候选池标的，按报告ID增量 | 随 `/screen` 触发或手动批量补抓 |

**为什么财报按 `report_date` 增量而不是"股票代码+report_date"**：akshare的 `stock_yjbb_em` 等接口本身就是"传一个 `report_date` 返回当期全市场数据"的批量接口，按 `report_date` 维度判断"这一期是否已经抓过"即可决定是否需要重新拉取，比逐股票判断更符合接口形态。

数据库表：`financial_reports`、`forecasts`、`industry_index`、`research_reports`（含 `stage` 字段标记元数据/已解析正文，及 `pdf_path`/`content_text` 字段）。

### 2.3 刷新机制与 `/meta`

- `POST /refresh/kline` — 触发任务组A（后台任务），Hover提示：*"更新股票列表与全市场K线数据（日/周/月/季），建议每日收盘后执行"*
- `POST /refresh/fundamental` — 触发任务组B，Hover提示：*"更新财报、业绩预告快报、行业指数与研报数据，财报季前后建议执行"*
- `GET /refresh/status` — 两个任务组各自的步骤进度：
  ```
  {
    kline:       { status: 'idle'|'running'|'done'|'error', updatedAt, steps: RefreshStep[] },
    fundamental: { status, updatedAt, steps: RefreshStep[] }
  }
  // RefreshStep = { label, done, total, elapsed, progress }
  ```
  - 任务组A steps：股票列表 / K线数据（日+周+月+季）
  - 任务组B steps：财报数据 / 业绩预告快报 / 申万行业指数 / 研报-全市场元数据 / 研报-候选池解析
- `GET /meta` — 各数据源更新时间：
  ```
  {
    stockList:        { updatedAt },
    klineDay:         { updatedAt },  // 周/月/季K同批次生成，共用一个时间戳
    financialReports: { updatedAt, reportPeriod },  // 如 "2025Q1"
    forecasts:        { updatedAt },
    industryIndex:    { updatedAt },
    researchReports:  { stage1UpdatedAt, stage2CandidateCount }
  }
  ```

---

## 3. 信号库：12个信号完整映射

主文档表4定义的12个信号，逐条对应数据来源与前端展示方式：

| # | 信号 | 量化定义（摘自主文档表4） | 数据来源 / 计算位置 | 前端展示映射 |
|---|---|---|---|---|
| 1 | 业绩大增 | 单季归母净利润同比 > 50% | `financial_reports`（按 `report_date` 增量） | `SignalKey.highGrowth` |
| 2 | 业绩超预期 | 实际增速 > 历史中枢，或预告/快报超预期 | `financial_reports` + `forecasts` 对比历史中枢 | `SignalKey.beatExpect` |
| 3 | 业绩创新高 | 单季/TTM净利润 = 历史新高 | `financial_reports` 同股票历史序列滚动比较 | 无独立徽章；作为策略1**加分项**参与打分，不单独显示 |
| 4 | 股价创历史新高 | 收盘价 = 历史新高/近一年新高（距高<5%） | `kline_day`（qfq）历史序列 | `SignalKey.newHigh` |
| 5 | 研报关键词命中 | 近90天研报命中关键词清单 | `research_reports`（Stage1元数据：标题/摘要关键词匹配；候选池Stage2解析正文复核） | 命中具体关键词 → `orderFull`/`capexExpand`/`newProduct`/`domesticSub`/`industryRecover`/`valuationRepair`（即 `KEYWORDS` 中除"高增长""业绩超预期"外的6个），溢出计入 `extraSignals` |
| 6 | 板块效应 | 同申万二级行业内"业绩大增+关键词命中"标的数 ≥ 3 | 信号1+信号5在 `industry_sw2` 维度的聚合统计（策略引擎运行时现算） | `SignalKey.sectorEffect` |
| 7 | 行业指数创新高 | 申万行业指数 = 历史/阶段新高 | `industry_index`（申万行业指数行情）历史序列 | `SignalKey.industryNewHigh` |
| 8 | α地位 | 行业内按区间涨幅/市值/业绩增速排序，取TopN | `kline_day`(区间涨幅) + `financial_reports`(增速) + 市值，行业内排序 | `SignalKey.alpha` |
| 9 | 低位错杀（策略2） | 距一年高回撤 > 35% 且净利润同比 > 0 | `kline_day`(回撤) + `financial_reports`(净利润同比) | 不设独立徽章——本身是策略2硬过滤条件，命中即入选，本身就是"上榜理由" |
| 10 | 🚫业绩持续下滑 | 净利润同比连续 ≥2季下滑 | `financial_reports` 历史序列 | 一票否决：命中则不进候选列表，不出现在 `signals` 数组里 |
| 11 | 🚫股价创历史新低 | 收盘价 = 历史新低 | `kline_day` 历史序列 | 同上，一票否决 |
| 12 | 🚫行业景气下行（策略2） | 行业整体净利润增速为负/下行 | `financial_reports` 按申万行业聚合 / `industry_index` 走势 | 策略2专属一票否决 |

**关于"12"对不上的说明**：前端 `types.ts` 的 `SignalKey` 也恰好有12个值，但与上表不是一一对应——`SignalKey` 是"会渲染成徽章的展示型信号"（6个核心信号 + 6个研报关键词），而上表中的"业绩创新高""低位错杀"和3个避雷信号是**策略引擎内部使用的**（参与打分/入选条件/一票否决），不会单独出现在徽章列表中。两边的12条都已完整覆盖，只是用途不同。

---

## 4. 策略引擎

### 4.1 策略1 / 策略2

沿用主文档第5节，不变：每个 preset = 硬过滤（必须满足）+ 加权打分（排序）+ 避雷（一票否决），输出 `Candidate.score`（0-100）与 `Candidate.signals`。

### 4.2 策略3「技术面战法」（新增）

- **定位**：与策略1/2平行的**第三类独立策略**，纯技术面布尔判定，**不计算综合得分**（用户已确认"目前先不用打分"）。
- **子选项**：
  - **双线战法**（`TrendSupportSelector`）：基于知行短期趋势线（白线，`compute_zhixing_short_trend`）与知行多空线（黄线，`compute_zhixing_bull_bear`）+ KDJ + 涨跌幅过滤。
  - **B2战法**（`B2Selector`）：放量上涨——量比 + 涨跌幅 + KDJ的J值过滤。
- **移植范围**：两个Selector类原样迁移，依赖的指标纯函数（`compute_kdj`/`compute_bbi`/`compute_rsv`/`compute_dif`/`compute_zhixing_short_trend`/`compute_zhixing_bull_bear`/`bbi_deriv_uptrend`）一并迁移，输入统一改为读取 `kline_day`（替代旧项目的CSV）。
- **参数**（取自旧项目 `configs.json`，作为 `/presets` 的默认值）：
  - 双线战法：`pct_chg_min=-2.0, pct_chg_max=1.8, j_threshold=15, j_q_threshold=0.1, max_window=90, tolerance=0.01, white_span=10, yellow_m_args=[14,28,57,114]`
  - B2战法：`vol_ratio=1.0, up_threshold=4.0, j_ceil=85.0, j_prev_threshold=-5.0, j_prev_q_threshold=0.1, max_window=90`，并内嵌一组 `trend_params`（结构同双线战法，`j_threshold=-5.0`）
- **响应结构**（独立于 `Candidate`，新类型 `TechnicalCandidate`）：
  ```
  { code, name, industry, close, pctChg, strategyName, triggerDate, diagnostics: Record<string, number>, sortKey }
  ```
  `diagnostics` 是该战法计算过程中保留的关键中间指标（如双线战法的J值/与白线的距离，B2战法的量比/涨跌幅/J值等），具体字段在移植Selector类时从其计算逻辑中提取确定；`sortKey` 用于列表默认排序（如按触发日期倒序）。

---

## 5. 后端API设计

在主文档第6节的5个端点基础上调整为8个：

| 端点 | 说明 |
|---|---|
| `POST /refresh/kline` | 触发任务组A（见2.3） |
| `POST /refresh/fundamental` | 触发任务组B（见2.3） |
| `GET /refresh/status` | 两个任务组的进度（见2.3） |
| `GET /presets` | 返回4个策略的参数schema：`[{id, category: 'fundamental'\|'technical', name, params: [...], warning?}]`。`StrategyId` 扩展为 `'super-growth' \| 'oversold-bluechip' \| 'trend-support' \| 'b2'` |
| `GET /screen?preset=<id>&params=<...>` | `category='fundamental'` → 返回 `Candidate[]`（不变）；`category='technical'` → 返回 `TechnicalCandidate[]`（见4.2） |
| `GET /stock/{code}/kline?period=day\|week\|month\|quarter` | 新增统一K线子资源：`{ data: Kline[], highLine, highLabel }`，`Kline` 新增 `k/d/j/whiteLine/yellowLine` 字段。被 `/stock/{code}` 和技术面右栏共用 |
| `GET /stock/{code}` | 个股下钻页完整详情（仅策略1/2语境），结构不变，`klineDay/Week/Month/Quarter` 类型升级为上面带指标的新 `Kline` |
| `GET /meta` | 见2.3 |

---

## 6. 前端联动

### 6.1 整体布局：新增"策略选择"侧栏 + TopBar精简

在现有"全局图标导航 | 主内容区"两栏之间，插入一条新的常驻竖向**策略选择侧栏**（对应此前确认的分组+分隔线效果），整体变为三栏。`TopBar` 去掉原有策略 `Tabs`，改为两个刷新按钮（2.3的文案）+ 简洁的更新时间提示。

策略1/2选中时：
```
┌──────┬──────────────┬──────────────────────────────────────────────┐
│ 全局  │ 策略选择      │ TopBar：Wordmark ······ [刷新行情][刷新基本面] 更新于X │
│ 图标  │              ├──────────────────────────────────────────────┤
│ 导航  │ 创新高超级成长 ●│                                              │
│       │ 低位错杀蓝筹   │  ┌─────────────────┐ ┌──────────────────┐  │
│ 选股  │ ──────────    │  │ 筛选条件          │ │                    │  │
│ 自选股│ 技术面战法     │  │ 候选结果(表格)    │ │  个股详情面板       │  │
│ 策略库│   双线战法     │  │ 数据刷新进度      │ │  (K线+KDJ+黄白线)  │  │
│ 回测  │   B2战法      │  └─────────────────┘ └──────────────────┘  │
│ 设置  │              │                                              │
└──────┴──────────────┴──────────────────────────────────────────────┘
```

技术面战法选中时，主内容区切换为另一种两栏：
```
┌──────┬──────────────┬──────────────────────────────────────────────┐
│ 全局  │ 策略选择      │ TopBar：同上                                  │
│ 图标  │              ├──────────────────────────────────────────────┤
│ 导航  │ 创新高超级成长 │                                              │
│       │ 低位错杀蓝筹   │  ┌─────────────┐ ┌──────────────────────┐  │
│ 选股  │ ──────────    │  │ 参数面板(简) │ │                        │  │
│ 自选股│ 技术面战法     │  │ 候选列表     │ │   K线主图(候选股票)     │  │
│ 策略库│   双线战法 ●   │  │ (独立列表)   │ │   ─────────           │  │
│ 回测  │   B2战法      │  │ 数据刷新进度 │ │   KDJ 副图             │  │
│ 设置  │              │  └─────────────┘ └──────────────────────┘  │
└──────┴──────────────┴──────────────────────────────────────────────┘
```

策略选择侧栏始终常驻，不随策略变化；点击其中一项决定主内容区渲染哪种布局。

### 6.2 策略1/2视图

基本不变：左列 `FilterPanel` + `CandidateResults`（渲染 `Candidate[]`）+ `DataRefreshProgress`；右列 `StockDetailPanel`，其中 `PriceChart` 升级为统一组件（新增KDJ副图 + 黄白线叠加）。

### 6.3 策略3视图（技术面战法）

新页面级组件（如 `TechnicalScreenView`），左栏新增 `TechnicalCandidateList`（独立列表，渲染 `TechnicalCandidate[]`，顶部为按当前子战法切换字段的精简参数面板，复用 `NumberField`）+ `DataRefreshProgress`；右栏复用6.2升级后的统一 `PriceChart`（K线+KDJ+黄白线），数据来自 `/stock/{code}/kline`。**不展示** `StockDetailPanel` 的财报/研报/风险卡片——这些与纯技术面选股无关。

`PriceChart` 作为**全站唯一的K线图表组件**，在策略1/2下钻页和技术面右栏中复用同一份实现，避免重复造轮子。

### 6.4 数据刷新区

`DataRefreshProgress` 从现有"4步线性进度条"改为两个分组卡片：

- **任务组A（行情）**：股票列表 / K线数据（日+周+月+季）
- **任务组B（基本面）**：财报数据 / 业绩预告快报 / 申万行业指数 / 研报-全市场元数据 / 研报-候选池解析

对应 `/refresh/status` 的 `kline`/`fundamental` 两组数据。该卡片在策略1/2和技术面视图中都显示。

### 6.5 类型变更（`types.ts`）

- `StrategyId`: `'super-growth' | 'oversold-bluechip' | 'trend-support' | 'b2'`
- `Kline`: 新增 `k, d, j, whiteLine, yellowLine` 字段（可选，技术指标）
- 新增 `TechnicalCandidate` 类型（见4.2）
- `SignalKey`、`SIGNAL_META`、`KEYWORDS` 不变

---

## 7. 实施路线图

按风险与依赖关系分4个阶段：

1. **基础设施 + 技术面战法全链路打通**：SQLite建库 + FastAPI骨架；移植 `fetch_kline.py`（日K全量重抓 + 周/月/季K重采样）；移植 `TrendSupportSelector`/`B2Selector` 及指标函数；端点 `/refresh/kline`、`/screen?preset=trend-support|b2`、`/stock/{code}/kline`；前端策略选择侧栏 + 技术面两栏布局 + 统一 `PriceChart`。
   - 用最先确定要复用的代码，把"SQLite ↔ FastAPI ↔ React"整条链路和整体框架先跑通，技术面战法本身也是一个独立可用功能，且不依赖财报/爬虫，风险最低。
2. **基本面数据层**：财报/业绩预告快报/申万行业指数接入；`financial_reports`/`forecasts`/`industry_index` 表 + 增量逻辑；信号层纯函数（业绩大增/超预期/创新高、股价创新高、行业指数创新高、低位错杀、3个避雷信号），逐个可单测。
3. **研报爬虫 + 策略1/2组装**：东财研报Stage1（全市场元数据，限速+本地缓存+断点续爬）；信号层补全（研报关键词命中、板块效应、α地位）；组装策略1/2引擎（此时策略1/2才第一次端到端可跑，因为其硬过滤条件本身包含"研报关键词命中"）；`/presets`、`/screen?preset=super-growth|oversold-bluechip`、`/refresh/fundamental` 完整版；Stage2候选池PDF下载+解析。
4. **收尾打磨**：`/meta` 完整实现；默认股票池过滤（剔除ST/上市<1年/北交所）；端到端联调与边界场景检查（停牌股、新股无历史数据等）。

---

## 8. 测试策略（在主文档第9节基础上补充）

- **技术面选股回归测试**：复用 `StockTradebyZ-改` 的CSV fixture模式（其AGENTS.md约定的"确定性本地CSV测试数据"），用相同输入跑移植后的 `TrendSupportSelector`/`B2Selector`，结果应与旧项目一致。
- **K线重采样**：构造已知日K样本，验证周/月/季K聚合在月末/季末边界处的分组正确（open=首/high=max/low=min/close=末/volume=求和）。
- **指标函数**（KDJ/BBI/知行白线黄线等）：固定输入验证输出，沿用旧项目计算逻辑作为基准。
- **财报增量更新**：mock akshare返回，验证按 `report_date` 增量写入与去重。
- **研报爬虫**：HTTP响应用本地mock，不依赖真实网络，验证限速/断点续爬逻辑。
- **前端**：当前未引入测试框架，v1沿用"接入真实API后浏览器手动走查"，`data/mock.ts` 在开发期继续作为离线fixture，不额外引入测试基础设施。

---

## 9. 未决事项（实施时确认）

- `TechnicalCandidate.diagnostics` 的具体字段名，需在移植 `TrendSupportSelector`/`B2Selector` 时从其计算逻辑中的中间变量提取确定。
- 技术面参数面板的具体UI（哪些参数可调、滑块范围）在实施阶段细化，默认值取自 `configs.json`（见4.2）。
