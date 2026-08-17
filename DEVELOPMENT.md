# 冒险村物语 — 开发文档（AI 指南）

本文件面向 AI/开发者，说明工程架构、新增元素（建筑/装饰/人物/怪物）的完整流程与调试方法。
阅读顺序建议：第 1-2 节（架构）→ 第 4-7 节（新增元素，按需）→ 第 9 节（调试）。

---

## 1. 工程概览

纯前端、零依赖、无框架的 2.5D 等距村庄经营模拟游戏。

| 文件 | 职责 | 说明 |
|------|------|------|
| `index.html` | 游戏入口 | 按脚本顺序加载 content → sprites → engine → game |
| `content.js` | **内容配置** | 所有数值/名称/贴图引用（建筑/装饰/职业/怪物/初始布局） |
| `sprites.js` | **素材模块** | 贴图加载、底部贴地数据、像素蒙版、阴影算法（缓存1/缓存2） |
| `engine.js` | **引擎核心** | 等距投影、实体工厂（makeBuilding/makeAdventurer/makeSlime）、场景管理器 |
| `game.js` | **玩法逻辑** | 状态、冒险者 AI、寻路、渲染管线、建造交互、经济 |
| `ui.js` | **HTML 模态 UI** | 覆盖在 canvas 上的 HUD/建造菜单（卡片化）/日志/帮助/设置，通过 `window.__VILLAGE` 驱动 |
| `shadow_config.json` | **阴影静态配置** | 缓存2：每个元素一条 `projScale`（投影高度）+ `shrinkX`（横向收缩） |
| `shadow_strips.js` | **内联阴影条带** | 缓存1 的预生成数据（file:// 直接打开时使用，见第 12 节） |
| `gen_shadow_strips.html` | 条带生成工具 | 在 **http 服务器**下打开自动生成/刷新 `shadow_strips.js` |
| `shadow_config.html` | 阴影配置工具页 | 复制 sunshine 风格：预览 + 滑块定制 + 导出 JSON |
| `sunshine.html` | 阴影算法调试页 | S2 真实阴影算法可视化（粉红标注、投影距离/透明度滑块） |
| `SHADOW_ALGORITHM.md` | 阴影算法文档 | 蒙版裁剪映射、条带四边形、双层缓存原理的详细说明 |
| `DEVELOPMENT.md` | 本文档 | 开发与调试指南 |
| `assets/*.png` | 贴图资源 | 见第 3 节贴图规范 |

### 全局对象

- `window.Content`（content.js）：配置数据
- `window.Sprites`（sprites.js）：`IMG`、`IMG_SRC`、`SpriteKit`、`loadAssets`
- `window.Engine`（engine.js）：`TILE_W/H`、`gridToScreen`、`screenToGrid`、实体工厂、`SceneManager`
- `window.__VILLAGE`（game.js，调试入口）：完整运行时句柄，见第 9 节

### 关键常量

| 常量 | 值 | 含义 |
|------|-----|------|
| 画布 | **1920 × 1080** | 游戏画面（canvas）+ HTML UI（uiRoot 覆盖层） |
| `TILE_W / TILE_H` | 84 / 42 | 等距瓦片宽/高（菱形） |
| `MAP_COLS / MAP_ROWS` | **27 / 27** | 网格大小（原 12×12，面积约 5 倍；村庄 gy 0..8，野外 gy 9..26） |
| `MAP_OX / MAP_OY` | 456 / 80 | 网格原点屏幕坐标 |
| 相机 `camera` | `{x,y,maxX,maxY}` | 地图滚动：非放置模式**鼠标拖拽**平移；初始聚焦村庄左上 |
| `WILD_GX / WILD_GY` | 5 / 10 | 野外区域（怪物出生点） |
| `GRID[gy][gx]` | 0/1/2/3 | 空地/建筑(2x2)/装饰(1x1)/道路 |

---

## 2. 启动流程与渲染管线

### 启动

1. `index.html` 顺序加载 `content.js` → `sprites.js` → `engine.js` → `game.js`
2. `game.js` 调 `loadAssets(cb)`（sprites.js）：
   - 并行加载**全部贴图**（`IMG_SRC`），每张加载完调 `SpriteKit.setup(img, key)`
   - 同时 `fetch('shadow_config.json')` 静态读取**缓存2**（失败用内置默认）
   - 两者都完成才进入 `gameLoop`
3. `setup(img, key)` 按 key 分类装配：
   - `ALIGN_KEYS` 中的 key → 计算底部贴地数据 `bottomProfile / bottomRatio`
   - `MASK_KEYS`（建筑）→ 160×160 像素蒙版 `baseMask`（用于遮挡判定 + 阴影）
   - `SHADOW_KEYS`（非建筑）→ 按原始宽高比建蒙版，长边等比缩到 ≤160

### 渲染管线（game.js `renderGame`）

每帧构建一个 `items` 数组，每个元素 `{ y, draw() }`，按 `y` 升序排序后逐个 `draw()`（画家算法深度排序）：

- 地面网格 → 道路 → 野外 → 装饰 → **建筑**（含遮挡矩形收集）→ 史莱姆 → 冒险者 → 特效/UI
- 排序键 `y` 是实体**底部**的屏幕 y（如建筑 `p.y + 2*TILE_H + 20`、装饰 `p.y + TILE_H`、冒险者 `a.y + 14`）
- 建筑遮挡：`buildingRects` 收集建筑蒙版矩形，冒险者 `feet` 点被遮挡时调整绘制顺序

> 注意：装饰/人物绘制调用 `SpriteKit.Shadow.draw(ctx, {...})`，阴影画在实体本体**之前**。

### UI 分层（canvas 画面 + HTML 模态菜单）

- **canvas（`game.js`）只画游戏世界**：地面/实体/飘字/放置预览。不再绘制 HUD/菜单。
- **HTML（`index.html` + `ui.js`）覆盖在画布上**（`#uiRoot`，与画布同步缩放）：
  - `#hud` 顶部常驻栏：金币/声望/时间/冒险者统计 + 速度 + 建造/日志/帮助/设置按钮
  - `#modalMask` 模态层：**建造**（🏠建筑/🌳装饰/🛠工具 三个 tab，**卡片化**：图片缩略图+名称+造价+已建数量）、**日志**、**帮助**、**设置**
  - `#placeBar` 底部放置模式提示条（含取消按钮）
  - `#domToast` 消息提示
- ui.js 通过 `window.__VILLAGE` 驱动：`setPlaceMode` / `cancelPlaceMode` / `setSpeed` / `toggleDebug` / `buildingCost` / `fmt`，并每 400ms 读 `S` 刷新 DOM。
- **新增元素后**，建造菜单卡片会自动出现（遍历 `BUILD_DEFS`/`DECOR_DEFS`），无需改 ui.js。
- **相机**：世界坐标渲染时 `ctx.translate(-camera.x, -camera.y)`；点击/预览用 `screenToGrid(x + camera.x, y + camera.y)`。地图扩展后（27×27）靠**鼠标拖拽**滚动查看。

---

## 3. 贴图规范

| 类型 | 建议尺寸 | 说明 |
|------|----------|------|
| 建筑 | 160×160 正方形 | 底边轮廓决定贴合菱形宽度；2×2 占格 |
| 装饰 | 自定义（如 tree 90×118） | 非正方形贴图，按自然尺寸渲染（`DECOR_SIZE`） |
| 人物 | ck_* 高清立绘 | 游戏中显示约 37px 高（按宽高比缩放） |
| 怪物 | 正方形（slime 56×56） | 按 `size` 渲染 |

**关键：贴图底部必须有非透明像素**（`bottomProfile` 据此计算"贴地"位置）。底部全透明会导致贴图位置错乱、阴影退化为四边形。

---

## 4. 新增一个建筑

需要改动 5 处，**建议按顺序**：

### 步骤 1：`content.js` — BUILD_DEFS 定义

在 `BUILD_DEFS` 中追加（参考现有项）：

```js
guild: { name: '公会', icon: '🏰', desc: '提升全体冒险者', baseCost: 500, income: 25, maxLevel: 5, w: 96, h: 72, image: 'guild', effect: 'guild' },
```

字段说明：

| 字段 | 含义 |
|------|------|
| `name` | 建筑名 |
| `icon` | 列表/气泡 emoji |
| `desc` | 描述 |
| `baseCost` | 基础造价（同类型越多越贵） |
| `income` | 每次消费收入 |
| `maxLevel` | 最大等级 |
| `w / h` | UI 尺寸（图标显示用） |
| `image` | **贴图 key**（须与 sprites.js 的 IMG_SRC key 一致） |
| `effect` | 效果类型标识（见步骤 6） |

### 步骤 2：`content.js` — BUILD_ICONS

`BUILD_ICONS` 追加：`guild: '🏰'`（冒险者去消费时的气泡图标）。

### 步骤 3：贴图

放入 `assets/guild.png`（160×160，底部有像素）。

### 步骤 4：`sprites.js` — 三处注册

```js
IMG_SRC 追加:  guild: 'assets/guild.png',
ALIGN_KEYS 追加: 'guild',                    // 底部贴地数据
MASK_KEYS 追加: 'guild',                     // 建筑遮挡蒙版(160x160)+正方形阴影蒙版
SHADOW_KEYS 追加: 'guild',                   // 形状阴影蒙版
```

### 步骤 5：`shadow_config.json` — 缓存2 参数

`projScale` 与 `shrinkX` 各加一条：`"guild": 1`（建筑默认：不缩横向、投影高度 1）。

### 步骤 5.5：重新生成内联条带（重要）

在 http 服务器下打开 `gen_shadow_strips.html`，它会自动把所有元素的"缓存1 条带"重新生成并写入 `shadow_strips.js`。**新增/修改任何元素后都必须重新生成**，否则 file:// 直接打开时该元素阴影退化为菱形。

### 步骤 6：建筑效果（可选）

`game.js` 的 `updateUseFacility(a, dt)` 中追加消费效果分支（如 `inn` 回血、`weapon` 加攻）：

```js
} else if (b.type === 'guild') {
  a.atk += 1; a.def += 1;
  setBubble(a, '🏰');
}
```

### 步骤 7：初始布局（可选）

`content.js` 的 `INIT_BUILDINGS` 追加 `{ type: 'guild', gx, gy }`。

### 步骤 8：验证

见第 9 节调试。重点确认：能放置（2×2 空地）、冒险者会去消费、阴影形状贴合。

---

## 5. 新增一个装饰

### 步骤 1：`content.js` — DECOR_DEFS + DECOR_SIZE

```js
// DECOR_DEFS（1×1 占格，不可走）
totem: { name: '图腾', icon: '🗿', desc: '提升氛围', cost: 45 },
// DECOR_SIZE（渲染尺寸 [宽, 高]）
totem: [60, 90],
```

### 步骤 2：贴图

放入 `assets/totem.png`（建议 60×90，底部有像素）。

### 步骤 3：`sprites.js` — 三处注册

```js
IMG_SRC 追加:  totem: 'assets/totem.png',
ALIGN_KEYS 追加: 'totem',      // 底部贴地
SHADOW_KEYS 追加: 'totem',     // 形状阴影（自动按原始尺寸建蒙版）
```

> 装饰**不要**加入 `MASK_KEYS`（不参与建筑遮挡判定）。

### 步骤 4：`shadow_config.json` — 缓存2

`"totem": 0.5`（projScale）+ `"totem": 0.03`（shrinkX）。

### 步骤 4.5：重新生成内联条带

打开 `gen_shadow_strips.html` 重新生成 `shadow_strips.js`（见建筑步骤 5.5）。

### 步骤 5：特殊动画（可选）

`game.js` 装饰绘制分支（约 972 行 `d.img === 'tree'` 处）追加：

```js
} else if (d.img === 'totem') {
  drawW();
  // 发光粒子等自定义动画
}
```

### 步骤 6：验证

`placeDecorAt('totem', gx, gy)` 能放置、有阴影、能拆除。

---

## 6. 新增一个人物/职业

### 步骤 1：`content.js` — CLASS_DEFS + HERO_NAMES

```js
// CLASS_DEFS（key 是职业 id，img 是贴图 key）
sorcerer: { name: '术士', img: 'ck_sorcerer', atk: 11, def: 2, hp: 80 },
// HERO_NAMES（可选）追加名字
```

### 步骤 2：贴图

放入 `assets/ck_sorcerer.png`（Q 版立绘，底部有像素）。

### 步骤 3：`sprites.js` — 三处注册

```js
IMG_SRC 追加:   ck_sorcerer: 'assets/ck_sorcerer.png',
ALIGN_KEYS 追加: 'ck_sorcerer',
SHADOW_KEYS 追加: 'ck_sorcerer',
```

### 步骤 4：`shadow_config.json`

`"ck_sorcerer": 0.5` + `"ck_sorcerer": 0.03`。

### 步骤 4.5：重新生成内联条带

打开 `gen_shadow_strips.html` 重新生成 `shadow_strips.js`（见建筑步骤 5.5）。

### 步骤 5：验证

`makeAdventurer()` 会随机选择该职业（`CLASS_DEFS` 自动遍历）。确认贴图显示、行走动画、阴影正常。

---

## 7. 新增一个怪物

`MONSTER_DEFS` 追加（`name/img/hp/atk/exp/gold/size`，`boss` 可选）→ 贴图 → `IMG_SRC`/`ALIGN_KEYS`/`SHADOW_KEYS` 注册 → `shadow_config.json` → 打开 `gen_shadow_strips.html` 重新生成内联条带。
注意 `makeSlime()`（engine.js）目前随机 `['slime','goblin','bat']`，新怪物若要刷新需加入该数组；`slimeking` 通过 8% 概率 boss 出现。

---

## 8. 阴影系统（缓存1 + 缓存2）

详见 `SHADOW_ALGORITHM.md`。快速要点：

- **缓存1（真实阴影条带）**：实体创建时由 `SpriteKit.Shadow.prepare()` 预热（`buildShadowGeo` 纯计算，与位置无关），运行期直接复用；键 = `img.src|w|h|tileW`
- **缓存2（静态配置）**：`shadow_config.json`，游戏启动静态读取；`Shadow.draw(ctx, {img, key, x, groundY, tileW, projX, w, h})` 按 `key` 查 `projScale`（投影高度，左下↔右上方向）与 `shrinkX`（横向收缩，屏幕水平方向）
- 阴影渲染参数：建筑 `tileW=84, projX=140`；装饰 `42/100`；人物 `42/45`；怪物 `42/40`
- 新元素**必须**在 `shadow_config.json` 与 `sprites.js` 内置默认 `Shadow.config`（兜底）中都登记，否则用默认值 1

---

## 9. 调试指南

### 9.1 启动本地服务器

```bash
cd kairo-game
python -m http.server 8090
```

浏览器打开 `http://localhost:8090/index.html`（游戏）、`.../sunshine.html`（阴影算法调试）、`.../shadow_config.html`（阴影参数工具）。

### 9.2 控制台调试 API（`window.__VILLAGE`）

```js
const V = window.__VILLAGE;
V.newGame();                                   // 重开一局
V.placeBuildingAt('tavern', 5, 3);             // 放置建筑（2x2 空地）
V.placeDecorAt('tree', 6, 3);                  // 放置装饰
V.placeRoadAt(6, 4);                           // 铺路
V.demolishAt(5, 3);                            // 拆除
V.makeAdventurer(); V.makeSlime();             // 造实体（工厂已包装自动预热阴影）
V.advanceTime();                               // 推进时间
V.S;                                           // 全部游戏状态（buildings/decors/adventurers/slimes/gold/...）
V.S.adventurers[0].curGx; V.S.adventurers[0].state;  // 冒险者网格位置/状态
V.SpriteKit.Shadow.config.shrinkX['tree'];     // 缓存2 当前值
V.SpriteKit._shadowCache.size;                 // 缓存1 条目数
V.IMG['guild'];                                // 贴图对象（naturalWidth/bottomRatio/baseMask 等）
```

### 9.3 常用排查

| 现象 | 检查点 |
|------|--------|
| 贴图不显示 | `IMG_SRC` 路径/文件名、`assets/` 是否存在、控制台 404 |
| 建筑/装饰无法放置 | `canPlaceBuilding` 要求 2×2 空地且 `gy ≤ 8`；`canPlaceSingle` 要求空地 |
| 阴影不显示/退化 | key 是否加入 `ALIGN_KEYS` + `SHADOW_KEYS`；贴图底部是否有非透明像素 |
| 阴影形状/大小不对 | `shadow_config.html` 调 `shrinkX`/`projScale`；缓存1 蒙版尺寸 |
| 阴影不更新 | `_shadowCache` 键含 `img.src`——**换贴图文件后需硬刷新**（清缓存） |
| 人"站在树上" | 2.5D 树冠悬空遮挡的正常现象（非逻辑 bug），见 `SHADOW_ALGORITHM.md` |
| 冒险者卡住不动 | `syncAdventurerGrid`/`findPath` 不可达；检查路是否连通 |

### 9.4 修改配置后生效

- 改 `shadow_config.json` → **刷新游戏**（启动时静态读取）
- 改 `sprites.js`/`game.js`/`content.js` → 刷新即可
- 换贴图文件 → 硬刷新（Ctrl+F5），避免 `img.src` 缓存

---

## 10. 代码规范与注意事项

- **key 唯一**：`image/img` 与 `IMG_SRC`/`ALIGN_KEYS`/`SHADOW_KEYS`/`shadow_config.json` 的 key 必须完全一致
- 建筑 2×2 占格、装饰/道路 1×1；村内 `gy 0..8`，野外 `gy 9..11`（野外草地可走，可放装饰）
- 新元素贴图**底部留非透明像素**（贴地与阴影的前提）
- 阴影：建筑不加 `shrinkX`（横向 1），非建筑默认 `0.03`；投影高度建筑 1、非建筑 0.5
- 实体创建必须经过 `makeBuilding/makeAdventurer/makeSlime` 或显式调 `prepareShadow`（game.js 已自动包装），否则缓存1 未预热（懒生成兜底）
- 性能：蒙版已在装配时等比缩到 ≤160；避免在 `draw()` 内做重计算
- 修改后跑一遍：启动无报错 → 放置/建造 → 冒险者消费 → 阴影正常 → 阴影工具页可导出

---

## 11. 辅助文件说明

- `assets_new/`：备用贴图源（同名角色图的不同版本），不参与加载，仅作素材备份
- `*.ps1`（`gen_chars_*`、`resize_chars`、`regen_knight`、`cutout_chars`、`diag_*`、`check_*`）：PowerShell 素材生成/校验脚本，非运行依赖；改动贴图后可用 `check_fmt.ps1` 等校验格式
- 修改 `IMG_SRC`/贴图时，**不要**动 `assets_new/`（不影响游戏）

---

## 12. file:// 直接打开支持（无需 http 服务器）

游戏支持**双击 `index.html` 直接用 file:// 协议打开**，无需 http 服务器。

### 原理与限制

- **浏览器安全限制**：file:// 下 `canvas.getImageData()` 会抛 `SecurityError`（本地图片视为跨源，canvas 被污染），因此蒙版无法在运行时从像素建立，阴影会退化为菱形。
- **解决**：开发阶段在 http 环境把每个元素的"缓存1 条带"预生成到 `shadow_strips.js`（内联 JS，约 150KB），游戏启动时按稳定键预填充进缓存1。file:// 下即使像素读取失败，阴影仍渲染真实形状。
- **配置**：file:// 下 `fetch('shadow_config.json')` 被 CORS 拦截，自动回退到 `sprites.js` 内置默认参数（与发布版配置一致）。若想改阴影参数，用 http 打开 `shadow_config.html` 导出覆盖配置文件即可。
- **索引**：加载顺序 `content.js` → `shadow_strips.js` → `sprites.js` → `engine.js` → `game.js`（shadow_strips 必须在 sprites 之前）。

### 重要提醒

**新增/修改任何元素（贴图、尺寸、key）后，必须重新生成 `shadow_strips.js`**：
在 http 服务器下打开 `http://localhost:8090/gen_shadow_strips.html`，页面会输出完整的 `window.SHADOW_STRIPS={...};` 内容，复制保存为 `shadow_strips.js` 覆盖即可（也可用 headless 浏览器 + 脚本自动抓取写入）。
否则 file:// 打开时新元素阴影退化为菱形。
