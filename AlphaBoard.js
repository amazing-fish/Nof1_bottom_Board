// ==UserScript==
// @name         Alpha Board（链上/Small/横排/UX升级）
// @namespace    https://greasyfork.org/zh-CN/users/alpha-arena
// @version      0.4.0
// @description  仅用 Hyperliquid info 接口；3s 刷新；横向一行显示6模型；左下角“Alpha Board”最小化；平滑名次动画、数值涨跌闪烁、Live状态与失败退避、骨架占位、地址复制、快捷键。
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      api.hyperliquid.xyz
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /** ===== 基本配置 ===== */
  const BASE_INTERVAL_MS = 3000;          // 基础刷新周期
  const JITTER_MS = 300;                  // 抖动，避免“齐步走”
  const MAX_INTERVAL_MS = 12000;          // 失败退避上限
  const INITIAL_CAPITAL = 10000;          // 初始资金口径
  const FRESH_THRESH_MS = 15000;          // 超过即标记 Stale
  const STORE_ADDRS = 'AA_ADDRS_V1';
  const STORE_COLL  = 'AA_COLLAPSED_V3';

  // 默认模型地址（Qwen 留空，手动填）
  const DEFAULT_ADDRS = {
    'GPT-5': '0x67293D914eAFb26878534571add81F6Bd2D9fE06',
    'Gemini 2.5 Pro': '0x1b7A7D099a670256207a30dD0AE13D35f278010f',
    'Claude Sonnet 4.5': '0x59fA085d106541A834017b97060bcBBb0aa82869',
    'Grok-4': '0x56D652e62998251b56C8398FB11fcFe464c08F84',
    'DeepSeek V3.1': '0xC20aC4Dc4188660cBF555448AF52694CA62b0734',
    'Qwen3-Max': '0x7a8fd8bba33e37361ca6b0cb4518a44681bad2f3'
  };
  let ADDRS = loadJSON(STORE_ADDRS, DEFAULT_ADDRS);
  let COLLAPSED = loadJSON(STORE_COLL, false);

  const MODELS = [
    { key: 'GPT-5', badge: 'GPT' },
    { key: 'Gemini 2.5 Pro', badge: 'GEM' },
    { key: 'Claude Sonnet 4.5', badge: 'CLD' },
    { key: 'Grok-4', badge: 'GRK' },
    { key: 'DeepSeek V3.1', badge: 'DSK' },
    { key: 'Qwen3-Max', badge: 'QWN' },
  ];

  /** ===== 样式（Small + 横排 + 动效） ===== */
  GM_addStyle(`
    #ab-dock {
      position: fixed; left: 10px; bottom: 10px; z-index: 2147483647;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
                   Roboto, "PingFang SC","Microsoft YaHei","Noto Sans CJK SC", Arial;
      color-scheme: dark;
      --gap: 6px; --radius: 10px; --blur: 8px;
      --pY: 6px; --pX: 8px; --icon: 26px; --rank: 16px; --delta: 16px;
      --fsName: 11px; --fsVal: 14px; --fsSub: 11px;
      --bg: rgba(18,18,20,0.68);
      --card: rgba(28,28,32,0.92);
      --brd: rgba(255,255,255,0.10);
      --soft: rgba(255,255,255,0.06);
      --green: #16a34a; --red:#dc2626; --blue:#3b82f6; --text:#e5e7eb;
    }
    #ab-toggle {
      pointer-events: auto;
      display: ${COLLAPSED ? 'inline-flex' : 'none'};
      align-items:center; gap:6px;
      padding:6px 10px; border-radius:10px;
      background: rgba(18,18,20,0.75);
      border:1px solid var(--brd); color:var(--text); font-weight:700; font-size:12px;
      box-shadow: 0 8px 18px rgba(0,0,0,0.25);
      cursor: pointer; user-select: none;
    }
    #ab-wrap {
      pointer-events: auto;
      display: ${COLLAPSED ? 'none' : 'block'};
      backdrop-filter: blur(var(--blur));
      background: var(--bg);
      border: 1px solid var(--brd);
      border-radius: 12px;
      padding: 8px 10px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.28);
      max-width: min(96vw, 1280px);
    }
    #ab-topbar {
      display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;
    }
    #ab-left { display:flex; align-items:center; gap:8px; }
    #ab-title { color:#e7e9ee; font-size:11px; font-weight:700; letter-spacing:.3px; opacity:.9; }
    #ab-status { display:flex; align-items:center; gap:6px; font-size:11px; color:#aeb1b7; }
    .ab-dot { width:8px; height:8px; border-radius:50%; background:#9ca3af; box-shadow:0 0 0 0 rgba(0,0,0,0.2); }
    .ab-live  { background: var(--green); }
    .ab-warn  { background: #f59e0b; }
    .ab-dead  { background: var(--red); }
    #ab-actions { display:flex; gap:6px; }
    .ab-btn {
      cursor:pointer; padding:3px 7px; border-radius:8px; color:#cbd5e1;
      border:1px solid var(--soft); background: rgba(255,255,255,0.05); font-size:11px;
    }
    .ab-btn:hover { background: rgba(255,255,255,0.09); }

    /* 横向一行 + 滚动 */
    #ab-row {
      display:flex; flex-wrap: nowrap; gap: var(--gap);
      overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
      max-width: min(96vw, 1280px);
      position: relative;
    }
    #ab-row::-webkit-scrollbar { height: 6px; }
    #ab-row::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }

    .ab-card {
      flex: 0 0 auto;
      min-width: 168px; max-width: 220px;
      position: relative; display:flex; align-items:center; gap:8px;
      padding: var(--pY) var(--pX);
      background: var(--card); border: 1px solid var(--brd); border-radius: var(--radius);
      will-change: transform;
      transition: transform 250ms ease, box-shadow 250ms ease;
    }
    .ab-rank {
      position:absolute; left:-5px; top:-5px; width: var(--rank); height: var(--rank);
      border-radius: 50%; background: var(--blue); color:#fff; font-weight:700;
      display:flex; align-items:center; justify-content:center; font-size:10px;
      box-shadow: 0 4px 10px rgba(59,130,246,0.35);
    }
    .ab-delta {
      position:absolute; right:-5px; top:-5px; height: var(--delta);
      min-width: 20px; padding: 0 6px; border-radius: 999px;
      display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:700; color:#fff;
    }
    .ab-delta.up { background: var(--green); } .ab-delta.down { background: var(--red); }

    .ab-icon {
      width: var(--icon); height: var(--icon);
      border-radius: 8px; display:grid; place-items:center;
      font-weight:800; font-size:11px; color:#e5e7eb;
      background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03));
      border: 1px solid var(--soft); user-select:none; cursor: pointer;
    }
    .ab-body { display:grid; gap:2px; }
    .ab-name { font-size: var(--fsName); color:#aeb1b7; font-weight: 600; letter-spacing:.2px; }
    .ab-val  { font-size: var(--fsVal);  color:#f3f4f6; font-weight: 800; letter-spacing:.2px; font-variant-numeric: tabular-nums; }
    .ab-sub  { font-size: var(--fsSub);  color:#98a2b3; font-variant-numeric: tabular-nums; }
    .ab-sub .pos { color: var(--green); } .ab-sub .neg { color: var(--red); }

    /* 涨跌闪烁 */
    @media (prefers-reduced-motion: no-preference) {
      .flash-up   { box-shadow: 0 0 0 2px rgba(22,163,74,0.35) inset; }
      .flash-down { box-shadow: 0 0 0 2px rgba(220,38,38,0.35) inset; }
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
      background: rgba(0,0,0,0.8); color:#fff; padding:6px 8px; border-radius:8px;
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
          <span id="ab-title">Alpha Board · 链上实时</span>
          <div id="ab-status" aria-live="polite">
            <span class="ab-dot" id="ab-dot"></span>
            <span id="ab-time">Syncing…</span>
          </div>
        </div>
        <div id="ab-actions">
          <button id="ab-gear" class="ab-btn" title="配置地址（Alt+G）">⚙</button>
          <button id="ab-min"  class="ab-btn" title="最小化（Alt+B）">▾</button>
        </div>
      </div>
      <div id="ab-row"></div>
      <div id="ab-toast" role="status" aria-live="polite"></div>
    </div>
  `;
  document.documentElement.appendChild(dock);

  const wrap   = dock.querySelector('#ab-wrap');
  const row    = dock.querySelector('#ab-row');
  const toggle = dock.querySelector('#ab-toggle');
  const dot    = dock.querySelector('#ab-dot');
  const timeEl = dock.querySelector('#ab-time');
  const toast  = dock.querySelector('#ab-toast');

  // 展开/收起
  dock.querySelector('#ab-min').addEventListener('click', minimize);
  toggle.addEventListener('click', expand);

  function minimize(){
    COLLAPSED = true;
    wrap.style.display = 'none';
    toggle.style.display = 'inline-flex';
    saveJSON(STORE_COLL, COLLAPSED);
  }
  function expand(){
    COLLAPSED = false;
    wrap.style.display = 'block';
    toggle.style.display = 'none';
    saveJSON(STORE_COLL, COLLAPSED);
  }
  if (COLLAPSED) minimize(); else expand();

  // 快捷键
  window.addEventListener('keydown', (e)=>{
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (e.code === 'KeyB') { e.preventDefault(); COLLAPSED ? expand() : minimize(); }
      if (e.code === 'KeyG') { e.preventDefault(); openConfig(); }
    }
  });

  // 地址配置
  dock.querySelector('#ab-gear').addEventListener('click', openConfig);
  function openConfig(){
    const current = { ...ADDRS };
    const lines = MODELS.map(m => `${m.key}=${current[m.key] || ''}`).join('\n');
    const msg = `按行编辑“模型=地址”，非法或留空将忽略：\n示例：DeepSeek V3.1=0xC20aC4Dc4188660cBF555448AF52694CA62b0734`;
    const text = prompt(msg, lines);
    if (text == null) return;
    const out = {};
    text.split('\n').forEach(line => {
      const i = line.indexOf('=');
      if (i <= 0) return;
      const key = line.slice(0, i).trim();
      const addr = line.slice(i + 1).trim();
      out[key] = addr;
    });
    ADDRS = { ...ADDRS, ...out };
    saveJSON(STORE_ADDRS, ADDRS);
    schedule(0); // 立即刷新一次
  }

  /** ===== 卡片创建（一次性） ===== */
  const cardsByKey = new Map();
  MODELS.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'ab-card';
    card.setAttribute('data-key', m.key);
    card.innerHTML = `
      <div class="ab-rank">—</div>
      <div class="ab-delta" style="display:none"></div>
      <div class="ab-icon" title="点击复制地址">${m.badge}</div>
      <div class="ab-body">
        <div class="ab-name">${m.key}</div>
        <div class="ab-val"><span class="skeleton"></span></div>
        <div class="ab-sub"><span class="skeleton" style="width:90px;"></span></div>
      </div>
    `;
    row.appendChild(card);
    cardsByKey.set(m.key, card);

    // 复制地址
    card.querySelector('.ab-icon').addEventListener('click', async ()=>{
      const addr = ADDRRSafe(ADDRS[m.key]);
      if (!addr) { showToast('未配置地址'); return; }
      try {
        if (typeof GM_setClipboard === 'function') GM_setClipboard(addr);
        else await navigator.clipboard.writeText(addr);
        showToast('地址已复制');
      } catch { showToast('复制失败'); }
    });
  });

  /** ===== 数据拉取 & 退避调度 ===== */
  let intervalMs = BASE_INTERVAL_MS;
  let lastSuccess = 0;
  let timer = null;
  let lastOrder = MODELS.map(m=>m.key);
  const lastValueMap = new Map(); // 用于涨跌闪烁

  function schedule(delay) {
    if (timer) clearTimeout(timer);
    const jitter = (Math.random()*2-1) * JITTER_MS;
    timer = setTimeout(tick, Math.max(0, (delay ?? intervalMs) + jitter));
  }

  function setStatus(ok) {
    const now = Date.now();
    if (ok) lastSuccess = now;
    const stale = (now - lastSuccess) > FRESH_THRESH_MS;
    dot.className = 'ab-dot ' + (ok ? (stale ? 'ab-warn' : 'ab-live') : 'ab-dead');
    timeEl.textContent = ok ? (stale ? 'Stale' : ('更新 ' + fmtTime(now))) : 'Error';
  }

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
      const resp = await gmPostJson('https://api.hyperliquid.xyz/info', { type: 'clearinghouseState', user: address, dex: '' });
      const v = resp?.marginSummary?.accountValue || resp?.crossMarginSummary?.accountValue;
      const num = v ? parseFloat(v) : NaN;
      return Number.isFinite(num) ? num : null;
    } catch { return null; }
  }

  async function tick() {
    try {
      const results = await Promise.all(MODELS.map(async m=>{
        const addr = ADDRRSafe(ADDRS[m.key]);
        const val = await fetchAccountValue(addr);
        return { key: m.key, badge: m.badge, addr, value: val };
      }));
      render(results);
      setStatus(true);
      intervalMs = BASE_INTERVAL_MS; // 成功则重置退避
      schedule();
    } catch (e) {
      setStatus(false);
      intervalMs = Math.min(MAX_INTERVAL_MS, Math.ceil(intervalMs * 1.7));
      schedule();
    }
  }

  /** ===== 渲染（FLIP 动画 + 涨跌闪烁） ===== */
  function render(items) {
    // 排名
    items.sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));
    const newOrder = items.map(i=>i.key);

    // 记录旧位置
    const firstRects = new Map();
    items.forEach(i=>{
      const el = cardsByKey.get(i.key);
      firstRects.set(i.key, el.getBoundingClientRect());
    });

    // 更新内容
    items.forEach((it, idx)=>{
      const el = cardsByKey.get(it.key);
      el.querySelector('.ab-rank').textContent = (idx+1);

      // 位次变化徽标
      const delta = lastOrder.indexOf(it.key) - idx;
      const dEl = el.querySelector('.ab-delta');
      if (delta > 0) { dEl.textContent = '▲'+delta; dEl.className = 'ab-delta up'; dEl.style.display=''; }
      else if (delta < 0) { dEl.textContent = '▼'+(-delta); dEl.className = 'ab-delta down'; dEl.style.display=''; }
      else { dEl.style.display='none'; }

      // 数值 & PnL
      const valEl = el.querySelector('.ab-val');
      const subEl = el.querySelector('.ab-sub');
      if (it.value == null) {
        valEl.innerHTML = '<span class="skeleton" style="width:120px;"></span>';
        subEl.textContent = it.addr ? '暂不可用' : '地址未配置';
      } else {
        const prev = lastValueMap.get(it.key);
        valEl.textContent = fmtUSD(it.value);
        const pnl = it.value - INITIAL_CAPITAL;
        const pct = pnl / INITIAL_CAPITAL;
        subEl.innerHTML = `PnL <span class="${pnl>=0?'pos':'neg'}">${fmtUSD(pnl)} · ${fmtPct(pct)}</span>`;

        // 涨跌闪烁
        if (typeof prev === 'number' && prev !== it.value) {
          el.classList.remove('flash-up','flash-down');
          void el.offsetWidth; // reflow
          el.classList.add(prev < it.value ? 'flash-up' : 'flash-down');
          setTimeout(()=>el.classList.remove('flash-up','flash-down'), 260);
        }
        lastValueMap.set(it.key, it.value);
      }
    });

    // 根据新排序重排 DOM（FLIP）
    const els = items.map(i=>cardsByKey.get(i.key));
    // 计算位移前后的差
    const lastRects = new Map();
    els.forEach(el=>{
      const key = el.getAttribute('data-key');
      lastRects.set(key, firstRects.get(key));
    });
    // 实际重排
    els.forEach((el, i)=> row.appendChild(el));

    // 做 FLIP 动画
    els.forEach(el=>{
      const key = el.getAttribute('data-key');
      const first = lastRects.get(key);
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top  - last.top;
      if (dx || dy) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect(); // 强制 reflow
        el.style.transition = 'transform 250ms ease';
        el.style.transform = '';
        el.addEventListener('transitionend', ()=>{ el.style.transition=''; }, { once:true });
      }
    });

    lastOrder = newOrder;
  }

  /** ===== 工具函数 ===== */
  function ADDRRSafe(addr) { return typeof addr === 'string' ? addr.trim() : ''; }
  function loadJSON(k, fallback){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch{ return fallback; } }
  function saveJSON(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch{} }
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

  /** ===== 启动 ===== */
  schedule(0);
})();
