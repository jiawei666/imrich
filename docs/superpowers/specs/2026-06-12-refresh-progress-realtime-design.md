# 刷新进度实时推送设计文档

- 日期：2026-06-12
- 状态：设计通过

## 背景

当前后端刷新任务（行情/基本面）的进度存于模块级全局 `STATE`，前端通过 `setInterval` 每 3 秒轮询 `GET /refresh/status` 和 `GET /meta` 两个接口来更新进度卡片和 TopBar 的"数据更新于"。轮询延迟最长 3 秒且每次发两次 HTTP 请求，交互体验不好。

## 目标

将进度展示从"前端轮询"改为"后端 SSE 实时推送"。

- 改造范围：只改 `/refresh/status` 的传递方式（HTTP 轮询 → SSE 流），`/meta` 不做实时推送，改在刷新任务完成时（收到状态变更事件）单独拉一次。
- 连接策略：页面加载后常开 SSE 连接，不论是否正在进行刷新。

## 方案选择

选择 **SSE（Server-Sent Events）**，理由：

- 场景天然单向（后端推 → 前端收），SSE 语义匹配；
- 浏览器原生 `EventSource` 自带断线重连，前端代码量很小；
- FastAPI/Starlette 原生支持流式响应，零新依赖；
- 后端改动极小：只新增一个 SSE 端点 + 抽取一个快照函数，不碰 `refresh.py` 任务循环；
- 相比 WebSocket 方案，SSE 不需要前端手写重连+退避；相比事件驱动 pub/sub 方案，SSE 不涉及跨线程通知和 refresh.py 内部的逐步更新点改造。

## 后端改动

### 1. 抽取 `get_status_snapshot()` 函数

位置：`app/refresh.py`

把 `app/main.py:refresh_status()` 中构造 `result` 字典并用 DB 实际入库量回填 kline 步骤进度的逻辑整体搬到新函数 `get_status_snapshot() -> dict`。函数签名：

```python
def get_status_snapshot() -> dict:
    """返回 STATE 的序列化快照，并用数据库实际入库量回填进度。"""
```

`GET /refresh/status` 端点保留，内部改为直接调用 `get_status_snapshot()`——行为不变，现有测试不受影响。

### 2. 新增 `GET /refresh/status/stream` SSE 端点

位置：`app/main.py`

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

设计决策：

- **推送间隔固定 0.5s**，不做成可配置项——0.5s 已达到人眼感知的"实时"且不造无谓 CPU 开销。
- **有变化才发 `data:` 行**，无变化发注释行 `: ping` 保活（防止中间代理断连接）。
- **CORS**：`StreamingResponse` 无 CORS 头，需要在端点函数上对 `OPTIONS` 放行或在前端 Vite dev 代理。当前项目已经有 `CORSMiddleware`（`allow_origins=["http://localhost:5173", ...]`, `allow_methods=["*"]`, `allow_headers=["*"]`），`GET` SSE 请求被覆盖，无需额外处理。
- **线程安全**：后台刷新任务跑在线程池（FastAPI `BackgroundTasks` 对同步函数的默认行为），SSE 协程在事件循环中跑，二者读写同一模块级全局；因为只做 `STATE` 属性读取，Python GIL 下安全，不需要加锁。

### 不需要改的部分

- `app/refresh.py`：`STATE`、`RefreshStep`、`RefreshGroup`、任务执行函数——全部不动。数据变更仍由现有任务循环驱动，SSE 只是读取端的替换。
- `GET /refresh/status`：保留不删，供调试/脚本一次性查询使用。

## 前端改动

### 1. `src/lib/api.ts` 新增 SSE 订阅方法

```ts
refreshStatusStream: (onMessage: (status: RefreshStatus) => void) => {
  const es = new EventSource(`${BASE}/refresh/status/stream`)
  es.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data) as RefreshStatus) } catch {}
  }
  // 返回断开函数，供组件卸载时清理
  return () => es.close()
}
```

`refreshStatus()`（一次性 GET）保留不删，供兼容用途。

### 2. `src/App.tsx` 改动

#### a. 删除轮询 useEffect

删除现有 `useEffect` 中 3 秒 `setInterval` 轮询 `/refresh/status` 和 `/meta` 的逻辑。

#### b. 初始化 useEffect 精简

去掉 `api.refreshStatus().then(setRefreshStatus)`——初始状态由 SSE 第一条消息提供。`DataRefreshProgress` 已有 `status ?? REFRESH_STATUS` mock 兜底，连接建立前的短暂空窗期不影响展示。

#### c. 新增常驻 SSE 订阅

```ts
useEffect(() => {
  const prevRef = { kline: refreshStatus?.kline.status, fundamental: refreshStatus?.fundamental.status }
  const close = api.refreshStatusStream((status) => {
    setRefreshStatus(status)
    // 检测状态变更：从 running 变为非 running 意味着某个任务组刚完成
    const klineDone = prevRef.kline === 'running' && status.kline.status !== 'running'
    const fundamentalDone = prevRef.fundamental === 'running' && status.fundamental.status !== 'running'
    if (klineDone || fundamentalDone) reloadMeta()
    prevRef.kline = status.kline.status
    prevRef.fundamental = status.fundamental.status
  })
  return close
}, [])
```

注意：prevRef 需用 `useRef` 实现以避免 effect 重建闭包；上方仅为示意。

#### d. `triggerRefreshKline` / `triggerRefreshFundamental` 精简

去掉手动调用的 `reloadRefreshStatus()`（流会在 0.5s 内反映 `running`）和 `reloadMeta()`（完成时由流触发）。

### 3. 前端组件无需改动

`DataRefreshProgress.tsx`、`TechnicalScreenView.tsx` 等消费 `RefreshStatus` 的组件数据结构不变，不需要任何修改。

## 测试

### 后端

- 现有 `test_refresh_status_initial` 不动（验证 `/refresh/status` 行为不变）。
- 新增 `test_get_status_snapshot`：调用 `refresh.get_status_snapshot()`，断言返回 dict 包含 `kline`/`fundamental` 两个 key，`kline.steps` 为 list。
- 新增 `test_refresh_status_stream`：用 `client.stream("GET", "/refresh/status/stream")` 建立流式连接，迭代读取第一行 `data: ...`，JSON 解析后断言结构，然后退出 with 块关闭连接。

### 前端

项目当前无前端测试基建，本次不新增。手动验证方式：`npm run dev` 后触发刷新，观察进度卡片是否在 0.5s 级别更新、完成后 TopBar"更新于"是否刷新。

## 边界情况

| 情况 | 行为 |
|------|------|
| 后端重启 | `STATE` 重置为 idle，SSE 推送 idle 快照，前端自动展示"待执行" |
| SSE 断线 | 浏览器 EventSource 默认 ~3s 自动重连，重连后立即拿到当前快照 |
| 多标签页 | 每个标签页独立一条 SSE 连接，互不影响 |
| 刷新期间刷新页面 | 新 SSE 连接立即收到当前 `STATE` 快照（running 状态 + 已有进度），UI 自然恢复，不需要从 localStorage 恢复 |
| 空闲期无任务 | SSE 发心跳注释行保活，前端不做任何 UI 更新 |
| CORS | 现有 CORSMiddleware 已覆盖，无需额外处理 |

## 不在本次范围

- `/meta` 的实时推送（只在任务完成时触发单次拉取）
- 前端测试基建
- 定时自动刷新调度
- 多用户/分布式部署
