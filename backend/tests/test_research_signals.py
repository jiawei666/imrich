from app.research_signals import alpha_rank, has_research_keyword, keyword_hits, sector_effect


def test_keyword_hits_maps_text_to_signal_keys():
    hits = keyword_hits("订单饱满，产能扩张，新产品发布，国产替代，行业复苏，估值修复")
    assert hits == [
        "orderFull",
        "capexExpand",
        "newProduct",
        "domesticSub",
        "industryRecover",
        "valuationRepair",
    ]


def test_has_research_keyword_checks_title_summary_and_content():
    reports = [
        {"published_at": "2025-01-01", "title": "普通点评", "summary": "", "content_text": ""},
        {"published_at": "2025-06-01", "title": "业绩超预期", "summary": "订单饱满", "content_text": ""},
    ]
    assert has_research_keyword(reports, as_of="2025-06-15", window_days=30) is True
    assert has_research_keyword(reports, as_of="2025-06-15", window_days=7) is False


def test_sector_effect_counts_same_industry_hits():
    rows = [
        {"code": "sz000001", "industry": "银行", "high_growth": True, "research_hit": True},
        {"code": "sz000002", "industry": "银行", "high_growth": True, "research_hit": True},
        {"code": "sz000003", "industry": "银行", "high_growth": True, "research_hit": True},
        {"code": "sz000004", "industry": "电子", "high_growth": True, "research_hit": True},
    ]
    assert sector_effect("银行", rows, threshold=3) is True
    assert sector_effect("电子", rows, threshold=3) is False


def test_alpha_rank_uses_industry_percentile():
    rows = [
        {"code": "a", "industry": "电子", "return_pct": 30, "market_cap": 100, "net_profit_yoy": 60},
        {"code": "b", "industry": "电子", "return_pct": 10, "market_cap": 300, "net_profit_yoy": 20},
        {"code": "c", "industry": "电子", "return_pct": 5, "market_cap": 100, "net_profit_yoy": 10},
    ]
    assert alpha_rank("a", rows, top_n=1) is True
    assert alpha_rank("b", rows, top_n=1) is False
