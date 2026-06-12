# 刷新进度实时推送(SSE) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将刷新进度从"前端 3s 轮询"改为"后端 SSE 实时推送"，0.5s 间隔有变化即推。

**Architecture:** 后端从 `app/main.py` 的 `/refresh/status` 端点中抽取快照逻辑到 `app/refresh.py:get_status_snapshot()`，新增 `GET /refresh/status/stream` SSE 端点（0.5s 间隔 + diff 推送 + 心跳保活）。前端 `App.tsx` 删除 setInterval 轮询，改为 `EventSource` 常开订阅，状态从 running→非running 时触发单次 `/meta` 拉取。

**Tech Stack:** Python/FastAPI/Starlette StreamingResponse, TypeScript/React/EventSource

---

### Task 1: 抽取 `get_status_snapshot()` 到 `app/refresh.py`

**Files:**
- Modify: `backend/app/refresh.py`
- Modify: `backend/app/main.py:60-90`

- [ ] **Step 1: 在 `app/refresh.py` 末尾新增 `get_status_snapshot()` 函数**

在 `app/refresh.py` 文件末尾（`reset_state` 函数之后、`_fmt` 之后均可，放在 `_PERIOD_MODELS` 之后区域）新增：

```python
def get_status_snapshot() -> dict:
    """返回 STATE 的序列化快照，并用数据库实际入库量回填进度。"""
    from app.db import SessionLocal
    from app.models import Stock, KlineDay

    def _grp(g):
        return {"status": g.status, "updatedAt": g.updatedAt,
                "error": g.error, "steps": [vars(s) for s in g.steps]}

    result = {k: _grp(v) for k, v in STATE.items()}

    with SessionLocal() as s:
        stock_count = s.query(Stock).filter(Stock.delisted_at.is_(None)).count()
        kline_stock_count = s.query(KlineDay).group_by(KlineDay.code).count()

    kline_steps = result["kline"]["steps"]

    if stock_count > 0:
        kline_steps[0]["total"] = max(kline_steps[0]["total"], stock_count)
        kline_steps[0]["done"] = stock_count
        kline_steps[0]["progress"] = int(stock_count / kline_steps[0]["total"] * 100)

    if stock_count > 0:
        kline_steps[1]["total"] = max(kline_steps[1]["total"], stock_count)
        kline_steps[1]["done"] = kline_stock_count
        kline_steps[1]["progress"] = int(kline_stock_count / stock_count * 100)

    return result
```

- [ ] **Step 2: 修改 `app/main.py` 的 `/refresh/status` 端点，改为调用新函数**

将 `app/main.py` 第 60-90 行的 `refresh_status()` 函数替换为：

```python
@app.get("/refresh/status")
def refresh_status():
    return refresh.get_status_snapshot()
```

同时删除不再需要的 import（`SessionLocal`、`Stock`、`KlineDay` 不再在 main.py 中使用），确认 `from app import refresh` 已存在。

- [ ] **Step 3: 运行现有测试确认行为不变**

```bash
cd backend && source venv/bin/activate && pytest tests/test_api.py::test_refresh_status_initial -v
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/app/refresh.py backend/app/main.py
git commit -m "refactor: 抽取 get_status_snapshot() 到 refresh 模块"
```

---

### Task 2: 新增 `GET /refresh/status/stream` SSE 端点

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: 在 `app/main.py` 添加 import**

在文件顶部 import 区域新增：

```python
import asyncio
from fastapi import Request
from fastapi.responses import StreamingResponse
```

- [ ] **Step 2: 在 `/refresh/status` 端点下方新增 SSE 端点**

```python
@app.get("/refresh/status/stream")
async def refresh_status_stream(request: Request):
    async def gen():
        last = None
        while True:
            if await request.is_disconnected():
                break
            snapshot = refresh.get_status_snapshot()
            if snapshot != last:
                yield f"data: {json.dumps(snapshot)}\n\n"
                last = snapshot
            else:
                yield ": ping\n\n"
            await asyncio.sleep(0.5)
    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 3: 启动后端手动验证 SSE 端点**

```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload &
sleep 2
curl -N http://localhost:8000/refresh/status/stream &
sleep 2
kill %1 %2 2>/dev/null
```

Expected: 看到 `data: {"kline":{"status":"idle",...},"fundamental":{...}}` 输出。

- [ ] **Step 4: 提交**

```bash
git add backend/app/main.py
git commit -m "feat: 新增 GET /refresh/status/stream SSE 端点"
```

---

### Task 3: 后端测试 — `get_status_snapshot` 和 SSE 流

**Files:**
- Create: `backend/tests/test_refresh_stream.py`

- [ ] **Step 1: 创建测试文件 `backend/tests/test_refresh_stream.py`**

```python
import json

from app import refresh


def test_get_status_snapshot(client):
    refresh.reset_state()
    snapshot = refresh.get_status_snapshot()
    assert "kline" in snapshot
    assert "fundamental" in snapshot
    assert snapshot["kline"]["status"] == "idle"
    assert isinstance(snapshot["kline"]["steps"], list)
    assert len(snapshot["kline"]["steps"]) == 2
    assert len(snapshot["fundamental"]["steps"]) == 5


def test_refresh_status_stream(client):
    refresh.reset_state()
    with client.stream("GET", "/refresh/status/stream") as response:
        for line in response.iter_lines():
            if line.startswith("data:"):
                payload = line[5:].strip()
                body = json.loads(payload)
                assert "kline" in body
                assert "fundamental" in body
                break
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && source venv/bin/activate && pytest tests/test_refresh_stream.py -v
```

Expected: 2 PASS

- [ ] **Step 3: 提交**

```bash
git add backend/tests/test_refresh_stream.py
git commit -m "test: get_status_snapshot 和 SSE 流端点测试"
```

---

### Task 4: 前端 `api.ts` 新增 SSE 订阅方法

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 `api` 对象中新增 `refreshStatusStream` 方法**

在 `api` 对象中、`refreshStatus` 之后新增：

```ts
  refreshStatusStream: (onMessage: (status: RefreshStatus) => void) => {
    const es = new EventSource(`${BASE}/refresh/status/stream`)
    es.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data) as RefreshStatus) } catch { /* ignore parse errors */ }
    }
    return () => es.close()
  },
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): api 新增 refreshStatusStream SSE 订阅方法"
```

---

### Task 5: 前端 `App.tsx` 改用 SSE 订阅

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 在 import 中新增 `useRef`**

将第 1 行：
```ts
import { useEffect, useState } from 'react'
```
改为：
```ts
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Step 2: 删除初始化 useEffect 中的 `api.refreshStatus()` 调用**

将第 41-45 行：
```ts
  useEffect(() => {
    api.presets().then(setPresets).catch(() => setPresets([]))
    api.refreshStatus().then(setRefreshStatus).catch(() => setRefreshStatus(undefined))
    api.meta().then(setMeta).catch(() => setMeta(undefined))
  }, [])
```
改为：
```ts
  useEffect(() => {
    api.presets().then(setPresets).catch(() => setPresets([]))
    api.meta().then(setMeta).catch(() => setMeta(undefined))
  }, [])
```

- [ ] **Step 3: 删除 `reloadRefreshStatus` 变量**

删除第 52-53 行：
```ts
  const reloadRefreshStatus = () =>
    api.refreshStatus().then(setRefreshStatus).catch(() => setRefreshStatus(undefined))
```

- [ ] **Step 4: 精简 `triggerRefreshKline` 和 `triggerRefreshFundamental`**

将第 80-92 行：
```ts
  const triggerRefreshKline = (reloadStockList: boolean) => {
    api.refreshKline(reloadStockList).then(() => {
      reloadRefreshStatus()
      reloadMeta()
    }).catch(() => {})
  }

  const triggerRefreshFundamental = () => {
    api.refreshFundamental().then(() => {
      reloadRefreshStatus()
      reloadMeta()
    }).catch(() => {})
  }
```
改为：
```ts
  const triggerRefreshKline = (reloadStockList: boolean) => {
    api.refreshKline(reloadStockList).catch(() => {})
  }

  const triggerRefreshFundamental = () => {
    api.refreshFundamental().catch(() => {})
  }
```

- [ ] **Step 5: 删除轮询 useEffect，新增 SSE 订阅 useEffect**

将第 94-106 行：
```ts
  useEffect(() => {
    if (
      refreshStatus?.kline.status !== 'running' &&
      refreshStatus?.fundamental.status !== 'running'
    ) {
      return
    }
    const id = window.setInterval(() => {
      reloadRefreshStatus()
      reloadMeta()
    }, 3000)
    return () => window.clearInterval(id)
  }, [refreshStatus?.fundamental.status, refreshStatus?.kline.status])
```
替换为：
```ts
  const prevStatusRef = useRef<{ kline?: string; fundamental?: string }>({})

  useEffect(() => {
    const close = api.refreshStatusStream((status) => {
      setRefreshStatus(status)
      const prev = prevStatusRef.current
      if (prev.kline === 'running' && status.kline.status !== 'running') {
        reloadMeta()
      }
      if (prev.fundamental === 'running' && status.fundamental.status !== 'running') {
        reloadMeta()
      }
      prev.kline = status.kline.status
      prev.fundamental = status.fundamental.status
    })
    return close
  }, [])
```

注意：`prevStatusRef` 声明放在组件顶部、其他 state 声明附近（第 39 行 `detailError` 之后）。

- [ ] **Step 6: 类型检查**

```bash
cd frontend && npx tsc -b --noEmit 2>&1 | head -20
```

Expected: 无类型错误。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): 刷新进度从轮询改为 SSE 实时推送"
```

---

### Task 6: 端到端手动验证

- [ ] **Step 1: 启动后端**

```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload
```

- [ ] **Step 2: 启动前端**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: 验证场景**

1. 打开 `http://localhost:5173`，观察"数据刷新进度"卡片是否显示 idle 状态（SSE 连接已建立）。
2. 点击"刷新行情"按钮，观察进度卡片是否在 0.5s 级别更新（步骤计数和百分比变化）。
3. 等待刷新完成，观察进度卡片是否变为"已完成"，TopBar "数据更新于"是否刷新。
4. 同样验证"刷新基本面"按钮。
5. 在刷新进行中刷新浏览器页面（F5），观察进度卡片是否立即恢复当前进度（而非从头开始）。
