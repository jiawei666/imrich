# Industry Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add industry research reports to the stock detail experience, displayed beside existing stock reports in a two-tab report card.

**Architecture:** Reuse the existing Eastmoney report API pattern from `stock_research_report_em`, but store industry report metadata in a separate `industry_research_reports` table keyed by `report_id`. The existing fundamental research metadata refresh will upsert industry reports discovered from the same report rows, and `/stock/{code}` will return reports for the selected stock's `subIndustry` first, falling back to its parent industry.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, pytest, React, TypeScript, Tailwind, existing local UI primitives.

---

### Task 1: Backend Data Model And Detail API

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/db.py`
- Modify: `backend/app/stock_detail.py`
- Test: `backend/tests/test_stock_detail.py`

- [ ] **Step 1: Write failing stock detail test**

Add this test to `backend/tests/test_stock_detail.py`:

```python
def test_get_stock_detail_returns_industry_reports_for_sub_industry(db_path):
    init_db()
    from app.models import IndustryResearchReport
    with SessionLocal() as s:
        s.add(Stock(code="sz000003", name="测试股份", industry="锂电池", parent_industry="电力设备"))
        s.add(IndustryResearchReport(
            report_id="IR1",
            industry="锂电池",
            title="锂电池行业深度",
            org="测试证券",
            published_at="2026-06-02",
            pdf_url="https://example.com/ir1.pdf",
        ))
        s.add(IndustryResearchReport(
            report_id="IR2",
            industry="电力设备",
            title="电力设备行业策略",
            org="测试证券",
            published_at="2026-06-01",
            pdf_url="https://example.com/ir2.pdf",
        ))
        s.commit()

    detail = get_stock_detail("sz000003")

    assert detail["industryReports"] == [
        {
            "title": "锂电池行业深度",
            "org": "测试证券",
            "date": "2026-06-02",
            "pdfUrl": "https://example.com/ir1.pdf",
            "industry": "锂电池",
        }
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_stock_detail.py::test_get_stock_detail_returns_industry_reports_for_sub_industry -q`

Expected: FAIL because `IndustryResearchReport` is not defined.

- [ ] **Step 3: Implement model, migration, and API serialization**

Add `IndustryResearchReport` to `backend/app/models.py` with columns `report_id`, `industry`, `title`, `org`, `published_at`, `summary`, `pdf_url`, `updated_at` and index `(industry, published_at)`.

Add `_migrate_industry_research_reports(engine)` to `backend/app/db.py`, called from `init_db()`, creating the table if missing.

Update `backend/app/stock_detail.py` to import `IndustryResearchReport`, query `stock.industry` first, then `stock.parent_industry`, limit to 10, order by `published_at desc`, and return `industryReports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_stock_detail.py -q`

Expected: PASS.

### Task 2: Research Fetch Parsing And Refresh Upsert

**Files:**
- Modify: `backend/app/data/fetch_research.py`
- Modify: `backend/app/refresh.py`
- Test: `backend/tests/test_fetch_research.py`
- Test: `backend/tests/test_refresh_fundamental.py`

- [ ] **Step 1: Write failing parser and refresh tests**

Add a parser test proving a raw report row with `行业` or `indvInduName` returns `industry`.

Add a refresh test proving `refresh_research_metadata()` upserts `IndustryResearchReport` rows from fetched report rows that include an industry.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_fetch_research.py -q
pytest tests/test_refresh_fundamental.py::test_refresh_research_metadata_upserts_industry_reports -q
```

Expected: FAIL because parsed rows do not expose `industry` and refresh does not write the new table.

- [ ] **Step 3: Implement metadata enrichment**

Update `parse_research_row()` to include `industry` from `行业`, `indvInduName`, `industryName`, or `industry`.

Update `refresh_research_metadata()` to upsert an `IndustryResearchReport` row for each fetched row with non-empty `industry`, using the same `report_id`, title, org, date, summary, pdf URL, and current timestamp.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_fetch_research.py tests/test_refresh_fundamental.py::test_refresh_research_metadata_upserts_industry_reports -q
```

Expected: PASS.

### Task 3: Frontend Types And Report Tabs

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/detail/ResearchReports.tsx`
- Modify: `frontend/src/components/detail/StockDetailPanel.tsx`

- [ ] **Step 1: Update TypeScript types**

Add optional `industry?: string | null` to `ResearchReport` and add `industryReports: ResearchReport[]` to `StockDetail`.

- [ ] **Step 2: Implement tabbed report card**

Update `ResearchReports` to accept `stockReports` and `industryReports`, render local tabs `个股研报` and `产业研报`, keep the current pagination and PDF open behavior, and show `暂无产业研报数据` for an empty industry list.

- [ ] **Step 3: Wire stock detail panel**

Update `StockDetailPanel` to call `ResearchReports reports={detail.reports} industryReports={detail.industryReports}`.

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

### Task 4: Integration Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd backend
pytest tests/test_stock_detail.py tests/test_fetch_research.py tests/test_refresh_fundamental.py::test_refresh_research_metadata_upserts_industry_reports -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 3: Run local API smoke test**

Start or use the existing backend server and call `GET /stock/{code}` for a stock with seeded or existing industry report data. Confirm JSON contains both `reports` and `industryReports`.

- [ ] **Step 4: Browser smoke test**

Open the app, select a basic/fundamental candidate, confirm the report card shows `个股研报` and `产业研报` tabs, and clicking a report with `pdfUrl` opens the PDF URL.

---

## Self-Review

- Spec coverage: data source, storage, detail API, and UI placement are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: backend key `industryReports` matches frontend `StockDetail.industryReports`.
