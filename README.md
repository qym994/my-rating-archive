# TIER/00 · 从夯到拉

我的私人游戏 / 番剧评级档案。纯静态站点，无框架、无后端、无追踪。

**线上地址：<https://qym994.github.io/my-rating-archive/>**

当前部署方式：GitHub Pages · `main` 分支根目录 · 已开启 `.nojekyll`。

## 本地预览

在项目根目录启动任意静态服务器：

```powershell
python -m http.server 8765
```

然后打开 <http://127.0.0.1:8765/>。

不要直接双击 `index.html`：主页通过 `fetch()` 读取 `content.json`，`file://` 协议下会被浏览器拦截。

## 文件结构

```text
.
├─ index.html                 # 单页应用入口（主页 + 详情页）
├─ content.json               # 全部作品内容（标题、分数、层级、短评、图片路径）
├─ assets/
│  ├─ css/style.css
│  ├─ js/app.js               # 路由、渲染、编辑、拖拽排序、GitHub 发布
│  ├─ js/transitions.js       # 每部作品的专属切换演出
│  ├─ js/sound.js            # Web Audio 合成音效（Switch 咔哒声等）
│  ├─ js/store.js             # 内容读取、本地草稿、GitHub Contents API
│  └─ img/                    # 本地压缩后的背景图与缩略图
├─ .github/workflows/pages.yml
├─ .nojekyll
└─ 404.html
```

## 部署到 GitHub Pages

### 当前方式：从 main 分支发布（推荐）

1. 把本目录推送到仓库的 `main` 分支。
2. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **Deploy from a branch**。
3. 分支选择 `main`，目录选择 `/ (root)`。
4. 等待 Pages 构建完成，访问 `https://<用户名>.github.io/<仓库名>/`。

根目录已有 `.nojekyll`，避免 Jekyll 处理静态文件。`robots.txt` 与页面内的 `noindex` 都是建议搜索引擎不要收录这个私人页面。

### 可选：GitHub Actions

仓库也包含 `.github/workflows/pages.yml`。如果希望改用 Actions，把 Pages 的 Source 改成 **GitHub Actions**，之后每次推送 `main` 都会自动部署。该 workflow 只把网页所需文件放进 `_site`，不会发布 `.work/` 素材草稿。

## 修改内容

打开页面右上角 **管理**：

- 第一次使用会要求设置一个**本机管理密码**（至少 4 位）。
- 解锁后可以进入编辑模式：拖动卡片调整层级与顺序；点击卡片编辑标题、分数、短评、图片、转场等。
- 所有修改先保存在浏览器 `localStorage` 的**本地草稿**中。
- 要让线上访客看到修改，有两种方式：
  1. **GitHub 发布**：在管理面板填写 owner / repo / branch / `content.json` 路径和 Fine-grained Token，直接提交到仓库。
  2. **导出 content.json**：在 GitHub 网页中替换仓库根目录的 `content.json`，提交后等待 Pages 重新构建。

### GitHub Token 权限

建议创建 Fine-grained Personal Access Token：

- **Repository access**：只选择这个站点仓库。
- **Permissions → Repository permissions → Contents**：`Read and write`。
- 不需要其它权限。

Token 只保存在当前标签页的 `sessionStorage`，关闭标签页即失效，不会被写入页面、`content.json` 或仓库。

### 关于“内容只能由我更改”

这是一个纯静态站，浏览器端密码只能防止误触，**不是真正的服务器鉴权**。真正的写权限来自 GitHub 仓库：

- 访客只能读取页面，无法修改线上文件。
- 只有持有仓库写权限或 Token 的人可以发布新内容。
- 其他人最多只能在自己的浏览器里改一份本地草稿，不会影响线上站点。

## content.json 结构

```json
{
  "version": 1,
  "site": {
    "updatedAt": "2026-10-21",
    "heroGame": "assets/img/hero-game.webp",
    "heroAnime": "assets/img/hero-anime.webp"
  },
  "tiers": [
    { "id": "hang", "label": "夯", "en": "HANG", "ghost": "S", "desc": "……" }
  ],
  "games": [
    {
      "id": "elden-ring",
      "type": "game",
      "title": "艾尔登法环",
      "score": 9.7,
      "tier": "hang",
      "review": ["第一段", "第二段"],
      "tags": ["魂系", "开放世界"],
      "image": "assets/img/elden-ring.webp",
      "thumb": "assets/img/elden-ring-thumb.webp",
      "transition": "ring",
      "switchGame": false
    }
  ],
  "anime": []
}
```

`games` / `anime` 数组中的顺序就是同层级内的展示顺序。层级顺序由 `tiers` 数组决定。

### 图片

- 详情页背景推荐 16:9、横向 1600–2200px 的图片。
- 卡片缩略图建议 720px 宽、WebP 格式。
- 把图片放进 `assets/img/`，然后在编辑器中填写相对路径。
- 也可以直接填外部图片 URL，但对方站点可能限制跨站引用。

## 转场演出

| 类型 | 用于 |
| --- | --- |
| `boot` | Switch 游戏：Joy-Con 合体 + 咔哒声 + 开机 Logo |
| `portal` | 英雄联盟：海克斯传送门 |
| `scan` | Apex：空投扫描 |
| `bounty` | 荒野大镖客：死神之眼 |
| `colony` | 环世界：殖民日志 |
| `ring` | 艾尔登法环：赐福金环 |
| `heart` | 女神异闻录5：心之怪盗剪影 |
| `clock` | Re:Zero：死亡回归时钟 |
| `magic` | Fate：圣杯魔法阵 |
| `crt` | 命运石之门：世界线变动率 |
| `petals` | 芙莉莲：花瓣旅途 |
| `brand` | 剑风传奇：蚀之刻烙印 |
| `strings` | 轻音少女：放课后琴弦 |
| `brass` | 京吹：北宇治吹奏 |
| `wings` | 进击的巨人：自由之翼 |
| `glitch` | 孤独摇滚：故障音墙 |

动画与音效均为网页重新设计的致敬演出，不含官方视频或音频素材。

## 素材版权

页面中的游戏、动画图像版权归原作者、制作公司与发行商所有，仅作为个人收藏与非商业展示使用。素材来源记录见 `CREDITS.md`。如果你是权利人并希望移除某张图片，请联系站主。

## 技术说明

- 原生 ES Modules + CSS，无运行时依赖。
- 路由使用 hash（`#/game/elden-ring`），无需服务器 rewrite，适合 GitHub Pages 子路径部署。
- 背景、转场、音效都支持 `prefers-reduced-motion`；音效可在右上角关闭。
- 数据由 `content.json` 提供，页面端所有用户内容均做 HTML 转义。
