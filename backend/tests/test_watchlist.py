import pytest
from app.db import init_db
from app.models import WatchlistGroup, WatchlistItem


# ---------- 分组 CRUD ----------

def test_create_group(client):
    r = client.post("/watchlist/groups", json={"name": "双线战法"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "双线战法"
    assert data["items"] == []


def test_create_group_duplicate_returns_409(client):
    client.post("/watchlist/groups", json={"name": "双线战法"})
    r = client.post("/watchlist/groups", json={"name": "双线战法"})
    assert r.status_code == 409


def test_list_groups_empty(client):
    r = client.get("/watchlist/groups")
    assert r.status_code == 200
    assert r.json() == []


def test_rename_group(client):
    g = client.post("/watchlist/groups", json={"name": "旧名"}).json()
    r = client.patch(f"/watchlist/groups/{g['id']}", json={"name": "新名"})
    assert r.status_code == 200
    assert r.json()["name"] == "新名"


def test_delete_group(client):
    g = client.post("/watchlist/groups", json={"name": "临时组"}).json()
    r = client.delete(f"/watchlist/groups/{g['id']}")
    assert r.status_code == 204
    assert client.get("/watchlist/groups").json() == []


def test_reorder_group(client):
    a = client.post("/watchlist/groups", json={"name": "A"}).json()
    b = client.post("/watchlist/groups", json={"name": "B"}).json()
    client.patch(f"/watchlist/groups/{a['id']}", json={"sort_order": 10})
    client.patch(f"/watchlist/groups/{b['id']}", json={"sort_order": 5})
    groups = client.get("/watchlist/groups").json()
    assert groups[0]["name"] == "B"
    assert groups[1]["name"] == "A"


# ---------- 成员 CRUD ----------

def test_add_item_with_group_id(client):
    g = client.post("/watchlist/groups", json={"name": "双线战法"}).json()
    r = client.post("/watchlist/items", json={
        "group_id": g["id"],
        "stock_code": "sz000001",
        "stock_name": "平安银行",
        "industry": "银行",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["stock_code"] == "sz000001"
    assert data["industry"] == "银行"


def test_add_item_auto_creates_group_from_strategy(client):
    r = client.post("/watchlist/items", json={
        "stock_code": "sz000001",
        "stock_name": "平安银行",
        "strategy_id": "trend-support",
    })
    assert r.status_code == 201
    groups = client.get("/watchlist/groups").json()
    assert any(g["name"] == "双线战法" for g in groups)


def test_add_item_duplicate_returns_409(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"})
    r = client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"})
    assert r.status_code == 409


def test_same_stock_in_multiple_groups(client):
    g1 = client.post("/watchlist/groups", json={"name": "G1"}).json()
    g2 = client.post("/watchlist/groups", json={"name": "G2"}).json()
    r1 = client.post("/watchlist/items", json={"group_id": g1["id"], "stock_code": "sz000001", "stock_name": "A"})
    r2 = client.post("/watchlist/items", json={"group_id": g2["id"], "stock_code": "sz000001", "stock_name": "A"})
    assert r1.status_code == 201
    assert r2.status_code == 201


def test_delete_item(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    item = client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"}).json()
    r = client.delete(f"/watchlist/items/{item['id']}")
    assert r.status_code == 204
    groups = client.get("/watchlist/groups").json()
    assert groups[0]["items"] == []


def test_move_item_to_other_group(client):
    g1 = client.post("/watchlist/groups", json={"name": "G1"}).json()
    g2 = client.post("/watchlist/groups", json={"name": "G2"}).json()
    item = client.post("/watchlist/items", json={"group_id": g1["id"], "stock_code": "sz000001", "stock_name": "A"}).json()
    r = client.patch(f"/watchlist/items/{item['id']}", json={"group_id": g2["id"]})
    assert r.status_code == 200
    groups = client.get("/watchlist/groups").json()
    g1_data = next(g for g in groups if g["id"] == g1["id"])
    g2_data = next(g for g in groups if g["id"] == g2["id"])
    assert g1_data["items"] == []
    assert len(g2_data["items"]) == 1


def test_delete_group_cascades_items(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "A"})
    client.delete(f"/watchlist/groups/{g['id']}")
    assert client.get("/watchlist/groups").json() == []


def test_items_appear_in_group_list(client):
    g = client.post("/watchlist/groups", json={"name": "G"}).json()
    client.post("/watchlist/items", json={"group_id": g["id"], "stock_code": "sz000001", "stock_name": "平安银行"})
    groups = client.get("/watchlist/groups").json()
    assert groups[0]["items"][0]["stock_code"] == "sz000001"
