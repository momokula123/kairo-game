/* 冒险村物语 - 开罗风格像素村庄经营模拟（引擎 + 内容分离版） */
(function () {
  'use strict';

  window.__VILLAGE_VERSION = 82;   // 版本标识：强刷后控制台/页面可见，用于排查缓存
  console.log('[冒险村物语] 版本 v' + window.__VILLAGE_VERSION);

  let W = 1728, H = 1080;   // 逻辑分辨率：默认 1728x1080，加载后按窗口铺满动态调整（setViewport）
  let gDt = 0;             // 每帧秒数（用于属性面板等倒计时）
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* ============ 引擎 / 内容 / 素材 模块 ============ */
  const C = window.Content;         // 内容配置（职业/建筑/装饰/怪物/名称）
  const Sp = window.Sprites;        // 素材模块（IMG / IMG_SRC / SpriteKit / loadAssets）
  const E = window.Engine;          // 引擎（实体工厂 / 场景管理器 / 等距投影）
  const { IMG, IMG_SRC, SpriteKit, loadAssets } = Sp;
  const {
    TILE_W, TILE_H, MAP_COLS, MAP_ROWS, MAP_OX, MAP_OY, WILD_GX, WILD_GY,
    rnd, rndi, clamp,
    gridToScreen, screenToGrid,
    SceneManager,
  } = E;
  // 实体工厂（稍后包装：创建时预热阴影缓存1）
  let makeBuilding = E.makeBuilding, makeAdventurer = E.makeAdventurer, makeSlime = E.makeSlime;

  /* ============ 相机（地图 85x85 可滚动查看）============ */
  const WORLD_W = (MAP_COLS + MAP_ROWS) * TILE_W / 2;       // 等距世界近似宽
  const WORLD_H = (MAP_COLS + MAP_ROWS) * TILE_H / 2 + TILE_H;
  const WORLD_MIN_X = MAP_OX - (MAP_COLS - 1) * TILE_W / 2;
  const camera = {
    x: 0, y: 0,   // 鼠标拖拽可滚动；初始聚焦中央保护区（newGame 时设置）
    minX: WORLD_MIN_X,
    maxX: WORLD_MIN_X + WORLD_W - W,
    minY: MAP_OY - TILE_H,
    maxY: MAP_OY + WORLD_H - H,
  };
  // 窗口铺满：画布=窗口，逻辑分辨率同步；相机边界随之更新
  function setViewport(w, h) {
    if (!w || !h) return;
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    camera.maxX = WORLD_MIN_X + WORLD_W - W;
    camera.maxY = MAP_OY + WORLD_H - H;
    if (camera.maxX < camera.minX) camera.maxX = camera.minX;
    if (camera.maxY < camera.minY) camera.maxY = camera.minY;
    camera.x = clamp(camera.x, camera.minX, camera.maxX);
    camera.y = clamp(camera.y, camera.minY, camera.maxY);
  }

  /* ============ 中央区域布局（城堡 + 森林入口 + 野区）============ */
  const VILLAGE = { gx1: 10, gy1: 10, gx2: 30, gy2: 30 };     // 村庄活动区（居中于 42x42 地图）
  const CASTLE_POS = { gx: 20, gy: 20 };                      // 大城堡 2x2 左上角（地图中心）
  const GATE_GX = 20, GATE_GY = 10;                           // 上方森林入口（城堡北侧通道）
  const FOREST = { gx1: 12, gy1: 4, gx2: 28, gy2: 9 };        // 入口外森林（勇者进村通道）
  const WILD_AREAS = [                                        // 怪物野区（多个，难度不同；紫区地面）
    { gx1: 13, gy1: 31, gx2: 25, gy2: 38, level: 1 },        // 南：Lv.1 低级怪（近村）
    { gx1: 31, gy1: 21, gx2: 39, gy2: 31, level: 2 },        // 东南：Lv.2
    { gx1: 2,  gy1: 3,  gx2: 9,  gy2: 13, level: 3 },        // 西北：Lv.3
    { gx1: 31, gy1: 3,  gx2: 39, gy2: 13, level: 4 },        // 东北：Lv.4 高级怪
  ];
  // 该格所在野区等级（0 = 不在野区）
  function wildLevelAt(gx, gy) {
    for (const a of WILD_AREAS) {
      if (gx >= a.gx1 && gx <= a.gx2 && gy >= a.gy1 && gy <= a.gy2) return a.level;
    }
    return 0;
  }
  // 野区等级 → 地面紫色深浅（等级越高越深）
  function wildColor(level) {
    const shades = [
      ['#9b6fd0', '#8a5fc0'],
      ['#8a5ac0', '#7a4fb0'],
      ['#7a4ab0', '#6a3fa0'],
      ['#623690', '#552d80'],
    ];
    const s = shades[Math.min(level, shades.length) - 1];
    return s;
  }

  // 数字格式化（工具，保留在引擎侧）
  const fmt = n => n >= 100000000 ? (n / 100000000).toFixed(1) + '亿'
    : n >= 10000 ? (n / 10000).toFixed(1) + '万'
    : Math.floor(n).toString();
  const {
    HERO_NAMES, RANDOM_TALK, LEVEL_NAMES,
    BUILD_DEFS, DECOR_DEFS, CLASS_DEFS, MONSTER_DEFS,
    BUILD_ICONS, DECOR_SIZE, ROAD_COST,
  } = C;
  const BUILD_KEYS = Object.keys(BUILD_DEFS);
  const DECOR_KEYS = Object.keys(DECOR_DEFS);

  /* ============ farm 四角编辑扩展 ============ */
  // 农田贴图（抠图 PNG，内容为标准菱形）的四角配置：图片内容菱形的上/右/下/左四个角（归一化 0..1，相对贴图宽高）。
  // 绘制时把这四个角一一对应到游戏 2×2 菱形草块的四个角（上→上、右→右、下→下、左→左），网格变形贴合，不旋转。
  // 可在 farm_fit.html 里拖动调好后写入，或用 S.farmCorners 运行时覆盖。
  const FARM_CORNERS = {
    top: [0.500, 0.134],
    right: [1.000, 0.493],
    bottom: [0.503, 0.872],
    left: [0.002, 0.499],
  };

  /* ============ 阴影缓存1 预热（实体创建时生成"贴近真实"的阴影条带）============ */
  // 每个实体创建时预生成缓存1：同一贴图/几何只算一次（耗系统资源），
  // 运行期绘制只读缓存，不再遍历蒙版。缓存2（shadow_config.json）负责
  // 各元素的横向收缩个性定制（静态省资源）。
  function prepareShadow(key, group) {
    const img = IMG[key];
    if (!img || !img.width || !img.baseMask) return;
    if (group === 'building') {
      const bsize = (C.BUILD_DEFS[key] && C.BUILD_DEFS[key].size) || 2;
      SpriteKit.Shadow.prepare({ img, key, tileW: bsize * TILE_W / 2, projX: 140 });
    } else if (group === 'decor') {
      const [dw, dh] = DECOR_SIZE[key] || [40, 44];
      SpriteKit.Shadow.prepare({ img, key, tileW: TILE_W / 2, projX: 100, w: dw, h: dh });
    } else if (group === 'actor') {
      const ch = 37;
      const cw = Math.max(18, Math.round(ch * (img.naturalWidth / img.naturalHeight)));
      SpriteKit.Shadow.prepare({ img, key, tileW: TILE_W / 2, projX: 45, w: cw, h: ch });
    } else if (group === 'monster') {
      const size = MONSTER_DEFS[key] ? MONSTER_DEFS[key].size : 56;
      SpriteKit.Shadow.prepare({ img, key, tileW: TILE_W / 2, projX: 40, w: size, h: size });
    }
  }
  // 包装实体工厂：创建即预热缓存1（makeBuilding / makeAdventurer / makeSlime）
  {
    const _mkB = E.makeBuilding, _mkA = E.makeAdventurer, _mkS = E.makeSlime;
    makeBuilding = (type, gx, gy) => {
      const b = _mkB(type, gx, gy);
      prepareShadow(b.image, 'building');
      return b;
    };
    makeAdventurer = (...a) => {
      const adv = _mkA(...a);
      prepareShadow(adv.img, 'actor');
      adv.inv = {};                       // 背包：{ 'cabbage_seed': n, 'cabbage_crop': n, ... }
      adv.farmCd = rnd(3000, 9000);       // 农活冷却偏移（错开行动）
      return adv;
    };
    makeSlime = (...a) => {
      const s = _mkS(...a);
      // 随机选一个野区出生，并按该区等级强化怪物
      const area = WILD_AREAS[rndi(0, WILD_AREAS.length - 1)];
      const sp = [rndi(area.gx1, area.gx2), rndi(area.gy1, area.gy2)];
      const pos = E.gridToScreen(sp[0] + rnd(-0.5, 0.5), sp[1] + rnd(-0.5, 0.5));
      s.x = pos.x; s.y = pos.y;
      const lv = area.level;
      s.level = lv;
      // 低级区（Lv.1/Lv.2）不刷 Boss：引擎自带的小概率 Boss 降级为普通怪
      if (s.boss && area.level < 3) {
        const t = ['slime', 'goblin', 'bat'][rndi(0, 2)];
        const fd = C.MONSTER_DEFS[t];
        s.type = t; s.img = fd.img; s.name = fd.name; s.boss = false; s.size = fd.size;
        s.hp = fd.hp; s.maxHp = fd.hp; s.atk = fd.atk; s.exp = fd.exp; s.gold = fd.gold;
      }
      // 高级区（Lv.3/Lv.4）高概率刷新大 Boss：史莱姆王
      if (area.level >= 3 && Math.random() < 0.4) {
        const bd = C.MONSTER_DEFS['slimeking'];
        s.type = 'slimeking';
        s.img = bd.img;
        s.name = bd.name;
        s.boss = true;
        s.size = bd.size;
        s.hp = bd.hp; s.maxHp = bd.hp; s.atk = bd.atk; s.exp = bd.exp; s.gold = bd.gold;
      }
      // 按区域等级强化；Boss 血量再 ×10（非常高）
      let mult = 1 + (lv - 1) * 0.6;   // Lv.1 ×1.0 … Lv.4 ×2.8
      if (s.boss) {
        mult *= 10;                     // Lv.3 Boss ≈120×22、Lv.4 Boss ≈120×28
        s.atk = Math.round(s.atk * 8);
      } else {
        s.atk = Math.round(s.atk * mult);
      }
      s.maxHp = Math.round(s.maxHp * mult);
      s.hp = s.maxHp;
      s.exp = Math.round(s.exp * (1 + (lv - 1) * 0.5));
      s.gold = Math.round(s.gold * (1 + (lv - 1) * 0.5));
      prepareShadow(s.img, 'monster');
      return s;
    };
  }

  /* ============ 游戏状态 ============ */
  const S = {
    screen: 'title',   // title | game
    gold: 500,          // 初始金币
    reputation: 0,      // 村庄声望
    day: 1, time: 8.0,  // 第几天，几点钟（0-24）
    speed: 1,           // 0暂停 1正常 2快 3飞快
    paused: false,
    adventurers: [],    // 村庄里的冒险者
    buildings: [],      // 已建造设施
    roads: new Set(),   // 玩家铺设的道路格 "gx,gy"
    decors: [],         // 玩家放置的装饰 { img, gx, gy }
    farmlands: new Set(),  // 农田格 key 'gx,gy'（由农场提供）
    crops: [],             // 作物 {gx,gy,seedKey,t:0,done:false}
    placeMode: null,    // null | 'building' | 'road' | 'decor' | 'demolish'
    selectedBuild: null,
    selectedDecor: null,
    debugBuildingBase: false,   // 调试：对齐辅助线（黄/青底边），默认隐藏，HUD 📐 可切换
    flatFit: { farm: true },    // 每个建筑是否启用"平铺自适应地块"（默认仅农场；卡片可勾选，存 localStorage）
    flatCornersCache: {},       // 各贴图内容菱形四角检测缓存 { imageKey: {top,right,bottom,left} }
    log: [],
    toast: null,
    floatTexts: [],     // 飘字动画
    particles: [],      // 粒子效果
    slimes: [],         // 村外史莱姆
    dayCount: 1,
    unlocked: {},
    lastTime: 0,
    timeAcc: 0,
    weekDay: 0,
    hirePool: [],
    mascotLevel: 1,
    perspCache: {},   // 建筑透视变换离屏缓存（corner 变才重建，每帧仅 blit）
  };

  /* ═══ 插件系统入口（唯一主代码接入点）═══
     插件（如 tweak.html）通过 localStorage['kairo_plugin'] 提供配置：
       { v: 版本戳(每次保存递增), data: { building_perspective: { 建筑key: {corner: 偏移px} } } }
     游戏启动读取一次；每 0.5s 检测插件版本戳变化 → 更新 S.pluginData（渲染直接读它） */
  S.pluginData = {};
  let _pluginVer = 0;
  function refreshPlugins() {
    try {
      const raw = localStorage.getItem('kairo_plugin');
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.v && d.v !== _pluginVer) {
        _pluginVer = d.v;
        S.pluginData = (d.data && typeof d.data === 'object') ? d.data : {};
        S.perspCache = {};   // 插件更新 → 清透视缓存（corner 变化）
      }
    } catch (e) { /* 忽略 */ }
  }
  refreshPlugins();
  setInterval(refreshPlugins, 500);

  /* ============ 网格占用系统 ============ */
  // grid[gy][gx]: 0=空地 1=建筑(2x2) 2=装饰(1x1) 3=道路
  // 村口 (5,0)(5,1) 为固定道路，其余全部由玩家铺设
  let GRID = [];
  function initGrid() {
    GRID = [];
    for (let gy = 0; gy < MAP_ROWS; gy++) {
      GRID.push(new Array(MAP_COLS).fill(0));
    }
    // 固定村口通道
    GRID[0][5] = 3; GRID[1][5] = 3;
    // 玩家道路
    for (const k of S.roads) {
      const [gx, gy] = k.split(',').map(Number);
      if (gx >= 0 && gy >= 0 && gx < MAP_COLS && gy < MAP_ROWS) GRID[gy][gx] = 3;
    }
    // 玩家装饰
    for (const d of S.decors) GRID[d.gy][d.gx] = 2;
    // 建筑（size x size，默认 2x2，城堡 3x3）
    for (const b of S.buildings) {
      const bsize = (BUILD_DEFS[b.type] && BUILD_DEFS[b.type].size) || 2;
      for (let dy = 0; dy < bsize; dy++)
        for (let dx = 0; dx < bsize; dx++)
          GRID[b.gy + dy][b.gx + dx] = 1;
    }
  }
  // 单格类型（越界返回 -1）
  function cellType(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= MAP_COLS || gy >= MAP_ROWS) return -1;
    return GRID[gy][gx];
  }
  // 格子是否可走：道路(3)可走；农田格/野区(紫色战斗区)草地可走；其余草地要铺路才能走
  function isWalkable(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= MAP_COLS || gy >= MAP_ROWS) return false;
    const v = GRID[gy][gx];
    if (v === 3) return true;
    if (v === 0 && (wildLevelAt(gx, gy) > 0 || S.farmlands.has(gx + ',' + gy))) return true;
    return false;
  }
  // 建筑 size x size 是否可放（必须在中央围栏内村庄区，全部空地）
  function canPlaceBuilding(gx, gy, size) {
    const s = size || 2;
    if (gx < 0 || gy < 0 || gx + s - 1 >= MAP_COLS || gy + s - 1 >= MAP_ROWS) return false;
    // 无默认围栏：全图可建造（仅需空地，不压道路/城堡/树/作物）
    for (let dy = 0; dy < s; dy++)
      for (let dx = 0; dx < s; dx++)
        if (cellType(gx + dx, gy + dy) !== 0) return false;
    if (S.crops.some(c => c.gx >= gx && c.gx <= gx + s - 1 && c.gy >= gy && c.gy <= gy + s - 1)) return false;
    return true;
  }

  // 农场登记农田（建筑外圈 8 格，空地才登记）
  function registerFarmPlots(b) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const nx = b.gx + dx, ny = b.gy + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) continue;
        const inB = nx >= b.gx && nx <= b.gx + 1 && ny >= b.gy && ny <= b.gy + 1;
        if (inB) continue;
        if (cellType(nx, ny) === 0) S.farmlands.add(nx + ',' + ny);
      }
    }
  }
  // 拆农场：清理无作物的农田格（有作物的格保留）
  function clearFarmPlots(b) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const nx = b.gx + dx, ny = b.gy + dy;
        const inB = nx >= b.gx && nx <= b.gx + 1 && ny >= b.gy && ny <= b.gy + 1;
        if (inB) continue;
        const k = nx + ',' + ny;
        if (S.crops.some(c => (c.gx + ',' + c.gy) === k)) continue;
        S.farmlands.delete(k);
      }
    }
  }
  // 道路/装饰 1x1 是否可放（空地即可，村内村外都行；不压作物田）
  function canPlaceSingle(gx, gy) {
    if (cellType(gx, gy) !== 0) return false;
    if (S.crops.some(c => c.gx === gx && c.gy === gy)) { toast('农田使用中！', 'warn'); return false; }
    return true;
  }

  /* ============ 冒险者 ============ */
  // 同步冒险者所在的网格坐标（用其屏幕坐标反算）
  function syncAdventurerGrid(a) {
    const g = screenToGrid(a.x, a.y);
    a.curGx = g.gx; a.curGy = g.gy;
  }

  const advPower = a => a.atk * (1 + a.level * 0.1);

  /* ============ 网格寻路 ============ */
  // BFS 从 (sx,sy) 到 (tx,ty) 找最短可走路径（4 方向）
  function findPath(sx, sy, tx, ty) {
    if (!isWalkable(sx, sy) || !isWalkable(tx, ty)) return null;
    if (sx === tx && sy === ty) return [{ gx: tx, gy: ty }];
    const prev = {};
    const key = (x, y) => x + ',' + y;
    const q = [[sx, sy]];
    prev[key(sx, sy)] = null;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length > 0) {
      const [cx, cy] = q.shift();
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (isWalkable(nx, ny) && !(key(nx, ny) in prev)) {
          prev[key(nx, ny)] = [cx, cy];
          q.push([nx, ny]);
        }
      }
    }
    if (!(key(tx, ty) in prev)) return null;
    // 回溯路径
    const path = [];
    let cur = [tx, ty];
    while (cur) {
      path.push({ gx: cur[0], gy: cur[1] });
      cur = prev[key(cur[0], cur[1])];
    }
    return path.reverse();
  }
  // 宽松 BFS（道路/农田/任何空地都走）：仅作为农活/建筑寻路失败的兜底，
  // 允许穿越草地到农田或任意建筑，不穿建筑/树。正常走路仍走严格道路。
  function findPathLoose(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [{ gx: tx, gy: ty }];
    const prev = {};
    const key = (x, y) => x + ',' + y;
    const q = [[sx, sy]];
    prev[key(sx, sy)] = null;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length > 0) {
      const [cx, cy] = q.shift();
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) continue;
        const v = GRID[ny][nx];
        if ((v === 3 || v === 0) && !(key(nx, ny) in prev)) {
          prev[key(nx, ny)] = [cx, cy];
          q.push([nx, ny]);
        }
      }
    }
    if (!(key(tx, ty) in prev)) return null;
    const path = [];
    let cur = [tx, ty];
    while (cur) {
      path.push({ gx: cur[0], gy: cur[1] });
      cur = prev[key(cur[0], cur[1])];
    }
    return path.reverse();
  }
  // 智能寻路：先严格道路，失败再宽松兜底（农活/任意建筑可达）
  function findPathSmart(sx, sy, tx, ty) {
    const p = findPath(sx, sy, tx, ty);
    if (p) return p;
    return findPathLoose(sx, sy, tx, ty);
  }
  // 随机选一个道路格（人只走道路；默认在中央村庄活动区）
  function randomWalkablePoint(area) {
    const a = area || { gx1: 11, gy1: 11, gx2: 29, gy2: 29 };
    for (let i = 0; i < 50; i++) {
      const gx = rndi(a.gx1, a.gx2), gy = rndi(a.gy1, a.gy2);
      if (GRID[gy] && GRID[gy][gx] === 3) {
        const p = gridToScreen(gx, gy);
        return { gx, gy, x: p.x, y: p.y + TILE_H / 2 };
      }
    }
    return null;
  }
  // 注入寻路钩子到实体工厂（makeAdventurer 需要 randomWalkablePoint / gatePos）
  if (E && typeof E.setWalkHooks === 'function') {
    E.setWalkHooks({
      randomWalkablePoint,
      gatePos: () => E.gridToScreen(GATE_GX, GATE_GY),   // 勇者从上方森林入口进村
    });
  }
  // 找离建筑最近的可走格（作为消费站立点）
  function buildingStandPoint(b) {
    const bsize = (BUILD_DEFS[b.type] && BUILD_DEFS[b.type].size) || 2;
    // 宽松可走：道路/农田/任意空地（农田与无路建筑也能被访问）
    const looseOk = (gx, gy) => {
      const v = GRID[gy] && GRID[gy][gx];
      return v === 3 || v === 0 || S.farmlands.has(gx + ',' + gy);
    };
    // 建筑底边中线下方的道路格
    const cx = b.gx + Math.floor(bsize / 2), cy = b.gy + bsize;
    if (isWalkable(cx, cy)) {
      const p = gridToScreen(cx, cy);
      return { gx: cx, gy: cy, x: p.x, y: p.y + TILE_H / 2 };
    }
    // 其他方向找（严格可走优先，其次宽松可走）
    const candidates = [
      [b.gx, b.gy + bsize], [b.gx + bsize, b.gy + bsize],
      [b.gx - 1, b.gy + Math.floor(bsize / 2)], [b.gx + bsize, b.gy + Math.floor(bsize / 2)],
      [b.gx, b.gy - 1], [b.gx + bsize, b.gy],
    ];
    for (const [gx, gy] of candidates) {
      if (isWalkable(gx, gy)) {
        const p = gridToScreen(gx, gy);
        return { gx, gy, x: p.x, y: p.y + TILE_H / 2 };
      }
    }
    for (const [gx, gy] of candidates) {
      if (looseOk(gx, gy)) {
        const p = gridToScreen(gx, gy);
        return { gx, gy, x: p.x, y: p.y + TILE_H / 2 };
      }
    }
    return null;
  }
  // 找 (gx,gy) 周围最近的相邻可走格（优先相邻，不站在目标格上）
  function nearestWalkableTo(gx, gy) {
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (isWalkable(gx + dx, gy + dy)) return { gx: gx + dx, gy: gy + dy };
        }
      }
    }
    if (isWalkable(gx, gy)) return { gx, gy };
    return null;
  }
  // 冒险者站在被拆掉的路上/装饰上：瞬移到最近可走格
  function unstuck(a) {
    const w = nearestWalkableTo(a.curGx, a.curGy);
    if (!w) return false;
    a.curGx = w.gx; a.curGy = w.gy;
    const p = gridToScreen(w.gx, w.gy);
    a.x = p.x; a.y = p.y + TILE_H / 2;
    a.path = null;
    a.targetBld = null;
    return true;
  }

  /* ============ 游戏初始化 ============ */
  function newGame() {
    clearSave();   // 重新开始：清掉旧存档
    S.screen = 'game';
    SceneManager.switchTo('game');   // 场景管理器同步
    // 相机聚焦中央城堡
    const camC = E.gridToScreen(CASTLE_POS.gx + 1.0, CASTLE_POS.gy + 1.0);
    camera.x = clamp(camC.x - W / 2, camera.minX, camera.maxX);
    camera.y = clamp(camC.y - H / 2, camera.minY, camera.maxY);
    S.gold = 500;
    S.reputation = 0;
    S.day = 1; S.time = 8;
    S.adventurers = [];
    S.buildings = [];
    S.buildingHits = {};   // 每帧渲染记录的命中矩形（黄线同基准，点击/悬停判定）
    S.roads = new Set();
    S.decors = [];
    S.log = [];
    S.floatTexts = [];
    S.particles = [];
    S.slimes = [];
    S.placeMode = null;
    S.selectedBuild = null;
    S.selectedDecor = null;
    S.farmlands = new Set();   // 农田格 key 'gx,gy'（由农场提供）
    S.crops = [];              // 作物 {gx,gy,seedKey,t:0,done:false}

    // 初始世界布局：中央城堡 + 四方森林入口 + 连接道路
    initGrid();
    buildInitialWorld();

    // 初始冒险者
    for (let i = 0; i < 3; i++) {
      S.adventurers.push(makeAdventurer());
    }
    for (let i = 0; i < 3; i++) {
      S.slimes.push(makeSlime());
    }
    addLog('🏰 冒险村成立了！大城堡坐镇中央，招待冒险者们吧！', 'good');
    addLog('🛣️ 村庄开放无围栏，全图可建造，铺路连通村内外', 'info');
    addLog('🌲 勇者从北边森林入口进村！', 'info');
  }

  // 铺路格（避开已占用）
  function addRoadCell(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= MAP_COLS || gy >= MAP_ROWS) return;
    if (GRID[gy][gx] !== 0) return;
    S.roads.add(gx + ',' + gy);
    GRID[gy][gx] = 3;
  }

  /* ============ 进度保存（localStorage 自动存档 / 续玩 / 清档）============ */
  function saveGame() {
    if (S.screen !== 'game') return;
    try {
      const d = {
        gold: S.gold, reputation: S.reputation, day: S.day, time: S.time, dayCount: S.dayCount,
        roads: Array.from(S.roads),
        farmlands: Array.from(S.farmlands),
        buildings: S.buildings.map(b => ({ type: b.type, gx: b.gx, gy: b.gy, level: b.level, totalEarned: b.totalEarned, customers: b.customers })),
        decors: S.decors.map(dd => ({ img: dd.img, gx: dd.gx, gy: dd.gy })),
        crops: S.crops.map(c => ({ gx: c.gx, gy: c.gy, seedKey: c.seedKey, t: c.t, done: c.done })),
        adventurers: S.adventurers.map(a => ({
          name: a.name, cls: a.cls, img: a.img, healer: !!a.healer, x: a.x, y: a.y,
          hp: a.hp, maxHp: a.maxHp, atk: a.atk, def: a.def, level: a.level, exp: a.exp,
          gold: a.gold, speed: a.speed, mood: a.mood, tired: a.tired, equipped: a.equipped,
          favorite: a.favorite, weapon: a.weapon || null,
        })),
        slimes: S.slimes.map(s => ({ type: s.type, img: s.img, name: s.name, boss: !!s.boss, x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp, atk: s.atk, exp: s.exp, gold: s.gold, size: s.size })),
      };
      localStorage.setItem('village_save', JSON.stringify(d));
    } catch (e) { /* 存档失败忽略 */ }
  }

  function loadGame() {
    let d;
    try { d = JSON.parse(localStorage.getItem('village_save')); } catch (e) { return false; }
    if (!d || !Array.isArray(d.buildings)) return false;
    S.screen = 'game';
    SceneManager.switchTo('game');
    S.gold = (d.gold !== undefined ? d.gold : 500);
    S.reputation = d.reputation || 0;
    S.day = d.day || 1; S.time = (d.time !== undefined ? d.time : 8);
    S.dayCount = d.dayCount || 1;
    S.roads = new Set(d.roads || []);
    S.farmlands = new Set(d.farmlands || []);
    S.buildings = (d.buildings || []).map(bd => {
      const b = makeBuilding(bd.type, bd.gx, bd.gy);
      b.level = bd.level || 1;
      b.totalEarned = bd.totalEarned || 0;
      b.customers = bd.customers || 0;
      return b;
    });
    S.decors = (d.decors || []).map(dd => ({ img: dd.img, gx: dd.gx, gy: dd.gy }));
    S.crops = (d.crops || []).map(c => ({ gx: c.gx, gy: c.gy, seedKey: c.seedKey, t: c.t, done: !!c.done }));
    initGrid();
    S.adventurers = (d.adventurers || []).map(ad => Object.assign({}, ad, {
      path: null, pathIdx: 0, targetX: 0, targetY: 0, curGx: 0, curGy: 0,
      bubble: null, bubbleT: 0, bubbleType: null, animT: 0, animFlip: false,
      targetBld: null, targetSlime: null, state: 'wander', adventureTimer: 0, restTimer: 0, leaveT: 0,
    }));
    S.slimes = (d.slimes || []).map(sl => Object.assign({}, sl, { animT: 0 }));
    S.placeMode = null; S.selectedBuild = null; S.selectedDecor = null;
    S.log = []; S.floatTexts = []; S.particles = []; S.buildingHits = {};
    addLog('已读取上次存档，继续经营！', 'good');
    return true;
  }

  function hasSave() {
    try { return !!localStorage.getItem('village_save'); } catch (e) { return false; }
  }
  function clearSave() {
    try { localStorage.removeItem('village_save'); } catch (e) {}
  }

  // 初始世界：大城堡（居中）→ 城堡四周道路 → 四向出村路 → 上方森林入口 → 森林（无默认围栏）
  function buildInitialWorld() {
    const { gx1, gy1, gx2, gy2 } = VILLAGE;
    // 1) 大城堡 2x2（地图中心；无默认围栏，村庄开放）
    const castle = makeBuilding('castle', CASTLE_POS.gx, CASTLE_POS.gy);
    S.buildings.push(castle);
    const csize = (BUILD_DEFS.castle && BUILD_DEFS.castle.size) || 2;
    for (let dy = 0; dy < csize; dy++)
      for (let dx = 0; dx < csize; dx++)
        GRID[CASTLE_POS.gy + dy][CASTLE_POS.gx + dx] = 1;
    // 2) 城堡四周道路（一圈）
    for (let gx = CASTLE_POS.gx - 1; gx <= CASTLE_POS.gx + csize; gx++) {
      addRoadCell(gx, CASTLE_POS.gy - 1);
      addRoadCell(gx, CASTLE_POS.gy + csize);
    }
    for (let gy = CASTLE_POS.gy - 1; gy <= CASTLE_POS.gy + csize; gy++) {
      addRoadCell(CASTLE_POS.gx - 1, gy);
      addRoadCell(CASTLE_POS.gx + csize, gy);
    }
    // 4) 上方入口：城堡北侧 → 围栏上边缺口 → 森林通道
    for (let gy = GATE_GY; gy <= CASTLE_POS.gy - 1; gy++) {
      addRoadCell(GATE_GX, gy);
      addRoadCell(GATE_GX + 1, gy);
    }
    for (let gy = FOREST.gy1; gy < GATE_GY; gy++) {
      addRoadCell(GATE_GX, gy);
      addRoadCell(GATE_GX + 1, gy);
    }
    // 5) 三向出村路：城堡圈路 → 南/东/西（冒险者出村去野区打怪）
    // 南（通往南侧野区）
    for (let gy = CASTLE_POS.gy + csize + 1; gy <= VILLAGE.gy2; gy++) {
      addRoadCell(GATE_GX, gy);
      addRoadCell(GATE_GX + 1, gy);
    }
    // 东
    for (let gx = CASTLE_POS.gx + csize + 1; gx <= VILLAGE.gx2; gx++) {
      addRoadCell(gx, GATE_GX);
      addRoadCell(gx, GATE_GX + 1);
    }
    // 西
    for (let gx = VILLAGE.gx1; gx <= CASTLE_POS.gx - 1; gx++) {
      addRoadCell(gx, GATE_GX);
      addRoadCell(gx, GATE_GX + 1);
    }
    // 6) 森林树阵（通道两侧）
    for (let gy = FOREST.gy1; gy <= FOREST.gy2; gy++) {
      for (let gx = FOREST.gx1; gx <= FOREST.gx2; gx++) {
        if (gx === GATE_GX || gx === GATE_GX + 1) continue;
        if (GRID[gy][gx] !== 0) continue;
        if ((gx * 7 + gy * 13) % 4 === 0) {
          S.decors.push({ img: 'tree', gx, gy });
          GRID[gy][gx] = 2;
          prepareShadow('tree', 'decor');
        }
      }
    }
  }

  function addLog(msg, type) {
    S.log.unshift({ msg, type: type || 'info' });
    if (S.log.length > 40) S.log.pop();
  }
  function toast(msg, type) {
    S.toast = { msg, type: type || 'info', t: performance.now() };
  }
  function floatText(x, y, txt, color) {
    S.floatTexts.push({ x, y, txt, color: color || '#ffd23f', t: 0, life: 1600 });
  }
  function sparkle(x, y, color) {
    S.particles.push({ x, y, color, t: 0, life: 500, vy: -40 });
  }

  /* ============ 建造 / 铺路 / 装饰 / 拆除 ============ */
  // 建筑造价（同类型越多越贵）
  function buildingCost(type) {
    const def = BUILD_DEFS[type];
    return Math.floor(def.baseCost * (1 + S.buildings.filter(b => b.type === type).length * 0.5));
  }

  function placeBuildingAt(type, gx, gy) {
    const def = BUILD_DEFS[type];
    const bsize = def.size || 2;
    const cost = buildingCost(type);
    if (S.gold < cost) { toast('金币不足！', 'warn'); return false; }
    if (!canPlaceBuilding(gx, gy, bsize)) { toast('这里放不下（需空地，不在作物田上）', 'warn'); return false; }
    S.gold -= cost;
    const b = makeBuilding(type, gx, gy);
    S.buildings.push(b);
    for (let dy = 0; dy < bsize; dy++)
      for (let dx = 0; dx < bsize; dx++)
        GRID[b.gy + dy][b.gx + dx] = 1;
    if (type === 'farm') registerFarmPlots(b);
    sparkle(b.x, b.y, '#7ce38b');
    addLog(`🏗️ 建造了${b.name}！`, 'good');
    toast(`🏗️ ${b.name}建造完成！${type === 'farm' ? ' 农田准备好了！' : ''}`, 'good');
    return true;
  }

  function placeRoadAt(gx, gy) {
    if (!canPlaceSingle(gx, gy)) { return false; }
    if (S.gold < ROAD_COST) { toast('金币不足！', 'warn'); return false; }
    S.gold -= ROAD_COST;
    S.roads.add(gx + ',' + gy);
    GRID[gy][gx] = 3;
    return true;
  }

  function placeDecorAt(type, gx, gy) {
    const def = DECOR_DEFS[type];
    if (!canPlaceSingle(gx, gy)) { return false; }
    if (S.gold < def.cost) { toast('金币不足！', 'warn'); return false; }
    S.gold -= def.cost;
    S.decors.push({ img: type, gx, gy });
    GRID[gy][gx] = 2;
    prepareShadow(type, 'decor');   // 创建时预热阴影缓存1
    const p = gridToScreen(gx, gy);
    sparkle(p.x, p.y, '#7ce38b');
    return true;
  }

  // 拆除：优先建筑（返还 50%），其次装饰/道路
  function demolishAt(gx, gy) {
    const v = cellType(gx, gy);
    // 建筑：点其占格任意格都拆
    for (const b of S.buildings) {
      const bsize = (BUILD_DEFS[b.type] && BUILD_DEFS[b.type].size) || 2;
      if (gx >= b.gx && gx <= b.gx + bsize - 1 && gy >= b.gy && gy <= b.gy + bsize - 1) {
        const refund = Math.floor(BUILD_DEFS[b.type].baseCost * 0.5 * b.level);
        S.gold += refund;
        S.buildings.splice(S.buildings.indexOf(b), 1);
        for (let dy = 0; dy < bsize; dy++)
          for (let dx = 0; dx < bsize; dx++)
            GRID[b.gy + dy][b.gx + dx] = 0;
        if (b.type === 'farm') clearFarmPlots(b);
        // 正在前往该建筑的冒险者打断
        for (const a of S.adventurers) {
          if (a.targetBld === b) { a.targetBld = null; a.path = null; a.state = 'wander'; }
        }
        addLog(`🧹 拆除了${b.name}，返还 ${refund}💰`, 'info');
        toast(`🧹 拆除${b.name} +${refund}💰`, 'info');
        return true;
      }
    }
    if (v === 2) {
      const i = S.decors.findIndex(d => d.gx === gx && d.gy === gy);
      if (i >= 0) {
        S.decors.splice(i, 1);
        GRID[gy][gx] = 0;
        return true;
      }
    } else if (v === 3) {
      // 森林入口通道（城堡北门到森林）不可拆
      if ((gx === GATE_GX || gx === GATE_GX + 1) && gy < GATE_GY) { toast('森林入口道路不能拆除', 'warn'); return false; }
      S.roads.delete(gx + ',' + gy);
      GRID[gy][gx] = 0;
      S.gold += 2;  // 返还少量
      return true;
    }
    return false;
  }

  function upgradeBuilding(b) {
    const def = BUILD_DEFS[b.type];
    if (b.level >= def.maxLevel) { toast('已满级！', 'warn'); return; }
    const cost = Math.floor(def.baseCost * b.level * 1.5);
    if (S.gold < cost) { toast('金币不足！', 'warn'); return; }
    S.gold -= cost;
    b.level++;
    sparkle(b.x + b.w / 2, b.y + b.h, '#ffd23f');
    addLog(`⬆️ ${b.name}升级到 Lv.${b.level}！`, 'good');
    toast(`⬆️ ${b.name} Lv.${b.level}！`, 'good');
  }

  /* ============ 时间推进 ============ */
  function advanceTime(dt) {
    // 现实毫秒 → 游戏分钟（1现实秒 = 30游戏分钟，一天≈48秒）
    S.time += dt / 1000 * 0.5;
    if (S.time >= 24) {
      S.time -= 24;
      S.day++;
      onNewDay();
    }
  }

  function onNewDay() {
    addLog(`🌅 第 ${S.day} 天开始了！`, 'good');
    // 每日税收（设施收入）
    let tax = 0;
    for (const b of S.buildings) tax += b.level * 5;
    S.gold += tax;
    addLog(`💰 设施日常收益 +${tax} 金币`, 'money');
    // 每天补充史莱姆
    const need = Math.min(2 + Math.floor(S.reputation / 20), 8) - S.slimes.length;
    for (let i = 0; i < Math.max(0, need); i++) S.slimes.push(makeSlime());
    // 新冒险者加入（从村口走进来）
    const newCount = Math.min(1 + Math.floor(S.reputation / 30), 4);
    if (S.adventurers.length < 10 + Math.floor(S.reputation / 10)) {
      for (let i = 0; i < newCount; i++) S.adventurers.push(makeAdventurer(true));
    }
    // 声望增加
    const repGain = 1 + S.buildings.length;
    S.reputation += repGain;
    if (S.reputation % 20 < repGain) {
      addLog(`🌟 村庄声望提升！(${S.reputation})`, 'good');
    }
  }

  /* ============ 冒险者 AI ============ */
  function updateAdventurers(dt) {
    for (const a of S.adventurers) {
      if (!a.inv) a.inv = {};   // 兜底：旧档/缺失背包（否则 seedshop 分支 Object.keys 崩溃）
      // 屏外降频：视野外的冒险者每 3 帧更新一次逻辑（降 CPU），回视野立即恢复
      if (!inView(a.x, a.y, 60) && (a._skip = (a._skip || 0) + 1) % 3 !== 0) continue;
      a.animT += dt;
      if (a.bubble && a.bubbleT > 0) a.bubbleT -= dt;
      else if (a.bubble) { a.bubble = null; a.bubbleType = null; }

      // 玩家拆路/拆建筑容错：站在不可走格时挪到最近可走格
      if (a.state !== 'enter' && a.state !== 'leave' && a.state !== 'adventure') {
        syncAdventurerGrid(a);
        if (!isWalkable(a.curGx, a.curGy) && a.curGy < 9) {
          if (!unstuck(a)) { a.state = 'leave'; a.leaveT = 0; continue; }
          if (a.state === 'useFacility' || a.state === 'moveTo') a.state = 'wander';
        }
      } else if (a.state === 'wander' || a.state === 'useFacility') {
        syncAdventurerGrid(a);
      }

      switch (a.state) {
        case 'enter': updateEnter(a, dt); break;
        case 'wander': updateWander(a, dt); break;
        case 'moveTo': updateMoveTo(a, dt); break;
        case 'useFacility': updateUseFacility(a, dt); break;
        case 'adventure': updateAdventure(a, dt); break;
        case 'farm': updateFarm(a, dt); break;
        case 'leave': updateLeave(a, dt); break;
      }

      // 心情自然变化
      a.mood = clamp(a.mood + rnd(-0.05, 0.1) * dt / 100, 0, 100);
      // 心情过低可能离开
      if (a.state !== 'enter' && a.state !== 'leave' && a.state !== 'useFacility') {
        if (tryLeave(a)) continue;
      }
    }

    // 清理离开的
    S.adventurers = S.adventurers.filter(a => a.state !== 'gone');
  }

  function setBubble(a, type) {
    a.bubble = type;
    a.bubbleT = 2000;
  }

  function updateEnter(a, dt) {
    // 从村口沿道路走进村庄
    syncAdventurerGrid(a);
    if (!isWalkable(a.curGx, a.curGy)) {
      if (!unstuck(a)) { a.state = 'leave'; a.leaveT = 0; return; }
    }
    // 目标：(5,2) 是路则走到那，否则任意道路格
    const dest = isWalkable(5, 2) ? { gx: 5, gy: 2 } : randomWalkablePoint();
    if (!dest) { a.state = 'wander'; return; }
    if (a.curGx !== dest.gx || a.curGy !== dest.gy) {
      if (!a.path || a.path.length === 0) {
        a.path = findPath(a.curGx, a.curGy, dest.gx, dest.gy);
        a.pathIdx = 1;
        if (!a.path) { a.state = 'wander'; return; }   // 村口暂时不通
      }
      moveAlongPath(a, dt);
    } else {
      a.state = 'wander';
      a.path = null;
    }
  }

  function updateWander(a, dt) {
    // 随机决定行为
    if (Math.random() < dt / 800) {
      const hasShop = S.buildings.some(b => b.type === 'seedshop');
      const hasFarm = S.buildings.some(b => b.type === 'farm');
      // 1) 背包有作物 → 去种子商店卖
      if (hasAnyCrop(a) && hasShop) {
        const b = S.buildings.find(x => x.type === 'seedshop');
        const stand = buildingStandPoint(b);
        if (stand) {
          a.state = 'moveTo';
          a.targetBld = b;
          a.targetX = stand.x; a.targetY = stand.y;
          a.path = findPathSmart(a.curGx, a.curGy, stand.gx, stand.gy);
          a.pathIdx = 1;
          setBubble(a, '🧺');
          return;
        }
      }
      // 2) 有农场 → 去种菜/收菜（约 1/3 概率去做农活）
      if (hasFarm && Math.random() < 0.33 && (hasAnySeed(a) || S.crops.some(c => c.done))) {
        a.state = 'farm';
        a.farmCd = rnd(500, 2500);
        a.targetBld = null;
        a.path = null;
        setBubble(a, '🌱');
        return;
      }
      // 3) 还没有种子 && 有种子商店 → 偶尔去买种子（建立种植循环）
      if (hasShop && !hasAnySeed(a) && !hasAnyCrop(a) && Math.random() < 0.35) {
        const b = S.buildings.find(x => x.type === 'seedshop');
        const stand = buildingStandPoint(b);
        if (stand) {
          a.state = 'moveTo';
          a.targetBld = b;
          a.targetX = stand.x; a.targetY = stand.y;
          a.path = findPathSmart(a.curGx, a.curGy, stand.gx, stand.gy);
          a.pathIdx = 1;
          setBubble(a, '🌰');
          return;
        }
      }
      const buildings = S.buildings;
      if (buildings.length > 0 && Math.random() < 0.55) {
        // 去某个设施消费（走到建筑门口的可走格）
        const b = buildings[rndi(0, buildings.length - 1)];
        const stand = buildingStandPoint(b);
        if (!stand) { a.state = 'wander'; return; }
        a.state = 'moveTo';
        a.targetBld = b;
        a.targetX = stand.x;
        a.targetY = stand.y;
        a.path = findPath(a.curGx, a.curGy, stand.gx, stand.gy);
        a.pathIdx = 1;
        setBubble(a, BUILD_ICONS[b.type] || '😊');
      } else {
        // 去野外打怪（沿道路寻路走到怪物旁边）
        a.state = 'adventure';
        a.adventureTimer = 0;
        a.targetSlime = null;
        a.targetBld = null;
        a.path = null;
        setBubble(a, '⚔️');
      }
    } else if (Math.random() < dt / 2000) {
      // 随机闲聊 + 走道路漫游
      setBubble(a, RANDOM_TALK[rndi(0, RANDOM_TALK.length - 1)]);
      const dest = randomWalkablePoint();
      if (!dest) return;
      a.state = 'moveTo';
      a.targetX = dest.x;
      a.targetY = dest.y;
      a.targetBld = null;
      a.path = findPath(a.curGx, a.curGy, dest.gx, dest.gy);
      a.pathIdx = 1;
    }
  }

  // 沿网格路径移动一格一步
  function moveAlongPath(a, dt) {
    if (!a.path || a.path.length === 0) return;
    // 目标格
    const step = a.path[a.pathIdx];
    if (!step) { a.path = null; return; }
    const tp = gridToScreen(step.gx, step.gy);
    const tx = tp.x, ty = tp.y + TILE_H / 2;
    const dx = tx - a.x, dy = ty - a.y;
    const dist = Math.hypot(dx, dy);
    const spd = a.speed * dt / 1000;
    if (dist <= spd) {
      // 到达该格，走下一格
      a.x = tx; a.y = ty;
      a.curGx = step.gx; a.curGy = step.gy;
      a.pathIdx++;
      a.animFlip = dx < 0;
      if (a.pathIdx >= a.path.length) {
        a.path = null;
        a.animT += dt;
      }
    } else {
      a.x += (dx / dist) * spd;
      a.y += (dy / dist) * spd;
      a.animFlip = dx < 0;
      a.animT += dt;
    }
  }

  function updateMoveTo(a, dt) {
    syncAdventurerGrid(a);
    if (a.path && a.path.length > 0) {
      moveAlongPath(a, dt);
      // 路径走完
      if (!a.path) {
        if (a.targetBld) {
          a.state = 'useFacility';
          a.useT = 0;
        } else {
          a.state = 'wander';
        }
      }
      return;
    }
    // 无路径（目标不可达）：改用宽松兜底（穿越草地到任意建筑），仍失败则漫游
    const dest = a.targetBld ? buildingStandPoint(a.targetBld) : randomWalkablePoint();
    if (!dest) { a.state = 'wander'; a.targetBld = null; return; }
    a.targetX = dest.x; a.targetY = dest.y;
    a.path = findPathSmart(a.curGx, a.curGy, dest.gx, dest.gy);
    if (!a.path) { a.state = 'wander'; a.targetBld = null; return; }
    a.pathIdx = 1;
  }

  function updateUseFacility(a, dt) {
    a.useT += dt;
    const b = a.targetBld;
    if (!b) { a.state = 'wander'; return; }
    if (b.type === 'farm') { a.state = 'farm'; a.farmCd = 800; a.targetBld = null; return; }
    if (a.useT > 1200) {
      // 消费完成
      const def = BUILD_DEFS[b.type];
      // 后期（等级≥3）收入翻倍
      const income = Math.round(def.income * b.level * rnd(0.8, 1.4) * (b.level >= 3 ? 2 : 1));
      S.gold += income;
      b.glow = 1;
      b.customers++;
      b.totalEarned += income;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      floatText(cx + rnd(-10, 10), cy - 10, '+' + income + '💰', '#ffd23f');
      sparkle(cx, cy, '#ffd23f');
      a.state = 'wander';
      a.targetBld = null;
      a.mood = clamp(a.mood + 5, 0, 100);
      if (b.type === 'inn') {
        a.hp = a.maxHp;
        a.tired = 0;
        setBubble(a, '😌');
      } else if (b.type === 'tavern') {
        a.mood = clamp(a.mood + 15, 0, 100);
        setBubble(a, '🍺');
      } else if (b.type === 'weapon') {
        // 武器店售卖武器：冒险者用金币购买/升级武器，装备到武器栏
        const WDEFS = C.WEAPON_DEFS;
        const wk = Object.keys(WDEFS);
        const cur = a.weapon && WDEFS[a.weapon.key];
        let cand = wk.filter(k => !cur || WDEFS[k].atk > cur.atk);
        if (!cand.length) cand = wk;
        const k = cand[rndi(0, cand.length - 1)];
        const wd = WDEFS[k];
        if (a.gold >= wd.price) {
          a.gold -= wd.price;
          if (a.weapon && WDEFS[a.weapon.key]) a.atk -= WDEFS[a.weapon.key].atk;
          a.weapon = { key: k, name: wd.name, atk: wd.atk };
          a.atk += wd.atk;
          a.equipped = a.weapon.atk;
          setBubble(a, wd.name);
          floatText(a.x, a.y - 26, '买了 ' + wd.name, '#cfe8ff');
        } else {
          setBubble(a, '钱不够');
        }
      } else if (b.type === 'shop') {
        a.hp = clamp(a.hp + 20, 0, a.maxHp);
        setBubble(a, '🛒');
      } else if (b.type === 'bakery') {
        a.hp = clamp(a.hp + 15, 0, a.maxHp);
        a.mood = clamp(a.mood + 8, 0, 100);
        setBubble(a, '🥖');
      } else if (b.type === 'magicshop') {
        a.mood = clamp(a.mood + 12, 0, 100);
        if (a.cls === '法师') { a.atk += 1; }
        setBubble(a, '🔮');
      } else if (b.type === 'training') {
        a.atk += 2;
        a.def += 1;
        a.tired = clamp(a.tired + 15, 0, 100);
        setBubble(a, '🥋');
      } else if (b.type === 'clinic') {
        a.hp = a.maxHp;
        setBubble(a, '💊');
      } else if (b.type === 'castle') {
        a.mood = clamp(a.mood + 25, 0, 100);
        a.hp = a.maxHp;
        a.atk += 1;
        a.def += 1;
        setBubble(a, '🏰');
      } else if (b.type === 'seedshop') {
        // 先卖作物 → 再补种子（交易额抽成给玩家）
        let trade = 0;
        for (const k of Object.keys(a.inv || {})) {
          if (k.endsWith('_crop') && a.inv[k] > 0) {
            const sk = k.slice(0, -5);
            const sd = C.SEED_DEFS[sk];
            if (!sd) continue;
            a.gold += sd.sellPrice * a.inv[k];
            trade += sd.sellPrice * a.inv[k];
            floatText(a.x, a.y - 30, '+' + (sd.sellPrice * a.inv[k]) + '💰', '#ffd23f');
            a.inv[k] = 0;
            delete a.inv[k];
          }
        }
        // 补种子
        const keys = Object.keys(C.SEED_DEFS);
        const sk = keys[rndi(0, keys.length - 1)];
        const sd = C.SEED_DEFS[sk];
        if (a.gold >= sd.seedCost) {
          a.gold -= sd.seedCost;
          a.inv[sk + '_seed'] = (a.inv[sk + '_seed'] || 0) + 1;
          trade += sd.seedCost;
          setBubble(a, '🌰');
        } else if (trade === 0) {
          setBubble(a, '😕');
        }
        if (trade > 0) {
          const inc = Math.round(trade * 0.2 * b.level);
          S.gold += inc;
          b.glow = 1;
          b.customers++;
          b.totalEarned += inc;
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          floatText(cx + rnd(-10, 10), cy - 10, '+' + inc + '💰', '#ffd23f');
          sparkle(cx, cy, '#ffd23f');
          addLog(`🌰 ${a.name} 做了笔买卖（${sk} 往返），商店赚 ${inc}💰`, 'good');
        }
      }
      // 牧师治疗他人
      if (a.healer && b.type === 'inn') {
        for (const other of S.adventurers) {
          if (other !== a && other.hp < other.maxHp * 0.5) {
            other.hp = other.maxHp;
            floatText(other.x, other.y - 20, '+治疗✨', '#7ce38b');
          }
        }
      }
    } else if (a.useT > 500 && Math.random() < dt / 2000) {
      setBubble(a, '😊');
    }
  }

  function updateAdventure(a, dt) {
    a.adventureTimer += dt;
    // 找一只活的怪
    const alive = S.slimes.filter(s => !s.dead);
    if (alive.length === 0) {
      a.state = 'wander';
      a.targetSlime = null;
      a.path = null;
      setBubble(a, '🏆');
      return;
    }
    // 打太久或血太少回村（放宽到 60s，给足往返野区的寻路时间）
    if (a.adventureTimer > 60000 || a.hp < 20) {
      a.state = 'wander';
      a.targetSlime = null;
      a.path = null;
      setBubble(a, a.hp < 20 ? '😫' : '😊');
      return;
    }
    // 选定目标怪（优先最近的活怪，避免跑去最远的野区）
    if (!a.targetSlime || a.targetSlime.dead) {
      let best = null, bd = Infinity;
      for (const s of alive) {
        const d = Math.abs(s.x - a.x) + Math.abs(s.y - a.y);
        if (d < bd) { bd = d; best = s; }
      }
      a.targetSlime = best;
      a.path = null;
    }
    const slime = a.targetSlime;
    // 是否已走到怪物旁边
    const sg = screenToGrid(slime.x, slime.y);
    const near = Math.abs(a.curGx - sg.gx) <= 1 && Math.abs(a.curGy - sg.gy) <= 1;
    if (!near) {
      // 寻路到怪物相邻格
      if (!a.path || a.path.length === 0) {
        const dest = nearestWalkableTo(sg.gx, sg.gy);
        if (dest) {
          const p = findPath(a.curGx, a.curGy, dest.gx, dest.gy);
          if (p && p.length > 1) { a.path = p; a.pathIdx = 1; }
        }
      }
      if (a.path && a.path.length > 0) {
        moveAlongPath(a, dt);
        return;
      }
      // 找不到路：稍后换目标
      if (Math.random() < dt / 1500) a.targetSlime = null;
      return;
    }
    // 攻击史莱姆
    if (Math.random() < dt / 120) {
      const dmg = rnd(3, 10) + a.atk * 0.5;
      slime.hp -= dmg;
      floatText(slime.x, slime.y - 20, '-' + Math.round(dmg), '#ff5c5c');
      if (slime.hp <= 0) {
        slime.dead = true;
        const reward = slime.gold + a.level * 5;
        S.gold += reward;
        floatText(slime.x, slime.y - 30, '+' + reward + '💰', '#ffd23f');
        sparkle(slime.x, slime.y, '#ffd23f');
        a.exp += slime.exp;
        a.hp = clamp(a.hp - rnd(3, 8), 0, a.maxHp);
        // Boss 掉落更多
        if (slime.boss) {
          addLog(`👑 ${a.name} 击败了史莱姆王！奖励 ${reward}💰`, 'good');
          sparkle(slime.x, slime.y, '#ff8ad4');
        }
        a.targetSlime = null;
        // 升级
        if (a.exp >= a.level * 30) {
          a.exp -= a.level * 30;
          a.level++;
          a.maxHp += 10; a.hp = a.maxHp;
          a.atk += 2; a.def += 1;
          floatText(a.x, a.y - 30, 'Lv UP!', '#7ce38b');
          setBubble(a, '🌟');
          addLog(`⚡ ${a.name} 升级到 Lv.${a.level}！（${LEVEL_NAMES[clamp(a.level - 1, 0, LEVEL_NAMES.length - 1)]}）`, 'good');
          // 冒险者变强会回村消费
          a.state = 'wander';
          a.path = null;
        }
      }
    }
    // Boss 大范围横扫：一下砸扁附近最多 3 个冒险者（高伤害）
    if (slime.boss && !slime.dead && Math.random() < dt / 800) {
      let hit = 0, total = 0;
      for (const other of S.adventurers) {
        if (hit >= 3) break;
        const dd = Math.abs(other.x - slime.x) + Math.abs(other.y - slime.y);
        if (dd < 160) {
          const bdmg = Math.round(rnd(15, 30) + slime.atk * 0.5);
          other.hp = clamp(other.hp - bdmg, 0, other.maxHp);
          floatText(other.x, other.y - 26, '-' + bdmg + '💥', '#ff8ad4');
          sparkle(other.x, other.y, '#ff8ad4');
          total += bdmg;
          hit++;
        }
      }
      if (hit > 0) {
        addLog(`👑 史莱姆王横扫！砸伤 ${hit} 名冒险者（${total} 伤害）`, 'warn');
        floatText(slime.x, slime.y - 42, '👑 横扫！', '#ff8ad4');
      }
    }
  }

  /* ============ 农业：作物生长 / 种田收货 ============ */
  function updateCrops(dt) {
    for (const cr of S.crops) {
      if (cr.done) continue;
      cr.t += dt;
      if (cr.t >= C.SEED_DEFS[cr.seedKey].growTime) {
        cr.done = true;
        const p = gridToScreen(cr.gx, cr.gy);
        floatText(p.x, p.y - 8, '成熟啦！', '#ffd23f');
      }
    }
  }

  function hasAnySeed(a) {
    for (const k in a.inv) if (k.endsWith('_seed') && a.inv[k] > 0) return true;
    return false;
  }
  function hasAnyCrop(a) {
    for (const k in a.inv) if (k.endsWith('_crop') && a.inv[k] > 0) return true;
    return false;
  }
  function pickSeed(a) {
    const list = [];
    for (const k in a.inv) if (k.endsWith('_seed') && a.inv[k] > 0) list.push(k.slice(0, -5));
    return list.length ? list[rndi(0, list.length - 1)] : null;
  }

  function plantCrop(a, gx, gy, seedKey) {
    S.crops.push({ gx, gy, seedKey, t: 0, done: false });
    a.inv[seedKey + '_seed']--;
    if (a.inv[seedKey + '_seed'] <= 0) delete a.inv[seedKey + '_seed'];
    const p = gridToScreen(gx, gy);
    floatText(p.x, p.y + TILE_H / 2 - 12, '🌱 ' + C.SEED_DEFS[seedKey].seedName, '#7ce38b');
    sparkle(p.x, p.y + TILE_H / 2, '#7ce38b');
    setBubble(a, '🌱');
  }

  function harvestCrop(a, cr) {
    const def = C.SEED_DEFS[cr.seedKey];
    S.crops.splice(S.crops.indexOf(cr), 1);
    // 收获带回 1 作物 + 1 种子（可持续种植）
    a.inv[cr.seedKey + '_crop'] = (a.inv[cr.seedKey + '_crop'] || 0) + 1;
    a.inv[cr.seedKey + '_seed'] = (a.inv[cr.seedKey + '_seed'] || 0) + 1;
    a.exp += 2;
    a.mood = clamp(a.mood + 3, 0, 100);
    const p = gridToScreen(cr.gx, cr.gy);
    floatText(p.x, p.y + TILE_H / 2 - 12, '🧺 ' + def.cropName, '#9b6fd0');
    sparkle(p.x, p.y + TILE_H / 2, '#9b6fd0');
  }

  // 走到目标隔壁可走格（失败时宽松兜底穿越草地）
  function goAdjacent(a, targGx, targGy) {
    syncAdventurerGrid(a);
    if (!a.path || a.path.length === 0) {
      const dest = nearestWalkableTo(targGx, targGy);
      if (!dest) return false;
      const p = findPathSmart(a.curGx, a.curGy, dest.gx, dest.gy);
      if (p && p.length > 1) { a.path = p; a.pathIdx = 1; }
      else return false;
    }
    moveAlongPath(a, 16);
    return true;
  }

  // 兜底：从远离村庄的农田回不来时，就近找路（农场枢纽）
  function updateFarm(a, dt) {
    a.farmCd -= dt;
    const farms = S.buildings.filter(b => b.type === 'farm');
    if (farms.length === 0) { a.state = 'wander'; a.targetBld = null; return; }
    if (a.farmCd > 0) { a.state = 'wander'; return; }
    // 1) 优先收获成熟作物
    if (S.crops.length > 0) {
      let ripe = null, bd = 1e9;
      for (const cr of S.crops) {
        if (!cr.done) continue;
        const gd = Math.abs(a.curGx - cr.gx) + Math.abs(a.curGy - cr.gy);
        if (gd < bd) { bd = gd; ripe = cr; }
      }
      if (ripe) {
        const near = Math.abs(a.curGx - ripe.gx) <= 1 && Math.abs(a.curGy - ripe.gy) <= 1;
        if (!near) {
          if (!goAdjacent(a, ripe.gx, ripe.gy)) { a.farmCd = 8000; a.state = 'wander'; }
          return;
        }
        harvestCrop(a, ripe);
        a.farmCd = rnd(2000, 5000);
        return;
      }
    }
    // 2) 有种子 → 找最近的空闲农田种
    const seedKey = pickSeed(a);
    if (seedKey) {
      let plot = null, bd = 1e9;
      for (const k of S.farmlands) {
        const xy = k.split(',');
        const gx = +xy[0], gy = +xy[1];
        if (S.crops.some(c => c.gx === gx && c.gy === gy)) continue;
        const gd = Math.abs(a.curGx - gx) + Math.abs(a.curGy - gy);
        if (gd < bd) { bd = gd; plot = { gx, gy }; }
      }
      if (plot) {
        const near = Math.abs(a.curGx - plot.gx) <= 1 && Math.abs(a.curGy - plot.gy) <= 1;
        if (!near) {
          if (!goAdjacent(a, plot.gx, plot.gy)) { a.farmCd = 8000; a.state = 'wander'; }
          return;
        }
        plantCrop(a, plot.gx, plot.gy, seedKey);
        a.farmCd = rnd(4000, 9000);
        return;
      }
    }
    // 3) 没种子 → 去种子商店买
    const shop = S.buildings.find(b => b.type === 'seedshop');
    if (shop) {
      const stand = buildingStandPoint(shop);
      if (stand) {
        a.targetBld = shop;
        a.targetX = stand.x; a.targetY = stand.y;
        a.path = findPathSmart(a.curGx, a.curGy, stand.gx, stand.gy);
        a.pathIdx = 1;
        a.state = 'moveTo';
        setBubble(a, '🌰');
        return;
      }
    }
    a.state = 'wander';
  }

  function updateLeave(a, dt) {
    // 沿道路走回村口后消失
    if (!a.path) {
      const p = findPath(a.curGx, a.curGy, 5, 0);
      if (!p) { a.state = 'gone'; return; }
      a.path = p;
      a.pathIdx = 1;
    }
    moveAlongPath(a, dt);
    if (!a.path) a.state = 'gone';
  }

  function tryLeave(a) {
    // 心情太低会离开村庄
    if (a.mood < 30 && Math.random() < 0.2) {
      a.state = 'leave';
      a.leaveT = 0;
      setBubble(a, '👋');
      return true;
    }
    return false;
  }

  /* ============ 史莱姆更新 ============ */
  function updateSlimes(dt) {
    for (const s of S.slimes) {
      if (s.dead) continue;
      // 屏外降频：视野外的怪每 3 帧更新一次（降 CPU），回视野立即恢复
      if (!inView(s.x, s.y, 60) && (s._skip = (s._skip || 0) + 1) % 3 !== 0) continue;
      s.animT += dt;
      // 缓慢跳动
      s.y += Math.sin(s.animT / 200) * 0.05;
    }
    // 清理死的
    const alive = S.slimes.filter(s => !s.dead);
    S.slimes = alive;
    // 保持史莱姆数量（根据声望；上限 30 只，避免怪海导致渲染卡死——原上限 200 是 6 秒卡死根因）
    const target = Math.min(8 + Math.floor(S.reputation / 12), 30);
    while (S.slimes.length > target) S.slimes.pop();      // 清掉存量超标（修复旧档已有怪海）
    while (S.slimes.length < target) {
      S.slimes.push(makeSlime());
    }
  }

  /* ============ 渲染 ============ */
  // 视口剔除辅助：世界坐标是否在相机视野内（含余量，防边缘/阴影被截）
  function inView(wx, wy, pad) {
    const pd = pad == null ? 130 : pad;
    return wx + pd > camera.x && wx - pd < camera.x + W && wy + pd > camera.y && wy - pd < camera.y + H;
  }
  function drawBg() {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, W, H);
    // 草地质感
    ctx.fillStyle = '#245f2e';
    for (let y = 0; y < H; y += 16) {
      for (let x = 0; x < W; x += 16) {
        if ((x / 16 + y / 16) % 3 !== 0) ctx.fillRect(x, y, 16, 16);
      }
    }
    // 道路
    ctx.fillStyle = '#c8b082';
    ctx.fillRect(120, 0, 40, H);
    ctx.fillRect(0, 530, W, 50);
  }

  function drawText(text, x, y, size, color, align) {
    ctx.font = `bold ${size}px 'Courier New', monospace`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, x, y);
  }

  function drawPixelText(text, x, y, size, color, align) {
    ctx.font = `${size}px 'Courier New', monospace`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, x, y);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPanel(x, y, w, h, fill, border, bw) {
    ctx.fillStyle = fill || '#232a3d';
    roundedRect(x, y, w, h, 6);
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = bw || 2;
      ctx.stroke();
    }
  }

  function mouseIn(x, y, w, h) {
    return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  }

  /* ============ 渲染标题 ============ */
  function renderTitle() {
    // 首页背景：优先用 AI 生成的视频（游戏 × 视频结合），无视频时回退等距村庄场景
    const tv = document.getElementById('titleVideo');
    if (tv && tv.readyState >= 2 && tv.videoWidth > 0) {
      ctx.drawImage(tv, 0, 0, W, H);
      // 半透明遮罩
      ctx.fillStyle = 'rgba(10,14,20,0.45)';
      ctx.fillRect(0, 0, W, H);
    } else {
      drawBg();
      ctx.save();
      ctx.globalAlpha = 0.9;
      renderIsometricMap();
      ctx.restore();
      // 半透明遮罩
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      ctx.fillRect(0, 0, W, H);
    }

    // 浮动光点（背景星尘动画）
    const tNow = performance.now();
    for (let i = 0; i < 26; i++) {
      const sp = 0.012 + (i % 3) * 0.008;
      const px = ((i * 137.5) % (W + 40) + tNow * sp) % (W + 40) - 20;
      const py = ((i * 53) % (H + 40) + Math.sin(tNow / 900 + i) * 20) % (H + 40) - 20;
      ctx.fillStyle = 'rgba(255,255,220,' + (0.22 + 0.2 * Math.sin(tNow / 700 + i)) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    // 标题（渐变 + 光晕动画）
    const grad = ctx.createLinearGradient(0, 90, 0, 205);
    grad.addColorStop(0, '#fff6c0');
    grad.addColorStop(0.5, '#ffd23f');
    grad.addColorStop(1, '#ff8f2f');
    ctx.save();
    ctx.shadowColor = 'rgba(255,180,40,' + (0.5 + 0.3 * Math.sin(tNow / 800)) + ')';
    ctx.shadowBlur = 30;
    drawPixelText('冒 险 村 物 语', W / 2, 135, 76, grad, 'center');
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundedRect(W / 2 - 375, 123, 750, 100, 12);
    ctx.fill();
    drawText('~ 2.5D Isometric Adventure Village ~', W / 2, 248, 22, '#e8f0ff', 'center');

    // 按钮（有存档显示"继续经营"，横排）
    const hasS = hasSave();
    const btns = [];
    if (hasS) {
      btns.push({ label: '继续经营', cb: loadGame });
      btns.push({ label: '重新开始', cb: () => { clearSave(); newGame(); } });
    } else {
      btns.push({ label: '开始经营村庄', cb: newGame });
    }
    btns.push({ label: '玩法说明', cb: () => { S.screen = 'help'; } });
    if (btns.length === 3) {
      const bw = 300, gapB = 22, x0 = W / 2 - (bw * 3 + gapB * 2) / 2;
      let x = x0;
      for (const b of btns) {
        const hover = mouseIn(x, 400, bw, 80);
        drawPanel(x, 400, bw, 80, hover ? '#3a5a8a' : '#24466e', '#7ce38b', 2);
        drawText(b.label, x + bw / 2, 423, 25, '#ffffff', 'center');
        x += bw + gapB;
      }
    } else {
      let y = 405;
      for (const b of btns) {
        const hover = mouseIn(W / 2 - 225, y, 450, 78);
        drawPanel(W / 2 - 225, y, 450, 78, hover ? '#3a5a8a' : '#24466e', '#7ce38b', 2);
        drawText(b.label, W / 2, y + 21, 28, '#ffffff', 'center');
        y += 102;
      }
    }

    // 素材展示
    const chars = [
      { img: IMG.warrior, x: 56, y: 580, w: 110, h: 154 },
      { img: IMG.mage, x: 190, y: 580, w: 110, h: 154 },
      { img: IMG.priest, x: 324, y: 580, w: 110, h: 154 },
      { img: IMG.archer, x: 1148, y: 580, w: 110, h: 154 },
      { img: IMG.merchant, x: 1282, y: 580, w: 110, h: 154 },
      { img: IMG.villager, x: 1416, y: 580, w: 110, h: 154 },
    ];
    for (const ch of chars) {
      if (ch.img && ch.img.width > 0) ctx.drawImage(ch.img, ch.x, ch.y, ch.w, ch.h);
    }
    if (IMG.slime && IMG.slime.width > 0) ctx.drawImage(IMG.slime, 540, 645, 72, 72);
    if (IMG.goblin && IMG.goblin.width > 0) ctx.drawImage(IMG.goblin, 620, 645, 72, 72);
    if (IMG.bat && IMG.bat.width > 0) ctx.drawImage(IMG.bat, 700, 645, 72, 72);
    if (IMG.slimeking && IMG.slimeking.width > 0) ctx.drawImage(IMG.slimeking, 780, 640, 92, 92);
    drawText('战士 法师 牧师 弓手 | 商人 村民 | 史莱姆 哥布林 蝙蝠 史莱姆王', 90, 770, 16, '#8892a8');
    drawText('2.5D 等距像素村庄经营 · 招待冒险者,建设你的村庄!', W / 2, H - 60, 19, '#8892a8', 'center');
  }

  /* ============ 渲染帮助 ============ */
  function renderHelp() {
    drawBg();
    drawPixelText('📖 玩法说明', W / 2, 40, 32, '#ffd23f', 'center');
    const lines = [
      '开罗风格 2.5D 等距冒险村经营游戏！',
      '',
      '· 道路、建筑、装饰全部由你自由规划，没有固定槽位',
      '· 冒险者只走道路：用铺路把村口、建筑、野外连起来',
      '· 建筑占 2x2 格（村内），道路/装饰占 1x1 格',
      '· 铺路可连续点击；放建筑有绿色/红色预览',
      '· 拆除模式可移除道路/装饰/建筑（建筑返还 50%）',
      '· 冒险者自动去设施消费赚钱，去野外打怪升级',
      '· 野外有史莱姆/哥布林/蝙蝠，还有稀有的史莱姆王Boss！',
      '· 声望提升会吸引更多冒险者进村',
      '· 不在放置模式时点击建筑可升级',
      '',
      '目标：把冒险村打造成传说级的冒险者天堂！',
    ];
    let y = 195;
    for (const l of lines) {
      drawText(l, 150, y, 22, l === '' ? '#333' : '#c8d4f0');
      y += 45;
    }
    const hover = mouseIn(W / 2 - 180, H - 120, 360, 70);
    drawPanel(W / 2 - 180, H - 120, 360, 70, hover ? '#3a5a8a' : '#24466e', '#7ce38b', 2);
    drawText('返回', W / 2, H - 99, 26, '#ffffff', 'center');
  }

  /* ============ 渲染主游戏 ============ */
  function renderGame() {
    // 背景渐变（更亮）
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#3d5a3d');
    grad.addColorStop(1, '#27402a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 世界坐标随相机平移（UI 是 DOM 覆盖层，不受影响）
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    renderIsometricMap();
    renderDepthSorted();
    // 界面（HUD/菜单/日志/Toast）全部由 HTML 接管，见 ui.js
    renderFloats();
    renderPlacePreview();
    ctx.restore();
  }

  /* ============ 等距菱形瓦片绘制 ============ */
  function drawDiamond(gx, gy, fill, border, p) {
    const pt = p || gridToScreen(gx, gy);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + TILE_W / 2, pt.y + TILE_H / 2);
    ctx.lineTo(pt.x, pt.y + TILE_H);
    ctx.lineTo(pt.x - TILE_W / 2, pt.y + TILE_H / 2);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function renderIsometricMap() {
    // 视口裁剪（85x85 大地图只画可见格）
    const camL = camera.x - TILE_W, camR = camera.x + W + TILE_W;
    const camT = camera.y - TILE_H, camB = camera.y + H + TILE_H;
    // 整个地图铺绿（村庄/野外统一绿色基调）；野区按等级染紫（越深越高）
    for (let gy = 0; gy < MAP_ROWS; gy++) {
      for (let gx = 0; gx < MAP_COLS; gx++) {
        const px = MAP_OX + (gx - gy) * TILE_W / 2;
        const py = MAP_OY + (gx + gy) * TILE_H / 2;
        if (px < camL || px > camR || py < camT || py > camB) continue;
        const lv = wildLevelAt(gx, gy);
        let base;
        if (lv > 0) {
          const wc = wildColor(lv);
          base = (gx % 2 === gy % 2) ? wc[0] : wc[1];
        } else {
          base = (gx % 2 === gy % 2) ? '#57a04e' : '#4c9448';
        }
        drawDiamond(gx, gy, base, null, { x: px, y: py });
        // 道路格
        if (GRID[gy] && GRID[gy][gx] === 3) {
          drawDiamond(gx, gy, '#d9c491', null, { x: px, y: py });
          ctx.fillStyle = '#c9b07a';
          ctx.fillRect(px - 3, py + TILE_H / 2 - 1, 6, 2);
        } else if (lv === 0 && (gx * 7 + gy * 13) % 5 === 0) {
          ctx.fillStyle = '#6db565';
          ctx.fillRect(px - 1, py + TILE_H / 2 - 1, 2, 2);
        }
        // 农田格（农场周围）：棕色土壤 + 垄线
        if (S.farmlands.has(gx + ',' + gy)) {
          drawDiamond(gx, gy, (gx % 2 === gy % 2) ? '#8a6a4a' : '#7d5e40', null, { x: px, y: py });
          ctx.strokeStyle = '#5c4226';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - TILE_W / 4, py + TILE_H / 2);
          ctx.lineTo(px + TILE_W / 4, py + TILE_H / 2);
          ctx.stroke();
        }
      }
    }
    // 作物（生长 3 阶段：幼苗→成株→成熟 emoji）
    for (const cr of S.crops) {
      const cp = gridToScreen(cr.gx, cr.gy);
      if (cp.x < camL || cp.x > camR || cp.y < camT || cp.y > camB) continue;
      const def = C.SEED_DEFS[cr.seedKey];
      if (!def) continue;
      const prog = cr.done ? 1 : Math.min(1, cr.t / def.growTime);
      if (cr.done) {
        drawText(def.emoji, cp.x, cp.y + TILE_H / 2 - 14, 22, null, 'center');
      } else if (prog >= 0.5) {
        drawText('🌿', cp.x, cp.y + TILE_H / 2 - 12, 16, null, 'center');
      } else {
        ctx.fillStyle = '#8fe07a';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y + TILE_H / 2 - 6, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 上方森林入口标记
    const gate = gridToScreen(GATE_GX, GATE_GY - 2);
    if (gate.y > camT && gate.y < camB) {
      drawText('🚪 森林入口', gate.x, gate.y - 10, 12, '#7a5f2e', 'center');
    }
    // 怪物野区标记（每区中心显示等级）
    for (const a of WILD_AREAS) {
      const wc = gridToScreen((a.gx1 + a.gx2) / 2, (a.gy1 + a.gy2) / 2);
      if (wc.x < camL || wc.x > camR || wc.y < camT || wc.y > camB) continue;
      drawPanel(wc.x - 44, wc.y - 36, 88, 22, 'rgba(30,12,50,0.6)', '#8a5fc0', 1);
      drawText('Lv.' + a.level + ' 🐾', wc.x, wc.y - 32, 11, '#e8d8a8', 'center');
    }
  }

  /* ============ 深度排序渲染 ============ */
  function renderDepthSorted() {
    // 收集所有要渲染的对象（树/建筑/冒险者/史莱姆）
    const items = [];
    const buildingRects = [];   // 建筑包围矩形（像素蒙版遮挡判定用）

    // 玩家装饰（底部非透明像素对齐单格底角 p.y + TILE_H，与建筑同款处理）
    for (const d of S.decors) {
      const p = gridToScreen(d.gx, d.gy);
      if (!inView(p.x, p.y + TILE_H, 120)) continue;   // 视口剔除
      items.push({
        y: p.y + TILE_H,
        draw: () => {
          const img = IMG[d.img];
          if (!img || img.width === 0) return;
          const t = performance.now();
          const [dw, dh] = DECOR_SIZE[d.img] || [40, 44];
          const ratio = img.bottomRatio || 1;
          const groundY = p.y + TILE_H;            // 单格底角 = 地面基准
          // 悬停判定 + 选中放大（世界坐标，与人物/怪兽同款）
          const mwxD = mouse.x + camera.x, mwyD = mouse.y + camera.y;
          const dHov = (mwxD >= p.x - dw / 2 && mwxD <= p.x + dw / 2 && mwyD >= groundY - dh - 6 && mwyD <= groundY + 4);
          if (!d._scale) d._scale = 1;
          d._scale += ((dHov ? 1.08 : 1) - d._scale) * 0.25;
          ctx.save();
          if (d._scale > 1.001) {
            ctx.translate(p.x, groundY);
            ctx.scale(d._scale, d._scale);
            ctx.translate(-p.x, -groundY);
          }
          // 装饰地面阴影（统一阴影系统：单格菱形，投影贴合装饰本体；收缩系数查静态配置）
          SpriteKit.Shadow.draw(ctx, { img, x: p.x, groundY, tileW: TILE_W / 2, w: dw, h: dh, projX: 100, key: d.img });
          const baseTop = groundY - ratio * dh;    // 图片底部非透明像素落在地面
          const drawW = (dx) => ctx.drawImage(img, p.x - dw / 2 + (dx || 0), baseTop, dw, dh);
          if (d.img === 'tree') {
            drawW();
          } else if (d.img === 'fountain') {
            const sp = Math.abs(Math.sin(t / 200)) * 4;
            ctx.drawImage(img, p.x - dw / 2, baseTop + sp * 0.3, dw, dh);
            ctx.fillStyle = 'rgba(120,200,255,0.8)';
            ctx.fillRect(p.x - 1, groundY - 58 + sp * 0.3, 2, 3);
          } else if (d.img === 'fruittree') {
            drawW();
            // 果实闪光
            if (Math.sin(t / 500) > 0.7) {
              ctx.fillStyle = 'rgba(255,80,80,0.5)';
              ctx.fillRect(p.x - 4, baseTop + 30, 2, 2);
            }
          } else if (d.img === 'chest') {
            drawW();
            // 宝箱闪烁金光
            const glow = Math.abs(Math.sin(t / 400));
            ctx.fillStyle = `rgba(255,210,63,${glow * 0.4})`;
            ctx.beginPath();
            ctx.ellipse(p.x, groundY - 4, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (d.img === 'lamp') {
            drawW();
            // 路灯暖光
            const glow = Math.abs(Math.sin(t / 600));
            ctx.fillStyle = `rgba(255,200,80,${glow * 0.35})`;
            ctx.beginPath();
            ctx.arc(p.x, baseTop + 42, 18, 0, Math.PI * 2);
            ctx.fill();
          } else if (d.img === 'flag') {
            // 旗帜飘动
            const sway = Math.sin(t / 300) * 3;
            drawW(sway * 0.3);
          } else if (d.img === 'well') {
            drawW();
          } else {
            drawW();
          }
          ctx.restore();
          // 选中渐变圆柱光柱（固定尺寸，不随放大；世界坐标绘制）
          if (dHov) {
            const H = 60, rx = dw * 0.7, ry = Math.max(4, Math.round(rx * 0.32));   // 统一透视扁度
            const dGrad = ctx.createLinearGradient(0, groundY - H, 0, groundY);
            dGrad.addColorStop(0, 'rgba(124,227,139,0)');
            dGrad.addColorStop(1, 'rgba(124,227,139,0.32)');
            ctx.fillStyle = dGrad;
            ctx.beginPath();
            ctx.ellipse(p.x, groundY, rx, ry, 0, 0, Math.PI * 2);         // 底椭圆
            ctx.ellipse(p.x, groundY - H, rx, ry, 0, 0, Math.PI * 2);     // 顶椭圆
            ctx.rect(p.x - rx, groundY - H, rx * 2, H);                   // 侧面（圆柱）
            ctx.fill();
            // 底面椭圆描边（强调底座，清晰可见）
            ctx.strokeStyle = 'rgba(124,227,139,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(p.x, groundY, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      });
    }

    // 建筑（底部非透明像素自动对齐地面，阴影承接）
    for (const b of S.buildings) {
      const p = gridToScreen(b.gx, b.gy);
      b.x = p.x; b.y = p.y;
      const bsize = (BUILD_DEFS[b.type] && BUILD_DEFS[b.type].size) || 2;
      if (!inView(p.x, p.y + bsize * TILE_H, 200)) continue;   // 视口剔除（建筑含阴影余量）
      // size x size 占位的完整菱形：下角尖在 p.y + size*TILE_H（对齐基准）
      const groundY = p.y + bsize * TILE_H - 2;   // 地面基准线（阴影中心）
      // 记录建筑包围矩形（供角色蒙版遮挡判定；建筑底边精确贴合菱形，包围盒用实际绘制缩放）
      const imgB = IMG[b.image];
      const ratioB = (imgB && imgB.width > 0 && imgB.bottomRatio) ? imgB.bottomRatio : 1;
      // 计算底边贴合缩放（与绘制一致的精确缩放）
      const B_SCALE = (() => {
        if (!imgB || !imgB.bottomProfile) return 1;
        const prof = imgB.bottomProfile, ow = imgB.naturalWidth;
        let pMin = null, pMax = null;
        for (let x = 0; x < ow; x++) {
          if (prof[x] < 0) continue;
          const sx = x / ow;
          if (pMin == null || sx < pMin) pMin = sx;
          if (pMax == null || sx > pMax) pMax = sx;
        }
        return (pMax > pMin) ? (bsize * TILE_W) / ((pMax - pMin) * 160) : 1;
      })();
      const BD_W = Math.round(160 * B_SCALE), BD_H = Math.round(160 * B_SCALE);
      buildingRects.push({
        cx: p.x,
        topY: groundY - ratioB * BD_H,
        groundY,
        keyY: p.y + bsize * TILE_H + 20,
        img: imgB,
        scale: B_SCALE,   // 建筑缩放比例（蒙版遮挡坐标换算）
      });
      items.push({
        y: p.y + bsize * TILE_H + 20,
        draw: () => {
          // 地面阴影（统一阴影系统：size 菱形，底边贴合自动计算；收缩系数查静态配置）
          const imgShadow = IMG[b.image];
          SpriteKit.Shadow.draw(ctx, { img: imgShadow, x: p.x, groundY, tileW: bsize * TILE_W / 2, key: b.image });
          const img = IMG[b.image];
          // 底边精确贴合：让建筑底部轮廓左右端对准底面菱形 L(左角)/R(右角)
          let dw = 160, dh = 160;
          if (img && img.width > 0 && img.bottomProfile) {
            const prof = img.bottomProfile, ow = img.naturalWidth;
            let pMin = null, pMax = null;
            for (let x = 0; x < ow; x++) {
              if (prof[x] < 0) continue;
              const sx = x / ow;
              if (pMin == null || sx < pMin) pMin = sx;
              if (pMax == null || sx > pMax) pMax = sx;
            }
            if (pMax > pMin) {
              // 菱形左右顶点宽 = size*TILE_W，等比缩放
              dw = Math.round(160 * ((bsize * TILE_W) / ((pMax - pMin) * 160)));
              // dh 一律按贴图自然比例（建筑贴图管线铁规：禁止宽高比阈值分支/压方/立起）
              dh = Math.max(1, Math.round(dw * (img.naturalHeight / img.naturalWidth)));
            }
          }
          let topY;
          if (img && img.width > 0) {
            // 底部非透明像素行对齐到地面（放大后仍贴地）
            const ratio = img.bottomRatio || 1;
            topY = groundY - ratio * dh;
          } else {
            topY = groundY - 50;
          }
          // —— 提前计算本建筑命中矩形与悬停（黄线同源，世界坐标，与相机解耦）——
          const ratioB2 = (img && img.bottomRatio) ? img.bottomRatio : 1;
          let xb0 = 1e9, xb1 = -1e9, yb0 = 1e9, yb1 = -1e9;
          const prB = (img && img.bottomProfile) ? img.bottomProfile : null;
          const owB = img ? img.naturalWidth : 0;
          if (prB && owB) {
            for (let x = 0; x < owB; x++) {
              const rB = prB[x];
              if (rB < 0) continue;
              const sxx = p.x - dw / 2 + (x / owB) * dw;
              const syy = topY + Math.min(rB, ratioB2) * dh;
              if (sxx < xb0) xb0 = sxx;
              if (sxx > xb1) xb1 = sxx;
              if (syy < yb0) yb0 = syy;
              if (syy > yb1) yb1 = syy;
            }
          } else {
            xb0 = p.x - dw / 2; xb1 = p.x + dw / 2; yb0 = topY + dh * 0.6; yb1 = topY + dh;
          }
          const hitW = Math.max(30, dw), hitH = Math.max(40, (yb1 - topY) + 10);
          const hitB = { x: p.x - dw / 2, y: topY, w: hitW, h: hitH };
          S.buildingHits[b.id] = hitB;
          const mwx = mouse.x + camera.x, mwy = mouse.y + camera.y;
          const hovered = (mwx >= hitB.x && mwx <= hitB.x + hitB.w && mwy >= hitB.y && mwy <= hitB.y + hitB.h);
          // 选中放大动画（短暂、平滑；移开后恢复 1.0）
          if (!b._scale) b._scale = 1;
          b._scale += ((hovered ? 1.08 : 1) - b._scale) * 0.25;
          ctx.save();
          if (b._scale > 1.001) {
            // 以建筑底部中心为锚点放大
            ctx.translate(p.x, groundY);
            ctx.scale(b._scale, b._scale);
            ctx.translate(-p.x, -groundY);
          }
          if (img && img.width > 0) {
            if (S.flatFit[b.type]) {
              // —— 平铺自适应地块：检测贴图内容菱形四角 → 对应游戏 bsize 菱形四角，网格变形贴合（勾选的"平的等距图"适用）——
              const bsize = (BUILD_DEFS[b.type] && BUILD_DEFS[b.type].size) || 2;
              const ow0 = img.naturalWidth, oh0 = img.naturalHeight;
              const halfW = bsize * TILE_W / 2, halfH = bsize * TILE_H / 2;
              const cc = gridToScreen(b.gx + bsize / 2, b.gy + bsize / 2);   // 地块中心
              let FC = S.flatCornersCache[b.image];
              if (!FC) {
                FC = detectFarmCorners(img);
                if (FC) S.flatCornersCache[b.image] = FC;
              }
              if (!FC) FC = FARM_CORNERS;   // 检测失败兜底
              // 源四角：图片内容菱形（归一化 → 像素）
              const A = { x: FC.top[0] * ow0, y: FC.top[1] * oh0 };
              const B = { x: FC.right[0] * ow0, y: FC.right[1] * oh0 };
              const C = { x: FC.bottom[0] * ow0, y: FC.bottom[1] * oh0 };
              const Dd = { x: FC.left[0] * ow0, y: FC.left[1] * oh0 };
              // 目标四角：游戏菱形（上/右/下/左）
              const U = { x: cc.x, y: cc.y - halfH };
              const R = { x: cc.x + halfW, y: cc.y };
              const D = { x: cc.x, y: cc.y + halfH };
              const L = { x: cc.x - halfW, y: cc.y };
              const Src = (u, v) => ({
                x: (1 - u) * (1 - v) * A.x + u * (1 - v) * B.x + u * v * C.x + (1 - u) * v * Dd.x,
                y: (1 - u) * (1 - v) * A.y + u * (1 - v) * B.y + u * v * C.y + (1 - u) * v * Dd.y,
              });
              const Dst = (u, v) => ({
                x: (1 - u) * (1 - v) * U.x + u * (1 - v) * R.x + u * v * D.x + (1 - u) * v * L.x,
                y: (1 - u) * (1 - v) * U.y + u * (1 - v) * R.y + u * v * D.y + (1 - u) * v * L.y,
              });
              const drawTri = (s, d) => {
                const ux = s[1].x - s[0].x, uy = s[1].y - s[0].y, vx = s[2].x - s[0].x, vy = s[2].y - s[0].y;
                const den = ux * vy - vx * uy; if (!den) return;
                const wux = d[1].x - d[0].x, wuy = d[1].y - d[0].y, wvx = d[2].x - d[0].x, wvy = d[2].y - d[0].y;
                const a = (wux * vy - wvx * uy) / den, c = (wvx * ux - wux * vx) / den;
                const b = (wuy * vy - wvy * uy) / den, dd = (wvy * ux - wuy * vx) / den;
                const e = d[0].x - a * s[0].x - c * s[0].y, f = d[0].y - b * s[0].x - dd * s[0].y;
                ctx.save();
                ctx.beginPath(); ctx.moveTo(d[0].x, d[0].y); ctx.lineTo(d[1].x, d[1].y); ctx.lineTo(d[2].x, d[2].y); ctx.closePath();
                ctx.clip();
                ctx.transform(a, b, c, dd, e, f);
                ctx.drawImage(img, 0, 0, ow0, oh0);
                ctx.restore();
              };
              const N = 20;
              for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const u0 = i / N, v0 = j / N, u1 = (i + 1) / N, v1 = (j + 1) / N;
                const s00 = Src(u0, v0), s10 = Src(u1, v0), s11 = Src(u1, v1), s01 = Src(u0, v1);
                const d00 = Dst(u0, v0), d10 = Dst(u1, v0), d11 = Dst(u1, v1), d01 = Dst(u0, v1);
                drawTri([s00, s10, s11], [d00, d10, d11]);
                drawTri([s00, s11, s01], [d00, d11, d01]);
              }
            } else {
              // 插件选择性透视（corner≠0 站立+底部V形夹角；corner=0 站立；dy 上下平移）
              const plug = (S.pluginData && S.pluginData.building_perspective && S.pluginData.building_perspective[b.type]) || null;
              const corner = plug ? (plug.corner || 0) : 0;
              const dy = plug ? (plug.dy || 0) : 0;
              if (corner !== 0 && img && img.width > 0) {
                const pc = getPerspCanvas(b.type, img, corner, dw, dh);   // 离屏缓存（GPU 图像变换），每帧仅 blit
                ctx.drawImage(pc, p.x - pc.width / 2, topY + dy);
              } else {
                ctx.drawImage(img, p.x - dw / 2, topY + dy, dw, dh);
              }
            }
          } else {
            ctx.fillStyle = '#8a5a3b';
            ctx.fillRect(p.x - 34, topY, 68, 50);
            // 无贴图建筑：emoji 占位图标
            const icon = (BUILD_DEFS[b.type] && BUILD_DEFS[b.type].icon) || '🏠';
            ctx.font = '34px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(icon, p.x, topY + 30);
          }
          // 调试：黄线——沿图片底部非透明像素轮廓画 5px 显眼黄色虚线（游戏源码原始方案）
          if (S.debugBuildingBase && img && img.width > 0 && img.bottomProfile) {
            const prof = img.bottomProfile, ow = img.naturalWidth;
            ctx.save();
            ctx.setLineDash([8, 5]);
            ctx.strokeStyle = '#ffd23f';
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            let started = false;
            for (let x = 0; x < ow; x++) {
              const r = prof[x];
              if (r < 0) continue;
              const sx = p.x - dw / 2 + (x / ow) * dw;
              const sy = topY + Math.min(r, img.bottomRatio || 1) * dh;
              if (!started) { ctx.moveTo(sx, sy); started = true; }
              else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.restore();
          }
          // 调试：2x2 建造方块的两条底边（青色 5px 虚线）——游戏源码原始方案（固定地块，不随微调）
          if (S.debugBuildingBase) {
            ctx.save();
            ctx.setLineDash([8, 5]);
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x - TILE_W, p.y + TILE_H);         // 左角
            ctx.lineTo(p.x, p.y + 2 * TILE_H);              // 下角尖
            ctx.lineTo(p.x + TILE_W, p.y + TILE_H);         // 右角
            ctx.stroke();
            ctx.restore();
          }
          // 等级星星（贴建筑底部上方）
          for (let i = 0; i < b.level; i++) {
            drawText('★', p.x - 30 + i * 11, groundY - 14, 10, '#ffd23f');
          }
          // 消费发光（地面）
          if (b.glow > 0) {
            ctx.globalAlpha = b.glow * 0.35;
            ctx.fillStyle = '#ffd23f';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y + TILE_H, 28, 13, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            b.glow = Math.max(0, b.glow - 0.02);
          }
          if (hovered) {
            // 幕墙：黄线轮廓整体向上平移的形状，单次路径填充（重叠不叠加变深），底部黄→顶部透明
            if (prB && owB) {
              const wallH = 130;   // 幕墙向上延伸高度
              const grad = ctx.createLinearGradient(0, yb0 - wallH, 0, yb0);
              grad.addColorStop(0, 'rgba(124,227,139,0)');
              grad.addColorStop(0.72, 'rgba(124,227,139,0.18)');
              grad.addColorStop(1, 'rgba(255,210,63,0.32)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              let started = false;
              // 下边：黄线轮廓（左→右）
              for (let x = 0; x < owB; x++) {
                const rB = prB[x];
                if (rB < 0) continue;
                const sx = p.x - dw / 2 + (x / owB) * dw;
                const sy = topY + Math.min(rB, ratioB2) * dh;
                if (!started) { ctx.moveTo(sx, sy); started = true; }
                else ctx.lineTo(sx, sy);
              }
              // 上边：黄线轮廓向上平移 wallH（右→左），闭合
              for (let x = owB - 1; x >= 0; x--) {
                const rB = prB[x];
                if (rB < 0) continue;
                const sx = p.x - dw / 2 + (x / owB) * dw;
                const sy = topY + Math.min(rB, ratioB2) * dh;
                ctx.lineTo(sx, sy - wallH);
              }
              ctx.closePath();
              ctx.fill();
            }
            drawPanel(xb0 - 50, yb0 - 30, 120, 24, 'rgba(10,14,24,0.9)', '#4a5a7a', 1);
            drawText(`${b.name} Lv.${b.level}`, xb0 + 10, yb0 - 26, 11, '#ffd23f', 'center');
          }
          ctx.restore();   // 恢复未缩放状态（地面阴影等不受放大影响）
        }
      });
    }

    // 史莱姆
    for (const s of S.slimes) {
      if (s.dead) continue;
      if (!inView(s.x, s.y, 130)) continue;   // 视口剔除（连阴影）
      items.push({
        y: s.y + 8,
        draw: () => {
          const bounce = Math.abs(Math.sin(s.animT / 200)) * 4;
          const img = IMG[s.img];
          // 悬停判定 + 选中放大（世界坐标，与建筑同款逻辑）
          const mwxS = mouse.x + camera.x, mwyS = mouse.y + camera.y;
          const sHov = (mwxS >= s.x - s.size / 2 && mwxS <= s.x + s.size / 2 && mwyS >= s.y - s.size && mwyS <= s.y + s.size + 6);
          if (!s._scale) s._scale = 1;
          s._scale += ((sHov ? 1.5 : 1) - s._scale) * 0.25;
          ctx.save();
          if (s._scale > 1.001) {
            ctx.translate(s.x, s.y + s.size / 2);
            ctx.scale(s._scale, s._scale);
            ctx.translate(-s.x, -(s.y + s.size / 2));
          }
          // 脚下红圈（把原来的绿色地面阴影改成红色圈，指示敌人位置）
          const R = s.size / 2;
          const gy = s.y + s.size / 2;   // 脚底地面
          ctx.beginPath();
          ctx.ellipse(s.x, gy, R, Math.max(5, R * 0.32), 0, 0, Math.PI * 2);
          ctx.fillStyle = s.boss ? 'rgba(255,90,30,0.30)' : 'rgba(255,40,40,0.25)';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = s.boss ? '#ff7a2f' : '#ff3b3b';
          ctx.stroke();
          // 怪物本体贴图（保留形象）
          if (img && img.width > 0) {
            ctx.drawImage(img, s.x - s.size / 2, s.y - s.size / 2 - bounce, s.size, s.size);
          } else {
            ctx.fillStyle = '#3dbf6a';
            ctx.beginPath();
            ctx.arc(s.x, s.y - bounce, s.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          // Boss 名字 / 普通怪等级
          if (s.boss) {
            drawText('👑 史莱姆王 Lv.' + s.level, s.x, s.y - s.size / 2 - 22, 9, '#ffd23f', 'center');
          } else {
            drawText('Lv.' + s.level, s.x, s.y - s.size / 2 - 20, 8, '#e8d8a8', 'center');
          }
          // 血条
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2 - 8, s.size, 3);
          ctx.fillStyle = s.boss ? '#ff8ad4' : '#ff5c5c';
          ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2 - 8, s.size * (s.hp / s.maxHp), 3);
          ctx.restore();
          // 选中渐变圆柱光柱（固定尺寸，不随放大；世界坐标绘制）
          if (sHov) {
            const H = 60, rx = s.size * 0.7, ry = Math.max(4, Math.round(rx * 0.32));   // 统一透视扁度
            const sGrad = ctx.createLinearGradient(0, s.y + s.size / 2 - H, 0, s.y + s.size / 2);
            sGrad.addColorStop(0, 'rgba(124,227,139,0)');
            sGrad.addColorStop(1, 'rgba(124,227,139,0.32)');
            ctx.fillStyle = sGrad;
            ctx.beginPath();
            ctx.ellipse(s.x, s.y + s.size / 2, rx, ry, 0, 0, Math.PI * 2);         // 底椭圆
            ctx.ellipse(s.x, s.y + s.size / 2 - H, rx, ry, 0, 0, Math.PI * 2);     // 顶椭圆
            ctx.rect(s.x - rx, s.y + s.size / 2 - H, rx * 2, H);                   // 侧面（圆柱）
            ctx.fill();
            // 底面椭圆描边（强调底座，清晰可见）
            ctx.strokeStyle = 'rgba(124,227,139,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(s.x, s.y + s.size / 2, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          // 属性面板（点击后跟随怪物显示 10 秒）
          if (s._infoT > 0) {
            s._infoT -= gDt;
            const px = s.x, py = s.y - s.size / 2 - 88;
            drawPanel(px - 62, py, 124, 78, 'rgba(10,14,24,0.92)', '#ff5c5c', 1);
            drawText((s.boss ? '👑 ' : '') + s.name, px, py + 16, 13, '#ffd23f', 'center');
            drawText('Lv.' + (s.level || 1), px, py + 34, 11, '#9aa7c0', 'center');
            drawText('❤ ' + Math.round(s.hp) + ' / ' + s.maxHp, px, py + 50, 11, '#ff8a8a', 'center');
            drawText('⚔ ' + s.atk + '  💰 ' + s.gold, px, py + 66, 11, '#ffd2a8', 'center');
          }
        }
      });
    }

    // 冒险者
    for (const a of S.adventurers) {
      if (!inView(a.x, a.y, 130)) continue;   // 视口剔除（连阴影）
      items.push({
        y: a.y + 14,
        feet: { x: a.x, y: a.y + 14 },   // 脚底点（建筑蒙版遮挡判定）
        draw: () => {
          // 行走动画（上下浮动）
          const walking = a.state === 'moveTo' || a.state === 'enter' || a.state === 'adventure' || a.state === 'leave';
          const bob = walking && a.path ? Math.sin(a.animT / 80) * 2 : 0;
          const img = IMG[a.img];
          if (img && img.width > 0) {
            // 按贴图宽高比缩放；底部非透明像素对齐脚底（贴地不飘）
            const ch = 37;   // 缩小3倍（原112）
            const cw = Math.max(18, Math.round(ch * (img.naturalWidth / img.naturalHeight)));
            const ratio = img.bottomRatio || 1;
            // 悬停判定 + 选中放大（世界坐标，与建筑同款逻辑）
            const mwxA = mouse.x + camera.x, mwyA = mouse.y + camera.y;
            const aHov = (mwxA >= a.x - cw / 2 && mwxA <= a.x + cw / 2 && mwyA >= a.y - 30 && mwyA <= a.y + 14);
            if (!a._scale) a._scale = 1;
            a._scale += ((aHov ? 1.5 : 1) - a._scale) * 0.25;
            ctx.save();
            if (a._scale > 1.001) {
              ctx.translate(a.x, a.y + 14);
              ctx.scale(a._scale, a._scale);
              ctx.translate(-a.x, -(a.y + 14));
            }
            // 地面阴影（统一阴影系统：单格菱形，贴合人物身形，投影距离短；收缩系数查静态配置）
            SpriteKit.Shadow.draw(ctx, { img, x: a.x, groundY: a.y + 14, tileW: TILE_W / 2, w: cw, h: ch, projX: 45, key: a.img });
            const bottom = a.y + 14 + bob;
            const top = bottom - ratio * ch;
            if (a.animFlip) {
              ctx.save();
              ctx.translate(a.x, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(img, -cw / 2, top, cw, ch);
              ctx.restore();
            } else {
              ctx.drawImage(img, a.x - cw / 2, top, cw, ch);
            }
            ctx.restore();
            // 选中渐变圆柱光柱（固定尺寸，不随放大；世界坐标绘制）
            if (aHov) {
              const H = 70, rx = cw * 0.75, ry = Math.max(4, Math.round(rx * 0.32));   // 统一透视扁度
              const aGrad = ctx.createLinearGradient(0, a.y + 14 - H, 0, a.y + 14);
              aGrad.addColorStop(0, 'rgba(124,227,139,0)');
              aGrad.addColorStop(1, 'rgba(124,227,139,0.32)');
              ctx.fillStyle = aGrad;
              ctx.beginPath();
              ctx.ellipse(a.x, a.y + 14, rx, ry, 0, 0, Math.PI * 2);         // 底椭圆
              ctx.ellipse(a.x, a.y + 14 - H, rx, ry, 0, 0, Math.PI * 2);     // 顶椭圆
              ctx.rect(a.x - rx, a.y + 14 - H, rx * 2, H);                   // 侧面（圆柱）
              ctx.fill();
              // 底面椭圆描边（强调底座，清晰可见）
              ctx.strokeStyle = 'rgba(124,227,139,0.5)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.ellipse(a.x, a.y + 14, rx, ry, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = a.cls === '法师' ? '#8a5ab5' : a.cls === '牧师' ? '#f0f0f0' : a.cls === '弓手' ? '#5ab54a' : '#4a9eff';
            ctx.fillRect(a.x - 10, a.y - 20 + bob, 20, 30);
            ctx.fillStyle = '#ffd8a8';
            ctx.fillRect(a.x - 10, a.y - 20 + bob, 20, 8);
          }
          // 名字 + 职业 + 等级（人物缩小后贴头顶）
          drawText(a.name, a.x, a.y - 42, 11, '#e8f0ff', 'center');
          drawText(a.cls, a.x - 40, a.y - 42, 10, '#9aa7c0');
          const lvColor = a.level >= 7 ? '#ffd23f' : a.level >= 4 ? '#7ce38b' : '#9aa7c0';
          drawText(`Lv.${a.level}`, a.x + 24, a.y - 42, 10, lvColor);
          // 战斗指标（攻击/防御/血量）
          drawText('⚔' + a.atk + ' 🛡' + a.def + ' ❤' + Math.round(a.hp) + '/' + a.maxHp, a.x, a.y - 56, 10, '#ffd2a8', 'center');

          // 对话气泡
          if (a.bubble && a.bubbleT > 0) {
            const bx = a.x, by = a.y - 80;
            const bw = a.bubble.length * 8 + 16;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            roundedRect(bx - bw / 2, by, bw, 22, 6);
            ctx.fill();
            ctx.strokeStyle = '#3a4a68';
            ctx.lineWidth = 1;
            ctx.stroke();
            drawText(a.bubble, bx, by + 5, 11, '#1a1f2e', 'center');
          }
          // 属性面板（点击后跟随人物显示 10 秒；含武器栏）
          if (a._infoT > 0) {
            a._infoT -= gDt;
            const hasW = !!(a.weapon && a.weapon.name);
            const px = a.x, py = a.y - 132 - (hasW ? 16 : 0);
            drawPanel(px - 62, py, 124, hasW ? 112 : 96, 'rgba(10,14,24,0.92)', '#4a9eff', 1);
            drawText(a.name, px, py + 16, 13, '#ffd23f', 'center');
            drawText(a.cls + ' Lv.' + a.level, px, py + 34, 11, '#9aa7c0', 'center');
            drawText('HP ' + Math.round(a.hp) + ' / ' + a.maxHp, px, py + 50, 11, '#ff8a8a', 'center');
            drawText('ATK ' + a.atk + '  DEF ' + a.def, px, py + 66, 11, '#ffd2a8', 'center');
            drawText('GOLD ' + a.gold + '  心情 ' + a.mood.toFixed(1), px, py + 82, 10, '#7ce38b', 'center');
            if (hasW) {
              drawText('武器 ' + a.weapon.name + ' +' + a.weapon.atk, px, py + 98, 10, '#cfe8ff', 'center');
            }
          }
        }
      });
    }

    // ==== 建筑像素蒙版遮挡修正（SpriteKit 内置判定）====
    // 角色脚底点落在建筑抠图的不透明像素内 → 角色在建筑后方（建筑盖住角色）
    // 包围盒重叠但脚底点不在蒙版内 → 角色在建筑前方（角色画在建筑之上）
    const CH_HALF_W = 40, CH_H = 112;
    for (const it of items) {
      if (!it.feet) continue;
      let behindKey = null, maxFront = it.y;
      for (const br of buildingRects) {
        const BW = br.scale ? Math.round(160 * br.scale) : 160;   // 每个建筑按实际缩放
        const overlap = it.feet.x + CH_HALF_W > br.cx - BW / 2 && it.feet.x - CH_HALF_W < br.cx + BW / 2 &&
          it.feet.y > br.topY - 4 && it.feet.y - CH_H < br.groundY;
        if (!overlap) continue;
        const inside = SpriteKit.isOccluded(it.feet.x, it.feet.y, br);
        if (inside) behindKey = behindKey == null ? br.keyY : Math.min(behindKey, br.keyY);
        else maxFront = Math.max(maxFront, br.keyY + 0.5);
      }
      if (behindKey != null) it.y = behindKey - 0.5;
      else if (maxFront > it.y) it.y = maxFront;
    }

    // 按 y 深度排序并渲染
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
  }

  function renderFloats() {
    // 飘字
    for (let i = S.floatTexts.length - 1; i >= 0; i--) {
      const f = S.floatTexts[i];
      f.t += 16.7;
      f.y -= 0.4;
      if (f.t > f.life) { S.floatTexts.splice(i, 1); continue; }
      const alpha = clamp(1 - f.t / f.life, 0, 1);
      ctx.globalAlpha = alpha;
      drawPixelText(f.txt, f.x - f.txt.length * 4, f.y, 14, f.color, 'center');
      ctx.globalAlpha = 1;
    }
    // 粒子
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.t += 16.7;
      p.y += p.vy * 0.016;
      if (p.t > p.life) { S.particles.splice(i, 1); continue; }
      const alpha = clamp(1 - p.t / p.life, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
      ctx.fillRect(p.x + 6, p.y + 4, 4, 4);
      ctx.globalAlpha = 1;
    }
  }

  function renderToast() {
    if (!S.toast) return;
    const dt = performance.now() - S.toast.t;
    if (dt > 2400) { S.toast = null; return; }
    const alpha = clamp(1 - dt / 2400, 0, 1);
    ctx.globalAlpha = alpha;
    const w = Math.min(520, S.toast.msg.length * 14 + 40);
    const x = (W - w) / 2;
    ctx.fillStyle = 'rgba(10,14,24,0.9)';
    roundedRect(x, H - 60, w, 44, 8);
    ctx.fill();
    ctx.strokeStyle = S.toast.type === 'good' ? '#7ce38b' : S.toast.type === 'warn' ? '#ff5c5c' : '#4a9eff';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawText(S.toast.msg, W / 2, H - 50, 15, '#fff', 'center');
    ctx.globalAlpha = 1;
  }

  /* ============ 放置模式：提示 + 地图预览 ============ */
  function cancelPlaceMode() {
    S.placeMode = null;
    S.selectedBuild = null;
    S.selectedDecor = null;
  }

  function renderPlacePreview() {
    if (!S.placeMode) return;
    const g = screenToGrid(mouse.x + camera.x, mouse.y + camera.y);
    const t = performance.now() / 300;
    const pulse = 0.25 + Math.abs(Math.sin(t)) * 0.2;

    if (S.placeMode === 'building' && S.selectedBuild) {
      // 2x2 大菱形预览（hover 格为左上角）
      const ok = canPlaceBuilding(g.gx, g.gy);
      const c = gridToScreen(g.gx + 1, g.gy + 1);
      ctx.fillStyle = ok ? `rgba(124,227,139,${pulse})` : `rgba(255,92,92,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - TILE_H);
      ctx.lineTo(c.x + TILE_W, c.y);
      ctx.lineTo(c.x, c.y + TILE_H);
      ctx.lineTo(c.x - TILE_W, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ok ? '#7ce38b' : '#ff5c5c';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 调试：放置方块的两条底边（青色 5px 虚线）
      if (S.debugBuildingBase) {
        ctx.save();
        ctx.setLineDash([8, 5]);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(c.x - TILE_W, c.y);              // 左角
        ctx.lineTo(c.x, c.y + TILE_H);              // 下角尖
        ctx.lineTo(c.x + TILE_W, c.y);              // 右角
        ctx.stroke();
        ctx.restore();
      }
      // 提示条
      drawPanel(60, 915, 930, 60, 'rgba(10,14,24,0.85)', ok ? '#7ce38b' : '#ff5c5c', 2);
      drawText(ok
        ? `点击放置 ${BUILD_DEFS[S.selectedBuild].name}（${buildingCost(S.selectedBuild)}💰）· 右键/ESC 取消`
        : '此处放不下：需要村内 2x2 空地，不能压道路/装饰/建筑',
        525, 933, 17, ok ? '#7ce38b' : '#ff8a8a', 'center');
      return;
    }
    if (S.placeMode === 'road') {
      const ok = canPlaceSingle(g.gx, g.gy) && S.gold >= ROAD_COST;
      const p = gridToScreen(g.gx, g.gy);
      ctx.fillStyle = ok ? `rgba(217,196,145,${pulse + 0.15})` : `rgba(255,92,92,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      ctx.lineTo(p.x, p.y + TILE_H);
      ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ok ? '#d9c491' : '#ff5c5c';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawPanel(60, 915, 930, 60, 'rgba(10,14,24,0.85)', '#d9c491', 2);
      drawText('🛣️ 铺路中：点击空地连续铺设 · 右键/ESC 结束', 525, 933, 17, '#d9c491', 'center');
      return;
    }
    if (S.placeMode === 'decor' && S.selectedDecor) {
      const def = DECOR_DEFS[S.selectedDecor];
      const ok = canPlaceSingle(g.gx, g.gy) && S.gold >= def.cost;
      const p = gridToScreen(g.gx, g.gy);
      ctx.fillStyle = ok ? `rgba(124,227,139,${pulse})` : `rgba(255,92,92,${pulse})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      ctx.lineTo(p.x, p.y + TILE_H);
      ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ok ? '#7ce38b' : '#ff5c5c';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawPanel(60, 915, 930, 60, 'rgba(10,14,24,0.85)', ok ? '#7ce38b' : '#ff5c5c', 2);
      drawText(ok
        ? `点击放置 ${def.name}（${def.cost}💰）· 右键/ESC 取消`
        : '只能放在空地上',
        525, 933, 17, ok ? '#7ce38b' : '#ff8a8a', 'center');
      return;
    }
    if (S.placeMode === 'demolish') {
      const v = cellType(g.gx, g.gy);
      const has = v === 1 || v === 2 || v === 3;
      const p = gridToScreen(g.gx, g.gy);
      ctx.fillStyle = has ? `rgba(255,92,92,${pulse})` : 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      ctx.lineTo(p.x, p.y + TILE_H);
      ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = has ? '#ff5c5c' : '#66738f';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawPanel(60, 915, 930, 60, 'rgba(10,14,24,0.85)', '#ff5c5c', 2);
      drawText('🧹 拆除中：点击道路/装饰/建筑 · 右键/ESC 结束', 525, 933, 17, '#ff8a8a', 'center');
    }
  }

  /* ============ 点击处理 ============ */
  function handleClicks(c) {
    const x = c.x, y = c.y;

    // ===== 地图区域 =====
    const g = screenToGrid(x + camera.x, y + camera.y);

    // 放置模式
    if (S.placeMode === 'building' && S.selectedBuild) {
      if (placeBuildingAt(S.selectedBuild, g.gx, g.gy)) {
        cancelPlaceMode();   // 建筑放一次退出
      }
      return;
    }
    if (S.placeMode === 'road') {
      placeRoadAt(g.gx, g.gy);   // 连续铺路
      return;
    }
    if (S.placeMode === 'decor' && S.selectedDecor) {
      placeDecorAt(S.selectedDecor, g.gx, g.gy);   // 连续放装饰
      return;
    }
    if (S.placeMode === 'demolish') {
      demolishAt(g.gx, g.gy);
      return;
    }

    // 非放置模式：点击建筑升级（命中矩形为世界坐标[黄线同源]，鼠标屏幕→世界后比较，与相机解耦）
    const wx = x + camera.x, wy = y + camera.y;
    // 点击人物/怪物 → 显示属性面板 10 秒（优先于建筑升级）
    for (const a of S.adventurers) {
      if (wx >= a.x - 22 && wx <= a.x + 22 && wy >= a.y - 40 && wy <= a.y + 14) { a._infoT = 10; return; }
    }
    for (const s of S.slimes) {
      if (s.dead) continue;
      if (wx >= s.x - s.size / 2 && wx <= s.x + s.size / 2 && wy >= s.y - s.size && wy <= s.y + s.size + 6) { s._infoT = 10; return; }
    }
    for (const b of S.buildings) {
      const hit = S.buildingHits && S.buildingHits[b.id];
      if (hit && wx >= hit.x && wx <= hit.x + hit.w && wy >= hit.y && wy <= hit.y + hit.h) {
        upgradeBuilding(b);
        return;
      }
    }
  }

  /* ============ 鼠标 ============ */
  let mouse = { x: 0, y: 0 };
  let clickQueue = [];
  let camDrag = null;      // 相机拖拽（非放置模式）
  let camMoved = false;    // 本次按下是否产生过拖拽（拖拽后忽略 click）
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    // 画布=窗口（无缩放）：鼠标逻辑坐标 = 画布内物理像素
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('click', e => {
    if (camMoved) { camMoved = false; return; }   // 拖拽滚动不触发点击
    const r = canvas.getBoundingClientRect();
    clickQueue.push({ x: e.clientX - r.left, y: e.clientY - r.top });
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // 左键：任意模式（含建造/工具）按住可拖拽滚动相机，纯点击才触发放置/升级；右键：取消放置模式
  canvas.addEventListener('mousedown', e => {
    if (S.screen !== 'game') return;
    if (e.button === 2) { cancelPlaceMode(); return; }
    if (e.button === 0) {
      camDrag = { sx: e.clientX, sy: e.clientY, cx: camera.x, cy: camera.y };
      camMoved = false;
    }
  });
  window.addEventListener('mousemove', e => {
    if (camDrag && S.screen === 'game') {
      // 画布=窗口：拖拽像素位移 = 相机位移
      if (Math.abs(e.clientX - camDrag.sx) > 4 || Math.abs(e.clientY - camDrag.sy) > 4) camMoved = true;
      camera.x = clamp(camDrag.cx - (e.clientX - camDrag.sx), camera.minX, camera.maxX);
      camera.y = clamp(camDrag.cy - (e.clientY - camDrag.sy), camera.minY, camera.maxY);
    }
  });
  window.addEventListener('mouseup', () => { camDrag = null; });
  // ESC 取消放置模式
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.screen === 'game') cancelPlaceMode();
  });

  function popClicks() {
    if (clickQueue.length === 0) return null;
    return clickQueue.shift();
  }

  /* ============ 场景注册（对象化） ============ */
  SceneManager.register('title', {
    name: 'title',
    render() { renderTitle(); },
    handleClick(c) {
      const x = c.x, y = c.y;
      if (x >= W / 2 - 225 && x <= W / 2 + 225) {
        if (y >= 405 && y <= 483) newGame();
        else if (y >= 507 && y <= 585) SceneManager.switchTo('help');
      }
    },
  });
  SceneManager.register('help', {
    name: 'help',
    render() { renderHelp(); },
    handleClick(c) {
      if (c.x >= W / 2 - 180 && c.x <= W / 2 + 180 && c.y >= H - 120 && c.y <= H - 50) {
        SceneManager.switchTo('title');
      }
    },
  });
  SceneManager.register('game', {
    name: 'game',
    enter() { S.screen = 'game'; },
    update(dt) {
      if (S.speed > 0 && !S.paused) {
        const mult = S.speed === 1 ? 1 : S.speed === 2 ? 3 : 6;
        advanceTime(dt * mult);
        updateAdventurers(dt * mult);
        updateSlimes(dt * mult);
        updateCrops(dt * mult);
      }
    },
    render() {
      try {
        renderGame();
      } catch (e) {
        // 渲染出错时兜底：至少画个背景，避免全黑
        ctx.fillStyle = '#1a2e1a';
        ctx.fillRect(0, 0, W, H);
        drawText('渲染出错: ' + e.message, 100, 100, 14, '#ff5c5c');
        if (window.__ERR_STACK__ === undefined) { window.__ERR_STACK__ = e.stack || ''; console.error('RENDER ERR', e); }
      }
    },
    handleClick(c) { handleClicks(c); },
  });
  SceneManager.switchTo('title');

  /* ============ 主循环 ============ */
  function gameLoop(t) {
    if (!S.lastTime) S.lastTime = t;
    const dt = Math.min(80, t - S.lastTime);
    S.lastTime = t;
    gDt = dt / 1000;   // 秒数（供属性面板倒计时）

    // 自动存档（游戏中每 5 秒节流）
    if (S.screen === 'game') {
      if (S._saveT === undefined) S._saveT = 0;
      S._saveT += dt;
      if (S._saveT > 5000) { S._saveT = 0; saveGame(); }
    }

    const sc = SceneManager.current;
    if (sc) {
      if (sc.update && S.screen === 'game') sc.update(dt);
      if (sc.render) sc.render();
      const c = popClicks();
      if (c && sc.handleClick) sc.handleClick(c);
    }

    requestAnimationFrame(gameLoop);
  }

  /* ============ 启动 ============ */

  // 自动检测贴图内容菱形四角（算法：按 PNG 非透明内容找上/右/下/左尖角，返回归一化 0..1）
  // 站立建筑透视变换：顶部矩形不动，底部按 corner 夹角做 V 形（原游戏 drawTri 网格技术，不压平贴地）
  function drawBuildingV(ctx, img, cx, topY, groundY, dw, corner, N) {
    const ow0 = img.naturalWidth, oh0 = img.naturalHeight;
    const n = N || 16;
    const Src = (u, v) => ({ x: u * ow0, y: v * oh0 });
    const Dst = (u, v) => {
      const x = cx + (u - 0.5) * dw;
      const bottomY = groundY + (1 - Math.abs(u - 0.5) * 2) * corner;   // 底部 V 形（corner 调夹角）
      return { x, y: topY + v * (bottomY - topY) };
    };
    const drawTri = (s, d) => {
      const ux = s[1].x - s[0].x, uy = s[1].y - s[0].y, vx = s[2].x - s[0].x, vy = s[2].y - s[0].y;
      const den = ux * vy - vx * uy; if (!den) return;
      const wux = d[1].x - d[0].x, wuy = d[1].y - d[0].y, wvx = d[2].x - d[0].x, wvy = d[2].y - d[0].y;
      const a = (wux * vy - wvx * uy) / den, c = (wvx * ux - wux * vx) / den;
      const b = (wuy * vy - wvy * uy) / den, dd = (wvy * ux - wuy * vx) / den;
      const e = d[0].x - a * s[0].x - c * s[0].y, f = d[0].y - b * s[0].x - dd * s[0].y;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(d[0].x, d[0].y); ctx.lineTo(d[1].x, d[1].y); ctx.lineTo(d[2].x, d[2].y); ctx.closePath();
      ctx.clip();
      ctx.transform(a, b, c, dd, e, f);
      ctx.drawImage(img, 0, 0, ow0, oh0);
      ctx.restore();
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u0 = i / n, v0 = j / n, u1 = (i + 1) / n, v1 = (j + 1) / n;
      const s00 = Src(u0, v0), s10 = Src(u1, v0), s11 = Src(u1, v1), s01 = Src(u0, v1);
      const d00 = Dst(u0, v0), d10 = Dst(u1, v0), d11 = Dst(u1, v1), d01 = Dst(u0, v1);
      drawTri([s00, s10, s11], [d00, d10, d11]);
      drawTri([s00, s11, s01], [d00, d11, d01]);
    }
  }

  // 透视变换离屏缓存：corner 变时生成一次（GPU 加速图像变换），每帧只 blit 一张图（流畅）
  function getPerspCanvas(btype, img, corner, dw, dh) {
    const key = btype + '|' + corner;
    let pc = S.perspCache[key];
    if (pc) return pc;
    const ratio = img.bottomRatio || 1;
    const w = Math.max(2, Math.ceil(dw));
    const h = Math.max(4, Math.ceil(ratio * dh + Math.max(0, corner) + 4));
    pc = document.createElement('canvas');
    pc.width = w; pc.height = h;
    const g = pc.getContext('2d');
    drawBuildingV(g, img, w / 2, 0, ratio * dh, dw, corner, 10);
    S.perspCache[key] = pc;
    return pc;
  }

  function detectFarmCorners(img) {
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) return null;
    const cv2 = document.createElement('canvas'); cv2.width = W; cv2.height = H;
    const g = cv2.getContext('2d');
    g.drawImage(img, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, W, H).data; } catch (e) { return null; }
    const col = x => { let lo = H, hi = -1; for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 30) { if (y < lo) lo = y; if (y > hi) hi = y; } return lo <= hi ? (lo + hi) / 2 : -1; };
    const row = y => { let lo = W, hi = -1; for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 30) { if (x < lo) lo = x; if (x > hi) hi = x; } return lo <= hi ? (lo + hi) / 2 : -1; };
    let minY = H, maxY = -1, minX = W, maxX = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 30) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (minX > maxX || minY > maxY) return null;
    return {
      top: [row(minY) / W, minY / H],
      right: [maxX / W, col(maxX) / H],
      bottom: [row(maxY) / W, maxY / H],
      left: [minX / W, col(minX) / H],
    };
  }

  /* ═══ 隐藏浮动控制板（建筑透视微调，热键 ~ 切换）═══ */
  let tbCurrent = null;
  function initTweakBoard() {
    const board = document.getElementById('tweakBoard');
    if (!board) return;
    const menu = document.getElementById('tbMenu');
    if (!menu) return;
    menu.innerHTML = '';
    for (const k in BUILD_DEFS) {
      const b = document.createElement('button');
      b.textContent = (BUILD_DEFS[k].icon || '') + ' ' + BUILD_DEFS[k].name;
      b.dataset.k = k;
      b.style.cssText = 'display:block;width:100%;text-align:left;padding:4px 8px;margin:2px 0;border:1px solid #2a3550;border-radius:6px;background:#182434;color:#cfd;cursor:pointer;font:12px system-ui';
      b.onclick = () => selectTB(k);
      menu.appendChild(b);
    }
    const slider = document.getElementById('tbSlider');
    slider.addEventListener('input', () => {
      document.getElementById('tbVal').textContent = slider.value;
      if (tbCurrent) writeTweak(tbCurrent, { corner: parseInt(slider.value, 10) || 0, dy: parseInt(document.getElementById('tbDY').value, 10) || 0 });
      updateTBAngle();
    });
    const dslider = document.getElementById('tbDY');
    dslider.addEventListener('input', () => {
      document.getElementById('tbDYVal').textContent = dslider.value;
      if (tbCurrent) writeTweak(tbCurrent, { corner: parseInt(slider.value, 10) || 0, dy: parseInt(dslider.value, 10) || 0 });
    });
    updateTBAngle();
  }
  function selectTB(k) {
    tbCurrent = k;
    document.querySelectorAll('#tbMenu button').forEach(b => {
      const on = b.dataset.k === k;
      b.style.background = on ? '#ffd23f' : '#182434';
      b.style.color = on ? '#111a26' : '#cfd';
    });
    const plug = (S.pluginData && S.pluginData.building_perspective && S.pluginData.building_perspective[k]) || null;
    const v = plug ? (plug.corner || 0) : 0;
    const dyv = plug ? (plug.dy || 0) : 0;
    document.getElementById('tbSlider').value = v;
    document.getElementById('tbVal').textContent = v;
    document.getElementById('tbDY').value = dyv;
    document.getElementById('tbDYVal').textContent = dyv;
    updateTBAngle();
  }
  function updateTBAngle() {
    const v = parseInt(document.getElementById('tbSlider').value, 10) || 0;
    document.getElementById('tbAngle').textContent = '黄线夹角 ' + (180 - 2 * Math.atan2(v, 84) * 180 / Math.PI).toFixed(1) + '°';
  }
  // 实时写入插件配置（面向对象：每建筑 {corner 夹角, dy 上下平移}）
  function writeTweak(k, obj) {
    try {
      const raw = localStorage.getItem('kairo_plugin');
      const d = raw ? JSON.parse(raw) : {};
      const bp = (d.data && d.data.building_perspective) ? d.data.building_perspective : {};
      bp[k] = obj;
      localStorage.setItem('kairo_plugin', JSON.stringify({ v: Date.now(), data: { building_perspective: bp } }));
    } catch (e) { /* 忽略 */ }
  }
  window.addEventListener('keydown', e => {
    if (e.key === '`' || e.key === '~') {
      const board = document.getElementById('tweakBoard');
      if (board) board.style.display = (board.style.display === 'none') ? 'block' : 'none';
    }
  });

  const bootEl = document.getElementById('boot');
  loadAssets(() => {
    // 画布铺满窗口并同步逻辑分辨率（点击/悬停按渲染记录的命中矩形判断，基准统一）
    setViewport(window.innerWidth, window.innerHeight);
    bootEl.style.display = 'none';
    requestAnimationFrame(gameLoop);
    initTweakBoard();   // 建筑透视浮动控制板
    // 读"平铺贴地"勾选状态（localStorage 持久化；farm 默认勾）
    try {
      const ff = JSON.parse(localStorage.getItem('flatFit'));
      if (ff) Object.assign(S.flatFit, ff);
    } catch (e) {}
    // —— farm 四角：先自动检测内容菱形四角（算法 = 按 PNG 非透明内容找上/右/下/左尖角），自动对齐，不依赖手动保存 ——
    const imgF = IMG['farm'];
    const autoC = (imgF && imgF.naturalWidth) ? detectFarmCorners(imgF) : null;
    if (autoC) { S.farmCorners = autoC; console.log('[farm] 自动检测四角', autoC); }
    // 仅自动检测失败时，回退到浏览器本地(localStorage) / farm_coords.json / 内嵌 FARM_CORNERS
    if (!autoC) {
      const applyFarmCorners = (d) => {
        if (d && d.top && d.right && d.bottom && d.left && d.w && d.h) {
          S.farmCorners = {
            top: [d.top[0] / d.w, d.top[1] / d.h],
            right: [d.right[0] / d.w, d.right[1] / d.h],
            bottom: [d.bottom[0] / d.w, d.bottom[1] / d.h],
            left: [d.left[0] / d.w, d.left[1] / d.h],
          };
          console.log('[farm] 已加载四角配置', S.farmCorners);
          return true;
        }
        return false;
      };
      try {
        const ls = localStorage.getItem('farm_corners');
        if (ls && applyFarmCorners(JSON.parse(ls))) {
          // 本地命中即用，跳过文件 fetch
        } else {
          fetch('farm_coords.json?t=' + Date.now(), { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : Promise.reject()))
            .then(d => applyFarmCorners(d))
            .catch(() => { /* 无配置文件时用内嵌 FARM_CORNERS */ });
        }
      } catch (e) {
        fetch('farm_coords.json?t=' + Date.now(), { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : Promise.reject()))
          .then(d => applyFarmCorners(d))
          .catch(() => { /* 无配置文件时用内嵌 FARM_CORNERS */ });
      }
    }
    // 有存档：自动续玩（进游戏），否则留在标题页
    if (hasSave()) loadGame();
  });

  // 调试钩子（ui.js 模态菜单通过此接口驱动游戏）
  window.__VILLAGE = {
    S, newGame, saveGame, loadGame, hasSave, clearSave, placeBuildingAt, placeRoadAt, placeDecorAt, demolishAt, upgradeBuilding,
    makeAdventurer, makeSlime, advanceTime, updateAdventurers, updateSlimes, onNewDay,
    handleClicks, IMG, IMG_SRC, SpriteKit, SceneManager, Content: C, Engine: E,
    camera, setViewport,   // 相机（地图滚动）+ 窗口铺满同步
    // —— HTML 模态 UI 专用接口 ——
    setPlaceMode(mode, key) {
      S.placeMode = mode;
      S.selectedBuild = mode === 'building' ? key : null;
      S.selectedDecor = mode === 'decor' ? key : null;
      if (mode && S.screen !== 'game') return;
    },
    cancelPlaceMode,
    setSpeed(i) { S.speed = i; },
    toggleDebug() {
      S.debugBuildingBase = !S.debugBuildingBase;
      toast(S.debugBuildingBase ? '📐 对齐辅助线已显示' : '📐 对齐辅助线已隐藏', 'info');
      return S.debugBuildingBase;
    },
    buildingCost,
    fmt,
  };
})();
