from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import WatchlistGroup, WatchlistItem

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

STRATEGY_NAMES: dict[str, str] = {
    "super-growth": "创新高超级成长",
    "oversold-bluechip": "低位错杀蓝筹",
    "trend-support": "双线战法",
    "b2": "B2战法",
}


def get_db():
    with SessionLocal() as db:
        yield db


# ---------- Pydantic schemas ----------

class GroupCreate(BaseModel):
    name: str


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class ItemCreate(BaseModel):
    group_id: Optional[int] = None
    stock_code: str
    stock_name: str
    industry: Optional[str] = None
    strategy_id: Optional[str] = None


class ItemUpdate(BaseModel):
    group_id: Optional[int] = None
    sort_order: Optional[int] = None


# ---------- Response helpers ----------

def _item_dict(item: WatchlistItem) -> dict:
    return {
        "id": item.id,
        "stock_code": item.stock_code,
        "stock_name": item.stock_name,
        "industry": item.industry,
        "strategy_id": item.strategy_id,
        "sort_order": item.sort_order,
        "added_at": item.added_at,
    }


def _group_dict(group: WatchlistGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "sort_order": group.sort_order,
        "items": [_item_dict(i) for i in sorted(group.items, key=lambda x: x.sort_order)],
    }


# ---------- Routes ----------

@router.get("/groups")
def list_groups(db: Session = Depends(get_db)):
    groups = (
        db.query(WatchlistGroup)
        .order_by(WatchlistGroup.sort_order, WatchlistGroup.id)
        .all()
    )
    return [_group_dict(g) for g in groups]


@router.post("/groups", status_code=201)
def create_group(body: GroupCreate, db: Session = Depends(get_db)):
    existing = db.query(WatchlistGroup).filter_by(name=body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="分组名已存在")
    max_order = db.query(func.max(WatchlistGroup.sort_order)).scalar() or 0
    group = WatchlistGroup(
        name=body.name,
        sort_order=max_order + 1,
        created_at=datetime.now().isoformat(),
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_dict(group)


@router.patch("/groups/{group_id}")
def update_group(group_id: int, body: GroupUpdate, db: Session = Depends(get_db)):
    group = db.get(WatchlistGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="分组不存在")
    if body.name is not None:
        group.name = body.name
    if body.sort_order is not None:
        group.sort_order = body.sort_order
    db.commit()
    db.refresh(group)
    return _group_dict(group)


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.get(WatchlistGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="分组不存在")
    db.delete(group)
    db.commit()


@router.post("/items", status_code=201)
def add_item(body: ItemCreate, db: Session = Depends(get_db)):
    # Resolve target group
    if body.group_id is not None:
        group = db.get(WatchlistGroup, body.group_id)
        if group is None:
            raise HTTPException(status_code=404, detail="分组不存在")
    elif body.strategy_id is not None:
        group_name = STRATEGY_NAMES.get(body.strategy_id, body.strategy_id)
        group = db.query(WatchlistGroup).filter_by(name=group_name).first()
        if group is None:
            max_order = db.query(func.max(WatchlistGroup.sort_order)).scalar() or 0
            group = WatchlistGroup(
                name=group_name,
                sort_order=max_order + 1,
                created_at=datetime.now().isoformat(),
            )
            db.add(group)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="group_id 或 strategy_id 必须提供其一")

    # Check duplicate
    existing = db.query(WatchlistItem).filter_by(
        group_id=group.id, stock_code=body.stock_code
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="该股票已在此分组中")

    item = WatchlistItem(
        group_id=group.id,
        stock_code=body.stock_code,
        stock_name=body.stock_name,
        industry=body.industry,
        strategy_id=body.strategy_id,
        sort_order=0,
        added_at=datetime.now().isoformat(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_dict(item)


@router.delete("/items/{item_id}", status_code=204)
def remove_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(WatchlistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    db.delete(item)
    db.commit()


@router.patch("/items/{item_id}")
def update_item(item_id: int, body: ItemUpdate, db: Session = Depends(get_db)):
    item = db.get(WatchlistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="条目不存在")
    if body.group_id is not None:
        target = db.get(WatchlistGroup, body.group_id)
        if target is None:
            raise HTTPException(status_code=404, detail="目标分组不存在")
        conflict = db.query(WatchlistItem).filter_by(
            group_id=body.group_id, stock_code=item.stock_code
        ).first()
        if conflict and conflict.id != item_id:
            raise HTTPException(status_code=409, detail="目标分组已有该股票")
        item.group_id = body.group_id
    if body.sort_order is not None:
        item.sort_order = body.sort_order
    db.commit()
    db.refresh(item)
    return _item_dict(item)
