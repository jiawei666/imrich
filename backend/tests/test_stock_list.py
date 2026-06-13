from app.db import SessionLocal, init_db
from app.models import Stock


def test_stock_list_pagination(client, db_path):
    init_db()
    with SessionLocal() as s:
        for i in range(25):
            s.add(Stock(code=f"sz{i:06d}", name=f"股票{i}", market_cap=100.0 + i))
        s.add(Stock(code="sz999999", name="退市股", delisted_at="2025-01-01"))
        s.commit()

    # 默认第一页
    r = client.get("/stocks")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert body["page"] == 1
    assert body["pageSize"] == 20
    assert len(body["data"]) == 20

    # 第二页
    r2 = client.get("/stocks?page=2&page_size=10")
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["total"] == 25
    assert b2["page"] == 2
    assert len(b2["data"]) == 10


def test_stock_list_sort(client, db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000003", name="C公司", market_cap=300.0))
        s.add(Stock(code="sz000001", name="A公司", market_cap=100.0))
        s.add(Stock(code="sz000002", name="B公司", market_cap=200.0))
        s.commit()

    # 默认按 code 升序
    r = client.get("/stocks?page_size=10")
    codes = [d["code"] for d in r.json()["data"]]
    assert codes == ["sz000001", "sz000002", "sz000003"]

    # 按市值降序
    r2 = client.get("/stocks?page_size=10&sort_by=market_cap&sort_order=desc")
    caps = [d["market_cap"] for d in r2.json()["data"]]
    assert caps == [300.0, 200.0, 100.0]

    # 按名称降序
    r3 = client.get("/stocks?page_size=10&sort_by=name&sort_order=desc")
    names = [d["name"] for d in r3.json()["data"]]
    assert names == ["C公司", "B公司", "A公司"]


def test_stock_list_excludes_delisted(client, db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="正常股"))
        s.add(Stock(code="sz000002", name="退市股", delisted_at="2025-06-01"))
        s.commit()

    r = client.get("/stocks")
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["code"] == "sz000001"


def test_stock_list_invalid_sort_by(client, db_path):
    r = client.get("/stocks?sort_by=invalid")
    assert r.status_code == 422  # FastAPI validation error


def test_stock_list_invalid_sort_order(client, db_path):
    r = client.get("/stocks?sort_order=invalid")
    assert r.status_code == 422


def test_stock_search_pagination(client, db_path):
    init_db()
    with SessionLocal() as s:
        for i in range(25):
            s.add(Stock(code=f"sz{i:06d}", name=f"测试股{i}"))
        s.add(Stock(code="sz999999", name="测试退市股", delisted_at="2025-01-01"))
        s.commit()

    # 默认第一页
    r = client.get("/stocks/search?q=测试")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert body["page"] == 1
    assert body["pageSize"] == 30
    assert len(body["data"]) == 25

    # 自定义分页：第二页
    r2 = client.get("/stocks/search?q=测试&page=2&page_size=10")
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["total"] == 25
    assert b2["page"] == 2
    assert b2["pageSize"] == 10
    assert len(b2["data"]) == 10

    # 两页数据不重复、合计覆盖全部
    r1 = client.get("/stocks/search?q=测试&page=1&page_size=10")
    codes_p1 = {d["code"] for d in r1.json()["data"]}
    codes_p2 = {d["code"] for d in r2.json()["data"]}
    assert codes_p1.isdisjoint(codes_p2)

    # 排除退市股
    all_codes = set()
    for p in (1, 2, 3):
        page = client.get(f"/stocks/search?q=测试&page={p}&page_size=10").json()
        all_codes.update(d["code"] for d in page["data"])
    assert "sz999999" not in all_codes
    assert len(all_codes) == 25
