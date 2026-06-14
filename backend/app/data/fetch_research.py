from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable, Iterable, Optional

import pandas as pd

from app.data.fetch_kline import normalize_stock_code_for_sina


def parse_research_row(row: dict) -> dict:
    raw_code = str(row.get("股票代码") or row.get("code") or "").zfill(6)
    pdf_url = str(row.get("报告PDF链接") or row.get("pdf_url") or "")
    # akshare 不再提供报告 ID 字段，用 PDF 链接的文件名（全局唯一）作为 report_id
    report_id = pdf_url.rsplit("/", 1)[-1].removesuffix(".pdf") or str(
        row.get("报告ID") or row.get("report_id") or ""
    )
    published_at = row.get("日期") or row.get("发布日期") or row.get("published_at") or ""
    return {
        "report_id": report_id,
        "code": normalize_stock_code_for_sina(raw_code),
        "name": str(row.get("股票简称") or row.get("name") or ""),
        "title": str(row.get("报告名称") or row.get("title") or ""),
        "org": str(row.get("机构") or row.get("机构名称") or row.get("org") or ""),
        "published_at": str(published_at)[:10],
        "summary": str(row.get("摘要") or row.get("summary") or ""),
        "pdf_url": pdf_url,
    }


def fetch_research_metadata(code: str, ak_fn: Optional[Callable[[str], pd.DataFrame]] = None) -> list[dict]:
    """抓取单只股票的研报列表（akshare 按 symbol 查询，无全市场接口）。"""
    if ak_fn is None:
        import akshare as ak  # type: ignore

        ak_fn = ak.stock_research_report_em
    raw_code = code[2:] if code.startswith(("sh", "sz", "bj")) else code
    try:
        df = ak_fn(raw_code)
    except KeyError:
        # akshare 的 stock_research_report_em 在该股票暂无研报时
        # （东财接口返回 TotalPage=0），内部 DataFrame 缺少 infoCode 列会抛 KeyError。
        # 这是正常情况（如次新股尚无研报覆盖），视为空结果。
        return []
    return [parse_research_row(row) for row in df.to_dict("records")]


def download_pdf(
    url: str,
    directory: Path,
    run_fn: Callable = subprocess.run,
    timeout: int = 20,
) -> str:
    """下载研报 PDF。

    pdf.dfcfw.com 的 WAF 会拦截 requests/httpx 等 Python HTTP 客户端（无论是否走代理、
    是否使用 HTTP/2、是否模拟浏览器 TLS 指纹，均返回反爬 JS 挑战页而非 PDF），
    只有系统 curl 能稳定通过，因此改用 subprocess 调用 curl 直连下载。
    """
    directory.mkdir(parents=True, exist_ok=True)
    filename = url.rstrip("/").split("/")[-1] or "research.pdf"
    if not filename.lower().endswith(".pdf"):
        filename = f"{filename}.pdf"
    path = directory / filename
    result = run_fn(
        ["curl", "-sS", "--fail", "--noproxy", "*", "-m", str(timeout), "-o", str(path), url],
        capture_output=True,
        timeout=timeout + 5,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl 下载失败 (exit {result.returncode}): {result.stderr.decode(errors='replace')}")
    return str(path)


def parse_pdf_text(path: str, parser_fn: Optional[Callable[[str], Iterable[str]]] = None) -> str:
    if parser_fn is None:
        import pdfplumber

        def parser_fn(pdf_path: str) -> Iterable[str]:
            with pdfplumber.open(pdf_path) as pdf:
                return [page.extract_text() or "" for page in pdf.pages]

    return "\n".join(part for part in parser_fn(path) if part)
