from app.pool_filters import filter_default_pool, is_default_pool_stock


def test_is_default_pool_stock_rejects_st_bj_delisted_and_new_stock():
    as_of = "2026-06-11"
    assert is_default_pool_stock(
        {"code": "sz000001", "is_st": False, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"},
        as_of,
    )
    assert not is_default_pool_stock(
        {"code": "sz000002", "is_st": True, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"},
        as_of,
    )
    assert not is_default_pool_stock(
        {"code": "bj430001", "is_st": False, "is_bj": True, "delisted_at": None, "listed_at": "2020-01-01"},
        as_of,
    )
    assert not is_default_pool_stock(
        {"code": "sz000003", "is_st": False, "is_bj": False, "delisted_at": "2025-01-01", "listed_at": "2020-01-01"},
        as_of,
    )
    assert not is_default_pool_stock(
        {"code": "sz000004", "is_st": False, "is_bj": False, "delisted_at": None, "listed_at": "2026-01-01"},
        as_of,
    )


def test_filter_default_pool_returns_only_allowed_codes():
    rows = [
        {"code": "sz000001", "is_st": False, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"},
        {"code": "sz000002", "is_st": True, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"},
    ]
    assert [row["code"] for row in filter_default_pool(rows, "2026-06-11")] == ["sz000001"]
