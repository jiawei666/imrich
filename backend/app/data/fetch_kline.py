from __future__ import annotations

import json
import logging
import time
from typing import List, Optional

import pandas as pd
import requests

logger = logging.getLogger(__name__)

# 伪装浏览器 UA，避免被新浪/腾讯反爬识别为 python-requests 爬虫
_BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
_HEADERS = {"User-Agent": _BROWSER_UA}


# ---- 新浪接口：全市场A股实时行情（含市值） ---- #
_SINA_URL = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
_SINA_PAGE_SIZE = 80


def _get_sina_page_count(timeout: float = 15) -> int:
    """获取新浪 A 股分页总数。"""
    params = {
        "page": 1, "num": 1, "sort": "symbol", "asc": 1,
        "node": "hs_a", "symbol": "", "_s_r_a": "auto",
    }
    r = requests.get(_SINA_URL, params=params, headers=_HEADERS, timeout=timeout)
    if r.status_code != 200:
        raise RuntimeError(f"新浪接口返回 HTTP {r.status_code}: {_truncate(r.text, 200)}")
    data = json.loads(r.text)
    if not isinstance(data, list) or len(data) == 0:
        raise RuntimeError(f"新浪接口返回异常数据: {_truncate(r.text, 200)}")
    total = int(data[0].get("count", 0)) if "count" in data[0] else 0
    if total == 0:
        # 从响应头或内容推断
        total = 5500  # A 股约 5500 只
    return (total + _SINA_PAGE_SIZE - 1) // _SINA_PAGE_SIZE


def _truncate(text: str, max_len: int = 200) -> str:
    return text[:max_len] + "..." if len(text) > max_len else text


def fetch_sina_spot() -> pd.DataFrame:
    """直接调新浪接口获取全市场 A 股实时行情（含市值）。

    返回列：代码, 名称, 总市值(万元), 最新价, 涨跌幅, 成交量, 成交额
    不依赖 akshare 封装，保留 mktcap 字段。
    """
    page_count = _get_sina_page_count()
    big_df = pd.DataFrame()

    for page in range(1, page_count + 1):
        params = {
            "page": page, "num": _SINA_PAGE_SIZE, "sort": "symbol", "asc": 1,
            "node": "hs_a", "symbol": "", "_s_r_a": "auto",
        }
        r = requests.get(_SINA_URL, params=params, headers=_HEADERS, timeout=15)
        if r.status_code == 456:
            raise RuntimeError(
                f"新浪接口拒绝访问（HTTP 456），IP 被临时封禁，请等待 5~60 分钟后重试。"
                f"详情: {_truncate(r.text, 300)}"
            )
        if r.status_code != 200:
            raise RuntimeError(f"新浪接口返回 HTTP {r.status_code}: {_truncate(r.text, 200)}")

        try:
            data = json.loads(r.text)
        except (json.JSONDecodeError, ValueError):
            raise RuntimeError(
                f"新浪接口返回非 JSON 数据（可能 IP 被封）: {_truncate(r.text, 200)}"
            )

        if not isinstance(data, list) or len(data) == 0:
            logger.warning("新浪接口第 %d/%d 页返回空数据，跳过", page, page_count)
            continue

        page_df = pd.DataFrame(data)
        big_df = pd.concat([big_df, page_df], ignore_index=True)

        # 简单限速，避免被封
        if page < page_count:
            time.sleep(0.3)

    if big_df.empty:
        raise RuntimeError("新浪接口返回数据为空，可能是 IP 被封或接口变更")

    # 提取需要的列
    result = pd.DataFrame()
    result["代码"] = big_df["symbol"].astype(str).str.zfill(6)
    result["名称"] = big_df["name"].astype(str)
    result["总市值"] = pd.to_numeric(big_df.get("mktcap", 0), errors="coerce").fillna(0)

    logger.info("新浪接口获取全市场 A 股共 %d 只", len(result))
    return result


# ---- 代码标准化 ---- #

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


# ---- 腾讯接口：日K线 ---- #

def stock_zh_a_hist_tx(symbol: str = "sz000001", adjust: str = "qfq",
                       timeout: Optional[float] = None) -> pd.DataFrame:
    """腾讯证券-日频-股票历史数据（默认前复权，近1095天）。"""
    url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
    params = {"param": f"{symbol},day,,,1095,{adjust}", "r": "0.8205512681390605"}
    r = requests.get(url, params=params, headers=_HEADERS, timeout=timeout)
    data_json = json.loads(r.text)
    result = data_json["data"][symbol]
    if "day" in result:
        temp_df = pd.DataFrame(result["day"])
    elif "hfqday" in result:
        temp_df = pd.DataFrame(result["hfqday"])
    else:
        temp_df = pd.DataFrame(result["qfqday"])
    big_df = temp_df.iloc[:, :6].copy()
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


# ---- 股票列表 ---- #

def get_constituents(min_cap: float) -> List[dict]:
    """按总市值筛全市场A股，返回 [{code(带前缀), name, market_cap(亿)}]。

    min_cap 单位为元；market_cap 字段单位为亿元。
    使用新浪接口获取股票列表+市值，腾讯接口获取K线，与旧项目 akshare_tx 数据源一致。
    """
    df = fetch_sina_spot()
    # 新浪 mktcap 单位是万元，转换为亿元
    df["market_cap_yi"] = df["总市值"] / 10000
    # 按市值过滤（min_cap 单位为元，即 /1e8 = 亿元）
    min_cap_yi = min_cap / 1e8
    df = df[df["market_cap_yi"] >= min_cap_yi]

    rows = []
    for _, row in df.iterrows():
        raw_code = str(row["代码"]).zfill(6)
        normalized = normalize_stock_code_for_sina(raw_code)
        rows.append({
            "code": normalized,
            "name": str(row["名称"]),
            "market_cap": round(float(row["market_cap_yi"]), 2),
        })
    logger.info("筛选市值≥ %.0f 亿，共 %d 只", min_cap_yi, len(rows))
    return rows
