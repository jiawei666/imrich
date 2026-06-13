import pandas as pd

from app.data import fetch_fundamental as ff


def test_fetch_financial_reports_parses_yjbb(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001", "300750"],
        "股票简称": ["平安银行", "宁德时代"],
        "净利润-净利润": [1.0e9, 5.0e9],
        "净利润-同比增长": [60.0, 52.3],
        "营业总收入-营业总收入": [5.0e9, 2.0e10],
        "营业总收入-同比增长": [30.0, 28.7],
        "销售毛利率": [25.0, 22.1],
    })
    monkeypatch.setattr(ff.ak, "stock_yjbb_em", lambda date: fake)
    rows = ff.fetch_financial_reports("20250331")
    assert rows[0]["code"] == "sz000001"
    assert rows[0]["net_profit_yoy"] == 60.0
    assert rows[1]["code"] == "sz300750"
    assert rows[1]["revenue_yoy"] == 28.7


def test_fetch_financial_reports_handles_nan(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001"],
        "股票简称": ["平安银行"],
        "净利润-净利润": [float("nan")],
        "净利润-同比增长": [float("nan")],
        "营业总收入-营业总收入": [5.0e9],
        "营业总收入-同比增长": [30.0],
        "销售毛利率": [float("nan")],
    })
    monkeypatch.setattr(ff.ak, "stock_yjbb_em", lambda date: fake)
    rows = ff.fetch_financial_reports("20250331")
    assert rows[0]["net_profit"] is None
    assert rows[0]["net_profit_yoy"] is None
    assert rows[0]["gross_margin"] is None


def test_fetch_forecasts_parses_yjyg(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001"],
        "股票简称": ["平安银行"],
        "预测指标": ["净利润"],
        "业绩变动": ["预增"],
        "业绩变动幅度": [80.0],
        "预测数值": [1.2e9],
        "上年同期值": [6.6e8],
        "公告日期": ["2025-04-10"],
    })
    monkeypatch.setattr(ff.ak, "stock_yjyg_em", lambda date: fake)
    rows = ff.fetch_forecasts("20250331")
    assert rows[0]["code"] == "sz000001"
    assert rows[0]["source"] == "forecast"
    assert rows[0]["change_pct"] == 80.0
    assert rows[0]["notice_date"] == "2025-04-10"


def test_fetch_express_reports_parses_yjkb(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001"],
        "股票简称": ["平安银行"],
        "净利润-净利润": [1.1e9],
        "净利润-同比增长": [65.0],
        "营业收入-营业收入": [5.2e9],
        "营业收入-同比增长": [32.0],
        "公告日期": ["2025-04-12"],
    })
    monkeypatch.setattr(ff.ak, "stock_yjkb_em", lambda date: fake)
    rows = ff.fetch_express_reports("20250331")
    assert rows[0]["code"] == "sz000001"
    assert rows[0]["source"] == "express"
    assert rows[0]["net_profit_yoy"] == 65.0
    assert rows[0]["revenue_yoy"] == 32.0


def test_get_sw_industries(monkeypatch):
    # sw_index_second_info 返回的行业代码带 .SI 后缀，但 index_hist_sw / index_component_sw
    # 都不认这个后缀（传入会返回空结果），需要在这里去掉。
    fake = pd.DataFrame({"行业代码": ["850111.SI", "850221.SI"], "行业名称": ["银行", "白色家电"]})
    monkeypatch.setattr(ff.ak, "sw_index_second_info", lambda: fake)
    out = ff.get_sw_industries()
    assert out == [{"code": "850111", "name": "银行"}, {"code": "850221", "name": "白色家电"}]


def test_get_industry_index_hist(monkeypatch):
    fake = pd.DataFrame({
        "代码": ["850111", "850111"],
        "日期": ["2025-01-02", "2025-01-03"],
        "收盘": [101.0, 102.0],
        "开盘": [100.0, 101.0],
        "最高": [102.0, 103.0],
        "最低": [99.0, 100.0],
        "成交量": [1000.0, 1100.0],
        "成交额": [1.0e8, 1.1e8],
    })
    monkeypatch.setattr(ff.ak, "index_hist_sw", lambda symbol, period: fake)
    out = ff.get_industry_index_hist("850111")
    assert list(out.columns) == ["date", "open", "close", "high", "low", "volume"]
    assert out.iloc[0]["close"] == 101.0


def test_get_industry_index_hist_empty(monkeypatch):
    monkeypatch.setattr(
        ff.ak,
        "index_hist_sw",
        lambda symbol, period: pd.DataFrame(
            columns=["代码", "日期", "收盘", "开盘", "最高", "最低", "成交量", "成交额"],
        ),
    )
    out = ff.get_industry_index_hist("850111")
    assert out.empty
    assert list(out.columns) == ["date", "open", "close", "high", "low", "volume"]


def test_get_industry_constituents(monkeypatch):
    fake = pd.DataFrame({"证券代码": ["000001", "600000"], "证券名称": ["平安银行", "浦发银行"]})
    monkeypatch.setattr(ff.ak, "index_component_sw", lambda symbol: fake)
    out = ff.get_industry_constituents("850111")
    assert out == ["sz000001", "sh600000"]


def test_get_industry_index_hist_retries_on_transient_error(monkeypatch):
    fake = pd.DataFrame({
        "代码": ["850111"], "日期": ["2025-01-02"], "收盘": [101.0], "开盘": [100.0],
        "最高": [102.0], "最低": [99.0], "成交量": [1000.0], "成交额": [1.0e8],
    })
    calls = {"n": 0}

    def flaky(symbol, period):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ValueError("Expecting value: line 1 column 1 (char 0)")
        return fake

    monkeypatch.setattr(ff.ak, "index_hist_sw", flaky)
    monkeypatch.setattr(ff.time, "sleep", lambda s: None)
    out = ff.get_industry_index_hist("850111")
    assert calls["n"] == 3
    assert out.iloc[0]["close"] == 101.0


def test_get_industry_index_hist_raises_after_exhausting_retries(monkeypatch):
    def always_fail(symbol, period):
        raise ValueError("boom")

    monkeypatch.setattr(ff.ak, "index_hist_sw", always_fail)
    monkeypatch.setattr(ff.time, "sleep", lambda s: None)
    try:
        ff.get_industry_index_hist("850111")
        assert False, "应抛出异常"
    except ValueError:
        pass


def test_get_industry_constituents_retries_on_transient_error(monkeypatch):
    fake = pd.DataFrame({"证券代码": ["000001"], "证券名称": ["平安银行"]})
    calls = {"n": 0}

    def flaky(symbol):
        calls["n"] += 1
        if calls["n"] < 2:
            raise ValueError("boom")
        return fake

    monkeypatch.setattr(ff.ak, "index_component_sw", flaky)
    monkeypatch.setattr(ff.time, "sleep", lambda s: None)
    out = ff.get_industry_constituents("850111")
    assert calls["n"] == 2
    assert out == ["sz000001"]
