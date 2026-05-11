# 项目锚点

## 项目概览
- 名称：Nof1 Bottom Board
- 主要组件：`AlphaBoard.js`
- 当前版本：`v1.7.0`（feature）

## 当前目标
- 当前任务：按评审意见移除 AXS 卡片，改为 OPENAI 卡片，并继续由欧易（OKX）提供该卡片行情。
- 行为约束：保持主次面板既有交互与前台轮询门控；新 source 接入需兼容现有 price/change/percent/ts 渲染字段。
- 兼容策略：Binance 与 OKX 行情统一映射为 `price/change/percent/ts`，渲染层无感知切换。

## 约束
- 遵循 `AGENTS.md` 中列出的沟通、流程与审计要求。
- 维护轻量、可读的前端代码结构。
- 版本号按 `v主.次.修` 维护；本次属于 feature，升级到 `v1.7.0`。

## 设计笔记
- 将 `fetchPerpTicker` 升级为按 `source` 分流：`binance` 继续走 `fapi/v1/ticker/24hr`，`okx` 走 `api/v5/market/ticker`。
- 在 FEATURE_CARDS 中保留 BTC/XAU 使用 Binance，并将第三张卡片由 AXS 调整为 OPENAI（`OPENAI-USDT-SWAP`，OKX）。
- OKX 返回字段映射：`last` -> `price`；`open24h` 计算 `change`；`sodUtc0` 计算 `percent`，并统一输出比例值。

## 验证记录
- 2026-05-11：按评审意见移除 AXS 并新增 OPENAI 卡片（OKX），执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-05-11：新增 FEATURE_CARDS 多 source 支持并接入 OKX AXS-SWAP，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复切回前台自动折叠行为，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：新增 AXSUSDT 永续卡片并改造折叠态为状态灯入口，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：将 BTC/XAU 改为 USDT 永续合约行情，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复主面板币对时间刷新门控回归，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：修复主面板轮询门控回归，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：执行 `node --check AlphaBoard.js`，验证 v1.3.1 bugfix 语法与脚本结构，检查通过。
- 2026-02-10：修复模型卡重排容器，执行 `node --check AlphaBoard.js`，语法检查通过。
- 2026-02-10：执行 `node --check AlphaBoard.js`，语法检查通过。

## 潜在影响
- 新增 `www.okx.com` 访问依赖；若目标环境屏蔽该域名，相关卡片会显示获取失败。
- OKX 的 `percent` 由日内基准价计算，和 Binance 的 24h 统计口径可能存在轻微差异。
- 渲染层保持统一字段，不影响既有样式、排序与前台刷新策略。
