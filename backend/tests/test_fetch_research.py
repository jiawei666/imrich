import subprocess
from pathlib import Path

import pandas as pd
import pytest

from app.data.fetch_research import download_pdf, fetch_research_metadata, parse_pdf_text, parse_research_row


def test_parse_research_row_normalizes_fields():
    row = {
        "股票代码": "000001",
        "股票简称": "平安银行",
        "报告名称": "订单饱满，业绩超预期",
        "机构": "测试证券",
        "日期": "2025-06-01",
        "报告PDF链接": "https://example.test/H3_AP202506011234567_1.pdf",
    }
    parsed = parse_research_row(row)
    assert parsed == {
        "report_id": "H3_AP202506011234567_1",
        "code": "sz000001",
        "name": "平安银行",
        "title": "订单饱满，业绩超预期",
        "org": "测试证券",
        "published_at": "2025-06-01",
        "summary": "",
        "pdf_url": "https://example.test/H3_AP202506011234567_1.pdf",
    }


def test_fetch_research_metadata_calls_akshare_with_stock_symbol():
    df = pd.DataFrame(
        [
            {
                "股票代码": "600000",
                "股票简称": "浦发银行",
                "报告名称": "行业复苏",
                "机构": "测试证券",
                "日期": "2025-06-02",
                "报告PDF链接": "https://example.test/H3_AP202506021234567_1.pdf",
            }
        ]
    )
    seen = {}

    def ak_fn(symbol):
        seen["symbol"] = symbol
        return df

    rows = fetch_research_metadata("sh600000", ak_fn=ak_fn)
    assert seen["symbol"] == "600000"
    assert rows[0]["code"] == "sh600000"
    assert rows[0]["title"] == "行业复苏"
    assert rows[0]["report_id"] == "H3_AP202506021234567_1"


def test_fetch_research_metadata_strips_bj_prefix_for_symbol():
    seen = {}

    def ak_fn(symbol):
        seen["symbol"] = symbol
        return pd.DataFrame([])

    fetch_research_metadata("bj430047", ak_fn=ak_fn)
    assert seen["symbol"] == "430047"


def test_fetch_research_metadata_returns_empty_when_no_reports():
    # akshare 的 stock_research_report_em 在该股票无研报时（东财接口返回
    # TotalPage=0），其内部会因 big_df 缺少 infoCode 列抛出 KeyError。
    def ak_fn(symbol):
        raise KeyError("infoCode")

    rows = fetch_research_metadata("sz301331", ak_fn=ak_fn)
    assert rows == []


def test_download_pdf_writes_bytes(tmp_path):
    """curl 把响应体写到 -o 指定的路径；download_pdf 应返回该路径。"""
    def run_fn(cmd, capture_output, timeout):
        out_path = Path(cmd[cmd.index("-o") + 1])
        out_path.write_bytes(b"%PDF-1.4 fake")
        return subprocess.CompletedProcess(cmd, 0, b"", b"")

    out = download_pdf("https://pdf.dfcfw.com/pdf/r1.pdf", tmp_path, run_fn=run_fn)
    assert Path(out).read_bytes() == b"%PDF-1.4 fake"


def test_download_pdf_bypasses_proxy(tmp_path):
    """pdf.dfcfw.com 经代理访问会被反爬拦截返回JS挑战页而非真实PDF，下载需绕过代理直连。"""
    captured = {}

    def run_fn(cmd, capture_output, timeout):
        captured["cmd"] = cmd
        out_path = Path(cmd[cmd.index("-o") + 1])
        out_path.write_bytes(b"%PDF-1.4 fake")
        return subprocess.CompletedProcess(cmd, 0, b"", b"")

    download_pdf("https://pdf.dfcfw.com/pdf/r1.pdf", tmp_path, run_fn=run_fn)

    assert "--noproxy" in captured["cmd"]


def test_download_pdf_raises_on_curl_failure(tmp_path):
    """东财PDF CDN的WAF会对部分请求返回567等错误码；curl --fail 非0退出码应转为异常，
    供上层（_download_and_parse）捕获并跳过、留待下次重试。"""
    def run_fn(cmd, capture_output, timeout):
        return subprocess.CompletedProcess(cmd, 22, b"", b"curl: (22) The requested URL returned error: 567")

    with pytest.raises(RuntimeError):
        download_pdf("https://pdf.dfcfw.com/pdf/r1.pdf", tmp_path, run_fn=run_fn)


def test_parse_pdf_text_uses_injected_parser(tmp_path):
    pdf = tmp_path / "r1.pdf"
    pdf.write_bytes(b"fake")
    text = parse_pdf_text(str(pdf), parser_fn=lambda path: ["第一页", "第二页"])
    assert text == "第一页\n第二页"
