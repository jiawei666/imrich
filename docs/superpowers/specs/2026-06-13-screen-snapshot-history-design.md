# 双线/B2 战法筛选结果按天快照设计

日期：2026-06-13

## 背景

技术面战法面板中，「双线战法」（`trend-support`）和「B2 战法」（`b2`）的筛选都是全市场逐股计算，耗时较长。每次点击「运行筛选」都会重新加载全市场日K并逐股评估，即使行情数据没有更新（同一交易日内多次操作）也要重算一次。

同时，用户希望能回看"某一天该战法选出了哪些股票"，而不只是看当前最新一次的结果。

## 目标

1. 每次「运行筛选」的结果按 **(战法, 数据日期)** 存入数据库，数据日期为本次计算所依据的最新K线日期。
2. 同一 (战法, 数据日期) 若已有记录且本次参数与已存参数相同，直接返回缓存结果，跳过全市场加载与逐股计算。
3. 参数不同则重新计算并覆盖该 (战法, 数据日期) 记录。
4. 前端在筛选结果模式下提供一个历史日期下拉框，可只读地查看某一天保存的结果，不触发重新计算。

范围仅限技术面预设 `trend-support` 和 `b2`（即 `TECHNICAL_PRESETS`），不涉及基本面预设（`run_fundamental_screen` 不变）。

## 数据模型

新增表 `screen_snapshots`（`app/models.py`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer, PK, autoincrement | |
| `preset_id` | String, index | `trend-support` / `b2` |
| `data_date` | String | 本次筛选依据的最新K线日期（'YYYY-MM-DD'） |
| `params_json` | String | 本次运行使用的参数，`json.dumps(params, sort_keys=True)` |
| `candidates_json` | String | 候选股结果列表（与 `/screen` 返回结构相同），`json.dumps(candidates)` |
| `candidate_count` | Integer, default 0 | 入选数量，用于历史列表展示 |
| `updated_at` | String | 最近一次写入时间（ISO 字符串） |

约束：`UniqueConstraint("preset_id", "data_date")`，并建索引 `(preset_id, data_date)`。

新表通过现有 `init_db()` 中的 `Base.metadata.create_all(engine)` 自动创建，无需额外迁移脚本。

## 后端逻辑（`app/screen.py`）

### 新增辅助函数

- `_latest_kline_date() -> Optional[str]`：执行 `SELECT MAX(date) FROM kline_day`，轻量查询，不加载全市场数据。
- `_load_snapshot(preset_id, data_date) -> Optional[ScreenSnapshot]`：按 `(preset_id, data_date)` 查一行。
- `_save_snapshot(preset_id, data_date, params_json, candidates) -> None`：存在则更新（覆盖 `params_json`/`candidates_json`/`candidate_count`/`updated_at`），不存在则插入。写入失败时捕获异常、记录日志，不影响本次结果返回。
- `list_screen_snapshots(preset_id: str) -> List[dict]`：按 `data_date` 倒序返回 `[{"date": ..., "count": ..., "updatedAt": ...}, ...]`。
- `get_screen_snapshot(preset_id: str, data_date: str) -> Optional[List[dict]]`：返回该记录的 `candidates_json` 反序列化结果；不存在返回 `None`。

### `run_technical_screen` 改造

```python
def run_technical_screen(preset_id, params):
    data_date = _latest_kline_date()
    if data_date is None:
        return []

    params_json = json.dumps(params or {}, sort_keys=True)
    snap = _load_snapshot(preset_id, data_date)
    if snap is not None and snap.params_json == params_json:
        return json.loads(snap.candidates_json)

    # ——— 现有计算逻辑（加载全市场K线、逐股 evaluate）———
    # date 取值改为使用 data_date（pd.Timestamp(data_date)）
    candidates = [...]

    _save_snapshot(preset_id, data_date, params_json, candidates)
    return candidates
```

- 即使 `candidates == []` 也写入快照（`candidate_count=0`），表示"这天该战法没有选出股票"，同样参与缓存命中判断和历史列表展示。
- `_load_kline_data()` 内部已有的 `latest_date` 计算与 `_latest_kline_date()` 结果应一致（均为 `kline_day` 表的全局最大日期），用 `data_date` 替代原先 `max(df["date"].max() for df in data.values())` 不改变现有筛选行为。

## 新增 API 端点（`app/main.py`）

```python
@app.get("/screen/history")
def screen_history(preset: str):
    return list_screen_snapshots(preset)

@app.get("/screen/history/{date}")
def screen_history_detail(date: str, preset: str):
    result = get_screen_snapshot(preset, date)
    if result is None:
        raise HTTPException(status_code=404, detail="未找到该日期的筛选结果")
    return result
```

`app/schemas.py` 新增：

```python
class ScreenSnapshotMeta(BaseModel):
    date: str
    count: int
    updatedAt: str
```

## 前端改动

### `types.ts`

```ts
export interface ScreenSnapshotMeta {
  date: string
  count: number
  updatedAt: string
}
```

### `lib/api.ts`

```ts
screenHistory: (preset: string) =>
  get<ScreenSnapshotMeta[]>(`/screen/history?preset=${encodeURIComponent(preset)}`),
screenHistoryDetail: (preset: string, date: string) =>
  get<TechnicalCandidate[]>(`/screen/history/${date}?preset=${encodeURIComponent(preset)}`),
```

### `components/screener/StockListCard.tsx`

新增 props：

- `historyList?: ScreenSnapshotMeta[]`
- `selectedHistoryDate?: string`
- `onSelectHistoryDate?: (date: string) => void`

当 `isScreened && historyList?.length` 时，在卡头标题旁渲染一个 `<select>`，按 `historyList`（已按日期倒序）渲染选项，文案形如 `2026-06-13（12只）`，`value` 绑定 `selectedHistoryDate`，`onChange` 调用 `onSelectHistoryDate`。

### `components/technical/TechnicalScreenView.tsx`

新增状态：

```ts
const [historyList, setHistoryList] = useState<ScreenSnapshotMeta[]>([])
const [historyDate, setHistoryDate] = useState<string | null>(null)
```

- **`runScreen` 成功后**：调用 `api.screenHistory(strategy)` 刷新 `historyList`，并把 `historyDate` 设为列表第一项（按日期倒序，即刚保存的"最新日期"快照）。
- **新增 `onSelectHistoryDate(date)`**：若 `date === historyDate` 直接返回；否则调用 `api.screenHistoryDetail(strategy, date)`，用返回结果替换 `candidates`，更新 `historyDate = date`。不修改 `paramValues`——筛选抽屉中的参数仍是当前/上次手动设置的值，仅影响下一次「运行筛选」。
- **切换策略的现有 effect**（重置 `paramValues`/`screenMode`/`filterOpen` 那个）中追加：`setHistoryList([])`、`setHistoryDate(null)`。
- **`clearScreen`**（"清除筛选"按钮回调）中追加同样的两行重置。

将 `historyList`、`historyDate`、`onSelectHistoryDate` 作为新 props 传给 `StockListCard`。

## 数据流小结

1. 用户调整参数 → 点击「运行筛选」→ 后端按 (战法, 最新数据日期) 查缓存：参数相同则秒回缓存结果，参数不同或无记录则全量计算并 upsert 快照 → 前端展示结果，历史下拉框自动选中"最新日期"。
2. 用户从下拉框选择某个历史日期 → 前端只读拉取该日期保存的 `candidates_json`，替换列表展示，不触发任何计算。
3. 再次点击「运行筛选」会覆盖"最新数据日期"那条记录，并把下拉框自动切回最新日期。
4. 切换战法或点击「清除筛选」→ 历史下拉框清空/隐藏，回到全市场模式。

## 测试计划

### 后端

`tests/test_screen.py` 扩展：

- 调用 `run_technical_screen` 后，`screen_snapshots` 表中存在对应 `(preset_id, data_date)` 记录，`candidate_count`/`candidates_json` 与返回结果一致。
- 相同参数再次调用 → 返回结果与第一次完全一致，且表中仍只有一行（验证缓存命中、未重复写入）。
- 不同参数再次调用（同一 `data_date`）→ 该行被覆盖（`params_json` 更新，行数不变，`candidates_json` 随新结果变化）。
- 候选为空（`[]`）时也写入一行 `candidate_count=0`，且该记录同样可被缓存命中。

`tests/test_api.py` 新增：

- `GET /screen/history?preset=xxx` 按日期倒序返回 `[{date, count, updatedAt}]`。
- `GET /screen/history/{date}?preset=xxx` 返回内容与对应快照的 `candidates_json` 一致。
- 请求不存在的日期 → 404。

### 前端（手动验证）

`npx tsc --noEmit` + `npm run lint` 通过后，浏览器手测：

- 运行筛选后，下拉框出现并显示当天日期 + 数量。
- 切换到历史日期 → 候选列表替换为该日快照内容，网络面板只请求 `/screen/history/{date}`，不再请求 `/screen`。
- 切换战法 → 下拉框消失、回到全市场模式。
- 相同参数重复点击「运行筛选」→ 响应明显更快（命中缓存）。
