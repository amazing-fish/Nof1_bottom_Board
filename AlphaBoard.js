// ==UserScript==
// @name         Alpha Board（链上盈利数据展示/底部横排暂时/可隐藏/柔和玻璃）
// @namespace    https://greasyfork.org/zh-CN/users/1211909-amazing-fish
// @version      1.0.2
// @description  链上实时账户看板 · 默认最小化 · 按模型独立退避 · 轻量玻璃态 UI · 低饱和 P&L · 横排 6 卡片并展示相对更新时间
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      api.hyperliquid.xyz
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /**
   * Alpha Board 1.0.2
   * ------------------
   *  - 针对多模型地址的链上账户价值聚合看板
   *  - 以 Hyperliquid API 为数据源，独立退避拉取、无本地持久化
   *  - 默认最小化，支持标题点击折叠，卡片横向排列并带相对时间
   *  - 轻量玻璃态视觉 + 低饱和红/绿提示，适合常驻屏幕
   */

  /** ===== 常量与默认（无记忆） ===== */
  const INITIAL_CAPITAL = 10000;     // 账户价值基准，用于计算 PnL
  const FRESH_THRESH_MS = 15000;     // 顶栏“Stale” 阈值
  const JITTER_MS = 250;             // 轮询轻微抖动，避免同时请求
  const BACKOFF_STEPS = [3000, 5000, 8000, 12000]; // 网络失败退避梯度
  let   COLLAPSED = true;            // 默认以折叠状态启动

  // 默认地址列表：直接在此修改即可，不会弹窗也不写本地存储
  const ADDRS = {
    'GPT-5': '0x67293D914eAFb26878534571add81F6Bd2D9fE06',
    'Gemini 2.5 Pro': '0x1b7A7D099a670256207a30dD0AE13D35f278010f',
    'Claude Sonnet 4.5': '0x59fA085d106541A834017b97060bcBBb0aa82869',
    'Grok-4': '0x56D652e62998251b56C8398FB11fcFe464c08F84',
    'DeepSeek V3.1': '0xC20aC4Dc4188660cBF555448AF52694CA62b0734',
    'Qwen3-Max': '0x7a8fd8bba33e37361ca6b0cb4518a44681bad2f3'
  };

  // 模型清单，用于确定卡片顺序与徽章缩写
  const MODELS = [
    { key: 'GPT-5', badge: 'GPT' },
    { key: 'Gemini 2.5 Pro', badge: 'GEM' },
    { key: 'Claude Sonnet 4.5', badge: 'CLD' },
    { key: 'Grok-4', badge: 'GRK' },
    { key: 'DeepSeek V3.1', badge: 'DSK' },
    { key: 'Qwen3-Max', badge: 'QWN' },
  ];

  /** ===== 玻璃态 + 透明度优化样式（更透、更克制） ===== */
  // 所有视觉样式集中在一处，方便微调颜色、透明度或布局。
  GM_addStyle(`
    #ab-dock {
      position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
                   Roboto,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC", Arial;
      color-scheme: dark;
      --gap: 8px; --radius: 14px;
      --pY: 8px; --pX: 12px; --icon: 29px;
      --fsName: 10px; --fsVal: 13.5px; --fsSub: 11px;

      /* ↓↓↓ 更低存在感的玻璃态（降低 blur / saturate / 亮度） ↓↓↓ */
      --bg: rgba(12,14,18,0.26);
      --bg2: rgba(12,14,18,0.12);
      --card: rgba(18,21,28,0.28);
      --card-hover: rgba(26,30,38,0.38);
      --brd: rgba(255,255,255,0.10);
      --soft: rgba(255,255,255,0.08);
      --shadow: 0 12px 30px rgba(0,0,0,0.2);

      /* ↓↓↓ 低饱和柔和绿/红（P&L + 状态点 + 闪烁） ↓↓↓ */
      --green: rgb(204,255,216);
      --red:   rgb(255,215,213);
      --blue:  #60a5fa;
      --text:  #e6e8ee;
    }

    /* 展开按钮：更透、轻玻璃 */
    #ab-toggle {
      pointer-events: auto;
      display: inline-flex;
      align-items:center; gap:6px;
      padding:5px 9px; border-radius:11px;
      background: rgba(18,21,28,0.24);
      border:1px solid rgba(255,255,255,0.10); color:var(--text); font-weight:600; font-size:11px; letter-spacing:.3px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.22);
      cursor: pointer; user-select: none;
      backdrop-filter: saturate(0.75) blur(3px);
      transition: background .2s ease, border-color .2s ease, transform .15s ease;
    }
    #ab-toggle:hover { background: rgba(22,25,34,0.32); border-color: rgba(255,255,255,0.16); transform: translateY(-1px); }

    /* 面板主体：更透、少 blur、少 saturate */
    #ab-wrap {
      pointer-events: auto;
      display: none;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008)) ,
        radial-gradient(140% 160% at 0% 100%, rgba(96,165,250,0.05), transparent 60%) ,
        var(--bg);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 16px;
      padding: 8px 12px 10px;
      box-shadow: 0 14px 30px rgba(0,0,0,0.24);
      max-width: min(96vw, 1280px);
      backdrop-filter: saturate(0.75) blur(3px);
      overflow: visible;
    }

    #ab-dock.ab-expanded #ab-toggle { display: none; }
    #ab-dock.ab-expanded #ab-wrap { display: block; }
    #ab-dock.ab-collapsed #ab-toggle { display: inline-flex; }
    #ab-dock.ab-collapsed #ab-wrap { display: none; }

    #ab-topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; padding:2px 0; }
    #ab-left { display:flex; align-items:center; gap:8px; }
    #ab-title { color:#f7faff; font-size:11px; font-weight:700; letter-spacing:.35px; cursor: pointer; text-transform: uppercase; text-shadow: 0 0 8px rgba(0,0,0,0.35); }
    #ab-status { display:flex; align-items:center; gap:6px; font-size:10.5px; color:#f0f4ff; letter-spacing:.25px; text-shadow: 0 0 8px rgba(0,0,0,0.32); font-weight:500; }
    .ab-dot { width:8px; height:8px; border-radius:50%; background:#9ca3af; }
    .ab-live  { background: var(--green); box-shadow: 0 0 10px color-mix(in srgb, var(--green) 35%, transparent); }
    .ab-warn  { background: #f59e0b;   box-shadow: 0 0 10px rgba(245,158,11,0.30); }
    .ab-dead  { background: var(--red); box-shadow: 0 0 10px color-mix(in srgb, var(--red) 35%, transparent); }

    #ab-link {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 8px;
      color: #f5f7ff;
      text-decoration: none;
      background: rgba(255,255,255,0.05);
      border: 1px solid transparent;
      transition: background .2s ease, border-color .2s ease, transform .15s ease;
    }
    #ab-link:hover {
      background: rgba(255,255,255,0.10);
      border-color: rgba(255,255,255,0.12);
      transform: translateY(-1px);
    }
    #ab-link svg { width: 14px; height: 14px; fill: currentColor; }

    /* 横向一行 + 滚动 */
    #ab-row-viewport {
      position: relative;
      overflow-x: auto;
      overflow-y: visible;
      scrollbar-width: thin;
      max-width: min(96vw, 1280px);
      padding: 0 12px 10px 12px;
      margin: 0;
    }
    #ab-row-viewport::-webkit-scrollbar { height: 6px; }
    #ab-row-viewport::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }

    #ab-row {
      display:flex;
      flex-wrap: nowrap;
      gap: var(--gap);
      padding-right: 8px;
    }

    .ab-card {
      flex: 0 0 auto;
      min-width: 176px; max-width: 240px;
      position: relative; display:flex; align-items:flex-start; gap:10px;
      padding: var(--pY) var(--pX);
      background: linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: var(--radius);
      transition: transform 220ms ease, box-shadow 220ms ease, background 160ms ease, border-color 160ms ease;
      will-change: transform;
      box-shadow: none;
    }
    .ab-card:hover {
      background: linear-gradient(155deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));
      border-color: rgba(255,255,255,0.16);
      box-shadow: 0 10px 24px rgba(0,0,0,0.26);
      transform: translateY(-1px);
    }

    .ab-icon {
      width: var(--icon); height: var(--icon);
      border-radius: 9px; display:grid; place-items:center;
      font-weight:700; font-size:10px; letter-spacing:.5px; color:#10131a;
      background: rgba(248,251,255,0.58);
      border: 1px solid rgba(255,255,255,0.28); user-select:none; cursor: pointer;
      box-shadow: 0 6px 16px rgba(0,0,0,0.22);
      backdrop-filter: blur(6px) saturate(1.1);
      transition: background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
    }
    .ab-icon:hover { background: rgba(255,255,255,0.82); border-color: rgba(255,255,255,0.42); box-shadow: 0 10px 20px rgba(0,0,0,0.28); }
    .ab-icon:active { transform: scale(0.96); }
    .ab-body { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .ab-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .ab-name { font-size: var(--fsName); color:#f7faff; font-weight:600; letter-spacing:.24px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow: 0 0 6px rgba(0,0,0,0.32); }
    .ab-time { font-size:10px; color:#eef3ff; letter-spacing:.25px; white-space:nowrap; font-weight:500; text-shadow: 0 0 6px rgba(0,0,0,0.30); }
    .ab-val  { font-size: var(--fsVal);  color:#f9fbff; font-weight:700; letter-spacing:.3px; font-variant-numeric: tabular-nums; text-shadow: 0 0 6px rgba(0,0,0,0.28); }
    .ab-sub  { font-size: var(--fsSub);  color:#a4afc0; font-variant-numeric: tabular-nums; }

    /* ↓ P&L 低饱和绿/红 */
    .ab-sub .pos { color: color-mix(in srgb, var(--green) 82%, #d1fae5); }
    .ab-sub .neg { color: color-mix(in srgb, var(--red) 82%,   #fee2e2); }

    /* 涨跌闪烁（进一步降低透明度与冲击感） */
    @media (prefers-reduced-motion: no-preference) {
      .flash-up   { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--green) 18%, transparent); }
      .flash-down { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--red)   18%, transparent); }
    }

    /* 骨架占位 */
    .skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.05) 65%);
      background-size: 400% 100%;
      animation: ab-shimmer 1.2s ease-in-out infinite;
      border-radius: 999px; height: 10px; width: 120px; opacity: .6;
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
  // 创建挂载点与初始骨架，配合 toggle/title 控制展示状态。
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
        <a
          id="ab-link"
          href="https://nof1.ai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开 Nof1.ai（新窗口）"
          title="打开 Nof1.ai（新窗口）"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 112 0v3a4 4 0 01-4 4H5a4 4 0 01-4-4V6a4 4 0 014-4h3a1 1 0 110 2H5z" />
            <path d="M9 3a1 1 0 011-1h7a1 1 0 011 1v7a1 1 0 11-2 0V5.414l-8.293 8.293a1 1 0 11-1.414-1.414L14.586 4H10a1 1 0 01-1-1z" />
          </svg>
        </a>
      </div>
      <div id="ab-row-viewport">
        <div id="ab-row"></div>
      </div>
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
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('aria-controls', 'ab-wrap');
  toggle.setAttribute('tabindex', '0');
  title.setAttribute('role', 'button');
  title.setAttribute('tabindex', '0');
  title.setAttribute('aria-controls', 'ab-wrap');

  function applyCollapseState(){
    if (COLLAPSED) {
      dock.classList.add('ab-collapsed');
      dock.classList.remove('ab-expanded');
      toggle.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'false');
      title.setAttribute('aria-expanded', 'false');
      wrap.setAttribute('aria-hidden', 'true');
    } else {
      dock.classList.add('ab-expanded');
      dock.classList.remove('ab-collapsed');
      toggle.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'true');
      title.setAttribute('aria-expanded', 'true');
      wrap.setAttribute('aria-hidden', 'false');
    }
  }
  function minimize(){ COLLAPSED = true;  applyCollapseState(); }
  function expand()  { COLLAPSED = false; applyCollapseState(); }
  toggle.addEventListener('click', expand);
  toggle.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      expand();
    }
  });
  title.addEventListener('click',  minimize);
  title.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      minimize();
    }
  });
  minimize();

  /** ===== 状态与卡片 ===== */
  const state = new Map();              // key -> { value, addr, ts }
  const cardsByKey = new Map();         // key -> card DOM 节点
  const timeDisplays = new Map();       // key -> 时间显示 DOM
  let   lastOrder = MODELS.map(m=>m.key); // 保留历史顺序以便未来做最小化动画
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
        <div class="ab-head">
          <div class="ab-name" title="${m.key}">${m.key}</div>
          <div class="ab-time"><span class="skeleton" style="width:54px;"></span></div>
        </div>
        <div class="ab-val"><span class="skeleton"></span></div>
        <div class="ab-sub"><span class="skeleton" style="width:90px;"></span></div>
      </div>
    `;
    row.appendChild(card);
    cardsByKey.set(m.key, card);

    // 初始状态：为每张卡片记住地址和时间显示节点
    state.set(m.key, { value: null, addr: ADDRRSafe(ADDRS[m.key]), ts: 0 });
    timeDisplays.set(m.key, card.querySelector('.ab-time'));

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

  refreshCardTimes();

  /** ===== 网络层 ===== */
  /**
   * 以 GM_xmlhttpRequest POST JSON，统一处理超时/异常。
   * @param {string} url
   * @param {object} data
   * @returns {Promise<any>}
   */
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

  /**
   * 拉取地址的账户价值，优先读取逐仓/全仓字段，异常时返回 null。
   * @param {string} address
   * @returns {Promise<number|null>}
   */
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

  /**
   * 为指定模型启动独立轮询：成功时重置退避，失败时升级退避。
   * @param {string} mkey
   */
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
  /**
   * 更新单个模型卡片的文案、排序及动画效果。
   * @param {string} mkey
   * @param {number|null} value
   */
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
      subEl.textContent = s.addr ? '等待数据…' : '地址未配置';
      s.ts = 0;
    } else {
      const prev = lastValueMap.get(mkey);
      valEl.textContent = fmtUSD(value);
      const pnl = value - INITIAL_CAPITAL;
      const pct = pnl / INITIAL_CAPITAL;
      subEl.innerHTML = `PnL <span class="${pnl>=0?'pos':'neg'}">${fmtUSD(pnl)} · ${fmtPct(pct)}</span>`;
      s.ts = Date.now();

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
    refreshCardTimes();
  }

  /** ===== 顶栏状态：Live / Stale / Dead ===== */
  /**
   * 刷新顶栏状态点及文字，反映最新网络健康情况。
   */
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
  /**
   * 刷新卡片上的相对时间显示。
   */
  function refreshCardTimes(){
    const now = Date.now();
    timeDisplays.forEach((el, key)=>{
      if (!el) return;
      const s = state.get(key);
      if (!s) return;
      if (!s.addr) { el.textContent = '未配置'; return; }
      if (!s.ts) { el.textContent = '等待数据'; return; }
      el.textContent = fmtSince(s.ts, now);
    });
  }
  // 轻量 UI 刷新：仅更新文本与状态点，不追加网络请求
  setInterval(()=>{ updateStatus(); refreshCardTimes(); }, 1000);

  /** ===== 工具函数 ===== */
  /** 清洗地址字符串，避免 undefined/null */
  function ADDRRSafe(addr) { return typeof addr === 'string' ? addr.trim() : ''; }
  /** 统一格式化 USD 文案 */
  function fmtUSD(n){ return n==null ? '—' : '$' + n.toLocaleString(undefined,{maximumFractionDigits:2}); }
  /** 输出带正负号的百分比 */
  function fmtPct(n){ return n==null ? '—' : ((n>=0?'+':'') + (n*100).toFixed(2) + '%'); }
  /**
   * 根据时间戳生成中文相对时间。
   * @param {number} ts
   * @param {number} [now]
   */
  function fmtSince(ts, now = Date.now()){
    const diff = Math.max(0, now - ts);
    if (diff < 5000) return '刚刚';
    if (diff < 60000) return Math.floor(diff/1000) + ' 秒前';
    if (diff < 3600000) return Math.floor(diff/60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff/3600000) + ' 小时前';
    return Math.floor(diff/86400000) + ' 天前';
  }
  /** HH:MM:SS 形式的绝对时间 */
  function fmtTime(ts){
    const d=new Date(ts); const p=n=>n<10?'0'+n:n;
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  /**
   * 统一的轻量提示气泡。
   * @param {string} msg
   */
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toast.classList.remove('show'), 1200);
  }
})();
