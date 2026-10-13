# 调研：diagram-design 与 archify 如何保证图表质量 —— 对 awesome-workflow 的启示

日期：2026-10-12 · 对象：[cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)（v2.6）、[tt-a1i/archify](https://github.com/tt-a1i/archify)（v3.0.1）· 两仓库均已 clone 到本地并实际渲染验证。

## 一句话结论

两者走了**完全相反的两条路**，但都把"质量"变成了**写下来的规则 + 机器可验证的门禁**，而不是靠模型"审美"：

| | diagram-design | archify |
|---|---|---|
| 质量来源 | **Prompt 侧**：把"品味"写成 60+ 份参考文档，agent 手排 SVG 坐标 | **编译器侧**：agent 只写语义 JSON，几何由 Node 编译器求解 |
| 输出 | 单文件 HTML + 内联 SVG，**零 JS** | 单文件 HTML + 内联 SVG + 728 KB viewer runtime |
| 美学 | 编辑风：暖纸色、1 px 细线、无阴影、衬线标题、**禁用 JetBrains Mono / 深色霓虹** | "证据控制台"：深色优先、**JetBrains Mono 单字体**、7 种固定语义色 |
| 确定性 | 弱（README 承认"同一提示词两次布局可能不同"） | 强（v1 输出逐字节保留；迁移幂等） |
| 校验 | Python 脚本群 + Playwright 像素级裁切检测 | 自带 standalone validator + Chrome DevTools 管道四分辨率溢出检测 |
| 适合 | 要发表的"一张好图" | 大量、可重复、可追溯的工程图 |

> 对 awesome-workflow 的启示：你的 YAML 已经是 archify 式的"typed IR"，**应走 archify 的确定性编译路线，但把 diagram-design 的视觉约束作为编译器的样式常量**。

---

## 1. diagram-design：把品味写下来，再用脚本守住

### 1.1 设计理念（SKILL.md §1、§4、§5）
- **"最高质量的动作通常是删除"**：每个节点代表独立概念；总一起出现的两个节点合并为一个；布局已能表达的关系就删掉连线；"图不是加完就完，而是再也删不掉才算完"。
- **目标密度 4/10**，超过 9 个节点就该拆成两张（overview + detail）。
- **强调色是"编辑用的"，不是信号系统**：全图 1–2 个 focal 元素；"如果你想给 4 个东西上强调色，说明你还没决定什么是重点"。
- **语义角色而非 hex**：`paper / ink / muted / soft / rule / accent / link`，所有类型文档只写 `{ink @ 0.40}` 这类占位符，渲染前到 `style-guide.md` 解析。换品牌只改一个文件。
- **三种字体各司其职**：Instrument Serif（标题/斜体旁注）、Geist（节点名）、Geist Mono（端口、URL、命令等**技术内容**，绝不当"程序员气氛字体"）。
- **先选语义模式，再选视觉类型**（§3）：9 种行为模式（fan-in 瓶颈、paved road、lifecycle phase map…）各自拥有更紧的预算和反模式，再映射到 44 种视觉类型之一。

### 1.2 硬约束
- **复杂度预算**：通用 9 节点 / 12 箭头 / 2 强调 / 2 旁注；分类型表（swimlane ≤ 5 泳道、sequence ≤ 5 lifeline、kanban ≤ 5 列 12 卡…）。
- **4 px 网格**：节点原点、宽高、间距、padding 全部能被 4 整除——作者称这是"让图不像 AI 生成"的关键。
- **六条连线规则（违反即 fail）**：只允许正交（圆角 r=8 肘）；箭头标签 ≤ 14 字符、全大写、带不透明遮罩、离线 6–10 px；无重叠线、交叉处用 hop；同一边多条连线各自独立接点，≥ 12 px；不得从非端点盒子后面穿过；标签遮罩不得被后绘节点覆盖。
- **可访问 SVG 合约**：`role="img"` + `aria-labelledby`，`<title>` 必须是 `<svg>` 第一个子元素，ID 带文件前缀。
- **移动端**：`min-width` = viewBox 宽度，外层 `overflow-x: auto`，否则会整页横滚或被祖先 `overflow:hidden` 裁掉。

### 1.3 反模式清单（"AI slop" 识别表）
深色 + 青/紫光晕、JetBrains Mono 当通用字体、所有节点同样的盒子、图例浮在图内、无遮罩的箭头标签、竖排文字、三张等宽卡片、任何阴影、`rounded-2xl`、到处都是强调色、**照搬 Mermaid 渲染器的布局**。

### 1.4 流程约束
- **画前确认**：先用一句话说明选的类型/模式/尺寸/将被预算砍掉的内容，用户在场就让他改，不在场就把假设写在交付物旁。
- **Taste Gate**：约 40 项输出前自查表（type fit / remove test / signal / technical / typography）。
- **导入 = 重画，不是转换**：draw.io / Mermaid / Excalidraw 先用 Python 抽成统一 IR（nodes/edges/containers/hubs/budget flags），再按四个旋钮（format / size / detail / audience）重画，最后交 **fidelity ledger**（合并了什么、砍了什么）。源文件里的文字一律当不可信数据。

### 1.5 工具与 CI（全部 Python，几乎只用标准库）
| 脚本 | 做什么 |
|---|---|
| `lint-skin.py` | 对照 style-guide 检查 hex、字体、a11y、单文件安全（无远程 script/@import） |
| `verify-contrast.py` | 文本 token 4.5:1、必要图形 3:1，半透明先合成再算，明暗两套皮肤 |
| `verify-geometry.py` | 标签遮罩被后绘节点裁切、斜线、线压在节点边框、接点离角 < 8 px、同边接点 < 12 px、两线 1 px 内并行 > 4 px |
| `lint-render.py` | **"浏览器是裁判"**：Playwright 截图一次，释放 `overflow` 再截一次，diff 出新墨迹 = 内容被裁切；分级释放祖先容器，1× 和 0.25× 两种缩放 |
| `self_check.py` | 随技能一起安装，用户侧也能跑 |
| `verify-docs-sync.py` | 路由词汇 / 画廊 / README 目录树 / 引用锚点同步；**SKILL.md 封顶 40 KB** |
| `verify-screenshot-freshness.py` | README 截图与示例 HTML 的 digest 绑定 |
| 分类型 `verify-*.py` | sankey 流量守恒、treemap 面积 = 数值、waterfall 累计、slopegraph 同刻度… |
| `test-verify-*.py` | **每个校验器都有对抗样例**（pass + 该抓到的坏例子） |

CI：3 OS × 2 Python 矩阵，Playwright/Chromium 版本钉死（像素裁判必须钉版本）。

### 1.6 第三方
无图表库、无布局引擎。图标：Tabler Icons（MIT）+ Simple Icons（CC0），均用 `currentColor`；字体 Google Fonts（可切系统字体离线）；Playwright 仅用于校验与 PNG 导出；Pillow 做缩略图。

### 1.7 治理
`docs/adr/` 14 份 ADR（如 0004 SKILL.md 字节上限、0005 标签几何必须机器校验）；`docs/superpowers/` 的 specs/plans（用的就是你库里的 obra/superpowers 流程）；版本号只在 main 合并后自动 bump，PR 禁止改。

---

## 2. archify：agent 不画像素，只写语义；编译器负责几何

### 2.1 架构
`typed JSON (JSON Schema 2020-12, 5 种类型)` → `node bin/archify.mjs finalize` → **validate → deliver(原子替换) → strict check(来源校验) → browser-check** → 单文件 HTML。
- 运行时**零依赖**（Node ≥ 18）；ajv 只在开发期生成 standalone validator；parse5/saxes 测试用；simple-icons 生成品牌徽标。
- workflow 的 IR：`lanes`（所有者/运行时边界，`variant: exception` 单独放失败/重试路径）、`phases`（Intake / Plan / Execute 之类的故事节拍，跨列）、`groups`（泳道内的并行/分支框）、`mainPath`（happy path，编译器校验相邻节点有边且不往回走）、`nodes[lane, col 0..5, type, label, sublabel, tag]`、`edges[variant, role, route preset]`、`semanticChecks`（allowedRoots / allowedTerminals / requiredEdges / requiredPaths）、`cards`。

### 2.2 编译器承担的"质量"
- **Readable v2 布局合约**：相邻 rank 基线 120 px；同泳道节点 ≥ 8 px；直连边净空 ≥ `max(28, 标签遮罩宽 + 8)`；端点 stub ≥ 8、内部拐角段 ≥ 16；viewBox 由内容测量得出，显式 viewBox 太小时报告精确 `requiredViewBox`。
- **文本宽度 CJK 感知**：全角算 2 单位（`6.5px × 单位 + 21px`）。
- **同边多条连线自动散开**（automatic port spread），不堆在中点。
- **路由预设优先于手写坐标**：`drop / outside-right / return-left / bottom-channel / up-channel`，手写 `via/labelAt/channelX` 是绝对硬钉，不可行就报 `workflow/explicit-pin-conflict` 而不是偷偷挪。
- **Clean Flow Gate**：边穿过无关节点（2 px 净空）即拒绝；标签撞节点/撞标签、标签比节点宽、图例出 viewBox、直线段 < 28 px 全部 fail。
- **诊断是因果的**：rank 容量失败会压制衍生的短边/标签重叠告警；每条 `supportedFixes[]` 都经"重新规划"验证过才给出；**永远不建议删语义标签**。
- **Agent 修复预算**：两轮修复；"非零退出永远不是成功"；"不得声称做过未做的目视检查"。

### 2.3 浏览器门禁（不用 Playwright）
`browser-check` 通过 Chrome DevTools 管道，在 1440×900 / 1600×1000 / 1920×1080 / 2048×1320 四个视口测量：**横向溢出一律失败**；投影文字 < 6 px 失败（建议 ≥ 7.5 px）；请求的主题必须真的生效；明暗两端点都测。产出带 SHA-256 的 receipt，不截图。

### 2.4 设计系统（DESIGN.md "The Evidence Console"）
- **语义色规则**：7 个饱和色各对应一种节点/关系语义（frontend 青、backend 绿、database 紫、cloud 琥珀、security 玫红、messagebus 橙、external 灰），"绝不为了让界面活泼而加色"。
- **主题平权**：light / dark / signal-flow / blueprint 只换材质，不换类别身份与信息优先级。
- **静态即完整**：动效只有一个有界 owner，静帧必须自洽；导出剥离一切 viewer 状态。
- **扁平为常态**：阴影只给浮动面板和激活焦点。
- **真相先于炫技**：focus / upstream·downstream reach / route 只从**作者写的边**推导；"不得把图可达性说成 blast radius"。
- 反参照：Mermaid 美化器、WYSIWYG、动效优先 demo、"密集仪表盘壳子、无尽的同款卡片网格、毛玻璃、渐变文字等 AI 界面陈词滥调"。

### 2.5 证据与可追溯
Architecture 节点可挂 `sources`（仓库相对路径 + 行号），锁定到 40 位 commit；渲染为 `SRC n` 小徽标，点开到 Git 校验过的文件；导出时剥离。普通图默认无来源，证据是 opt-in。

### 2.6 测试
约 100 个 `node:test` 文件 + golden 测试 + 浏览器测试；fixture 以 issue 命名（issue-126、#250）；v1 → v2 迁移幂等验证；上下文预算：SKILL.md 11.6 KB，分支参考只在触发时读。

---

## 3. 两者共同的"质量公式"（可直接抄）

1. **单文件 HTML + 内联 SVG，无运行时依赖**，双击可开、可嵌入、可 diff。
2. **写成文字的设计系统 + 明确的反模式表**，用语义角色而不是 hex。
3. **数值化硬预算**：节点数、泳道数、网格、标签净空、最小线段长度。
4. **几何机器校验 + 真浏览器渲染校验**（裁切 / 横向溢出 / 文字最小像素），不信源码只信像素。
5. **Agent 流程合约**：画前先说计划；门禁不过不许宣称成功；修复有轮数上限；交付带 receipt / ledger。
6. **渐进披露**控制上下文（SKILL.md 做路由，分支文档按触发加载，字节上限写进 CI）。
7. **Mermaid 只当输入**："重画，不转换"。
8. **可访问性**：`role=img` + title/desc、对比度、`prefers-reduced-motion`、键盘。
9. **图例从实际用到的类型派生**，放底部横条，不浮在图里。
10. **治理**：ADR / DESIGN.md / PRODUCT.md；校验器自带对抗测试；文档与产物同步检查。

---

## 4. 对 awesome-workflow 的具体建议

现状：`workflows/*.yml`（steps: actor / human_gate / model_tier / inputs / outputs / evidence_url）→ `build.mjs` → `workflows.json` + README；详情页是 CSS 竖向 step 列表（DECISIONS P2 "自定义 swimlane，React Flow + ELK 推迟"）。**YAML 已经是 archify 式的 typed IR，缺的是"编译器 + 门禁 + 样式合约"。**

### 4.1 路线选择：确定性编译，借编辑风样式
- 不要让 agent 手排坐标（diagram-design 路线对"一张发表图"好，对 10 → 100 条工作流的库不可复现）。
- 在 `scripts/build.mjs` 里把 YAML 编译成 **静态 SVG 字符串**（构建期生成，不在浏览器算布局）：`lane = actor`（human / agent / tool / ci，≤ 4 条，正好在 diagram-design 的 swimlane ≤ 5 预算内）、`col = step 序号`、`human_gate` 节点用 teal 强调（全图唯一 focal：**"人在哪里把关"就是这类图的 headline**）、`model_tier` 做 mono 副标签。
- 同一份 SVG 三处复用：详情面板内联、`docs/diagrams/<id>.svg` 供 README 直接 `![]()`（awesome list 立刻有图）、PNG 导出（Playwright 一行）。React Flow / ELK 继续推迟——四条泳道 + 线性步骤不需要通用布局引擎。

### 4.2 样式合约（写成 `DESIGN.md`，替代 DECISIONS P3 那一行）
- 语义角色：`paper`（暖纸）、`ink`、`muted`、`rule`、`accent`（teal，1–2 处）；actor 四色作为固定语义词汇（像 archify 的 7 色）而不是装饰色，图例由实际出现的 actor 派生。
- 4 px 网格；1 px 细线；无阴影；圆角 ≤ 6 px；正交连线 r=8 肘；箭头标签 ≤ 14 字符带遮罩；图例底部横条。
- 字体：标题衬线、步骤名 sans、`tool` / 命令 / `model_tier` 用 mono（**只有技术内容用 mono**）。
- 反模式表直接继承两家（尤其：所有 step 同款盒子、等宽三卡片、深色霓虹、Mermaid 原生布局）。
- 预算：一张图 ≤ 9 步；超过用 `phases`（Plan / Build / Review / Ship）分段或拆 overview + detail。你库里 gstack、superpowers 这类长流程会首先撞上这条。

### 4.3 Schema 升级（借 archify workflow IR 的几个字段）
- `phases[]`（跨步骤的故事节拍）、`main_path`（happy path，校验相邻 step 有边且不回退）、step 级 `on_fail → step_id`（异常路径进单独的 exception lane，而不是混在主路径）。
- `evidence_url` 升级为 `{url, commit?, path?, lines?}`，渲染成 `SRC` 小徽标——这是 archify "truth before spectacle" 在你库里的对应物，也和 C2 决策一致。
- `semantic_checks`：每条 workflow 至少一个 `human_gate` 或声明 `automation: automated`；`inputs/outputs` 链式一致（上一步的 output 应出现在下一步 input）。

### 4.4 CI 门禁（`check.yml` 目前只有 schema + tsc）
| 门禁 | 做法 | 来源 |
|---|---|---|
| 语义 lint | build 时校验 main_path / gate / IO 链 | archify `mainPath` + `semanticChecks` |
| 几何 lint | 对生成 SVG 检查：非正交段、标签遮罩被节点覆盖、同边接点 < 12 px、图例出 viewBox | diagram-design `verify-geometry.py`（思路可用 50 行 JS 复刻） |
| 对比度 | token 对 paper 4.5:1（明暗各一套） | diagram-design `verify-contrast.py` |
| 渲染 lint | Playwright 在 1440 和 390 宽各截一张详情页，`scrollWidth > clientWidth` 即 fail；SVG 外层 `overflow-x:auto` + `min-width=viewBox` | diagram-design `lint-render.py` + archify `browser-check` |
| Golden 快照 | `docs/diagrams/*.svg` 入库，PR diff 可见布局变化 | archify golden tests |
| 文档同步 | 已有（README 由 YAML 生成）；加截图 digest 过期检查 | diagram-design `verify-screenshot-freshness.py` |
| 校验器对抗测试 | 每个 lint 配一个"必须抓到"的坏 fixture | 两家都有 |

### 4.5 交互（从 archify 借最小集，不要造 viewer runtime）
- 点一个 step → 高亮 upstream / downstream（纯 CSS 或 20 行 JS，数据来自 YAML 的边）。
- `#step=<id>` 深链；"只看 human gate" 透镜（对应 P4 的 human-gate filter）。
- 不做动效；若做，静帧必须完整，尊重 `prefers-reduced-motion`。

### 4.6 Agent / 贡献者合约（写进 `AGENTS.md` 与 CONTRIBUTING）
- 新增 workflow 前先说：actor 集合、步数、哪一步是 gate、超预算怎么拆（diagram-design "confirm before drawing"）。
- `npm run check` 不过不许说"完成"；PR 里附生成的 SVG 截图（archify receipt 的轻量版）。
- 从 README / Mermaid 抄来的流程：**重画成 YAML，不复制原布局**，并在 `not_for` 或 notes 里写 fidelity ledger（合并/省略了什么）。

### 4.7 可以直接复用的零件
- Tabler Icons（MIT）/ Simple Icons（CC0）给 tool 徽标（claude-code、codex、cursor、github-actions），`currentColor` 继承 ink。
- diagram-design `assets/example-swimlane*.html` 作为视觉基准；`references/type-swimlane.md`、`type-process.md`、`layout-budget.md`、`primitives-core.md` 直接当样式常量来源。
- archify `renderers/workflow/README.md` 的 v2 layout contract 表（120 px rank、28 px 最短直段、标签净空公式、CJK 2 单位）当编译器参数初值。
- archify `schemas/workflow.schema.json` 的 `phases / groups / mainPath / semanticChecks` 字段设计。

### 4.8 建议的实施顺序
1. `DESIGN.md`（角色、预算、反模式）+ 用 Waza `/think` 走一遍。
2. `build.mjs` 增加 YAML → SVG 编译，产出 `docs/diagrams/*.svg`，README 条目嵌图。
3. `WorkflowDetail` 改为内联该 SVG + 最小高亮交互。
4. `check.yml` 加语义 lint、几何 lint、Playwright 溢出检查、golden 快照。
5. Schema 加 `phases / main_path / on_fail / evidence{commit,path}`，再回填现有 10 条。

---

## 来源
- https://github.com/cathrynlavery/diagram-design — README、`skills/diagram-design/SKILL.md`、`references/{style-guide,layout-budget,type-swimlane,primitives-core}.md`、`scripts/{lint-skin,lint-render,verify-geometry}.py`、`CONTRIBUTING.md`、`docs/adr/`
- https://github.com/tt-a1i/archify — README、`archify/SKILL.md`、`DESIGN.md`、`PRODUCT.md`、`archify/schemas/workflow.schema.json`、`archify/renderers/workflow/README.md`、`archify/references/{authoring-defaults,delivery-contract}.md`、`archify/examples/agent-tool-call.workflow.json`（本地 `deliver` 实跑通过 9/9 检查）
