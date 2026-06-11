from app.presets import get_presets, build_selector


def test_get_presets_returns_fundamental_and_technical():
    presets = get_presets()
    ids = {p["id"] for p in presets}
    assert ids == {"super-growth", "oversold-bluechip", "trend-support", "b2"}
    assert {p["category"] for p in presets} == {"fundamental", "technical"}
    for p in presets:
        assert isinstance(p["params"], list) and len(p["params"]) > 0
        for param in p["params"]:
            assert {"key", "label", "value"} <= set(param)


def test_trend_support_default_values():
    p = next(p for p in get_presets() if p["id"] == "trend-support")
    by_key = {x["key"]: x["value"] for x in p["params"]}
    assert by_key["pct_chg_min"] == -2.0
    assert by_key["pct_chg_max"] == 1.8
    assert by_key["j_threshold"] == 15


def test_build_selector_overrides_params():
    sel = build_selector("b2", {"up_threshold": 6.0})
    assert sel.up_threshold == 6.0
    assert sel.j_ceil == 85.0  # 默认仍生效


def test_build_selector_unknown_raises():
    import pytest
    with pytest.raises(KeyError):
        build_selector("nope", {})
