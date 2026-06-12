# i'mRich 选股器

A 股选股辅助工具。后端定期抓取行情、财报、研报等数据落地到本地 SQLite，按"技术面"和"基本面"两类策略对全市场股票做候选筛选；前端提供候选列表、个股详情（K线/财务/研报）与数据刷新进度的可视化面板。

> 工具**不替用户做交易决策**，只把全市场几千只股票筛成几十只候选，把命中的数据摆出来供人工复核。

## 功能特性

- **技术面选股**：双线战法、B2 战法等，基于 KDJ、知行短期趋势/多空线等指标组合判定。
- **基本面选股**：创新高超级成长、低位错杀蓝筹，结合财报同比增速、回撤幅度、研报关键词命中等信号打分。
- **个股详情**：K线图（日/周/月/季）、财务与营收图表、研报列表、风险提示。
- **数据刷新**：异步后台任务抓取行情/财报/研报，前端实时展示各步骤进度。
- 所有筛选参数均可在前端面板调节。

## 技术栈

- 后端：Python + FastAPI + SQLAlchemy + SQLite，数据抓取基于 akshare / 东方财富 / 新浪等数据源。
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4，图表用 ECharts。

## 快速开始

### 后端

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 抓取国内数据源（新浪/东方财富等）需要代理，按需配置 .env 中的代理变量
uvicorn app.main:app --reload
```

API 默认运行在 `http://localhost:8000`，启动时会自动初始化本地 SQLite 数据库（`backend/data/imrich.db`）。

首次使用建议先在前端点击"刷新行情/基本面数据"，将股票列表、K线、财报等数据拉取到本地，之后所有筛选与查询都走本地缓存，响应是秒级的。

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:5173` 即可访问，已配置好对本地后端（`http://localhost:8000`）的 CORS 与默认 API 地址。

## 运行测试

```bash
cd backend
pytest
```

## 项目结构

```
backend/    FastAPI 服务、数据抓取、选股策略与本地 SQLite 数据库
frontend/   React 单页应用
docs/       需求规格与实现计划文档
```

更详细的架构说明（数据流、选股策略扩展方式、刷新机制等）见 [`CLAUDE.md`](./CLAUDE.md)。
