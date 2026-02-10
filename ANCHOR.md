# 项目锚点

## 项目概览
- 名称：Nof1 Bottom Board
- 主要组件：`AlphaBoard.js`
- 当前版本：`v1.4.0`（feature）

## 当前目标
- 当前任务：将主面板 BTC 与 XAU 行情卡切换为 USDT 永续合约行情（Binance Futures）。
- 行为约束：仅在面板所在标签页位于前台时执行实时更新（含折叠/展开状态下的时间与数据刷新）；保持主次面板既有交互。
- 兼容策略：保留行情卡原有渲染字段（price/change/percent/ts），仅替换数据源与交易对。

## 约束
- 遵循 `AGENTS.md` 中列出的沟通、流程与审计要求。
- 维护轻量、可读的前端代码结构。
- 版本号按 `v主.次.修` 维护；本次属于 feature，升级到 `v1.4.0`。

## 设计笔记
- 将行情抓取统一抽象为 `fetchPerpTicker(symbol)`，复用 Binance Futures `fapi/v1/ticker/24hr` 返回结构。
- BTC 卡切换为 `BTCUSDT` 永续；XAU 卡切换为 `XAUUSDT` 永续，卡片标题与数据源文案同步更新。
- 删除黄金现货专用接口依赖，脚本 `@connect` 改为仅声明 Futures 域名。

## 验证记录
- 2026-02-10：将 BTC/XAU 改为 USDT 永续合约行情，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复主面板币对时间刷新门控回归，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复主面板轮询门控回归，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：执行 `node --check AlphaBoard.js`，验证 v1.3.1 bugfix 语法与脚本结构，检查通过。
- 2026-02-10：修复模型卡重排容器，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：执行 `node --check AlphaBoard.js`，语法检查通过。

## 潜在影响
- 行情卡数据源统一到 Binance Futures；若交易所侧无 `XAUUSDT` 合约，XAU 卡将展示为 `--`（失败兜底不影响主流程）。
- 主面板与次面板轮询/刷新门控逻辑保持不变，仅更换行情接口。
- 旧金价接口域名不再需要跨域授权，脚本对外连接面收敛。
