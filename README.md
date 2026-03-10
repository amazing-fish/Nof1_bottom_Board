# Nof1 Bottom Board

一个常驻页面底部的 Userscript 看板，用于同时展示：

- **主面板行情卡片**：BTCUSDT / XAUUSDT / AXSUSDT 永续行情
- **次面板模型账户卡片**：GPT-5、Gemini、Claude、Grok、DeepSeek、Qwen 等链上账户价值
- **顶部状态灯**：基于 Hyperliquid 账户轮询成功时间显示 Live / Stale / No data

当前脚本版本：**1.5.2**

---

## 设计目标

这个脚本不是传统的大面板交易终端，而是一个“低存在感、常驻屏幕角落”的轻量看板：

- 默认最小化，避免遮挡页面
- 展开后先看主面板行情
- 再按需展开次面板查看模型账户价值
- 尽量减少突兀动画与高饱和色彩
- 多标签页下尽量避免对 Hyperliquid 的重复请求

一句话概括：**轻、稳、能常驻**。

---

## 当前功能

### 1. 主面板：行情卡片

主面板横向展示 3 张行情卡片：

- BTCUSDT · 永续
- XAUUSDT · 永续
- AXSUSDT · 永续

数据源为 **Binance Futures 24hr ticker**。

每张卡片展示：

- 当前价格
- 24h 涨跌额
- 24h 涨跌幅
- 相对更新时间

---

### 2. 次面板：模型账户价值

点击中间的展开按钮后，会显示次面板模型账户卡片。

默认包含：

- GPT-5
- Gemini 2.5 Pro
- Claude Sonnet 4.5
- Grok-4
- DeepSeek V3.1
- Qwen3-Max

数据源为 **Hyperliquid clearinghouseState**。

每张卡片展示：

- 账户价值 Account Value
- 相对 `INITIAL_CAPITAL` 的 PnL
- 相对收益率
- 相对更新时间

模型卡片会按最新账户价值自动排序。

---

### 3. 顶部状态灯

顶部状态文字与状态点反映 Hyperliquid 账户同步健康情况：

- **Live**：最近成功拉到数据
- **Stale**：一段时间未成功更新
- **No data**：尚未成功拿到任何账户数据

折叠后的圆形入口也会同步这个状态点颜色。

---

### 4. 横向滚轮滑动

主面板支持鼠标滚轮把垂直滚动转换为横向滚动，带缓动动画：

- 更适合底部横排卡片
- 卡片较多时不需要额外拖动滚动条
- 尊重 `prefers-reduced-motion`

---

### 5. 复制地址

在次面板中点击模型卡片左侧徽章，可以复制该模型对应地址。

---

## 1.5.2 修复内容

### 已修复

#### 1) 折叠态行情轮询降频

此前主面板折叠后，行情轮询仍然以正常刷新频率持续请求 Binance。  
现在改为：

- **展开主面板**：按正常频率刷新
- **折叠状态**：自动降频刷新
- **重新展开**：立即触发一次刷新

这样可以降低不必要请求，同时避免用户展开时看到过旧数据。

---

#### 2) 次面板隐藏时不执行 FLIP 动画

此前模型账户排序更新时，即使次面板未展开，也会做 FLIP 位置动画计算。  
现在改为：

- 次面板隐藏时：**仅更新数据和最终顺序**
- 次面板展开时：**才执行可见动画**

这样可以减少隐藏状态下的无效布局计算，避免微小抖动。

---

#### 3) Toast 定时器写法收敛

将函数对象挂属性的写法改为独立 `toastTimer` 变量，逻辑更清晰，也更利于后续维护。

---

## 数据源

### Hyperliquid

用于拉取模型账户价值：

- Endpoint: `https://api.hyperliquid.xyz/info`
- Request type: `clearinghouseState`

读取字段优先顺序：

- `marginSummary.accountValue`
- `crossMarginSummary.accountValue`

---

### Binance Futures

用于拉取行情卡片：

- Endpoint: `https://fapi.binance.com/fapi/v1/ticker/24hr`

当前使用的 symbol：

- `BTCUSDT`
- `XAUUSDT`
- `AXSUSDT`

---

## 轮询策略

### 账户价值（Hyperliquid）

模型账户使用**独立轮询 + 退避**：

- 失败后按梯度退避
- 使用 `BroadcastChannel` + `localStorage` 做简单共享缓存
- 尽量减少多标签页重复请求
- 地址为空时不发请求

### 行情卡片（Binance）

行情卡片使用固定刷新间隔，但会根据可见性调整：

- 前台 + 展开：正常刷新
- 前台 + 折叠：降频刷新
- 后台：等待前台后再刷新

---

## 安装方式

### Tampermonkey / Violentmonkey

1. 安装浏览器 Userscript 插件
2. 新建脚本
3. 用仓库里的 `AlphaBoard.js` 全量替换
4. 保存并刷新目标页面

---

## 配置说明

### 1) 修改账户地址

在脚本顶部的 `ADDRS` 中修改：

```js
const ADDRS = {
  'GPT-5': '0x...',
  'Gemini 2.5 Pro': '0x...',
  'Claude Sonnet 4.5': '0x...',
  'Grok-4': '0x...',
  'DeepSeek V3.1': '0x...',
  'Qwen3-Max': '0x...'
};
