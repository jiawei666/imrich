# 技术面"运行筛选"按钮 loading 反馈设计

- 日期：2026-06-13
- 状态：设计通过

## 背景

技术面战法面板（`TechnicalScreenView.tsx`）的筛选抽屉中有"运行筛选"按钮，点击后调用 `runScreen` → `api.screenTechnical`。后端筛选需要把全市场未退市日 K 加载到内存并逐股评估，耗时较长。

当前 `runScreen` 是一个裸 `async` 函数，没有任何 loading 状态：

- 请求进行中按钮外观不变，用户不知道点击是否生效；
- 按钮未禁用，可在请求未返回前被重复点击，产生多个并发 `screenTechnical` 请求。

## 目标

在不改变现有交互流程（抽屉在请求期间保持打开、结果返回后自动关闭）的前提下，给"运行筛选"按钮加上 loading 反馈，并阻止重复触发。

## 方案

### 1. `TechnicalScreenView.tsx`

- 新增 `screening` state（`useState(false)`），用于驱动按钮的 loading UI。
- 新增 `screeningRef`（`useRef(false)`）做防重入保护：`runScreen` 入口若 `screeningRef.current` 为 `true` 直接 return。
- `runScreen` 改造：

```ts
const runScreen = useMemo(() => async () => {
  if (screeningRef.current) return
  screeningRef.current = true
  setScreening(true)
  try {
    const res = await api.screenTechnical(strategy, paramValues)
    setCandidates(res)
    setScreenMode('screened')
    if (res[0]) {
      setSelectedCode(res[0].code)
      setSelectedName(res[0].name)
    }
  } catch {
    setCandidates([])
    setScreenMode('screened')
  } finally {
    screeningRef.current = false
    setScreening(false)
  }
  setFilterOpen(false)
}, [strategy, paramValues])
```

- 将 `screening` 作为 `loading` prop 传给 `TechnicalFilterCard`。

### 2. `TechnicalFilterCard.tsx`

- 新增 `loading?: boolean` prop。
- "运行筛选"按钮：
  - `disabled={loading}`（Button 组件已有 `disabled:opacity-50 disabled:pointer-events-none` 样式，无需新增样式）。
  - `loading` 为真时，按钮内容替换为 `Loader2`（`lucide-react`，`size-3.5 animate-spin`）+「筛选中...」文案；否则显示「运行筛选」。该写法与 `TopBar.tsx` 中刷新进度的 spinner 用法一致。

## 影响范围

仅 `frontend/src/components/technical/TechnicalScreenView.tsx` 与 `frontend/src/components/technical/TechnicalFilterCard.tsx` 两个文件，不涉及后端、不涉及其他战法面板。

## 测试

前端无既有单测覆盖此组件交互；通过手动验证：点击"运行筛选"后按钮立即变为禁用 + loading 文案，请求返回后恢复，期间重复点击不触发新请求。
