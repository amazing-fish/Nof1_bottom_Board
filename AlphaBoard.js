// ==UserScript==
// @name         Alpha Board（链上/Small/横排/退避/柔和玻璃）
// @namespace    https://greasyfork.org/zh-CN/users/alpha-arena
// @version      0.5.2
// @description  无记忆 | 默认最小化 | 无外显排名 | 标题一键最小化 | 按模型独立退避(3s→5s→8s→12s) | 仅 Hyperliquid info；横排6卡；更高透明度/更少玻璃态；P&L 绿/红降饱和。
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      api.hyperliquid.xyz
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /** ===== 常量与默认（无记忆） ===== */
  const INITIAL_CAPITAL = 10000;     // PnL 基准
  const FRESH_THRESH_MS = 15000;     // 全局“Stale”阈值（用于顶栏指示）
  const JITTER_MS = 250;             // 轻微抖动，避免齐步走
  const BACKOFF_STEPS = [3000, 5000, 8000, 12000]; // 失败退避阶梯
  let   COLLAPSED = true;            // 默认最小化（不落盘）

  // 默认地址（可直接在此常量区改，不弹窗、不写盘）
  const ADDRS = {
    'GPT-5': '0x67293D914eAFb26878534571add81F6Bd2D9fE06',
    'Gemini 2.5 Pro': '0x1b7A7D099a670256207a30dD0AE13D35f278010f',
    'Claude Sonnet 4.5': '0x59fA085d106541A834017b97060bcBBb0aa82869',
    'Grok-4': '0x56D652e62998251b56C8398FB11fcFe464c08F84',
    'DeepSeek V3.1': '0xC20aC4Dc4188660cBF555448AF52694CA62b0734',
    'Qwen3-Max': '0x7a8fd8bba33e37361ca6b0cb4518a44681bad2f3'
  };

  const MODELS = [
    { key: 'GPT-5', badge: 'GPT' },
    { key: 'Gemini 2.5 Pro', badge: 'GEM' },
    { key: 'Claude Sonnet 4.5', badge: 'CLD' },
    { key: 'Grok-4', badge: 'GRK' },
    { key: 'DeepSeek V3.1', badge: 'DSK' },
    { key: 'Qwen3-Max', badge: 'QWN' },
  ];

  /** ===== 玻璃态 + 透明度优化样式（更透、更克制） ===== */
  GM_addStyle(`
    #ab-dock {
      position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
                   Roboto,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC", Arial;
      color-scheme: dark;
      --gap: 6px; --radius: 12px;
      --pY: 6px; --pX: 8px; --icon: 26px;
      --fsName: 11px; --fsVal: 14px; --fsSub: 11px;

      /* ↓↓↓ 降低玻璃态：整体更通透，blur/saturate 更低 ↓↓↓ */
      --bg: rgba(16,18,22,0.28);
      --bg2: rgba(16,18,22,0.16);
      --card: rgba(28,31,36,0.38);
      --card-hover: rgba(28,31,36,0.46);
      --brd: rgba(255,255,255,0.12);
      --soft: rgba(255,255,255,0.06);
      --shadow: 0 10px 24px rgba(0,0,0,0.26);

      /* ↓↓↓ 低饱和版本绿/红（P&L + 状态点 + 闪烁） ↓↓↓ */
      --green: hsl(142 45% 48% / 1);  /* 较 #22c55e 降饱和、略暗 */
      --red:   hsl(0   58% 56% / 1);  /* 较 #ef4444 降饱和、略暗 */
      --blue:  #60a5fa;
      --text:  #e6e8ee;
    }

    /* 展开按钮：更透、轻玻璃 */
    #ab-toggle {
      pointer-events: auto;
      display: ${COLLAPSED ? 'inline-flex' : 'none'};
      align-items:center; gap:6px;
      padding:6px 10px; border-radius:12px;
      background: linear-gradient(180deg, var(--bg), var(--bg2));
      border:1px solid var(--brd); color:var(--text); font-weight:700; font-size:12px;
      box-shadow: var(--shadow);
      cursor: pointer; user-select: none;
      backdrop-filter: saturate(0.9) blur(4px);
      transition: background .2s ease, border-color .2s ease, transform .15s ease;
    }
    #ab-toggle:hover { border-color: rgba(255,255,255,0.18); transform: translateY(-1px); }

    /* 面板主体：更透、少 blur、少 saturate */
    #ab-wrap {
      pointer-events: auto;
      display: ${COLLAPSED ? 'none' : 'block'};
      background:
        linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015)) ,
        radial-gradient(120% 150% at 0% 100%, rgba(96,165,250,0.06), transparent 55%) ,
        var(--bg);
      border: 1px solid var(--brd);
      border-radius: 14px;
      padding: 8px 10px;
      box-shadow: var(--shadow);
      max-width: min(96vw, 1280px);
      backdrop-filter: saturate(0.9) blur(4px);
    }

    #ab-topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    #ab-left { display:flex; align-items:center; gap:8px; }
    #ab-jump {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 8px;
      border: 1px solid var(--soft);
      background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
      color: #c7d2fe;
      text-decoration: none;
      transition: background .2s ease, border-color .2s ease, color .2s ease, transform .15s ease;
    }
    #ab-jump:hover {
      background: rgba(255,255,255,0.14);
      border-color: rgba(255,255,255,0.20);
      color: #f3f4f6;
      transform: translateY(-1px);
    }
    #ab-jump svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    #ab-title { color:#eef1f6; font-size:11px; font-weight:700; letter-spacing:.3px; opacity:.9; cursor: pointer; }
    #ab-status { display:flex; align-items:center; gap:6px; font-size:11px; color:#aeb1b7; }
    .ab-dot { width:8px; height:8px; border-radius:50%; background:#9ca3af; }
    .ab-live  { background: var(--green); box-shadow: 0 0 10px color-mix(in srgb, var(--green) 35%, transparent); }
    .ab-warn  { background: #f59e0b;   box-shadow: 0 0 10px rgba(245,158,11,0.30); }
    .ab-dead  { background: var(--red); box-shadow: 0 0 10px color-mix(in srgb, var(--red) 35%, transparent); }

    /* 横向一行 + 滚动 */
    #ab-row {
      display:flex; flex-wrap: nowrap; gap: var(--gap);
      overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
      max-width: min(96vw, 1280px);
      position: relative;
    }
    #ab-row::-webkit-scrollbar { height: 6px; }
    #ab-row::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 999px; }

    .ab-card {
      flex: 0 0 auto;
      min-width: 168px; max-width: 220px;
      position: relative; display:flex; align-items:center; gap:8px;
      padding: var(--pY) var(--pX);
      background: var(--card);
      border: 1px solid var(--brd);
      border-radius: var(--radius);
      transition: transform 240ms ease, box-shadow 240ms ease, background 160ms ease, border-color 160ms ease;
      will-change: transform;
    }
    .ab-card:hover {
      background: var(--card-hover);
      border-color: rgba(255,255,255,0.18);
      box-shadow: 0 8px 22px rgba(0,0,0,0.28);
    }

    .ab-icon {
      width: var(--icon); height: var(--icon);
      border-radius: 8px; display:grid; place-items:center;
      font-weight:800; font-size:11px; color:#e5e7eb;
      background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
      border: 1px solid var(--soft); user-select:none; cursor: pointer;
      box-shadow: inset 0 0 6px rgba(255,255,255,0.05);
    }
    .ab-body { display:grid; gap:2px; }
    .ab-name { font-size: var(--fsName); color:#b8bec8; font-weight: 600; letter-spacing:.2px; }
    .ab-val  { font-size: var(--fsVal);  color:#f3f4f6; font-weight: 800; letter-spacing:.2px; font-variant-numeric: tabular-nums; }
    .ab-sub  { font-size: var(--fsSub);  color:#9aa4b2; font-variant-numeric: tabular-nums; }

    /* ↓ P&L 低饱和绿/红 */
    .ab-sub .pos { color: color-mix(in srgb, var(--green) 82%, #d1fae5); }
    .ab-sub .neg { color: color-mix(in srgb, var(--red) 82%,   #fee2e2); }

    /* 涨跌闪烁（进一步降低透明度与冲击感） */
    @media (prefers-reduced-motion: no-preference) {
      .flash-up   { box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 18%, transparent) inset; }
      .flash-down { box-shadow: 0 0 0 2px color-mix(in srgb, var(--red)   18%, transparent) inset; }
    }

    /* 骨架占位 */
    .skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%);
      background-size: 400% 100%;
      animation: ab-shimmer 1.2s ease-in-out infinite;
      border-radius: 6px; height: 12px; width: 120px;
    }
    @keyframes ab-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    /* Toast */
    #ab-toast {
      position: absolute; left: 8px; bottom: 100%; margin-bottom: 8px;
      background: rgba(0,0,0,0.78); color:#fff; padding:6px 8px; border-radius:8px;
      font-size:11px; pointer-events:none; opacity:0; transform: translateY(6px);
      transition: opacity .2s ease, transform .2s ease;
    }
    #ab-toast.show { opacity:1; transform: translateY(0); }
  `);

  /** ===== DOM ===== */
  const dock = document.createElement('div');
  dock.id = 'ab-dock';
  dock.innerHTML = `
    <div id="ab-toggle" title="展开 Alpha Board">Alpha Board</div>
    <div id="ab-wrap" role="region" aria-label="Alpha Board 实时看板">
      <div id="ab-topbar">
        <div id="ab-left">
          <span id="ab-title" title="点击最小化">Alpha Board · 链上实时</span>
          <div id="ab-status" aria-live="polite">
            <span class="ab-dot" id="ab-dot"></span>
            <span id="ab-time">Syncing…</span>
          </div>
        </div>
        <a id="ab-jump" href="https://nof1.ai" target="_blank" rel="noopener noreferrer" title="在新窗口打开 nof1.ai" aria-label="打开 nof1.ai">
          <svg viewBox="0 0 16 16" role="img" aria-hidden="true" focusable="false">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M5.22 4.22a.75.75 0 0 1 1.06 0L11 8.94V6a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-.75.75h-5a.75.75 0 0 1 0-1.5h2.94L5.22 5.28a.75.75 0 0 1 0-1.06z"></path>
          </svg>
        </a>
      </div>
      <div id="ab-row"></div>
      <div id="ab-toast" role="status" aria-live="polite"></div>
    </div>
  `;
  document.documentElement.appendChild(dock);

  const wrap   = dock.querySelector('#ab-wrap');
  const row    = dock.querySelector('#ab-row');
  const toggle = dock.querySelector('#ab-toggle');
  const title  = dock.querySelector('#ab-title');
  const dot    = dock.querySelector('#ab-dot');
  const timeEl = dock.querySelector('#ab-time');
  const toast  = dock.querySelector('#ab-toast');

  // 展开/收起（默认最小化）
  function minimize(){ COLLAPSED = true;  wrap.style.display = 'none';  toggle.style.display = 'inline-flex'; }
  function expand()  { COLLAPSED = false; wrap.style.display = 'block'; toggle.style.display = 'none'; }
  toggle.addEventListener('click', expand);
  title.addEventListener('click',  minimize);
  minimize();

  /** ===== 状态与卡片 ===== */
  const state = new Map();              // key -> { value, addr }
  const cardsByKey = new Map();
  let   lastOrder = MODELS.map(m=>m.key);
  let   lastGlobalSuccess = 0;
  let   seenAnySuccess = false;
  const lastValueMap = new Map();       // 涨跌闪烁使用

  MODELS.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'ab-card';
    card.setAttribute('data-key', m.key);
    card.innerHTML = `
      <div class="ab-icon" title="点击复制地址">${m.badge}</div>
      <div class="ab-body">
        <div class="ab-name">${m.key}</div>
        <div class="ab-val"><span class="skeleton"></span></div>
        <div class="ab-sub"><span class="skeleton" style="width:90px;"></span></div>
      </div>
    `;
    row.appendChild(card);
    cardsByKey.set(m.key, card);

    // 初始状态
    state.set(m.key, { value: null, addr: ADDRRSafe(ADDRS[m.key]) });

    // 复制地址
    card.querySelector('.ab-icon').addEventListener('click', async ()=>{
      const addr = state.get(m.key).addr;
      if (!addr) { showToast('未配置地址'); return; }
      try {
        if (typeof GM_setClipboard === 'function') GM_setClipboard(addr);
        else await navigator.clipboard.writeText(addr);
        showToast('地址已复制');
      } catch { showToast('复制失败'); }
    });
  });

  /** ===== 网络层 ===== */
  function gmPostJson(url, data) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST', url, data: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText)); }
          catch (e) { reject(e); }
        },
        onerror: reject, ontimeout: reject
      });
    });
  }

  async function fetchAccountValue(address) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) return null;
    try {
      const resp = await gmPostJson('https://api.hyperliquid.xyz/info', {
        type: 'clearinghouseState', user: address, dex: ''
      });
      const v = resp?.marginSummary?.accountValue || resp?.crossMarginSummary?.accountValue;
      const num = v ? parseFloat(v) : NaN;
      return Number.isFinite(num) ? num : null;
    } catch { return null; }
  }

  /** ===== 按模型独立轮询 + 失败退避 ===== */
  const pollers = new Map(); // key -> { step, timer }
  function startPoller(mkey){
    const rec = { step: 0, timer: null };
    pollers.set(mkey, rec);

    const run = async () => {
      const s = state.get(mkey);
      const addr = s.addr;

      // 无地址时：视为“不可用”，降频到最高 12s
      if (!addr) {
        updateCard(mkey, null);
        rec.step = BACKOFF_STEPS.length - 1;
        scheduleNext();
        return;
      }

      const val = await fetchAccountValue(addr);
      if (val == null) {
        // 失败：退避升级
        rec.step = Math.min(rec.step + 1, BACKOFF_STEPS.length - 1);
      } else {
        // 成功：重置退避 & 更新全局状态
        rec.step = 0;
        seenAnySuccess = true;
        lastGlobalSuccess = Date.now();
        updateCard(mkey, val);
        updateStatus(); // 刷新顶栏状态
      }
      scheduleNext();
    };

    function scheduleNext(){
      const base = BACKOFF_STEPS[rec.step];
      const jitter = (Math.random() * 2 - 1) * JITTER_MS;
      clearTimeout(rec.timer);
      rec.timer = setTimeout(run, Math.max(0, base + jitter));
    }

    scheduleNext();
  }

  // 为所有模型启动独立轮询
  MODELS.forEach(m => startPoller(m.key));

  /** ===== 渲染 ===== */
  function updateCard(mkey, value){
    const s = state.get(mkey);
    s.value = value;

    // 先记录旧位置信息（用于 FLIP 动画）
    const firstRects = new Map();
    MODELS.forEach(m=>{
      const el = cardsByKey.get(m.key);
      firstRects.set(m.key, el.getBoundingClientRect());
    });

    // 更新本卡展示
    const el = cardsByKey.get(mkey);
    const valEl = el.querySelector('.ab-val');
    const subEl = el.querySelector('.ab-sub');
    if (value == null) {
      valEl.innerHTML = '<span class="skeleton" style="width:120px;"></span>';
      subEl.textContent = s.addr ? '暂不可用' : '地址未配置';
    } else {
      const prev = lastValueMap.get(mkey);
      valEl.textContent = fmtUSD(value);
      const pnl = value - INITIAL_CAPITAL;
      const pct = pnl / INITIAL_CAPITAL;
      subEl.innerHTML = `PnL <span class="${pnl>=0?'pos':'neg'}">${fmtUSD(pnl)} · ${fmtPct(pct)}</span>`;

      // 涨跌闪烁（更柔和）
      if (typeof prev === 'number' && prev !== value) {
        el.classList.remove('flash-up','flash-down');
        void el.offsetWidth;
        el.classList.add(prev < value ? 'flash-up' : 'flash-down');
        setTimeout(()=>el.classList.remove('flash-up','flash-down'), 260);
      }
      lastValueMap.set(mkey, value);
    }

    // 重排：按最新值排序（不显示名次，仅内部排序）
    const items = MODELS.map(m => ({ key: m.key, value: state.get(m.key).value }));
    items.sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));
    const newOrder = items.map(i=>i.key);

    const els = items.map(i=>cardsByKey.get(i.key));
    const lastRects = new Map();
    els.forEach(el=>{
      const key = el.getAttribute('data-key');
      lastRects.set(key, firstRects.get(key));
    });
    els.forEach((el)=> row.appendChild(el));

    els.forEach(el=>{
      const key = el.getAttribute('data-key');
      const first = lastRects.get(key);
      const last  = el.getBoundingClientRect();
      if (first) {
        const dx = first.left - last.left;
        const dy = first.top  - last.top;
        if (dx || dy) {
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.getBoundingClientRect();
          el.style.transition = 'transform 240ms ease';
          el.style.transform = '';
          el.addEventListener('transitionend', ()=>{ el.style.transition=''; }, { once:true });
        }
      }
    });

    lastOrder = newOrder;
  }

  /** ===== 顶栏状态：Live / Stale / Dead ===== */
  function updateStatus(){
    const now = Date.now();
    if (!seenAnySuccess) {
      dot.className = 'ab-dot ab-dead';
      timeEl.textContent = 'No data';
      return;
    }
    const stale = (now - lastGlobalSuccess) > FRESH_THRESH_MS;
    dot.className = 'ab-dot ' + (stale ? 'ab-warn' : 'ab-live');
    timeEl.textContent = (stale ? 'Stale' : ('更新 ' + fmtTime(now)));
  }
  setInterval(updateStatus, 1000); // 轻量 UI 刷新，不打网络

  /** ===== 工具函数 ===== */
  function ADDRRSafe(addr) { return typeof addr === 'string' ? addr.trim() : ''; }
  function fmtUSD(n){ return n==null ? '—' : '$' + n.toLocaleString(undefined,{maximumFractionDigits:2}); }
  function fmtPct(n){ return n==null ? '—' : ((n>=0?'+':'') + (n*100).toFixed(2) + '%'); }
  function fmtTime(ts){
    const d=new Date(ts); const p=n=>n<10?'0'+n:n;
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toast.classList.remove('show'), 1200);
  }
})();
