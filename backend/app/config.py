import os
from pathlib import Path

# DB 文件路径，测试通过 IMRICH_DB_PATH 覆盖到临时文件
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "imrich.db"


def get_db_path() -> str:
    return os.environ.get("IMRICH_DB_PATH", str(DEFAULT_DB_PATH))
