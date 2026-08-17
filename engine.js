/* ============================================================
 * 冒险村物语 - 引擎核心（实体工厂 + 场景管理器）
 * 依赖 global.Content（内容配置）与 global.Sprites（素材）
 * ============================================================ */
(function (global) {
  'use strict';
  const C = global.Content;
  const Sp = global.Sprites;

  // 引擎配置（等距投影等）
  const TILE_W = 84, TILE_H = 42;
  const MAP_COLS = 42, MAP_ROWS = 42;   // 60x60 → 42x42（面积约减半）
  const MAP_OX = 456, MAP_OY = 80;
  const WILD_GX = 0, WILD_GY = 0;       // 占位（怪物区由 game.js 初始布局规划）

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 等距投影：grid -> screen
  function gridToScreen(gx, gy) {
    return { x: MAP_OX + (gx - gy) * TILE_W / 2, y: MAP_OY + (gx + gy) * TILE_H / 2 };
  }
  // 屏幕 -> grid（粗略）
  function screenToGrid(sx, sy) {
    const dx = sx - MAP_OX, dy = sy - MAP_OY;
    const gx = (dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2;
    const gy = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;
    return { gx: Math.floor(gx), gy: Math.floor(gy) };
  }

  /* ============ 实体工厂（对象化） ============ */
  function makeBuilding(type, gx, gy) {
    const def = C.BUILD_DEFS[type];
    if (!def) throw new Error('未知建筑类型: ' + type);
    // 建筑占格 size x size（默认 2x2，城堡 3x3）：中心 = 左上角格 + size/2 格偏移
    const size = def.size || 2;
    const centerGx = gx + size / 2, centerGy = gy + size / 2;
    const pos = gridToScreen(centerGx, centerGy);
    return {
      type: type,
      name: def.name,
      level: 1,
      gx: gx, gy: gy,   // 2x2 左上角
      x: pos.x, y: pos.y,
      w: def.w, h: def.h,
      glow: 0,          // 消费时发光动画
      cool: 0,          // 冷却
      customers: 0,
      totalEarned: 0,
      image: def.image,
    };
  }

  // 游戏逻辑钩子（由 game.js 注入，避免引擎依赖具体寻路实现）
  let walkHooks = {};
  function setWalkHooks(h) { walkHooks = h || {}; }

  function makeAdventurer(fromGate, opts) {
    const o = opts || {};
    const classKeys = Object.keys(C.CLASS_DEFS);
    const cls = C.CLASS_DEFS[classKeys[rndi(0, classKeys.length - 1)]];
    const gatePos = walkHooks.gatePos ? walkHooks.gatePos() : gridToScreen(5, 0);
    const randPos = walkHooks.randomWalkablePoint ? walkHooks.randomWalkablePoint() : null;
    const sp = randPos ? { x: randPos.x, y: randPos.y } : { x: gatePos.x, y: gatePos.y + TILE_H / 2 };
    return {
      name: C.HERO_NAMES[rndi(0, C.HERO_NAMES.length - 1)],
      cls: cls.name,
      img: cls.img,
      healer: !!cls.healer,
      x: fromGate ? gatePos.x : sp.x,
      y: fromGate ? gatePos.y + TILE_H / 2 : sp.y,
      curGx: 0, curGy: 0,
      targetX: 0, targetY: 0,
      path: null,          // 当前网格路径
      pathIdx: 0,
      state: fromGate ? 'enter' : 'wander',   // enter | wander | moveTo | useFacility | adventure | leave
      hp: cls.hp, maxHp: cls.hp,
      atk: cls.atk, def: cls.def,
      level: 1, exp: 0,
      gold: rndi(30, 100),
      speed: rnd(50, 90),
      mood: 80,
      bubble: null, bubbleT: 0,
      bubbleType: null,
      animT: 0,          // 行走动画计时
      animFlip: false,
      targetBld: null,
      targetSlime: null,
      adventureTimer: 0,
      restTimer: 0,
      leaveT: 0,
      tired: 0,          // 疲劳值
      equipped: 0,       // 装备加成
      favorite: Object.keys(C.BUILD_DEFS)[rndi(0, Object.keys(C.BUILD_DEFS).length - 1)],
    };
  }

  function makeSlime() {
    // 随机怪物类型（史莱姆/哥布林/蝙蝠，Boss 概率低）
    const types = ['slime', 'goblin', 'bat'];
    const type = Math.random() < 0.08 ? 'slimeking' : types[rndi(0, types.length - 1)];
    const def = C.MONSTER_DEFS[type];
    const pos = gridToScreen(WILD_GX + rnd(-1.5, 1.5), WILD_GY + rnd(-0.5, 1.5));
    return {
      type: type,
      img: def.img,
      name: def.name,
      boss: !!def.boss,
      x: pos.x + rnd(-8, 8),
      y: pos.y + rnd(-4, 4),
      hp: def.hp, maxHp: def.hp,
      atk: def.atk,
      exp: def.exp,
      gold: def.gold,
      size: def.size,
      animT: 0,
      dead: false,
    };
  }

  /* ============ 场景管理器（对象化） ============ */
  // 场景 = { name, enter(), exit(), update(dt), render(), handleClick(c), renderBackground() }
  const SceneManager = {
    scenes: {},
    current: null,

    register(name, scene) {
      this.scenes[name] = scene;
    },
    switchTo(name) {
      const next = this.scenes[name];
      if (!next) { console.error('未知场景: ' + name); return; }
      if (this.current && this.current.exit) this.current.exit();
      this.current = next;
      if (next.enter) next.enter();
    },
    get name() {
      return this.current ? this.current.name : null;
    },
  };

  // 帮助场景（纯静态页面）
  SceneManager.register('help', {
    name: 'help',
  });

  global.Engine = {
    TILE_W, TILE_H, MAP_COLS, MAP_ROWS, MAP_OX, MAP_OY, WILD_GX, WILD_GY,
    rnd, rndi, clamp,
    gridToScreen, screenToGrid,
    makeBuilding, makeAdventurer, makeSlime,
    setWalkHooks,
    SceneManager,
  };
})(window);
