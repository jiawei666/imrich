from pathlib import Path

import pandas as pd

from app.data.fetch_research import download_pdf, fetch_research_metadata, parse_pdf_text, parse_research_row


def test_parse_research_row_normalizes_fields():
    row = {
        "报告ID": "R1",
        "股票代码": "000001",
        "股票简称": "平安银行",
        "报告名称": "订单饱满，业绩超预期",
        "机构名称": "测试证券",
        "发布日期": "2025-06-01",
        "摘要": "国产替代",
        "PDF地址": "https://example.test/r1.pdf",
    }
    parsed = parse_research_row(row)
    assert parsed == {
        "report_id": "R1",
        "code": "sz000001",
        "name": "平安银行",
        "title": "订单饱满，业绩超预期",
        "org": "测试证券",
        "published_at": "2025-06-01",
        "summary": "国产替代",
        "pdf_url": "https://example.test/r1.pdf",
    }


def test_fetch_research_metadata_uses_injected_akshare():
    df = pd.DataFrame(
        [
            {
                "报告ID": "R1",
                "股票代码": "600000",
                "股票简称": "浦发银行",
                "报告名称": "行业复苏",
                "机构名称": "测试证券",
                "发布日期": "2025-06-02",
                "摘要": "",
                "PDF地址": "",
            }
        ]
    )
    rows = fetch_research_metadata(lambda: df)
    assert rows[0]["code"] == "sh600000"
    assert rows[0]["title"] == "行业复苏"


def test_download_pdf_writes_bytes(tmp_path):
    class Resp:
        content = b"%PDF-1.4 fake"

        def raise_for_status(self):
            return None

    out = download_pdf("https://example.test/r1.pdf", tmp_path, get_fn=lambda url, timeout: Resp())
    assert Path(out).read_bytes() == b"%PDF-1.4 fake"


def test_parse_pdf_text_uses_injected_parser(tmp_path):
    pdf = tmp_path / "r1.pdf"
    pdf.write_bytes(b"fake")
    text = parse_pdf_text(str(pdf), parser_fn=lambda path: ["第一页", "第二页"])
    assert text == "第一页\n第二页"
