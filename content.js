/* ============================================================
 * 冒险村物语 - 内容配置（引擎与内容分离）
 * 所有玩法数值/名称/贴图引用都在这里，引擎（game.js）只负责读取
 * ============================================================ */
(function (global) {
  'use strict';

  /* ============ 名字池 ============ */
  const HERO_NAMES = ['勇者凯尔', '剑士莉娜', '游侠阿隆', '法师梅琳', '牧师露西', '盗贼莱恩', '战士戈登', '弓手伊芙', '贤者奥利', '女武神薇拉', '武僧塔克', '枪兵雷诺'];
  const RANDOM_TALK = ['今天去哪里冒险？', '装备还不赖吧！', '这个村子真热闹', '听说北边有龙！', '打完这仗就去喝酒', '新来的伙伴加油！'];
  const LEVEL_NAMES = ['F级冒险者', 'E级冒险者', 'D级冒险者', 'C级冒险者', 'B级冒险者', 'A级冒险者', 'S级冒险者', 'SS级冒险者', '传说级冒险者'];

  /* ============ 设施定义 ============ */
  const BUILD_DEFS = {
    inn:       { name: '旅店',   icon: '🏨', desc: '冒险者住宿恢复体力', baseCost: 150, income: 8,  maxLevel: 5, w: 96, h: 72, image: 'inn',       effect: 'inn' },
    tavern:    { name: '酒馆',   icon: '🍺', desc: '喝酒聊天提升心情',   baseCost: 200, income: 12, maxLevel: 5, w: 96, h: 72, image: 'tavern',    effect: 'tavern' },
    weapon:    { name: '武器店', icon: '⚔️', desc: '出售武器提升战力',   baseCost: 300, income: 15, maxLevel: 5, w: 96, h: 72, image: 'weapon',    effect: 'weapon' },
    shop:      { name: '杂货店', icon: '🧺', desc: '出售冒险补给品',     baseCost: 180, income: 10, maxLevel: 5, w: 96, h: 72, image: 'shop',      effect: 'shop' },
    bakery:    { name: '面包店', icon: '🥖', desc: '卖面包冒险者吃饱',   baseCost: 220, income: 13, maxLevel: 5, w: 96, h: 72, image: 'bakery',    effect: 'bakery' },
    magicshop: { name: '魔法屋', icon: '🔮', desc: '魔法道具强化法术',   baseCost: 350, income: 18, maxLevel: 5, w: 96, h: 72, image: 'magicshop', effect: 'magicshop' },
    training:  { name: '训练场', icon: '🥋', desc: '训练提升攻击防御',   baseCost: 400, income: 20, maxLevel: 5, w: 96, h: 72, image: 'training',  effect: 'training' },
    clinic:    { name: '治疗所', icon: '💊', desc: '治疗重伤冒险者',     baseCost: 280, income: 16, maxLevel: 5, w: 96, h: 72, image: 'clinic',    effect: 'clinic' },
    castle:    { name: '大城堡', icon: '🏰', desc: '村庄地标，冒险者朝圣', baseCost: 2000, income: 45, maxLevel: 3, w: 150, h: 120, image: 'castle', size: 2, effect: 'castle' },
    farm:      { name: '农场',   icon: '🚜', desc: '提供农田，冒险者自种自收自卖', baseCost: 320, income: 14, maxLevel: 5, w: 96, h: 72, image: 'farm',      effect: 'farm' },
    seedshop:  { name: '种子商店', icon: '🌰', desc: '卖种子·收作物', baseCost: 260, income: 12, maxLevel: 5, w: 96, h: 72, image: 'seedshop',  effect: 'seedshop' },
  };

  /* ============ 种子 / 作物定义（种 → 收 → 卖）============ */
  const SEED_DEFS = {
    cabbage: { seedName: '白菜种子', cropName: '白菜', emoji: '🥬', seedCost: 10, sellPrice: 24, growTime: 25000 },
    carrot:  { seedName: '胡萝卜种子', cropName: '胡萝卜', emoji: '🥕', seedCost: 16, sellPrice: 42, growTime: 40000 },
    wheat:   { seedName: '小麦种子', cropName: '小麦', emoji: '🌾', seedCost: 24, sellPrice: 66, growTime: 60000 },
    pumpkin: { seedName: '南瓜种子', cropName: '南瓜', emoji: '🎃', seedCost: 40, sellPrice: 112, growTime: 90000 },
    ginseng: { seedName: '人参种子', cropName: '人参', emoji: '🌿', seedCost: 90, sellPrice: 260, growTime: 140000 },
  };

  /* 装饰定义（玩家可放置，1x1 占格，不可走） */
  const DECOR_DEFS = {
    tree:      { name: '树木', icon: '🌲', desc: '美化村庄', cost: 20 },
    fruittree: { name: '果树', icon: '🌳', desc: '美化+收获', cost: 30 },
    lamp:      { name: '路灯', icon: '🏮', desc: '夜间照明', cost: 40 },
    flag:      { name: '旗帜', icon: '🚩', desc: '提升氛围', cost: 25 },
    chest:     { name: '宝箱', icon: '📦', desc: '冒险者围观', cost: 50 },
    fountain:  { name: '喷泉', icon: '⛲', desc: '村庄地标', cost: 80 },
    well:      { name: '水井', icon: '🪣', desc: '解渴之地', cost: 60 },
    fence_a:   { name: '围栏·横', icon: '🪵', desc: '沿南北边（/方向）的栅栏段', cost: 15 },
    fence_b:   { name: '围栏·竖', icon: '🪵', desc: '沿东西边（\方向）的栅栏段', cost: 15 },
  };

  /* 冒险者职业定义（可爱Q版立绘） */
  const CLASS_DEFS = {
    knight:   { name: '骑士',   img: 'ck_knight',   atk: 8,  def: 6, hp: 130 },
    mage:     { name: '法师',   img: 'ck_mage',     atk: 10, def: 2, hp: 85 },
    priest:   { name: '牧师',   img: 'ck_priest',   atk: 4,  def: 3, hp: 100, healer: true },
    archer:   { name: '弓手',   img: 'ck_archer',   atk: 8,  def: 3, hp: 90 },
    monk:     { name: '武僧',   img: 'ck_monk',     atk: 7,  def: 4, hp: 110 },
    rogue:    { name: '盗贼',   img: 'ck_rogue',    atk: 9,  def: 2, hp: 85 },
    valkyrie: { name: '女武神', img: 'ck_valkyrie', atk: 8,  def: 5, hp: 105 },
    paladin:  { name: '圣骑士', img: 'ck_paladin',  atk: 6,  def: 8, hp: 140 },
  };

  /* 怪物定义 */
  const MONSTER_DEFS = {
    slime:     { name: '史莱姆', img: 'slime',     hp: 35,  atk: 3, exp: 10, gold: 6,  size: 56 },
    goblin:    { name: '哥布林', img: 'goblin',    hp: 50,  atk: 5, exp: 18, gold: 10, size: 56 },
    bat:       { name: '蝙蝠',   img: 'bat',       hp: 25,  atk: 4, exp: 12, gold: 8,  size: 56 },
    slimeking: { name: '史莱姆王', img: 'slimeking', hp: 120, atk: 8, exp: 45, gold: 30, size: 72, boss: true },
  };

  /* 设施效果图标（冒险者消费气泡用） */
  const BUILD_ICONS = { inn: '💤', tavern: '🍺', weapon: '⚔️', shop: '🧺', bakery: '🥖', magicshop: '🔮', training: '🥋', clinic: '💊', castle: '🏰', farm: '🚜', seedshop: '🌰' };

  /* 装饰渲染尺寸（深排渲染用） */
  const DECOR_SIZE = {
    tree: [90, 118], fruittree: [90, 118], fountain: [84, 98],
    chest: [56, 46], lamp: [48, 76], flag: [42, 70], well: [62, 72],
    fence_a: [92, 74], fence_b: [70, 73],
  };

  /* 初始地图配置 */
  const INIT_ROADS = ['3,2', '4,2', '5,2', '6,2', '7,2', '5,3', '5,4'];
  const INIT_BUILDINGS = [{ type: 'inn', gx: 3, gy: 3 }];
  const INIT_DECORS = [{ img: 'tree', gx: 1, gy: 1 }, { img: 'tree', gx: 8, gy: 1 }];

  const ROAD_COST = 5;   // 每格道路价格

  global.Content = {
    HERO_NAMES,
    RANDOM_TALK,
    LEVEL_NAMES,
    BUILD_DEFS,
    DECOR_DEFS,
    CLASS_DEFS,
    MONSTER_DEFS,
    BUILD_ICONS,
    SEED_DEFS,
    DECOR_SIZE,
    INIT_ROADS,
    INIT_BUILDINGS,
    INIT_DECORS,
    ROAD_COST,
  };
})(window);
