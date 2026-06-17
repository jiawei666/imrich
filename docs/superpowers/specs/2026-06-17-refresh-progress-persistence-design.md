# 刷新进度持久化降频设计

## 背景

当前后端使用 FastAPI + SQLAlchemy + SQLite，刷新任务的实时状态保存在内存 `STATE` 中，前端通过 `/refresh/status` 与 `/refresh/status/stream` 读取。为了支持进程重启后的进度恢复，心跳线程还会把 `STATE` 高频写入 `refresh_runs` 与 `refresh_steps`。

SQLite 的写锁粒度是数据库文件级别，不是表级别。即使心跳只写 `refresh_runs` / `refresh_steps`，也会和正在写 `stocks`、`kline_days`、`financial_reports`、`forecasts`、`research_reports` 等业务表的刷新任务争用同一个写锁。近期出现的 `sqlite3.OperationalError: database is locked` 就来自 `persist_state()` 更新 `refresh_runs` 时撞上业务写事务。

## 目标

- 消除心跳线程高频写 SQLite 导致的锁竞争。
- 保留前端实时刷新进度能力。
- 保留后端重启后识别“上次任务中断”的能力。
- 不引入 Redis、PostgreSQL 等额外运行依赖。
- 不在本次改造中改变 7 个刷新任务的业务数据写入方式。

## 非目标

- 不解决所有 SQLite 多写者竞争；业务刷新任务之间仍可能争用写锁。
- 不恢复后端异常退出前精确到 `done/progress` 的运行中进度。
- 不重构刷新任务的整体依赖图与并发编排。

## 现状问题

当前心跳流程：

1. `start_heartbeat()` 启动 daemon 线程。
2. 每 `HEARTBEAT_INTERVAL` 秒调用 `_heartbeat_once()`。
3. 对每个 group 生成进度指纹：`group.status + steps[].status/done/progress`。
4. 如果整体指纹变化，调用 `persist_state()`。
5. `persist_state()` upsert `refresh_runs` 与 `refresh_steps` 并提交事务。

刷新任务运行时，`done/progress` 会频繁变化，心跳线程接近每几秒写一次 SQLite。由于 SQLite 同一时刻只能有一个写事务，心跳写库会和任何业务写事务冲突。

## 方案

采用“运行态进度只读内存，生命周期边界低频落库”的模型。

### 状态来源

- 进程运行中：`/refresh/status` 与 SSE 始终读取内存 `STATE`。
- 任务进行中：`step.done`、`step.progress`、`step.elapsed` 只存在内存，不写 SQLite。
- 进程启动恢复：读取 `refresh_runs` 的任务摘要，再根据业务表数据回填可推导的完成状态。

### 心跳线程

心跳线程保留，但只做进程内 watchdog：

- 观察内存进度指纹。
- 指纹变化时更新 group 的 `last_beat`。
- 不调用 `persist_state()`。
- 若 running group 超过 `STALE_THRESHOLD` 没有推进，由现有 `_detect_stale()` 在内存中标记 `error`。

这样前端实时进度仍然可用，但心跳线程不再参与 SQLite 写锁竞争。

### 数据库持久化

`refresh_runs` 改为任务组生命周期摘要表，低频写入：

- 任务开始：写 `status=running`、`updated_at`、`instance_id`、`heartbeat_at`。
- 任务成功：写 `status=done`、`updated_at`，清空 `instance_id` 与 `heartbeat_at`。
- 任务失败：写 `status=error`、`error`、`updated_at`，清空 `instance_id` 与 `heartbeat_at`。
- 启动恢复发现旧 running：写 `status=error`，`error="上次任务中断"`。

`refresh_steps` 保留表结构以兼容旧库和现有模型，但不再作为运行中进度的持久化来源。实现阶段可以停止写入 `refresh_steps`，或仅在任务结束时写最终快照；默认选择停止写入，避免额外 SQLite 写事务。

### 任务生命周期封装

新增统一的生命周期辅助函数，避免各刷新入口重复写持久化逻辑。

建议接口：

```python
def _mark_group_started(group_key: str) -> None: ...
def _mark_group_finished(group_key: str, status: str, error: str | None = None) -> None: ...
```

各任务入口在边界调用：

- `run_stock_list_refresh`
- `run_kline_data_refresh`
- `run_financial_refresh`
- `run_forecasts_refresh`
- `run_industry_refresh`
- `run_research_meta_refresh`
- `run_research_pdfs_refresh`
- `run_full_refresh`

单步任务归属：

- `stock-list` 与 `kline-data` 更新 `kline` 组摘要。
- 5 个基本面任务更新 `fundamental` 组摘要。
- 一键全量更新更新 `all` 组摘要，并继续维护 `kline` / `fundamental` 的内存状态。

### 启动恢复

启动时流程调整为：

1. `init_db()` 初始化表结构。
2. 读取 `refresh_runs`。
3. 对 `status=running` 且 `instance_id != 当前 INSTANCE_ID` 的记录，标记为 `error`，错误信息为“上次任务中断”。
4. 重置内存 `STATE`。
5. 使用 `_backfill_state_from_db()` 根据业务表回填已有数据对应的 step 状态。
6. 启动心跳 watchdog。

不再从 `refresh_steps` 恢复精确 step 进度。

## 错误处理

- 生命周期持久化失败时记录 warning/error，但不应让业务刷新任务因为“摘要写入失败”直接失败。
- 业务刷新任务自身失败时仍按现有逻辑更新内存 step 为 `error`，并在边界写 `refresh_runs.status=error`。
- 如果后端整个进程卡死，进程内 watchdog 无法自救；仍需要依赖外部重启机制。重启后通过旧 `running` 记录识别中断。

## 数据流

```text
刷新任务运行
  -> 更新内存 STATE.steps[].done/progress
  -> 前端 SSE 读取内存 STATE
  -> 心跳线程只更新内存 last_beat

任务开始/结束/失败
  -> 低频写 refresh_runs

后端重启
  -> 读取 refresh_runs 识别旧 running
  -> 根据业务表回填 STATE 摘要
```

## 测试计划

- 心跳线程测试：`_heartbeat_once()` 在进度变化时更新 `last_beat`，但不写 `refresh_runs`。
- 低频持久化测试：任务开始/成功/失败分别更新 `refresh_runs`。
- 启动恢复测试：旧 `running` 且 `instance_id` 不匹配时标记为中断。
- 回归测试：业务表持有短暂 SQLite 写锁时，心跳不会尝试写库，因此不产生 `database is locked`。
- 现有状态接口测试：`/refresh/status` 与 SSE 仍返回内存实时进度。

## 取舍

这个方案牺牲了“进程崩溃后恢复精确百分比”的能力，换取更低的 SQLite 写锁竞争和更简单的运行态模型。对于当前本地选股工具，刷新任务可重跑，业务表可回填摘要状态，这个取舍比高频持久化运行中进度更稳。
