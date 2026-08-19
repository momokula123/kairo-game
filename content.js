/* ============================================================
 * 冒险村物语 - 内容配置（引擎与内容分离）
 * 所有玩法数值/名称/贴图引用都在这里，引擎（game.js）只负责读取
 * ============================================================
 *
 * ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
 * ★ 开发铁规（AI 与开发者必须严格遵守，不得跳过/自行特判）★
 * ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
 * 新增任何内容，必须【完整走下面的注册管线】。注册点缺一 =
 * 该内容缺 底边对齐 / 蒙版遮挡 / 阴影 / 存档 等能力 → 视为开发事故。
 * 禁止对单一内容写 if 特判（黄线、尺寸、阴影等一律走统一管线，
 * 严格参考旅店 inn / 骑士 ck_knight 的既有注册）。
 *
 * 一、新增【建筑】—— 共 9 处，全做：
 *   1. content.js BUILD_DEFS        定义（name/icon/desc/baseCost/income/
 *                                   maxLevel/w/h/image/effect/size）
 *   2. content.js BUILD_ICONS       消费气泡图标（对话类，可用汉字/emoji）
 *   3. sprites.js IMG_SRC           贴图引用 'assets/xxx.png'
 *   4. sprites.js ALIGN_KEYS        底边自动对齐（必须）
 *   5. sprites.js MASK_KEYS         像素蒙版遮挡 → 角色会被建筑盖住（必须）
 *   6. sprites.js SHADOW_KEYS       形状蒙版阴影（必须）
 *   7. sprites.js Shadow.config.shrinkX/projScale   建筑 = 1 / 1
 *   8. sprites.js 阴影条带          复用旅店 inn 的条带（方形小屋近似），
 *                                   key 形如 '新建筑|0|0|84'
 *   9. assets/xxx.png               透明 PNG、正方形、建筑底部贴地、无底部噪点
 *
 * 二、新增【人物职业】：
 *   1. content.js CLASS_DEFS        定义（name/img/atk/def/hp，healer 可选）
 *   2. sprites.js IMG_SRC           立绘 'assets/ck_xxx.png'
 *   3. sprites.js ALIGN_KEYS        底边对齐
 *   4. sprites.js SHADOW_KEYS       阴影
 *   5. sprites.js shrinkX/projScale 人物 = 0.03 / 0.5
 *   6. sprites.js 阴影条带          缓存（人物形状条带）
 *
 * 三、新增【怪物】：
 *   1. content.js MONSTER_DEFS      定义（name/img/hp/atk/exp/gold/size，boss 可选）
 *   2. sprites.js IMG_SRC / ALIGN_KEYS / SHADOW_KEYS / shrinkX(0.03)/projScale(0.5) / 条带
 *
 * 四、新增【装饰】：
 *   1. content.js DECOR_DEFS + DECOR_SIZE（渲染尺寸）
 *   2. sprites.js IMG_SRC / ALIGN_KEYS / SHADOW_KEYS / shrinkX(0.03)/projScale(0.5) / 条带
 *
 * 五、新增【武器】：
 *   1. content.js WEAPON_DEFS       定义（name/atk/price）
 *
 * 【贴图规格铁规】透明 PNG / 正方形 / 主体居中 / 底部贴地 / 清理孤立噪点像素。
 * 【建筑贴图管线铁规（必须遵守，禁止违反）】
 *   - 禁止用图片宽高比/角度阈值（如 1.35）做任何分支——横竖/宽高只是透视角度，
 *     一律走统一底边贴合管线，绝不因"比值没超阈值"而压扁/立起贴图。
 *   - 底边宽 dw：由贴图底部滤噪点后的轮廓两端，对齐 2×2 菱形左右角（贴合蓝线）。
 *   - 高度 dh：一律按贴图自然比例 dh = dw × (oh/ow)，禁止阈值分支、禁止硬编码压方。
 *   - 黄色虚线 = 贴图底部滤噪点后的底边（两条）轮廓，经底边贴合变换贴合蓝色菱形虚线；
 *     黄线必须反映贴图真实底边，不许改成与贴图无关的形状。
 * 【严格遵循游戏源码铁规（必须遵守，禁止违反）】
 *   - 一切渲染/辅助线/功能必须严格按游戏既有代码方案（game.js / sprites.js 已实现逻辑）执行，
 *     禁止自绘、发明、脑补新形状/新线条/新变换（如自绘 V 形、菱形裁剪、透视网格）。
 *   - 禁止擅自修改黄线/蓝线（青线）/贴图的定义与来源：黄线=贴图底部滤噪后底边轮廓、
 *     蓝线=固定地块两条底边、贴图=底边贴合站立绘制。
 *   - 插件/工具只做配置与预览，若要在游戏中生效必须经开发者审批后按游戏源码方案接入。
 * 【引擎钩子】建筑消费效果 = game.js updateUseFacility 按 b.type 分支（如需新效果）。
 * 【存档】建筑/人物/怪物均已被 saveGame 白名单序列化，新增字段需同步补进 saveGame。
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
    forge:     { name: '铁匠铺', icon: '铁', desc: '打铁锤炼装备，冒险者战力大增', baseCost: 380, income: 17, maxLevel: 5, w: 96, h: 72, image: 'forge', effect: 'forge' },
    market:    { name: '集市',   icon: '市', desc: '人流汇聚，收入更高', baseCost: 260, income: 14, maxLevel: 5, w: 96, h: 72, image: 'market', effect: 'market' },
    shrine:    { name: '神社',   icon: '社', desc: '祈祷驱散疲惫，提升心情', baseCost: 240, income: 11, maxLevel: 5, w: 96, h: 72, image: 'shrine', effect: 'shrine' },
    library:   { name: '图书馆', icon: '书', desc: '研读典籍，冒险者经验增长', baseCost: 300, income: 13, maxLevel: 5, w: 96, h: 72, image: 'library', effect: 'library' },
    barracks:  { name: '兵营', icon: '兵', desc: '红警式兵营，训练士兵提升战力', baseCost: 320, income: 14, maxLevel: 5, w: 96, h: 72, image: 'barracks', effect: 'barracks' },
    powerplant:{ name: '发电厂', icon: '电', desc: '红警式发电厂，全村运转更高效', baseCost: 340, income: 15, maxLevel: 5, w: 96, h: 72, image: 'powerplant', effect: 'powerplant' },
    refinery:  { name: '精炼厂', icon: '矿', desc: '红警式矿石精炼厂，金币产出更高', baseCost: 420, income: 18, maxLevel: 5, w: 96, h: 72, image: 'refinery', effect: 'refinery' },
    windmill:  { name: '风车', icon: '风', desc: '风车磨坊，收入稳定', baseCost: 220, income: 10, maxLevel: 5, w: 96, h: 72, image: 'windmill', effect: 'windmill' },
    church:    { name: '教堂', icon: '堂', desc: '祈祷净化，提升心情与好感', baseCost: 280, income: 12, maxLevel: 5, w: 96, h: 72, image: 'church', effect: 'church' },
    tower:     { name: '瞭望塔', icon: '塔', desc: '放哨瞭望，防御与视野提升', baseCost: 250, income: 11, maxLevel: 5, w: 96, h: 72, image: 'tower', effect: 'tower' },
    colosseum: { name: '角斗场', icon: '斗', desc: '罗马式角斗场，勇者试炼之地', baseCost: 900, income: 32, maxLevel: 3, w: 150, h: 120, image: 'colosseum', size: 2, effect: 'colosseum' },
    empire:    { name: '帝国大厦', icon: '帝', desc: '摩天巨塔，全村收入大增', baseCost: 1500, income: 50, maxLevel: 3, w: 96, h: 150, image: 'empire', size: 2, effect: 'empire' },
    lighthouse:{ name: '灯塔', icon: '灯', desc: '指引冒险者归乡，稳定收入', baseCost: 300, income: 13, maxLevel: 5, w: 96, h: 96, image: 'lighthouse', size: 1, effect: 'lighthouse' },
    statue:    { name: '自由女神像', icon: '神', desc: '地标雕像，全村士气提升', baseCost: 1200, income: 40, maxLevel: 3, w: 96, h: 140, image: 'statue', size: 2, effect: 'statue' },
    pyramid:   { name: '金字塔', icon: '金', desc: '古埃及法老陵墓，声望大增', baseCost: 1600, income: 48, maxLevel: 3, w: 120, h: 110, image: 'pyramid', size: 2, effect: 'pyramid' },
    sphinx:    { name: '狮身人面像', icon: '斯', desc: '沙漠守卫像，收入稳定', baseCost: 700, income: 26, maxLevel: 3, w: 110, h: 100, image: 'sphinx', size: 2, effect: 'sphinx' },
    peach_garden:{ name: '桃园', icon: '桃', desc: '桃园三结义之地，冒险者结义提升战力', baseCost: 600, income: 24, maxLevel: 3, w: 120, h: 90, image: 'peach_garden', size: 2, effect: 'peach_garden' },
    chibi:     { name: '赤壁战船', icon: '赤', desc: '火烧赤壁的战船，火属性战力提升', baseCost: 900, income: 34, maxLevel: 3, w: 120, h: 90, image: 'chibi', size: 2, effect: 'chibi' },
    pagoda:    { name: '佛塔', icon: '佛', desc: '多层佛塔，祈祷净化心灵', baseCost: 800, income: 30, maxLevel: 3, w: 90, h: 130, image: 'pagoda', size: 2, effect: 'pagoda' },
    dojo:      { name: '武馆', icon: '武', desc: '练武之地，冒险者近战攻击提升', baseCost: 500, income: 22, maxLevel: 5, w: 96, h: 72, image: 'dojo', effect: 'dojo' },
    observatory:{ name: '观星台', icon: '星', desc: '仰望星空，预见好运，收入提升', baseCost: 550, income: 24, maxLevel: 5, w: 96, h: 78, image: 'observatory', size: 2, effect: 'observatory' },
    bathhouse: { name: '温泉', icon: '温', desc: '泡温泉驱散疲惫，恢复心情', baseCost: 400, income: 18, maxLevel: 5, w: 96, h: 72, image: 'bathhouse', effect: 'bathhouse' },
    bank:      { name: '金库', icon: '金', desc: '储存金币，全村收入加成', baseCost: 1000, income: 40, maxLevel: 3, w: 96, h: 72, image: 'bank', size: 2, effect: 'bank' },
    stable:    { name: '马厩', icon: '马', desc: '照料坐骑，冒险者移速提升', baseCost: 350, income: 15, maxLevel: 5, w: 96, h: 72, image: 'stable', effect: 'stable' },
    granary:   { name: '粮仓', icon: '粮', desc: '储存粮食，农场产出加成', baseCost: 320, income: 14, maxLevel: 5, w: 96, h: 72, image: 'granary', effect: 'granary' },
    temple:    { name: '希腊神庙', icon: '庙', desc: '雅典娜神庙，冒险者智慧提升', baseCost: 900, income: 32, maxLevel: 3, w: 96, h: 84, image: 'temple', size: 2, effect: 'temple' },
    china_tower:{ name: '中国塔楼', icon: '塔', desc: '飞檐楼阁，村落地标收入高', baseCost: 1100, income: 38, maxLevel: 3, w: 96, h: 110, image: 'china_tower', size: 2, effect: 'china_tower' },
    guard_post:{ name: '哨戒塔', icon: '哨', desc: '岗哨瞭望，防御提升', baseCost: 280, income: 12, maxLevel: 5, w: 96, h: 96, image: 'guard_post', size: 1, effect: 'guard_post' },
    obelisk:   { name: '方尖碑', icon: '碑', desc: '古埃及石碑，声望加成', baseCost: 450, income: 20, maxLevel: 5, w: 80, h: 130, image: 'obelisk', size: 1, effect: 'obelisk' },
    dungeon:   { name: '地牢入口', icon: '牢', desc: '地下城入口，冒险者探险刷宝', baseCost: 650, income: 28, maxLevel: 3, w: 96, h: 78, image: 'dungeon', size: 2, effect: 'dungeon' },
    mage_tower:{ name: '法师塔', icon: '法', desc: '魔法之塔，法术强化', baseCost: 850, income: 30, maxLevel: 3, w: 80, h: 140, image: 'mage_tower', size: 2, effect: 'mage_tower' },
    greenhouse:{ name: '温室', icon: '温', desc: '玻璃温室，作物与收入提升', baseCost: 380, income: 16, maxLevel: 5, w: 96, h: 72, image: 'greenhouse', effect: 'greenhouse' },
    training_ground:{ name: '练兵场', icon: '练', desc: '操练士兵，全队攻防提升', baseCost: 520, income: 22, maxLevel: 5, w: 120, h: 84, image: 'training_ground', size: 2, effect: 'training_ground' },
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
    berserker: { name: '狂战士', img: 'ck_paladin', atk: 12, def: 3, hp: 135 },
    darkmage:  { name: '暗法师', img: 'ck_mage',    atk: 13, def: 2, hp: 80 },
    ninja:     { name: '忍者',   img: 'ck_rogue',   atk: 11, def: 2, hp: 82 },
  };

  /* 怪物定义 */
  const MONSTER_DEFS = {
    slime:     { name: '史莱姆', img: 'slime',     hp: 35,  atk: 3, exp: 10, gold: 6,  size: 56 },
    goblin:    { name: '哥布林', img: 'goblin',    hp: 50,  atk: 5, exp: 18, gold: 10, size: 56 },
    bat:       { name: '蝙蝠',   img: 'bat',       hp: 25,  atk: 4, exp: 12, gold: 8,  size: 56 },
    slimeking: { name: '史莱姆王', img: 'slimeking', hp: 120, atk: 8, exp: 45, gold: 30, size: 72, boss: true },
  };

  /* 武器定义（武器店售卖，冒险者购买装备） */
  const WEAPON_DEFS = {
    dagger:      { name: '匕首',   atk: 2, price: 35 },
    iron_sword:  { name: '铁剑',   atk: 4, price: 60 },
    war_axe:     { name: '战斧',   atk: 6, price: 100 },
    staff:       { name: '法杖',   atk: 5, price: 85 },
    longbow:     { name: '长弓',   atk: 6, price: 95 },
    great_sword: { name: '大剑',   atk: 10, price: 180 },
  };

  /* 设施效果图标（冒险者消费气泡用） */
  const BUILD_ICONS = { inn: '💤', tavern: '🍺', weapon: '⚔️', shop: '🧺', bakery: '🥖', magicshop: '🔮', training: '🥋', clinic: '💊', castle: '🏰', farm: '🚜', seedshop: '🌰', forge: '铁', market: '市', shrine: '社', library: '书', barracks: '兵', powerplant: '电', refinery: '矿', windmill: '风', church: '堂', tower: '塔' };

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
    WEAPON_DEFS,
    BUILD_ICONS,
    SEED_DEFS,
    DECOR_SIZE,
    INIT_ROADS,
    INIT_BUILDINGS,
    INIT_DECORS,
    ROAD_COST,
  };
})(window);
