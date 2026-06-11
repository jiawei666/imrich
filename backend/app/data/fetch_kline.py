from __future__ import annotations

import json
import logging
from typing import List, Optional

import pandas as pd
import requests
import akshare as ak  # type: ignore

logger = logging.getLogger(__name__)


def normalize_stock_code_for_sina(code: str) -> str:
    """为腾讯/新浪接口添加市场前缀（sh/sz/bj）。"""
    if code.startswith(("sh", "sz", "bj")):
        return code
    code = code.zfill(6)
    if code.startswith(("600", "601", "603", "605")):
        return f"sh{code}"
    if code.startswith(("000", "001", "002", "003")):
        return f"sz{code}"
    if code.startswith(("300", "301")):
        return f"sz{code}"
    if code.startswith("688"):
        return f"sh{code}"
    if code.startswith(("430", "830", "831", "832", "833", "834", "835", "836",
                        "837", "838", "839", "870", "871", "872", "873", "874",
                        "875", "876", "877", "878", "879", "9")):
        return f"bj{code}"
    logger.warning("无法确定股票 %s 的市场，默认当作北京市场", code)
    return f"bj{code}"


def stock_zh_a_hist_tx(symbol: str = "sz000001", adjust: str = "qfq",
                       timeout: Optional[float] = None) -> pd.DataFrame:
    """腾讯证券-日频-股票历史数据（默认前复权，近1095天）。"""
    url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
    params = {"param": f"{symbol},day,,,1095,{adjust}", "r": "0.8205512681390605"}
    r = requests.get(url, params=params, timeout=timeout)
    data_json = json.loads(r.text)
    result = data_json["data"][symbol]
    if "day" in result:
        temp_df = pd.DataFrame(result["day"])
    elif "hfqday" in result:
        temp_df = pd.DataFrame(result["hfqday"])
    else:
        temp_df = pd.DataFrame(result["qfqday"])
    big_df = temp_df.iloc[:, :6]
    big_df.columns = ["date", "open", "close", "high", "low", "amount"]
    big_df["date"] = pd.to_datetime(big_df["date"], errors="coerce").dt.date
    for col in ["open", "close", "high", "low", "amount"]:
        big_df[col] = pd.to_numeric(big_df[col], errors="coerce")
    big_df.drop_duplicates(inplace=True, ignore_index=True)
    return big_df


def get_kline_ak_tx(code: str, start: str, end: str, adjust: str = "qfq") -> pd.DataFrame:
    """返回字段：date(Timestamp), open, close, high, low, volume(股)。"""
    normalized_code = normalize_stock_code_for_sina(code)
    raw = stock_zh_a_hist_tx(symbol=normalized_code, adjust=adjust)
    if raw.empty:
        return raw
    df = raw.assign(date=lambda x: pd.to_datetime(x["date"]))
    numeric_cols = [c for c in df.columns if c != "date"]
    df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
    if "amount" in df.columns:
        df["volume"] = df["amount"] * 100  # 1手 = 100股
        df = df.drop(columns=["amount"])
    df = df[["date", "open", "close", "high", "low", "volume"]]
    return df.sort_values("date").reset_index(drop=True)


def get_constituents(min_cap: float) -> List[dict]:
    """按总市值筛全市场A股，返回 [{code(带前缀), name, market_cap(亿)}]。

    min_cap 单位为元；market_cap 字段单位为亿元。
    """
    df = ak.stock_zh_a_spot_em()
    df = df[["代码", "名称", "总市值"]].rename(
        columns={"代码": "code", "名称": "name", "总市值": "mktcap"})
    df["mktcap"] = pd.to_numeric(df["mktcap"], errors="coerce")
    df = df[df["mktcap"] >= min_cap]
    rows = []
    for _, row in df.iterrows():
        raw_code = str(row["code"]).zfill(6)
        rows.append({
            "code": normalize_stock_code_for_sina(raw_code),
            "name": str(row["name"]),
            "market_cap": round(float(row["mktcap"]) / 1e8, 2),
        })
    logger.info("筛选市值≥ %.0f 亿，共 %d 只", min_cap / 1e8, len(rows))
    return rows
