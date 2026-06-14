# 低位错杀蓝筹策略重构设计

> 日期: 2026-06-14
> 状态: 已回测验证，待实施

## 背景与问题

现有 `oversold-bluechip` 策略存在四个严重缺陷：

1. **无蓝筹定义**：没有市值门槛、行业龙头地位等筛选，50 亿小盘股只要超跌就能入选
2. **oversold 信号过严**：要求回撤 > 35% + 净利润同比 > 0%，导致顺丰（回撤 30.4%，利润+13%）被排除
3. **risk_profit_decline 机械**：连续 3 期同比下滑即排除，山西汾酒（0.48%→0.03%→-19.03%）被排除，但这恰恰是"错杀"的情形
4. **业绩衡量单一**：只看最新一期 Q1 同比，波动大且可能掩盖年报级别的实质恶化（如五粮液 Q1+82% 但年报-72%）

## 专家组圆桌结论

### 蓝筹定义（三条件 AND）

| 条件 | 阈值 | 数据来源 |
|------|------|----------|
| 市值 ≥ 500 亿 | `bluechipMarketCap` 默认 500 | `Stock.market_cap` |
| 最近连续 4 期净利润 > 0 | `bluechipProfitQuarters` 默认 4 | `FinancialReport.net_profit` |
| 最新毛利率 > 10%（金融行业豁免） | `bluechipMinGrossMargin` 默认 10 | `FinancialReport.gross_margin` |

金融行业判断：行业名称包含「银行、证券、保险、信托、多元金融」。

### 业绩衡量：TTM 同比

优先级：

1. **精确 TTM**：当前 TTM = Q1_new + (Annual_prev - Q1_prev)；去年同期 TTM = Q1_prev + (Annual_pp - Q1_pp)。需 3 年 Q1 数据
2. **年报同比**：最近两年年报净利润的同比变化。缺 Q1 数据时使用
3. **Q1 同比**：仅作为最后兜底

当前数据库 2024 年缺少 Q1 数据，所以大部分股票会走年报同比路径。随着数据积累，精确 TTM 的覆盖率会提高。

### 错杀判定（场景 A 或 B）

| 场景 | 条件 | 含义 |
|------|------|------|
| A（超跌错杀） | 回撤 ≥ 25% **且** TTM 同比 > -15% | 股价大幅回撤但业绩基本稳定 |
| B（深度错杀） | 回撤 ≥ 50% **且** TTM 同比 > -30% **且**年报净利 > 0 | 极端超跌，但公司仍在盈利 |

参数可调：

| 参数 | 默认 | 含义 |
|------|------|------|
| `drawdownMin` | 25 | 回撤下限(%) |
| `ttmYoyThreshold` | -15 | TTM 同比容忍下限(%) |
| `deepDrawdown` | 50 | 深度超跌回撤(%) |
| `deepTtmYoy` | -30 | 深度超跌 TTM 容忍(%) |

### 风险过滤（软标记，不硬排除）

| 风险 | 条件 | 展示 |
|------|------|------|
| 业绩结构恶化 | TTM 同比 < -15% 且毛利率同比降 > 3pct 且营收同比 < 0 | ⚠️ 标记 |
| 行业弱势 | 行业指数下行（沿用 `risk_industry_down`） | ⚠️ 标记 |

不再硬排除 `risk_profit_decline` 和 `risk_industry_down`，改为软标记。保留 `risk_price_new_low` 作为硬排除（创历史新低说明市场极度看空）。

## 回测结果

| 指标 | 旧策略 | 新策略 |
|------|--------|--------|
| 入选数量 | 25 只 | 108 只 |
| 顺丰控股 | 排除（回撤不足 35%） | **入选**（场景 A，回撤 30.4%，TTM 同比 +9.3%） |
| 山西汾酒 | 排除（利润连续下滑） | **入选**（场景 A，回撤 54.4%，TTM 同比 +0.03%） |
| 五粮液 | 入选（Q1 同比+82%） | **排除**（年报同比-72%，实质性恶化） |
| 中国石化 | 入选（Q1 同比+28%） | **排除**（年报同比-37%，实质性恶化） |

新策略通过 TTM/年报同比有效区分了"错杀"和"真杀"。

## 代码改动清单

### `app/signals.py`

- 新增 `is_bluechip(market_cap, reports, industry, params)` 函数
- 新增 `calc_ttm_yoy(reports_list)` 函数
- 修改 `low_position_oversold` → 保留原函数（技术面还在用），新增 `oversold_bluechip(closes, ttm_yoy, params)` 函数
- 新增 `risk_structural_decline(ttm_yoy, reports)` 函数（替代 `risk_profit_decline` 在蓝筹策略中的使用）

### `app/fundamental_rows.py`

- `build_fundamental_rows` 中对 `oversold-bluechip` 预设加入蓝筹硬性筛选
- 新增 TTM 同比计算逻辑
- 新增 `is_bluechip`、`ttm_yoy` 等字段到行数据
- 软风险标记替代硬排除

### `app/fundamental_screen.py`

- `oversold-bluechip` 分支：使用新的蓝筹 + TTM + 场景 A/B 判定
- 保留 `_has_common_risk` 中的 `risk_price_new_low`，移除 `risk_profit_decline`
- 软风险标记通过 `_candidate` 传递到前端

### `app/presets.py`

- 更新 `oversold-bluechip` 参数列表：新增 `bluechipMarketCap`、`bluechipProfitQuarters`、`bluechipMinGrossMargin`、`ttmYoyThreshold`、`deepDrawdown`、`deepTtmYoy`
- `drawdownMin` 默认值从 35 改为 25
