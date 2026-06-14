---
name: add-refresh-step-logic
description: Use when adding new logic to an existing refresh step or creating a new refresh step in the data refresh pipeline. Ensures backend progress tracking and frontend display stay consistent.
---

# Adding Logic to a Refresh Step

When you need to add new data-fetching logic to the refresh pipeline (e.g., adding index constituent fetching to the industry step), follow this checklist exactly. Skipping any item will cause frontend progress desync.

## Step 1: Identify the Target Step

Open `backend/app/refresh.py` and find the `RefreshStep` that will contain the new logic:

```python
# In _new_state():
"fundamental": RefreshGroup(steps=[
    RefreshStep("财报数据"),          # steps[0]
    RefreshStep("业绩预告快报"),       # steps[1]
    RefreshStep("行业与指数数据"),     # steps[2]  ← which one?
    RefreshStep("研报元数据"),        # steps[3]
    RefreshStep("研报PDF解析"),       # steps[4]
])
```

- If adding logic to an **existing step**: note its index.
- If creating a **new step**: add a new `RefreshStep("新步骤名")` and increment all downstream indices in tests.

## Step 2: Update the Step Label (If Scope Changed)

If the new logic changes what the step covers, update the label:

| Before | After | Why |
|--------|-------|-----|
| `RefreshStep("申万行业指数")` | `RefreshStep("行业与指数数据")` | Added index constituent logic |

The label is what the frontend `InlineProgress` component displays directly.

## Step 3: Implement the New Logic Function

Write the new function following these conventions:

```python
def refresh_new_logic(
    fetch_fn=None,        # injectable for testing
    step: Optional[RefreshStep] = None,  # pass step for progress updates
) -> None:
    """One-line docstring explaining what it fetches and where it writes."""
    if fetch_fn is None:
        from app.data.fetch_something import fetch_it
        fetch_fn = fetch_it

    items = [...]  # the things to process
    total = len(items)

    for i, item in enumerate(items, 1):
        try:
            data = fetch_fn(item)
        except Exception:
            logger.warning("XXX %s 抓取失败", item, exc_info=True)
            continue
        # write to DB
        with SessionLocal() as s:
            # ... upsert logic ...
            s.commit()
        # UPDATE PROGRESS (critical!)
        if step is not None and total > 0:
            step.done = i
            step.progress = int(i / total * 100)
```

**Rules for progress updates:**

1. **Always check `step is not None`** — allows the function to be called without progress tracking (e.g., from tests).
2. **Use `step.progress = int(done / total * 100)`** — this is what the frontend reads.
3. **Always set `step.total` before the loop starts** — otherwise progress calculations divide by zero.
4. **Update `step.done` inside the loop** — not just at the end.
5. **Wrap the entire progress update in `if step is not None`** — test code passes `step=None`.

## Step 4: Integrate into the Parent `run_*_refresh` Function

### Case A: Adding to an existing step (serial execution)

When the new logic runs **after** the existing step logic (serial), allocate a percentage split:

```python
def run_industry_refresh(..., new_logic_fn=None):
    step = group.steps[2]
    step.status = "running"
    try:
        _refresh_industry_index(...)          # uses 0→90% of progress
        refresh_new_logic(new_logic_fn, step=step)  # uses 90→100%
        step.progress = 100  # finalize
        step.status = "done"
```

**Inside the sub-functions**, cap progress at the allocated range:

| Sub-function | Progress range | Formula |
|-------------|---------------|---------|
| First sub-function | 0% → 90% | `int(i / total * 90)` |
| Second sub-function | 90% → 100% | `90 + int(i / total * 10)` |

### Case B: Adding as a new concurrent task

When the new logic runs **in parallel** with other steps via `ThreadPoolExecutor`:

1. Create a **separate `run_*_refresh`** wrapper with its own step index.
2. Add a **new `RefreshStep`** to the STATE.
3. Update the `pool.submit()` calls.

### Case C: New standalone step

1. Add `RefreshStep("新步骤名")` to `_new_state()`.
2. Create a `run_new_step_refresh()` function.
3. Wire it into `run_fundamental_refresh()` or `run_kline_refresh()`.
4. Update the frontend `FUNDAMENTAL_STEP_KEYS` / `KLINE_STEP_KEYS` arrays (see Step 7).

## Step 5: Update `run_fundamental_refresh` / `run_kline_refresh`

If adding a new concurrent task, update the pool:

```python
# Before:
futs = {
    pool.submit(run_step_A, ...): 0,
    pool.submit(run_step_B, ...): 1,
    pool.submit(run_step_C, ...): 2,
}

# After (new task added to existing step):
futs = {
    pool.submit(run_step_A, ...): 0,
    pool.submit(run_step_B, ...): 1,
    pool.submit(run_step_C, ..., new_logic_fn): 2,  # pass the new fn
}
```

**Never add a 4th concurrent task to a 3-worker pool without increasing `max_workers`.**

## Step 6: Update Tests

For every test that asserts on `step.progress` or `step.done`:

1. **If you changed the progress formula** (e.g., `*100` → `*90`), update the expected values.
2. **If you renamed the function** (e.g., `_refresh_X` → `refresh_X`), update all `refresh._refresh_X` calls in tests.
3. **If you added a new parameter** (e.g., `index_constituents_fn`), add a fake implementation in test calls.
4. **If you added a new RefreshStep**, update all index-based assertions (`steps[2]` might now be `steps[3]`).

Common test patterns:

```python
# Direct sub-function call (no progress finalization):
refresh._refresh_industry_index(group, ...)
assert group.steps[2].progress == 90  # not 100, because sub-function only fills part

# Full pipeline call (progress should reach 100):
refresh.run_fundamental_refresh(...)
assert all(step.progress == 100 for step in group.steps[:3])
```

## Step 7: Update Frontend (If Step Labels Changed)

In `frontend/src/App.tsx` or the relevant component:

1. Find the step label array (e.g., `FUNDAMENTAL_STEP_KEYS` or similar).
2. Update label text to match the new `RefreshStep.label`.
3. If you added a new step, add the corresponding UI element.

The frontend reads `step.label` directly from the API response, so if you only changed the label string and didn't add/remove steps, the frontend auto-updates.

## Step 8: Verify End-to-End

1. Run `pytest tests/ -x` — all tests must pass.
2. Start the backend: `uvicorn app.main:app --reload`
3. Start the frontend: `npm run dev`
4. Trigger a refresh and watch the progress bar in the TopBar:
   - Does the new step appear with the correct label?
   - Does progress increment smoothly (not jump from 0→100)?
   - Does progress reach exactly 100% when done?
   - If the step fails, does the error icon appear?

## Quick Reference: Progress Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Setting `progress=100` inside a sub-function | When sub-function runs as part of a larger step, progress should stop at its allocated max | Use `* 90` or `90 + * 10` formula |
| Not passing `step` to the sub-function | Progress stays at 0% the whole time | Add `step: Optional[RefreshStep] = None` parameter |
| Hardcoded `steps[N]` in tests | Adding a step shifts all indices | Use descriptive variable names or update all indices |
| `done` counts rows, `progress` counts iterations | `done/total` and `progress` tell different stories | Keep them consistent or document the difference |
| Forgetting `step.total = len(items)` | Division by zero or progress never starts | Set total before the loop |
