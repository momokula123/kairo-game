/* ============================================================
 * 冒险村物语 - 素材模块（贴图注册 + SpriteKit 像素能力）
 * IMG_SRC 注册新的贴图；ALIGN_KEYS/MASK_KEYS 决定自动能力
 * ============================================================
 *
 * ★ 装配铁规（严格参考 content.js 顶部"开发铁规"）★
 * 新增内容的【贴图装配】全部在此文件完成，缺一不可：
 *   1. IMG_SRC                    → 贴图引用 'assets/xxx.png'
 *   2. ALIGN_KEYS                 → 底边自动对齐（底部非透明像素落地面）
 *   3. MASK_KEYS                  → 像素蒙版（角色被建筑遮挡，建筑专属）
 *   4. SHADOW_KEYS                → 形状蒙版阴影
 *   5. Shadow.config.shrinkX      → 建筑 1 / 装饰·人物·怪物 0.03
 *   6. Shadow.config.projScale    → 建筑 1 / 装饰·人物·怪物 0.5
 *   7. 阴影条带缓存               → 复用同形状参考条带（新建筑复用 inn，
 *                                   key 形如 '新建筑|0|0|84'）
 * 禁止对单一贴图写 if 特判；新贴图规格：透明 PNG / 正方形 / 主体居中 /
 * 底部贴地 / 清理孤立噪点像素。
 * ============================================================ */
(function (global) {
  'use strict';

  const IMG = {};
  const IMG_SRC = {
    village: 'assets/village.png',
    warrior: 'assets/warrior.png',
    mage: 'assets/mage.png',
    slime: 'assets/slime.png',
    inn: 'assets/inn.png',
    tavern: 'assets/tavern.png',
    weapon: 'assets/weapon.png',
    shop: 'assets/shop.png',
    tree: 'assets/tree.png',
    fountain: 'assets/fountain.png',
    magicshop: 'assets/magicshop.png',
    bakery: 'assets/bakery.png',
    training: 'assets/training.png',
    clinic: 'assets/clinic.png',
    priest: 'assets/priest.png',
    archer: 'assets/archer.png',
    merchant: 'assets/merchant.png',
    villager: 'assets/villager.png',
    slimeking: 'assets/slimeking.png',
    goblin: 'assets/goblin.png',
    bat: 'assets/bat.png',
    chest: 'assets/chest.png',
    lamp: 'assets/lamp.png',
    fruittree: 'assets/fruittree.png',
    flag: 'assets/flag.png',
    well: 'assets/well.png',
    ck_knight: 'assets/ck_knight.png',
    ck_mage: 'assets/ck_mage.png',
    ck_archer: 'assets/ck_archer.png',
    ck_priest: 'assets/ck_priest.png',
    ck_monk: 'assets/ck_monk.png',
    ck_rogue: 'assets/ck_rogue.png',
    ck_valkyrie: 'assets/ck_valkyrie.png',
    ck_paladin: 'assets/ck_paladin.png',
    fence_a: 'assets/fence_a.png',
    fence_b: 'assets/fence_b.png',
    castle: 'assets/castle.png',
    farm: 'assets/farm.png?v=5',
    seedshop: 'assets/seedshop.png?v=2',
    forge: 'assets/forge.png?v=1',
    market: 'assets/market.png?v=1',
    shrine: 'assets/shrine.png?v=1',
    library: 'assets/library.png?v=1',
  };

  // 需要"底部像素贴地"数据的贴图 key（人物/建筑/装饰/怪物通用）
  const ALIGN_KEYS = new Set([
    'inn', 'tavern', 'weapon', 'shop', 'bakery', 'magicshop', 'training', 'clinic', 'castle',
    'farm', 'seedshop',
    'forge', 'market', 'shrine', 'library',
    'fence_a', 'fence_b',
    'ck_knight', 'ck_mage', 'ck_priest', 'ck_archer', 'ck_monk', 'ck_rogue', 'ck_valkyrie', 'ck_paladin',
    'tree', 'fruittree', 'fountain', 'chest', 'lamp', 'flag', 'well',
    'slime', 'goblin', 'bat', 'slimeking',
  ]);
  // 需要"像素蒙版遮挡"的贴图 key（建筑，正方形蒙版）
  const MASK_KEYS = new Set(['inn', 'tavern', 'weapon', 'shop', 'bakery', 'magicshop', 'training', 'clinic', 'castle', 'farm', 'seedshop', 'forge', 'market', 'shrine', 'library']);
  // 需要"形状蒙版阴影"的贴图 key（建筑 + 装饰 + 人物 + 怪物 → 统一阴影生成）
  const SHADOW_KEYS = new Set([
    'inn', 'tavern', 'weapon', 'shop', 'bakery', 'magicshop', 'training', 'clinic', 'castle',
    'farm', 'seedshop',
    'forge', 'market', 'shrine', 'library',
    'tree', 'fruittree', 'fountain', 'chest', 'lamp', 'flag', 'well', 'fence_a', 'fence_b',
    'ck_knight', 'ck_mage', 'ck_priest', 'ck_archer', 'ck_monk', 'ck_rogue', 'ck_valkyrie', 'ck_paladin',
    'slime', 'goblin', 'bat', 'slimeking',
  ]);

  // 等距瓦片尺寸（与引擎一致：2x2 建筑底面菱形）
  const TILE_W = 84, TILE_H = 42;

  // SpriteKit：贴图底部像素对齐 + 像素蒙版遮挡，程序内置、自动装配
  const SpriteKit = {
    MASK_W: 160, MASK_H: 160,
    _shadowCache: new Map(),   // S2 归一化条带缓存（贴图/尺寸/菱形/投影不变时只算一次）
    // 计算每列最底部非透明像素比例（0~1），以及最大底边比例；挂在 img.bottomProfile / img.bottomRatio
    computeBottom(img) {
      try {
        const ow = img.naturalWidth, oh = img.naturalHeight;
        if (!ow || !oh) return;
        const oc = document.createElement('canvas');
        oc.width = ow; oc.height = oh;
        const octx = oc.getContext('2d', { willReadFrequently: true });
        octx.drawImage(img, 0, 0);
        const d = octx.getImageData(0, 0, ow, oh).data;
        const profile = new Array(ow);
        let maxR = 0;
        const bottoms = [];
        for (let x = 0; x < ow; x++) {
          let bottom = -1;
          for (let y = oh - 1; y >= 0; y--) {
            if (d[(y * ow + x) * 4 + 3] > 8) {
              // 噪点过滤：孤立散点（上下左右 1px 内无其他不透明像素）视为底部噪点，忽略
              const up = y > 0 && d[((y - 1) * ow + x) * 4 + 3] > 8;
              const dn = y < oh - 1 && d[((y + 1) * ow + x) * 4 + 3] > 8;
              const lf = x > 0 && d[(y * ow + x - 1) * 4 + 3] > 8;
              const rt = x < ow - 1 && d[(y * ow + x + 1) * 4 + 3] > 8;
              if (up || dn || lf || rt) { bottom = y; break; }
            }
          }
          profile[x] = bottom < 0 ? -1 : bottom / oh;
          if (bottom >= 0) {
            bottoms.push(bottom / oh);
            if (profile[x] > maxR) maxR = profile[x];
          }
        }
        img.bottomProfile = profile;
        // 贴地用"主体底部"（95% 分位，忽略个别到底尖刺，
        // 否则烟囱/台阶等 1-2 像素会把主体抬离地面 15-20px）
        if (bottoms.length >= 4) {
          bottoms.sort((a, b) => a - b);
          img.bottomRatio = bottoms[Math.floor(bottoms.length * 0.95)] || maxR || 1;
        } else {
          img.bottomRatio = maxR || 1;
        }
      } catch (e) { img.bottomRatio = 1; }
    },
    // 按绘制尺寸建立不透明像素蒙版（Uint8Array），挂在 img.baseMask
    buildMask(img, w, h) {
      try {
        const oc = document.createElement('canvas');
        oc.width = w; oc.height = h;
        const c2 = oc.getContext('2d', { willReadFrequently: true });
        c2.drawImage(img, 0, 0, w, h);
        const d = c2.getImageData(0, 0, w, h).data;
        const m = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 8 ? 1 : 0;
        img.baseMask = m;
        img.baseMaskW = w; img.baseMaskH = h;
      } catch (e) { img.baseMask = null; }
    },
    // 自动装配：对单个已加载 img 计算所需数据（key 决定要不要蒙版）
    setup(img, key) {
      if (!img || !img.naturalWidth) return;
      img.shadowKey = key;   // 稳定纹理键（缓存1/内联条带共用，file:// 与 http 一致）
      if (ALIGN_KEYS.has(key)) {
        SpriteKit.computeBottom(img);
        if (SHADOW_KEYS.has(key)) {
          if (MASK_KEYS.has(key)) {
            // 建筑：正方形蒙版（与像素遮挡共用 160x160）
            SpriteKit.buildMask(img, SpriteKit.MASK_W, SpriteKit.MASK_H);
          } else {
            // 装饰/人物/怪物（非正方形贴图）：按原始宽高比建蒙版，阴影贴合本体。
            // 等比缩到长边 ≤160，避免大尺寸立绘（如 700px）导致每帧遍历几十万像素卡顿。
            let mw = Math.min(img.naturalWidth, 160);
            let mh = Math.round(mw * img.naturalHeight / img.naturalWidth);
            if (mh > 160) { mh = 160; mw = Math.round(160 * img.naturalWidth / img.naturalHeight); }
            SpriteKit.buildMask(img, mw, mh);
          }
        }
      }
    },
    // 遮挡判定：角色脚底点 (fx,fy) 落在建筑 rect（cx=中心x, topY, groundY, img）的蒙版内？
    // rect 可带 scale（绘制尺寸/蒙版尺寸之比），建筑放大后按比例换算蒙版坐标
    isOccluded(fx, fy, rect) {
      const m = rect.img && rect.img.baseMask;
      if (!m) return false;
      const w = SpriteKit.MASK_W;
      const sc = rect.scale || 1;
      const lx = Math.round((fx - (rect.cx - (w * sc) / 2)) / sc);
      const ly = Math.round((fy - rect.topY) / sc);
      return lx >= 0 && lx < w && ly >= 0 && ly < w && !!m[ly * w + lx];
    },
    // 地面阴影：真实阴影 = 【沿 L1 裁剪后的蒙版形状】映射到投影平面四边形
    // 光源在左下 → 阴影投向右上；投影方向为等距对角线 (dx, -dx/2)
    // 参数：ctx, img, 中心x, 地面基准y(底角), 绘制宽/高, 投影距离px(沿X)
    //
    // ════════════════════════════════════════════════════════════════
    // ★ 投影算法备忘（上下文丢失时可据此重建，勿删）★
    //
    // [贴图与锚点]（见 game.js 建筑绘制处的"底边精确贴合"）
    //  - 每张建筑图抠图(底部非透明像素)后有三个确定点：
    //      X1 = 底部轮廓左端点（等比缩放后精确落在底面菱形左角 L）
    //      R  = 底部轮廓右端点（精确落在底面菱形右角 R）
    //      X4 = 底部轮廓中点 = 底面菱形下角尖 B
    //  - 建筑绘制宽 dw = 160 * (2*TILE_W / 底边轮廓宽)，使底边贴合菱形左右顶点。
    //  - TILE_W = 84, TILE_H = 42（等距瓦片，2x2 建筑底面菱形）。
    //
    // [底面菱形四角]（q 点）
    //  - L(左角) = (cx - TILE_W, groundY - TILE_H)
    //  - B(下角尖) = (cx, groundY)
    //  - R(右角) = (cx + TILE_W, groundY - TILE_H)
    //  - T(上角) = (cx, groundY - 2*TILE_H)
    //
    // [线条 L1]（裁剪线，y = groundY - TILE_H）
    //  - L1 = 连接 X1(L 左角) 与 R(右角) 的底边线；L1 与底边轮廓贴合。
    //
    // [投影所在平面及约束]（用户定义的核心规则）
    //  - 光源在左下，阴影沿等距对角线(右上方)投影，位移 (dx, -dx/2)，dx=投影距离(140)。
    //  - 投影平面 = 底面四边形 L(左角)/B(下角尖) 平移 (dx,dy) 形成的平行四边形：
    //      X1 = L(左角), X4 = B(下角尖)
    //      X2 = L + (dx,dy), X3 = B + (dx,dy)
    //  - 阴影 = 裁剪后蒙版(去掉 L1 下方下半部)的【形状】经双线性映射到该投影四边形。
    //
    // [裁剪后蒙版映射 = S2 真实阴影]
    //  - 蒙版 baseMask = 160x160 建筑不透明像素；绘制时缩放 sc = dw/160。
    //  - 蒙版像素 (mx,my)：px = cx - dw/2 + mx*sc, py = topY + my*sc, topY = groundY - ratio*dw。
    //  - L1 裁剪：去掉 py >= l1Y 的像素（l1Y = groundY - TILE_H）。
    //  - 求剩余裁剪蒙版包围矩形 S1 = { x:rMinX, y:rMinY, w:rMaxX-rMinX, h:l1Y-rMinY }，
    //      下边贴合 L1。S1 角点：X5=(rMinX,rMinY) 左上, X6=(rMaxX,rMinY) 右上。
    //  - 角点映射（用户定义）：S1左下(X1点)→X1(L)，S1右下(R点)→X4(B)，
    //                          S1左上(X5)→X2(L')，S1右上(X6)→X3(B')。
    //  - 逐像素映射：u=(px-rMinX)/(rMaxX-rMinX), v=(py-rMinY)/(l1Y-rMinY)，
    //      top(u)=X2+(X3-X2)*u, bot(u)=X1+(X4-X1)*u, dst=top+(bot-top)*v。
    //  - 按蒙版行连折线 ctx.fill() 填充（保留蒙版真实形状，非实心平行四边形）。
    //  - 实时跟随 X1..X4（投影距离变化自动更新），为日出日落做准备。
    // ════════════════════════════════════════════════════════════════
    drawGroundShadow(ctx, img, cx, groundY, w, h, projX, tile, shrinkX) {
      const px = projX == null ? 140 : projX;
      const tw = tile == null ? TILE_W : tile;   // 菱形半宽（建筑 84，装饰单格 42）
      const th = tw / 2;                          // 菱形半高（等距比例）
      // 横向收缩系数：2.5D 中"横向"= 屏幕水平（左上↔右下 = 菱形左角↔右角方向），
      //   "竖直"（左下↔右上 = 投影方向）不变。故只缩 X1 左角（菱形半宽），dx 投影位移保持。
      const sx = shrinkX == null ? 1 : shrinkX;
      const dx = px, dy = -px / 2;   // 等距对角线方向（右上方）
      // 投影平面四角：底面菱形 L(左角)/B(下角尖) 平移 (dx,dy)
      const X1 = { x: cx - tw * sx, y: groundY - th };                // L 左角（横向收缩后）
      const X4 = { x: cx, y: groundY };                               // B 下角尖
      const X2 = { x: X1.x + dx, y: X1.y + dy };                      // L 的投影
      const X3 = { x: X4.x + dx, y: X4.y + dy };                      // B 的投影

      // 有贴图 → 真实阴影（缓存1 条带；file:// 下无蒙版时命中内联预生成条带）
      if (img && img.width > 0) {
        // ★ 缓存1：真实阴影条带（归一化 u/v，与实体位置 cx/groundY 无关）。
        //   贴图/绘制尺寸/菱形不变时只构建一次（实体创建时用 Shadow.prepare 预热），
        //   每帧仅按 X1..X4 做少量插值，不再重复遍历蒙版。
        let geo = null;
        try {
          geo = SpriteKit.Shadow.geo({ img, w, h, tileW: tw, projX: px });
        } catch (e) { geo = null; }
        if (geo && !geo.deg) {
          // 渲染缓存的归一化条带（每帧仅少量插值，不再遍历蒙版）
          //    top(u)=X2+(X3-X2)*u, bot(u)=X1+(X4-X1)*u, dst=top+(bot-top)*v
          const topDX = X3.x - X2.x, topDY = X3.y - X2.y;
          const botDX = X4.x - X1.x, botDY = X4.y - X1.y;
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.beginPath();
          for (let i = 0; i < geo.strips.length; i++) {
            const st = geo.strips[i];
            const uL = st[0], uR = st[1], v0 = st[2], v1 = st[3];
            const tLx = X2.x + topDX * uL, tLy = X2.y + topDY * uL;
            const bLx = X1.x + botDX * uL, bLy = X1.y + botDY * uL;
            const p0x = tLx + (bLx - tLx) * v0, p0y = tLy + (bLy - tLy) * v0;
            const tRx = X2.x + topDX * uR, tRy = X2.y + topDY * uR;
            const bRx = X1.x + botDX * uR, bRy = X1.y + botDY * uR;
            const p1x = tRx + (bRx - tRx) * v0, p1y = tRy + (bRy - tRy) * v0;
            const p2x = tRx + (bRx - tRx) * v1, p2y = tRy + (bRy - tRy) * v1;
            const p3x = tLx + (bLx - tLx) * v1, p3y = tLy + (bLy - tLy) * v1;
            ctx.moveTo(p0x, p0y);
            ctx.lineTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);
            ctx.lineTo(p3x, p3y);
            ctx.closePath();
          }
          ctx.fill();
          return;
        }
      }

      // 贴图未加载 / 无蒙版数据 → 退化为原逻辑：画整个投影平面四边形（含横向收缩）
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.moveTo(X1.x, X1.y);
      ctx.lineTo(X4.x, X4.y);
      ctx.lineTo(X3.x, X3.y);
      ctx.lineTo(X2.x, X2.y);
      ctx.closePath();
      ctx.fill();
    },
    // ═══ 统一阴影系统（面向对象 · 解耦）═══
    // 任何"可投影实体"只需提供一个描述对象，即可用同一算法生成形状阴影：
    //   SpriteKit.Shadow.draw(ctx, entity)
    // entity 字段：
    //   img     贴图（须已 setup：有 bottomProfile + baseMask）
    //   key     元素类型 key（如 'inn'/'tree'/'ck_knight'/'slime'）→ 查静态配置（缓存2）
    //   x       实体中心 x
    //   groundY 地面基准（底部贴地线 y）
    //   tileW   底面菱形半宽（建筑 84；装饰/人物/怪物单格 42），缺省 84
    //   w / h   实体实际绘制宽/高（建筑缺省 → 自动按底边贴合菱形）
    //   projX   投影距离（沿 X 轴），缺省 140；矮实体传小值
    //   shrinkX 兜底横向收缩系数（配置里没有该 key 时使用）
    // ═══════════════════════════════════════════════════════════
    // 【缓存2 = 静态配置】shadow_config.json 存着每个精灵/元素两条个性化参数：
    //   - shrinkX  横向收缩系数（2.5D 屏幕水平方向）
    //   - projScale 投影方向（左下↔右上）长度缩放（"影子高度"）
    // 游戏启动时 loadAssets 静态读取一次（读取失败用下方内置默认值），
    // 渲染时按 e.key 直接查表，不再硬编码——可在 shadow_config.html 中微调导出。
    Shadow: {
      // 内置默认参数（缓存2 文件缺失/读取失败时的兜底）
      config: {
        // 横向收缩系数（建筑不收缩，其余 0.03 极窄）
        shrinkX: {
          inn: 1, tavern: 1, weapon: 1, shop: 1, bakery: 1, magicshop: 1, training: 1, clinic: 1, castle: 1,
          farm: 1, seedshop: 1,   // 建筑（补齐管线）
          forge: 1, market: 1, shrine: 1, library: 1,   // 新建筑按旅店做法（不收缩）
          tree: 0.03, fruittree: 0.03, fountain: 0.03, chest: 0.03, lamp: 0.03, flag: 0.03, well: 0.03, fence_a: 0.03, fence_b: 0.03,
          ck_knight: 0.03, ck_mage: 0.03, ck_priest: 0.03, ck_archer: 0.03,
          ck_monk: 0.03, ck_rogue: 0.03, ck_valkyrie: 0.03, ck_paladin: 0.03,
          slime: 0.03, goblin: 0.03, bat: 0.03, slimeking: 0.03,
        },
        // 投影方向（左下↔右上）长度缩放：建筑 1（还原），其余 0.5
        projScale: {
          inn: 1, tavern: 1, weapon: 1, shop: 1, bakery: 1, magicshop: 1, training: 1, clinic: 1, castle: 1,
          farm: 1, seedshop: 1,   // 建筑（补齐管线）
          forge: 1, market: 1, shrine: 1, library: 1,   // 新建筑按旅店做法（还原）
          tree: 0.5, fruittree: 0.5, fountain: 0.5, chest: 0.5, lamp: 0.5, flag: 0.5, well: 0.5, fence_a: 0.5, fence_b: 0.5,
          ck_knight: 0.5, ck_mage: 0.5, ck_priest: 0.5, ck_archer: 0.5,
          ck_monk: 0.5, ck_rogue: 0.5, ck_valkyrie: 0.5, ck_paladin: 0.5,
          slime: 0.5, goblin: 0.5, bat: 0.5, slimeking: 0.5,
        },
      },
      // 静态读取缓存2 配置文件（shadow_config.json），完成后回调
      loadConfig(done) {
        const finish = () => { if (done) done(); };
        if (typeof fetch !== 'function') { finish(); return; }
        fetch('shadow_config.json')
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then((cfg) => {
            if (cfg && cfg.shrinkX) {
              for (const k in cfg.shrinkX) {
                if (cfg.shrinkX[k] != null) SpriteKit.Shadow.config.shrinkX[k] = cfg.shrinkX[k];
              }
            }
            if (cfg && cfg.projScale) {
              for (const k in cfg.projScale) {
                if (cfg.projScale[k] != null) SpriteKit.Shadow.config.projScale[k] = cfg.projScale[k];
              }
            }
          })
          .catch(() => { /* 读取失败用内置默认 */ })
          .then(finish);
      },
      // ★ 缓存1：真实阴影条带（归一化 u/v，与实体位置/投影距离都无关）。
      //   按 稳定键(img.shadowKey)|w|h|tileW 为键（条带与 projX 无关，投影缩放不影响复用），
      //   同贴图/同几何的实体共享一份。
      //   ⚠️ file:// 下浏览器禁止 canvas 像素读取（getImageData 抛 SecurityError），
      //      此时 buildShadowGeo 无法计算 → 命中 shadow_strips.js 内联预生成条带（见下）。
      geo(e) {
        const img = e.img;
        const tw = e.tileW == null ? TILE_W : e.tileW;
        const skey = (img && (img.shadowKey || img.src)) || '';
        const key = skey + '|' + (e.w || 0) + '|' + (e.h || 0) + '|' + tw;
        let g = SpriteKit._shadowCache.get(key);
        if (!g) {
          try {
            g = buildShadowGeo(img, e.w || 0, e.h || 0, tw);
          } catch (err) {
            g = { deg: true, strips: [] };
          }
          SpriteKit._shadowCache.set(key, g);
        }
        return g;
      },
      // 预生成缓存1（实体创建时调用；耗系统资源换运行期省资源，幂等）
      prepare(e) {
        SpriteKit.Shadow.geo(e);
      },
      draw(ctx, e) {
        // 直接查缓存2（静态配置）：
        //   shrinkX  → 横向收缩系数（有配置用配置，否则 e.shrinkX 兜底，再否则 1）
        //   projScale → 投影方向长度缩放（"影子高度"，有配置用配置，否则 1）
        let shrink = 1;
        if (e.key && SpriteKit.Shadow.config.shrinkX[e.key] != null) shrink = SpriteKit.Shadow.config.shrinkX[e.key];
        else if (e.shrinkX != null) shrink = e.shrinkX;
        let ps = 1;
        if (e.key && SpriteKit.Shadow.config.projScale[e.key] != null) ps = SpriteKit.Shadow.config.projScale[e.key];
        const projX = (e.projX == null ? 140 : e.projX) * ps;
        SpriteKit.drawGroundShadow(ctx, e.img, e.x, e.groundY,
          e.w || 0, e.h || 0, projX, e.tileW, shrink);
      },
    },
    // 手动注册额外贴图 key（内容配置可用它声明"也要贴地/蒙版"）
    registerKeys(alignKeys, maskKeys) {
      if (alignKeys) for (const k of alignKeys) ALIGN_KEYS.add(k);
      if (maskKeys) for (const k of maskKeys) MASK_KEYS.add(k);
    },
  };

  // ═══ file:// 支持：内联预生成条带 ═══
  // file:// 下浏览器禁止 canvas 像素读取（getImageData 抛 SecurityError），蒙版无法在运行时建立；
  // 因此开发阶段已用 http 环境把每个元素的"缓存1 条带"预生成到 shadow_strips.js（内联 JS），
  // 此处按稳定键（shadowKey|w|h|tileW）预填充进缓存1——游戏直接复用，无需读像素。
  if (typeof window !== 'undefined' && window.SHADOW_STRIPS) {
    for (const k in window.SHADOW_STRIPS) {
      SpriteKit._shadowCache.set(k, window.SHADOW_STRIPS[k]);
    }
    // 新建筑按旅店做法：阴影条带复用旅店的（方形小屋底部轮廓近似，尺寸同 2x2 / 84）
    const innStrips = window.SHADOW_STRIPS['inn|0|0|84'];
    if (innStrips) {
      for (const nb of ['forge', 'market', 'shrine', 'library']) {
        SpriteKit._shadowCache.set(nb + '|0|0|84', innStrips);
      }
    }
  }

  // ═══ 管线校验 callback（开发铁规）═══
  // 新增内容若未按 content.js 顶部"开发铁规"完整注册（IMG_SRC / ALIGN_KEYS /
  // MASK_KEYS / SHADOW_KEYS / shrinkX / projScale），启动时在此报错：
  // console.error + 页面顶部红色横幅（浏览器可见报错），强制回到管线补注册。
  function validatePipeline() {
    const C = global.Content;
    if (!C) return;
    const errs = [];
    const base = (kind, name, key) => {
      if (!IMG_SRC[key]) errs.push(kind + '[' + name + '] 缺 IMG_SRC 贴图引用');
      if (!ALIGN_KEYS.has(key)) errs.push(kind + '[' + name + '] 缺 ALIGN_KEYS 底边对齐');
      if (!SHADOW_KEYS.has(key)) errs.push(kind + '[' + name + '] 缺 SHADOW_KEYS 阴影');
      if (SpriteKit.Shadow.config.shrinkX[key] == null) errs.push(kind + '[' + name + '] 缺 shrinkX 配置');
      if (SpriteKit.Shadow.config.projScale[key] == null) errs.push(kind + '[' + name + '] 缺 projScale 配置');
    };
    for (const k in C.BUILD_DEFS) {
      base('建筑', C.BUILD_DEFS[k].name, k);
      if (!MASK_KEYS.has(k)) errs.push('建筑[' + C.BUILD_DEFS[k].name + '] 缺 MASK_KEYS 蒙版遮挡');
    }
    for (const k in C.CLASS_DEFS) base('职业', C.CLASS_DEFS[k].name, C.CLASS_DEFS[k].img);
    for (const k in C.MONSTER_DEFS) base('怪物', C.MONSTER_DEFS[k].name, C.MONSTER_DEFS[k].img);
    for (const k in C.DECOR_DEFS) base('装饰', C.DECOR_DEFS[k].name, k);
    if (errs.length) {
      const msg = '[开发铁规·管线校验] 以下内容未按管线完整注册（开发事故）：\n' + errs.join('\n');
      console.error(msg);
      try {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c62828;color:#fff;font:12px/1.6 monospace;padding:8px 12px;white-space:pre-wrap;border-bottom:3px solid #ff8a80;';
        d.textContent = msg;
        document.body.appendChild(d);
      } catch (e) { /* 页面报错失败则至少 console */ }
    }
  }

  // ═══ 缓存1 构建（纯计算，与实体位置 cx/groundY 无关）═══
  // 蒙版 → L1 裁剪 → 连续段条带（存 [uL,uR,v0,v1] 归一化 0~1）。
  // 用占位 cx=0、groundY=0 计算：u/v 归一化会抵消位置，结果适用于任意实体位置。
  function buildShadowGeo(img, w, h, tw, px) {
    const th = tw / 2;
    const mask = img && img.baseMask;
    // file:// 下像素读取失败 → 无蒙版 → 返回退化（有内联条带时缓存已命中，不会走到这）
    if (!mask) return { deg: true, strips: [] };
    const prof = img.bottomProfile, ow = img.naturalWidth;
    const mw = img.baseMaskW || 160, mh = img.baseMaskH || 160;
    // ① 绘制尺寸：建筑（w/h 传 160 占位）按底边轮廓贴合菱形计算；
    //    装饰/人物/怪物显式传实际绘制尺寸 → 直接用 w/h
    //   （人物底边轮廓窄，若套贴合公式会被放大数百像素）
    let pMin = null, pMax = null;
    for (let x = 0; x < ow; x++) {
      if (prof[x] < 0) continue;
      const f = x / ow;
      if (pMin == null || pMin > f) pMin = f;
      if (pMax == null || pMax < f) pMax = f;
    }
    let dw = mw, dh = mh;
    const explicit = w > 0 && w !== SpriteKit.MASK_W;
    if (explicit) { dw = w; dh = h > 0 ? h : w; }
    else if (pMax > pMin) { dw = Math.round(mw * ((2 * tw) / ((pMax - pMin) * mw))); dh = dw; }
    const ratio = img.bottomRatio || 1;
    const sc = dw / mw;
    const topY = -ratio * dh;   // 占位 groundY=0 的贴图顶部
    const l1Y = -th;            // 占位 L1 裁剪线

    // ② 遍历蒙版，收集 L1 下方（裁剪）剩余像素的包围矩形 S1
    //   （画布外区域由 canvas fill 自动裁剪，无需逐像素过滤）
    let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity;
    for (let my = 0; my < mh; my++) {
      for (let mx = 0; mx < mw; mx++) {
        if (!mask[my * mw + mx]) continue;
        const py = Math.round(topY + my * sc);
        if (py >= l1Y) continue;               // 去掉 L1 下方下半部
        const px2 = Math.round(-dw / 2 + mx * sc);   // 占位 cx=0
        if (px2 < rMinX) rMinX = px2;
        if (px2 > rMaxX) rMaxX = px2;
        if (py < rMinY) rMinY = py;
      }
    }
    if (!(rMinX <= rMaxX && rMinY < l1Y)) {
      // ③ 裁剪后剩不下 → 退化为画整个投影四边形
      return { deg: true, strips: [] };
    }
    // ④ 逐蒙版行：连续段 → 条带四边形（记录归一化 u/v，渲染时再插值）
    const RU = rMaxX - rMinX, RV = l1Y - rMinY;
    const rowV = (my) => Math.min(1, (Math.round(topY + my * sc) - rMinY) / RV);
    const strips = [];
    for (let my = 0; my < mh; my++) {
      const py = Math.round(topY + my * sc);
      if (py >= l1Y) continue;                // 整行在 L1 下方 → 裁剪掉
      const v0 = rowV(my), v1 = rowV(my + 1); // 本行与下一行的 v（条带上下边）
      let s0 = -1;
      for (let mx = 0; mx <= mw; mx++) {
        const on = mx < mw && !!mask[my * mw + mx];
        if (on && s0 < 0) s0 = mx;            // 段起点
        else if (!on && s0 >= 0) {            // 段终点 → 记录条带
          const uL = (Math.round(-dw / 2 + s0 * sc) - rMinX) / RU;
          const uR = (Math.round(-dw / 2 + (mx - 1) * sc) - rMinX) / RU;
          strips.push([uL, uR, v0, v1]);
          s0 = -1;
        }
      }
    }
    return { deg: false, strips };
  }

  // 加载全部素材，回调在所有图片加载完或超时后触发
  // 同时静态读取缓存2（shadow_config.json），两者都完成才进入游戏
  function loadAssets(cb) {
    let remaining = Object.keys(IMG_SRC).length + 1;   // +1 = 阴影配置
    const onLoad = () => { if (--remaining <= 0) { validatePipeline(); cb(); } };
    SpriteKit.Shadow.loadConfig(onLoad);               // 静态读取缓存2
    for (const k in IMG_SRC) {
      const img = new Image();
      img.onload = () => {
        SpriteKit.setup(img, k);
        onLoad();
      };
      img.onerror = onLoad;
      img.src = IMG_SRC[k];
      IMG[k] = img;
    }
    // 超时保护：3 秒后无论如何都启动（素材缺失也能玩，只是没贴图）
    setTimeout(() => { if (remaining > 0) cb(); }, 3000);
  }

  global.Sprites = { IMG, IMG_SRC, SpriteKit, loadAssets };
})(window);
