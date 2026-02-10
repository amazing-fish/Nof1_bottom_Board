# 项目锚点

## 项目概览
- 名称：Nof1 Bottom Board
- 主要组件：`AlphaBoard.js`
- 当前版本：`v1.5.0`（feature）

## 当前目标
- 当前任务：新增 `AXSUSDT` 永续行情卡，并优化折叠态入口为状态灯极简显示。
- 行为约束：仅在面板所在标签页位于前台时执行实时更新（含折叠/展开状态下的时间与数据刷新）；保持主次面板既有交互。
- 兼容策略：保留行情卡原有渲染字段（price/change/percent/ts），仅替换数据源与交易对。

## 约束
- 遵循 `AGENTS.md` 中列出的沟通、流程与审计要求。
- 维护轻量、可读的前端代码结构。
- 版本号按 `v主.次.修` 维护；本次属于 feature，升级到 `v1.5.0`。

## 设计笔记
- 保持永续行情抓取统一抽象 `fetchPerpTicker(symbol)`，新增 `AXSUSDT` 专用封装函数并加入主面板卡片配置。
- 折叠态入口去掉文字标题“Alpha Board”，改为圆形状态灯按钮，状态色与顶部状态点保持一致（live/warn/dead）。
- 状态同步沿用现有 `updateStatus()`，在更新顶栏状态时同时更新折叠态状态灯，避免双份状态逻辑。

## 验证记录
- 2026-02-10：新增 AXSUSDT 永续卡片并改造折叠态为状态灯入口，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：将 BTC/XAU 改为 USDT 永续合约行情，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复主面板币对时间刷新门控回归，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复主面板轮询门控回归，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：执行 `node --check AlphaBoard.js`，验证 v1.3.1 bugfix 语法与脚本结构，检查通过。
- 2026-02-10：修复模型卡重排容器，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：执行 `node --check AlphaBoard.js`，语法检查通过。

## 潜在影响
- 主面板行情卡数量由 2 增至 3，窄屏下滚动行为会更频繁，但仍由既有横向滚动策略承载。
- 折叠态仅显示状态灯，入口可见文本减少；通过 `title/aria-label` 保留可访问提示。
- 行情卡数据源统一到 Binance Futures；若交易所侧无 `XAUUSDT` 或 `AXSUSDT` 合约，将展示 `--`（失败兜底不影响主流程）。
