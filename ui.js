/* ============================================================
 * 冒险村物语 - HTML 模态 UI（覆盖在 canvas 上，逻辑坐标 1920x1080）
 * 依赖 game.js 的 window.__VILLAGE 调试钩子
 * ============================================================ */
(function () {
  'use strict';
  const V = window.__VILLAGE;
  if (!V) return;
  const C = V.Content, S = V.S;
  const root = document.getElementById('uiRoot');
  if (!root) return;

  const SPDS = ['⏸', '▶', '⏩', '⏭'];
  const SPD_TIP = ['暂停', '正常', '快速', '飞快'];

  /* ---------- DOM 工具 ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function btn(label, cls, cb) {
    const b = el('button', cls || 'ui-btn', label);
    b.onclick = cb;
    return b;
  }

  /* ============ 顶部 HUD ============ */
  let hudEl = null;
  function buildHud() {
    const hud = el('div', '', '');
    hud.id = 'hud';
    hudEl = hud;
    hud.innerHTML =
      '<div class="group">' +
      '<span class="res gold">💰 <span id="hGold">0</span></span>' +
      '<span class="res rep">⭐ <span id="hRep">0</span></span>' +
      '<span class="res misc" id="hDay">第 1 天 8:00</span>' +
      '<span class="res adv">👥 <span id="hAdv">0</span> 冒险者</span>' +
      '<span class="res misc">🏡 <span id="hBld">0</span> · 🛣️ <span id="hRoad">0</span></span>' +
      '</div>' +
      '<div class="btns">' +
      '<div class="spd" id="spdBox"></div>' +
      '<button id="btnBuild" class="ui-btn">🏗️ 建造</button>' +
      '<button id="btnLog" class="ui-btn">📜 日志</button>' +
      '<button id="btnHelp" class="ui-btn">❓ 帮助</button>' +
      '<button id="btnSet" class="ui-btn">⚙ 设置</button>' +
      '</div>';
    root.appendChild(hud);

    const spdBox = document.getElementById('spdBox');
    for (let i = 0; i < 4; i++) {
      const b = el('button', i === S.speed ? 'on' : '', SPDS[i]);
      b.title = SPD_TIP[i];
      b.onclick = (n => () => V.setSpeed(n))(i);
      spdBox.appendChild(b);
    }
    document.getElementById('btnBuild').onclick = () => openModal('build');
    document.getElementById('btnLog').onclick = () => openModal('log');
    document.getElementById('btnHelp').onclick = () => openModal('help');
    document.getElementById('btnSet').onclick = () => openModal('set');
  }

  /* ============ 放置模式提示条 ============ */
  let placeBar = null;
  function buildPlaceBar() {
    placeBar = el('div', '', '');
    placeBar.id = 'placeBar';
    placeBar.innerHTML = '<span class="tip" id="placeTip"></span>' +
      '<button class="ui-btn danger" id="placeCancel">✕ 取消</button>';
    root.appendChild(placeBar);
    document.getElementById('placeCancel').onclick = () => V.cancelPlaceMode();
  }

  /* ============ 模态系统 ============ */
  let mask = null;
  let curModal = null;
  function buildModalSystem() {
    mask = el('div', '', '');
    mask.id = 'modalMask';
    mask.onclick = e => { if (e.target === mask) closeModal(); };
    root.appendChild(mask);
  }
  function openModal(kind) {
    if (S.screen !== 'game') return;
    curModal = kind;
    mask.innerHTML = '';
    if (kind === 'build') renderBuildModal();
    else if (kind === 'log') renderLogModal();
    else if (kind === 'help') renderHelpModal();
    else if (kind === 'set') renderSetModal();
    mask.classList.add('open');
  }
  function closeModal() {
    mask.classList.remove('open');
    mask.innerHTML = '';
    curModal = null;
  }
  function modalHead(title) {
    const h = el('div', 'modal-head',
      '<h2>' + title + '</h2><button class="modal-close">✕</button>');
    h.querySelector('.modal-close').onclick = closeModal;
    return h;
  }
  function bodyBox(children) {
    const b = el('div', 'modal-body', '');
    if (children) for (const c of children) b.appendChild(c);
    return b;
  }

  /* ============ 建造模态（卡片化） ============ */
  let buildTab = 'build';
  function renderBuildModal() {
    const m = el('div', 'modal', '');
    m.appendChild(modalHead('🏗️ 建造'));
    const tabs = el('div', 'modal-tabs', '');
    const defs = [
      { t: 'build', label: '🏠 建筑' },
      { t: 'decor', label: '🌳 装饰' },
      { t: 'tool', label: '🛠 工具' },
    ];
    for (const d of defs) {
      const b = el('button', d.t === buildTab ? 'on' : '', d.label);
      b.onclick = () => { buildTab = d.t; renderBuildBody(m); };
      tabs.appendChild(b);
    }
    m.appendChild(tabs);
    m.appendChild(bodyBox());
    mask.appendChild(m);
    renderBuildBody(m);
  }
  function renderBuildBody(m) {
    const body = m.querySelector('.modal-body');
    body.innerHTML = '';
    if (buildTab === 'build') {
      const grid = el('div', 'card-grid', '');
      const FX = {
        inn: '住宿回满血·消疲劳（牧师会治队友）',
        tavern: '心情+15',
        weapon: '攻击永久+1',
        shop: '回复20血',
        bakery: '回复15血·心情+8',
        magicshop: '心情+12·法师攻+1',
        training: '攻击+2·防御+1（疲劳+15）',
        clinic: '直接满血',
        castle: '心情+25·满血·攻防+1',
        farm: '必须有农田玩种菜：冒险者自种自收原地变富',
        seedshop: '卖种子给冒险者·高价回收作物（抽成赚钱）',
      };
      for (const key of Object.keys(C.BUILD_DEFS)) {
        const def = C.BUILD_DEFS[key];
        const cost = V.buildingCost(key);
        const built = S.buildings.filter(b => b.type === key);
        const afford = S.gold >= cost;
        const card = el('div', 'bcard' + (afford ? '' : ' poor'), '');
        card.dataset.key = key;
        card.dataset.kind = 'b';
        card.innerHTML =
          '<div class="thumb">' + (V.IMG_SRC[key] ? '<img src="' + V.IMG_SRC[key] + '">' : '<div class="emoji">' + def.icon + '</div>') + '</div>' +
          '<div class="nm">' + def.icon + ' ' + def.name + '</div>' +
          '<div class="cost">' + cost + ' 💰</div>' +
          '<div class="fx">' + (FX[key] || def.desc) + '</div>' +
          '<div class="stat">' + (built.length ? '已建 ' + built.length + ' 座 · Lv' + built.map(b => b.level).join('/') : '2×2 空地') + '</div>';
        if (key === 'farm') {
          // farm 四角编辑入口：打开 farm_fit.html 调整贴图四角（同源 8090，localStorage 与游戏共享）
          const editBtn = el('button', 'editBtn', '✏️ 编辑四角');
          editBtn.onclick = (e) => {
            e.stopPropagation();
            window.open('http://localhost:8090/farm_fit.html', '_blank');
          };
          card.appendChild(editBtn);
        }
        // 平铺自适应地块勾选（默认不勾；勾了把"平的等距图"自适应贴到菱形地块）
        const fitRow = el('label', 'fitRow', '');
        const cbI = document.createElement('input');
        cbI.type = 'checkbox';
        cbI.checked = !!S.flatFit[key];
        cbI.onclick = (e) => e.stopPropagation();
        cbI.onchange = () => {
          S.flatFit[key] = cbI.checked;
          try { localStorage.setItem('flatFit', JSON.stringify(S.flatFit)); } catch (e) {}
          S.toast = { msg: (cbI.checked ? '✔ 已启用' : '✘ 已关闭') + def.name + ' 平铺贴地', type: 'info', t: performance.now() };
        };
        fitRow.appendChild(cbI);
        fitRow.appendChild(document.createTextNode(' 平铺贴地'));
        card.appendChild(fitRow);
        card.onclick = () => {
          if (S.gold < cost) return;
          V.setPlaceMode('building', key);
          closeModal();
        };
        grid.appendChild(card);
      }
      body.appendChild(grid);
    } else if (buildTab === 'decor') {
      const grid = el('div', 'card-grid', '');
      for (const key of Object.keys(C.DECOR_DEFS)) {
        const def = C.DECOR_DEFS[key];
        const imgKey = def.img || key;
        const afford = S.gold >= def.cost;
        const count = S.decors.filter(d => d.img === imgKey).length;
        const card = el('div', 'bcard' + (afford ? '' : ' poor'), '');
        card.dataset.key = key;
        card.dataset.kind = 'd';
        card.innerHTML =
          '<div class="thumb">' + (V.IMG_SRC[imgKey] ? '<img src="' + V.IMG_SRC[imgKey] + '">' : '<div class="emoji">' + def.icon + '</div>') + '</div>' +
          '<div class="nm">' + def.icon + ' ' + def.name + '</div>' +
          '<div class="cost">' + def.cost + ' 💰</div>' +
          '<div class="fx">' + def.desc + '</div>' +
          '<div class="stat">' + (count ? '已放 ' + count + ' 个' : '1×1 放置') + '</div>';
        card.onclick = () => {
          if (S.gold < def.cost) return;
          V.setPlaceMode('decor', imgKey);
          closeModal();
        };
        grid.appendChild(card);
      }
      body.appendChild(grid);
    } else {
      const tc = el('div', 'tool-card', '');
      const tools = [
        { ti: '🛣️', tn: '铺路', td: '5 💰/格 · 点击地图连续铺设', mode: 'road' },
        { ti: '🧹', tn: '拆除', td: '移除道路/装饰/建筑（建筑返还 50%）', mode: 'demolish' },
      ];
      for (const t of tools) {
        const c = el('div', 'tool', '');
        c.innerHTML = '<div class="ti">' + t.ti + '</div><div class="tn">' + t.tn + '</div><div class="td">' + t.td + '</div>';
        c.onclick = () => { V.setPlaceMode(t.mode); closeModal(); };
        tc.appendChild(c);
      }
      body.appendChild(tc);
    }
  }

  /* ============ 日志模态 ============ */
  function renderLogModal() {
    const m = el('div', 'modal', '');
    m.appendChild(modalHead('📜 村庄日志'));
    const b = bodyBox();
    if (S.log.length === 0) b.appendChild(el('div', 'log-line info', '暂无日志'));
    for (const ev of S.log) {
      b.appendChild(el('div', 'log-line ' + (ev.type || 'info'), ev.msg));
    }
    m.appendChild(b);
    mask.appendChild(m);
  }

  /* ============ 帮助模态 ============ */
  function renderHelpModal() {
    const lines = [
      '<b>冒险村物语</b> · 开罗风格 2.5D 等距村庄经营',
      '',
      '· <b>道路</b>、<b>建筑</b>、<b>装饰</b> 全部自由规划，没有固定槽位',
      '· 冒险者只走道路：用铺路把村口、建筑、野外连起来',
      '· 建筑占 2×2 格（村内），道路/装饰占 1×1 格',
      '· 铺路可连续点击；放建筑有绿色/红色预览',
      '· 拆除模式可移除道路/装饰/建筑（建筑返还 50%）',
      '· 冒险者自动去设施消费赚钱，去野外打怪升级',
      '· <b>农场</b>周边会形成农田：冒险者买种子→种地→收菜→卖回商店',
      '· 蔬菜按<span class="warn">不同种子收益</span>定价：白菜🥬 < 胡萝卜🥕 < 小麦🌾 < 南瓜🎃 < 人参🌿',
      '· 野外有史莱姆/哥布林/蝙蝠，还有稀有的史莱姆王 Boss！',
      '· 声望提升会吸引更多冒险者进村',
      '· 点击建筑可升级（非放置模式）',
    ];
    const m = el('div', 'modal', '');
    m.appendChild(modalHead('📖 玩法说明'));
    const b = bodyBox();
    for (const l of lines) b.appendChild(el('div', 'help-line', l));
    m.appendChild(b);
    mask.appendChild(m);
  }

  /* ============ 设置模态 ============ */
  function renderSetModal() {
    const m = el('div', 'modal', '');
    m.appendChild(modalHead('⚙ 设置'));
    const b = bodyBox();

    const spdRow = el('div', 'set-row', '<span class="lb">⏱ 游戏速度</span>');
    for (let i = 0; i < 4; i++) {
      const bb = btn(SPDS[i] + ' ' + SPD_TIP[i], 'ui-btn' + (i === S.speed ? ' active' : ''),
        (n => () => { V.setSpeed(n); closeModal(); })(i));
      spdRow.appendChild(bb);
    }
    b.appendChild(spdRow);

    const dbgRow = el('div', 'set-row', '<span class="lb">📐 对齐辅助线</span>');
    const dbgB = btn(S.debugBuildingBase ? '开（点按关闭）' : '关（点按开启）', 'ui-btn', () => {
      V.toggleDebug();
      dbgB.textContent = S.debugBuildingBase ? '开（点按关闭）' : '关（点按开启）';
    });
    dbgRow.appendChild(dbgB);
    b.appendChild(dbgRow);

    const rstRow = el('div', 'set-row', '<span class="lb">🔄 重新开始</span>');
    rstRow.appendChild(btn('重开一局', 'ui-btn danger', () => {
      if (confirm('确定重新开始经营村庄吗？')) {
        V.newGame();
        closeModal();
      }
    }));
    b.appendChild(rstRow);

    m.appendChild(b);
    mask.appendChild(m);
  }

  /* ============ DOM Toast（替换 canvas toast） ============ */
  let domToast = null;
  function buildToast() {
    domToast = el('div', '', '');
    domToast.id = 'domToast';
    root.appendChild(domToast);
  }
  function refreshToast() {
    if (!S.toast) {
      if (domToast.style.display !== 'none') domToast.style.display = 'none';
      return;
    }
    const dt = performance.now() - S.toast.t;
    if (dt > 2400) { S.toast = null; return; }
    domToast.textContent = S.toast.msg;
    domToast.className = S.toast.type === 'good' ? 'good' : S.toast.type === 'warn' ? 'warn' : '';
    domToast.style.display = 'block';
  }

  /* ============ 周期刷新 ============ */
  const PLACE_TIP = {
    building: () => '🏗️ 放置 ' + (C.BUILD_DEFS[S.selectedBuild] ? C.BUILD_DEFS[S.selectedBuild].name : '') + ' —— 点击地图放置（绿=可放）',
    decor: () => '🌳 放置 ' + (C.DECOR_DEFS[S.selectedDecor] ? C.DECOR_DEFS[S.selectedDecor].name : '') + ' —— 点击地图放置',
    road: () => '🛣️ 铺路中 —— 点击地图连续铺设',
    demolish: () => '🧹 拆除中 —— 点击要移除的道路/装饰/建筑',
  };
  function refresh() {
    hudEl.style.display = S.screen === 'game' ? 'flex' : 'none';
    placeBar.style.display = 'none';
    if (S.screen !== 'game') return;
    document.getElementById('hGold').textContent = V.fmt(S.gold);
    document.getElementById('hRep').textContent = S.reputation;
    const t = Math.floor(S.time);
    const m = String(Math.floor((S.time % 1) * 60)).padStart(2, '0');
    document.getElementById('hDay').textContent = '第 ' + S.day + ' 天 ' + t + ':' + m;
    document.getElementById('hAdv').textContent = S.adventurers.length;
    document.getElementById('hBld').textContent = S.buildings.length;
    document.getElementById('hRoad').textContent = S.roads.size;
    const spdBox = document.getElementById('spdBox');
    if (spdBox) {
      const bs = spdBox.children;
      for (let i = 0; i < 4; i++) bs[i].className = i === S.speed ? 'on' : '';
    }
    document.getElementById('btnBuild').className = 'ui-btn' + (S.placeMode ? ' active' : '');
    if (S.placeMode && PLACE_TIP[S.placeMode]) {
      placeBar.style.display = 'flex';
      document.getElementById('placeTip').textContent = PLACE_TIP[S.placeMode]();
    } else {
      placeBar.style.display = 'none';
    }
    // 建造模态内卡片可用性/数量实时刷新
    if (curModal === 'build') {
      const body = mask.querySelector('.modal-body');
      if (body) {
        const cards = body.querySelectorAll('.bcard');
        for (const card of cards) {
          const key = card.dataset.key;
          if (!key) continue;
          const isB = card.dataset.kind === 'b';
          const cost = isB ? V.buildingCost(key) : (C.DECOR_DEFS[key] ? C.DECOR_DEFS[key].cost : 0);
          card.classList.toggle('poor', S.gold < cost);
          if (isB) {
            const built = S.buildings.filter(b => b.type === key);
            card.querySelector('.stat').textContent = built.length ? '已建 ' + built.length + ' 座 · Lv' + built.map(b => b.level).join('/') : '2×2 空地';
            card.querySelector('.cost').textContent = cost + ' 💰';
          }
        }
      }
    }
    refreshToast();
  }

  /* ---------- 启动 ---------- */
  buildHud();
  buildPlaceBar();
  buildModalSystem();
  buildToast();
  setInterval(refresh, 400);
})();
