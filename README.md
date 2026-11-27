# 足球人生 · Football Life

一个纯前端、无依赖的足球生涯模拟游戏。从 16 岁起步，通过训练、比赛、转会和赛季推进走向退役。

## 运行方式

直接双击 `index.html` 即可（使用普通 `<script>`，兼容 `file://`）。

如果希望用本地服务器：

```powershell
python -m http.server 8000
# 然后打开 http://localhost:8000
```

## 目录结构

```
Game/
├─ index.html          页面结构：创建页 / 主界面四宫格 / 各功能弹层
├─ assets/
│  └─ style.css        全部样式
├─ js/
│  ├─ data.js          静态配置：属性、训练、比赛事件、成就、文案
│  ├─ engine.js        仿真引擎：状态、成长、比赛、赛季、转会、国家队、存档
│  └─ ui.js            UI 层：DOM 绑定、面板、渲染、Toast、比赛与赛季流程
└─ README.md
```

脚本按 `data.js → engine.js → ui.js` 顺序加载，使用全局作用域共享状态与函数；这样无需构建工具，也避免了 `file://` 下 ES Module 的跨域限制。

## 主要可调位置

### 属性与成长（`js/data.js`）

- `ATTR_START`：各位置初始能力区间（1–20）。
- `ATTR_WEIGHTS`：位置综合能力权重。
- `XP_BASE` / `XP_GROWTH`：升级经验曲线，数值越大升级越慢。
- `TRAIN_CATS`：五大训练类别及其主/副属性权重、基础体能消耗。
- `INTENSITIES`：轻度 / 普通 / 强化特训的消耗与收益倍率。

### 体能（`js/data.js` + `js/engine.js`）

- `WEEKLY_RECOVERY`（`js/data.js`）：每轮赛后基础恢复（当前 56）。
- `matchFullCost()`（`js/engine.js`）：满场体能消耗，按位置与体能属性计算。
- 比赛消耗按实际出场分钟数比例扣除；被换下只扣已出场部分。
- 标定目标：满场 + 普通训练 ≈ 回满；满场 + 强化特训会留下疲劳。

### 比赛关键点（`js/data.js` + `js/engine.js`）

- `POS_EVENT_WEIGHTS`：各位置抽到扑救/防守/传球/进攻的概率。
- `MATCH_EVENTS`：通用关键事件池及所需属性权重。
- `POS_SPECIAL_EVENTS`：门将专用传球/出击事件。
- `FILLER_TEXTS`：非关键点“全力比赛中……”文案。
- `LEAGUE_AVG`：各联赛平均能力，用于计算事件成功率。
- `simMatch()`：每半场 5 次关键点、实时评分、比分、体能消耗、换人判定。

换人规则：过了半场后，连续两个关键点实时评分低于 6.0，或关键节点体能低于 40，即被替换下场。

### UI / 页面

- `index.html`：主界面四个方格（属性 / 训练 / 数据 / 生涯）、底部比赛操作条。
- 成就入口在右上角 🏆 按钮，点击打开独立弹层。
- `fitTiles()`（`js/ui.js`）：按可视高度收缩四宫格，主界面不会出现纵向滚动。
- `js/ui.js` 的 `renderAll()` 是统一刷新入口；各面板打开时会单独刷新。

## 存档

使用浏览器 `localStorage`，键名为 `football_life_save_v1`。旧版本存档会在读取时自动从 20–99 制换算到 1–20 制。

## 开发提示

- 修改静态配置优先只改 `js/data.js`。
- 修改行为逻辑改 `js/engine.js`，不要把 DOM 操作写进引擎。
- 修改展示、面板、按钮交互改 `js/ui.js`。
- 三个脚本均为经典脚本，新增文件时保持加载顺序并在 `index.html` 中追加 `<script src="...">`。
