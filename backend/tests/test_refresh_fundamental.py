import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from app import refresh
from app.db import SessionLocal, init_db
from app.models import FinancialReport, Forecast, Industry, IndexConstituent, IndustryIndex, ResearchReport, Stock


def test_run_fundamental_refresh_marks_done(db_path):
    init_db()
    refresh.reset_state()

    refresh.run_fundamental_refresh(
        financial_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "net_profit": 1.0e9,
                "net_profit_yoy": 60.0,
                "revenue": 5.0e9,
                "revenue_yoy": 30.0,
                "gross_margin": 25.0,
            }
        ],
        forecast_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "source": "forecast",
                "indicator": "净利润",
                "change_desc": "预增",
                "change_pct": 80.0,
                "forecast_value": 1.2e9,
                "prior_value": 6.6e8,
                "notice_date": "2025-04-10",
            }
        ],
        express_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "source": "express",
                "net_profit": 1.1e9,
                "net_profit_yoy": 65.0,
                "revenue": 5.2e9,
                "revenue_yoy": 32.0,
                "notice_date": "2025-04-12",
            }
        ],
        industries_fn=lambda: [{"code": "850111", "name": "银行"}],
        industry_hist_fn=lambda code: pd.DataFrame(
            [{"date": "2025-01-02", "open": 100.0, "close": 101.0, "high": 102.0, "low": 99.0, "volume": 1000.0}]
        ),
        constituents_fn=lambda code: ["sz000001"],
        industries_first_fn=lambda: [],
        index_constituents_fn=lambda code: [],
    )

    group = refresh.STATE["fundamental"]
    assert group.status == "done"
    assert group.updatedAt is not None
    assert all(step.progress == 100 for step in group.steps[:3])

    with SessionLocal() as s:
        assert s.query(FinancialReport).count() == 1
        assert s.query(Forecast).count() == 2
        assert s.query(IndustryIndex).count() == 1
        stock = s.get(Stock, "sz000001")
        assert stock is not None
        assert stock.industry == "银行"


def test_run_fundamental_refresh_marks_error_on_exception(db_path):
    init_db()
    refresh.reset_state()

    def boom(rd):
        raise RuntimeError("boom")

    import pytest

    with pytest.raises(RuntimeError):
        refresh.run_fundamental_refresh(
            financial_fn=boom,
            forecast_fn=lambda rd: [],
            express_fn=lambda rd: [],
            industries_fn=lambda: [],
            industry_hist_fn=lambda code: pd.DataFrame(),
            constituents_fn=lambda code: [],
            industries_first_fn=lambda: [],
            index_constituents_fn=lambda code: [],
        )
    assert refresh.STATE["fundamental"].status == "error"


def test_refresh_industry_index_persists_completed_and_skips_failed(db_path):
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]

    def industry_hist_fn(code):
        if code == "850222":
            raise RuntimeError("persistent failure")
        return pd.DataFrame(
            [{"date": "2025-01-02", "open": 100.0, "close": 101.0, "high": 102.0, "low": 99.0, "volume": 1000.0}]
        )

    constituents = {"850111": ["sz000001"], "850222": ["sz000002"], "850333": ["sz000003"]}

    refresh._refresh_industry_index(
        group,
        industries_fn=lambda: [
            {"code": "850111", "name": "银行"},
            {"code": "850222", "name": "白色家电"},
            {"code": "850333", "name": "汽车"},
        ],
        industry_hist_fn=industry_hist_fn,
        constituents_fn=lambda code: constituents[code],
        industries_first_fn=lambda: [],
    )

    with SessionLocal() as s:
        assert s.query(IndustryIndex).filter_by(code="850111").count() == 1
        assert s.query(IndustryIndex).filter_by(code="850222").count() == 0
        assert s.query(IndustryIndex).filter_by(code="850333").count() == 1
        assert s.get(Stock, "sz000001").industry == "银行"
        assert s.get(Stock, "sz000003").industry == "汽车"
        stock2 = s.get(Stock, "sz000002")
        assert stock2 is None or not stock2.industry

    assert group.steps[2].done == 3
    assert group.steps[2].progress == 100


def test_refresh_industry_index_writes_industry_dimension_table(db_path):
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]

    refresh._refresh_industry_index(
        group,
        industries_fn=lambda: [
            {"code": "850111", "name": "银行", "parent_name": "金融"},
        ],
        industry_hist_fn=lambda code: pd.DataFrame(
            [{"date": "2025-01-02", "open": 1.0, "close": 1.0, "high": 1.0, "low": 1.0, "volume": 1.0}]
        ),
        constituents_fn=lambda code: [],
        industries_first_fn=lambda: [{"code": "47", "name": "金融"}],
    )

    with SessionLocal() as s:
        first = s.get(Industry, "47")
        assert first is not None
        assert first.name == "金融"
        assert first.level == 1
        assert first.parent_name is None

        second = s.get(Industry, "850111")
        assert second is not None
        assert second.name == "银行"
        assert second.level == 2
        assert second.parent_name == "金融"


def test_refresh_industry_index_handles_first_level_fetch_error(db_path):
    """一级行业抓取失败时记录警告但不影响二级行业写入与后续流程。"""
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]

    def boom():
        raise RuntimeError("network down")

    refresh._refresh_industry_index(
        group,
        industries_fn=lambda: [{"code": "850111", "name": "银行"}],
        industry_hist_fn=lambda code: pd.DataFrame(
            [{"date": "2025-01-02", "open": 1.0, "close": 1.0, "high": 1.0, "low": 1.0, "volume": 1.0}]
        ),
        constituents_fn=lambda code: [],
        industries_first_fn=boom,
    )

    with SessionLocal() as s:
        assert s.query(Industry).filter_by(level=1).count() == 0
        assert s.get(Industry, "850111") is not None


def test_refresh_industry_index_updates_progress_incrementally(db_path):
    """progress 应随处理的行业数量实时递增，而不是沿用上一次刷新遗留的值。"""
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]
    step = group.steps[2]
    step.progress = 100  # 模拟上一次刷新遗留的 100%

    progress_snapshots = []

    def industry_hist_fn(code):
        progress_snapshots.append(step.progress)
        return pd.DataFrame(
            [{"date": "2025-01-02", "open": 1.0, "close": 1.0, "high": 1.0, "low": 1.0, "volume": 1.0}]
        )

    refresh._refresh_industry_index(
        group,
        industries_fn=lambda: [{"code": f"8501{i}", "name": f"行业{i}"} for i in range(4)],
        industry_hist_fn=industry_hist_fn,
        constituents_fn=lambda code: [],
        industries_first_fn=lambda: [],
    )

    assert progress_snapshots == [0, 25, 50, 75]
    assert step.progress == 100


def test_refresh_financial_reports_updates_progress_per_period(db_path):
    """progress 应随已处理的报告期数递增，而不是沿用上一次刷新遗留的值。"""
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]
    step = group.steps[0]
    step.progress = 100  # 模拟上一次刷新遗留的 100%

    progress_snapshots = []

    def financial_fn(rd):
        progress_snapshots.append(step.progress)
        return []

    refresh._refresh_financial_reports(group, financial_fn)

    n = len(refresh._recent_report_dates())
    expected = [int(i / n * 100) for i in range(n)]
    assert progress_snapshots == expected
    assert step.progress == 100


def test_refresh_forecasts_updates_progress_per_period(db_path):
    """progress 应随已处理的报告期数递增，而不是沿用上一次刷新遗留的值。"""
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]
    step = group.steps[1]
    step.progress = 100  # 模拟上一次刷新遗留的 100%

    progress_snapshots = []

    def forecast_fn(rd):
        progress_snapshots.append(step.progress)
        return []

    refresh._refresh_forecasts(group, forecast_fn, express_fn=lambda rd: [])

    n = len(refresh._recent_report_dates())
    expected = [int(i / n * 100) for i in range(n)]
    assert progress_snapshots == expected
    assert step.progress == 100


def test_refresh_research_metadata_upserts_stage1(db_path):
    init_db()
    refresh.refresh_research_metadata(
        lambda code: [
            {
                "report_id": "R1",
                "code": "sz000001",
                "name": "平安银行",
                "title": "订单饱满",
                "org": "测试证券",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": "https://example.test/r1.pdf",
            }
        ],
        codes=["sz000001"],
    )
    with SessionLocal() as s:
        row = s.query(ResearchReport).filter_by(report_id="R1").one()
        assert row.stage == "metadata"


def test_refresh_research_metadata_dedupes_same_report_id_within_one_fetch(db_path):
    """同一次抓取里出现相同 report_id（如 akshare 返回重复行）时不应触发
    UNIQUE constraint failed: research_reports.report_id。"""
    init_db()
    refresh.refresh_research_metadata(
        lambda code: [
            {
                "report_id": "R1",
                "code": "sz000001",
                "name": "平安银行",
                "title": "订单饱满",
                "org": "测试证券",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": "https://example.test/r1.pdf",
            },
            {
                "report_id": "R1",
                "code": "sz000002",
                "name": "万科A",
                "title": "另一份报告",
                "org": "测试证券2",
                "published_at": "2025-06-02",
                "summary": "",
                "pdf_url": "https://example.test/r1.pdf",
            },
        ],
        codes=["sz000001"],
    )
    with SessionLocal() as s:
        rows = s.query(ResearchReport).filter_by(report_id="R1").all()
        assert len(rows) == 1
        assert rows[0].code == "sz000002"


def test_refresh_research_metadata_fetches_each_candidate_code(db_path):
    """应按传入的股票代码列表逐个调用 akshare（symbol 参数），而非只抓固定的一只股票。"""
    init_db()
    calls = []

    def fetch_fn(code):
        calls.append(code)
        return [
            {
                "report_id": f"R-{code}",
                "code": code,
                "name": "",
                "title": "t",
                "org": "",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": f"https://example.test/{code}.pdf",
            }
        ]

    refresh.refresh_research_metadata(fetch_fn, codes=["sz000001", "sz000002"])

    assert sorted(calls) == ["sz000001", "sz000002"]
    with SessionLocal() as s:
        codes = {r.code for r in s.query(ResearchReport).all()}
        assert codes == {"sz000001", "sz000002"}


def test_refresh_research_metadata_skips_code_on_fetch_error(db_path):
    """单只股票抓取失败不应中断整体刷新，其余股票仍正常入库。"""
    init_db()

    def fetch_fn(code):
        if code == "sz000001":
            raise RuntimeError("network error")
        return [
            {
                "report_id": "R2",
                "code": code,
                "name": "",
                "title": "t",
                "org": "",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": "https://example.test/r2.pdf",
            }
        ]

    refresh.refresh_research_metadata(fetch_fn, codes=["sz000001", "sz000002"])

    with SessionLocal() as s:
        rows = s.query(ResearchReport).all()
        assert len(rows) == 1
        assert rows[0].report_id == "R2"
        assert rows[0].code == "sz000002"


def test_refresh_research_metadata_fetches_concurrently(db_path):
    """逐只股票抓取研报元数据应并发进行，而不是串行等待每次网络请求。"""
    init_db()

    def fetch_fn(code):
        time.sleep(0.05)
        return []

    codes = [f"sz{i:06d}" for i in range(10)]
    start = time.perf_counter()
    refresh.refresh_research_metadata(fetch_fn, codes=codes, max_workers=5)
    elapsed = time.perf_counter() - start

    # 串行需 10*0.05s=0.5s；5 路并发理论上约 0.1s，留足余量验证明显加速
    assert elapsed < 0.35


def test_run_research_meta_refresh_uses_all_stock_codes(db_path):
    """步骤4应基于数据库里全量未退市股票代码逐个刷新，不做选股过滤（Bug：曾固定抓 sz000001）。"""
    init_db()
    refresh.reset_state()

    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.add(Stock(code="sz000002", name="万科A"))
        s.add(Stock(code="sz000003", name="已退市", delisted_at="2024-01-01"))
        s.commit()

    calls = []

    def research_meta_fn(code):
        calls.append(code)
        return [
            {
                "report_id": f"R-{code}",
                "code": code,
                "name": "",
                "title": "t",
                "org": "",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": f"https://example.test/{code}.pdf",
            }
        ]

    refresh.run_research_meta_refresh(research_meta_fn=research_meta_fn)

    assert sorted(calls) == ["sz000001", "sz000002"]
    assert refresh.STATE["fundamental"].steps[3].status == "done"
    with SessionLocal() as s:
        codes = {r.code for r in s.query(ResearchReport).all()}
        assert codes == {"sz000001", "sz000002"}


def test_refresh_research_pdfs_processes_all_unparsed_reports(db_path, tmp_path):
    """不再按候选池股票代码过滤，全量未解析的研报都应处理。"""
    init_db()
    recent_date = datetime.now().strftime("%Y-%m-%d")
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="R1", code="sz000001", title="a", published_at=recent_date, pdf_url="u1", stage="metadata"))
        s.add(ResearchReport(report_id="R2", code="sz000002", title="b", published_at=recent_date, pdf_url="u2", stage="metadata"))
        s.commit()
    target = tmp_path / "r1.pdf"
    target.write_bytes(b"fake")
    refresh.refresh_research_pdfs(
        directory=tmp_path,
        download_fn=lambda url, directory: str(Path(directory) / target.name),
        parse_fn=lambda path: "订单饱满正文",
    )
    with SessionLocal() as s:
        assert s.query(ResearchReport).filter_by(report_id="R1").one().stage == "parsed"
        assert s.query(ResearchReport).filter_by(report_id="R2").one().stage == "parsed"


def test_refresh_research_pdfs_skips_reports_older_than_one_year(db_path, tmp_path):
    """超过近一年的研报不下载 PDF，节省下载量。"""
    init_db()
    recent_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    old_date = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="R1", code="sz000001", title="a", published_at=recent_date, pdf_url="u1", stage="metadata"))
        s.add(ResearchReport(report_id="R2", code="sz000001", title="b", published_at=old_date, pdf_url="u2", stage="metadata"))
        s.commit()
    target = tmp_path / "r1.pdf"
    target.write_bytes(b"fake")
    refresh.refresh_research_pdfs(
        directory=tmp_path,
        download_fn=lambda url, directory: str(Path(directory) / target.name),
        parse_fn=lambda path: "正文",
    )
    with SessionLocal() as s:
        assert s.query(ResearchReport).filter_by(report_id="R1").one().stage == "parsed"
        assert s.query(ResearchReport).filter_by(report_id="R2").one().stage == "metadata"


def test_refresh_research_pdfs_updates_progress_incrementally(db_path, tmp_path):
    """progress 应随已解析的研报数量递增，而不是沿用上一次刷新遗留的值。"""
    init_db()
    refresh.reset_state()
    group = refresh.STATE["fundamental"]
    step = group.steps[4]
    step.progress = 100  # 模拟上一次刷新遗留的 100%

    recent_date = datetime.now().strftime("%Y-%m-%d")
    with SessionLocal() as s:
        for i in range(3):
            s.add(ResearchReport(report_id=f"R{i}", code="sz000001", title="t", published_at=recent_date, pdf_url=f"u{i}", stage="metadata"))
        s.commit()

    progress_snapshots = []
    target = tmp_path / "r.pdf"
    target.write_bytes(b"fake")

    def download_fn(url, directory):
        progress_snapshots.append(step.progress)
        return str(target)

    refresh.refresh_research_pdfs(
        directory=tmp_path,
        download_fn=download_fn,
        parse_fn=lambda path: "正文",
        group=group,
        max_workers=1,
    )

    assert progress_snapshots == [0, 33, 66]
    assert step.progress == 100


def test_refresh_research_pdfs_downloads_concurrently(db_path, tmp_path):
    """下载研报 PDF 应并发进行，而不是串行等待每次网络请求。"""
    init_db()
    recent_date = datetime.now().strftime("%Y-%m-%d")
    with SessionLocal() as s:
        for i in range(10):
            s.add(ResearchReport(report_id=f"R{i}", code="sz000001", title="t", published_at=recent_date, pdf_url=f"u{i}", stage="metadata"))
        s.commit()

    target = tmp_path / "r.pdf"
    target.write_bytes(b"fake")

    def download_fn(url, directory):
        time.sleep(0.05)
        return str(target)

    start = time.perf_counter()
    refresh.refresh_research_pdfs(
        directory=tmp_path,
        download_fn=download_fn,
        parse_fn=lambda path: "正文",
        max_workers=5,
    )
    elapsed = time.perf_counter() - start

    # 串行需 10*0.05s=0.5s；5 路并发理论上约 0.1s，留足余量验证明显加速
    assert elapsed < 0.35
    with SessionLocal() as s:
        for i in range(10):
            assert s.query(ResearchReport).filter_by(report_id=f"R{i}").one().stage == "parsed"


def test_run_fundamental_refresh_can_include_research_steps(db_path, tmp_path):
    init_db()
    refresh.reset_state()

    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()

    target = tmp_path / "r1.pdf"
    target.write_bytes(b"fake")

    refresh.run_fundamental_refresh(
        financial_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "net_profit": 1.0e9,
                "net_profit_yoy": 60.0,
                "revenue": 5.0e9,
                "revenue_yoy": 30.0,
                "gross_margin": 25.0,
            }
        ],
        forecast_fn=lambda rd: [],
        express_fn=lambda rd: [],
        industries_fn=lambda: [],
        industry_hist_fn=lambda code: pd.DataFrame(),
        constituents_fn=lambda code: [],
        industries_first_fn=lambda: [],
        index_constituents_fn=lambda code: [],
        research_meta_fn=lambda code: [
            {
                "report_id": "R1",
                "code": "sz000001",
                "name": "平安银行",
                "title": "订单饱满",
                "org": "测试证券",
                "published_at": datetime.now().strftime("%Y-%m-%d"),
                "summary": "",
                "pdf_url": "u1",
            }
        ],
        research_download_fn=lambda url, directory: str(target),
        research_parse_fn=lambda path: "订单饱满正文",
        research_directory=tmp_path,
    )

    group = refresh.STATE["fundamental"]
    assert group.steps[3].progress == 100
    assert group.steps[4].progress == 100


def test_refresh_index_constituents_writes_table(db_path):
    init_db()

    def fake_constituents(index_code):
        return {"000300": ["sz000001", "sh600519"], "000905": ["sz000002"]}[index_code]

    refresh._refresh_index_constituents(
        constituents_fn=fake_constituents,
        index_list=[("000300", "沪深300"), ("000905", "中证500")],
    )

    with SessionLocal() as s:
        rows = s.query(IndexConstituent).filter_by(index_code="000300").all()
        assert {r.stock_code for r in rows} == {"sz000001", "sh600519"}
        assert all(r.index_name == "沪深300" for r in rows)
        assert s.query(IndexConstituent).filter_by(index_code="000905").count() == 1


def test_refresh_index_constituents_replaces_existing_and_skips_failed(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(IndexConstituent(index_code="000300", stock_code="sz999999", index_name="沪深300"))
        s.commit()

    def fake_constituents(index_code):
        if index_code == "000905":
            raise RuntimeError("network down")
        return ["sz000001"]

    refresh._refresh_index_constituents(
        constituents_fn=fake_constituents,
        index_list=[("000300", "沪深300"), ("000905", "中证500")],
    )

    with SessionLocal() as s:
        codes_300 = {r.stock_code for r in s.query(IndexConstituent).filter_by(index_code="000300").all()}
        assert codes_300 == {"sz000001"}
        assert s.query(IndexConstituent).filter_by(index_code="000905").count() == 0


def test_run_fundamental_refresh_populates_index_constituents(db_path):
    init_db()
    refresh.reset_state()

    refresh.run_fundamental_refresh(
        financial_fn=lambda rd: [],
        forecast_fn=lambda rd: [],
        express_fn=lambda rd: [],
        industries_fn=lambda: [],
        industry_hist_fn=lambda code: pd.DataFrame(),
        constituents_fn=lambda code: [],
        industries_first_fn=lambda: [],
        index_constituents_fn=lambda code: ["sz000001"],
    )

    with SessionLocal() as s:
        rows = s.query(IndexConstituent).all()
        assert len(rows) > 0
        assert {r.stock_code for r in rows} == {"sz000001"}
