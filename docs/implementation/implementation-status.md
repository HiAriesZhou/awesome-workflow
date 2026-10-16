# Implementation status — 2026-10-16

P0-1、P0-2、P0-3、内部 workflow-curator 和交互图库已实施。交付分支：feat/content-pipeline-gallery；基线 HEAD：c518e2e750dd8cf39fb6054c151daf4b8ff20a45，开始时 main 工作区干净。P1 分享、统计、运营和定时任务未实施。

## 提交与 PR 交付

- 用户已授权 commit、push、创建 PR；该授权不包括合并或部署。main 的 push 会自动部署，因此使用独立分支交付，正式图库仍为原 10 个案例。
- 本轮提交前重新运行：npm run check（40 项）、npm run build、npm run test:visual（14 样本）、npm run test:gallery（10 案例、8 组交互检查、10 截图）、npm run test:preview（实际 5173 地址初始 10 张 SVG、无覆层与页面错误），全部通过。
- 独立临时状态目录实测 CLI：首次导入 20，重复导入跳过 20，queue 返回 20，异常配置退出 1；迁移保留 unknown 证据状态，拒绝覆盖已有输出。未修改实际候选队列。
- 提交前凭据模式检查未发现匹配项；.curator 原文/状态继续被忽略。git diff --check 和旧 workflows/docs/diagrams 无改动检查通过。所有截图与来源草稿均按原来的证据界限保留，不把自动检查视为用户验收或业务复现。
- Archify 的五份原始 HTML 对照产物保留上游输出；.gitattributes 仅为这些文件标记生成物并忽略行尾空格，避免为格式检查改写实验依据。其他文件仍按正常空白规则检查。
- PR 合并前仍需人工核对三份真实草稿的事实、未知项与许可；本轮没有将它们移入 workflows。

## 2026-10-16：修复用户实际打开的旧预览

- 用户截图仍是“一个选中 SVG + 卡片列表 + 右侧详情”。检查发现 5173 的旧 Vite 进程返回了含 diagramRef 的旧 App；磁盘上的 App 已是全部流程图图库。之前图库检查启动了独立服务，没有验证给用户的这个地址，因此遗漏问题。文件监听为何未更新尚未确定，不把猜测写成原因。
- 已确认旧进程属于当前仓库，仅重启该预览，仍使用 http://127.0.0.1:5173/awesome-workflow/ 。该地址现在返回新 App，不含旧选中图代码。
- 新增 npm run test:preview，直接检查已运行地址，不代为启动新测试服务。实际旧服务检查失败（preview-before.json/png），原地址重启后通过（live-preview.json/png）：未点击时 10 个图库条目和 10 张 SVG、0 个打开的覆层、0 页面错误；打开/关闭详情保留全部图库 SVG。Agent 查看了该地址的完整截图。
- npm run dev 加上 --strictPort，端口被占用时明确报错，不再悄悄换地址。独立生产图库检查和合成测试入口不受此命令参数影响。其他 preview 的脚本入口已检查；无需修改内容生产线或重新设计图库。
- 本轮只增加实际地址检查脚本、命令和文档，未改工作流、导出 SVG 或图库布局。测试环境首次启动浏览器受系统权限限制，获准后已完成实际检查；没有将权限失败当作 UI 回归结果。
- 演示：npm run dev -- --host 127.0.0.1 --port 5173；另一个终端运行 npm run test:preview。当前服务已运行，无需再次启动。仍未提交、推送或发布；下一步是用户查看这个实际地址的全部流程图布局。
- 回滚本轮防护只需移除 test:preview 命令和 scripts/preview-check.mjs、撤回 dev 的 --strictPort；保留前面的图库改动。不要回滚整个未提交工作区。

## 2026-10-14：图库重新设计

- 用户否定原来的卡片列表和单个选中图布局。已改成顶部搜索/领域/工具/证据筛选，下方直接展示全部 SVG；桌面两列、手机一列。保留原色彩与字体，移除大幅介绍和渐变背景。
- 点击图打开大覆层：拖动、按钮/滚轮缩放、查看全图、拆分视图切换。小到难读或移出视野的选中节点自动放大居中。节点详情包含角色、输入输出、审批、备注与证据；连线悬停/键盘聚焦显示连接信息，点击可固定详情，触屏无需悬停。
- 侧栏显示用途、作者、领域、工具链、来源链接、发布/证据状态、未知项和适用限制。旧顺序连接明确标注迁移，未补造新事实。旧 YAML 和导出的 SVG 均未改动；交互标记与独立 ID 仅在浏览器展示时添加。
- 主要文件：src/App.tsx、src/components/{WorkflowCard,WorkflowDiagram,WorkflowExplorer,InteractiveDiagram,WorkflowDetail}.tsx、src/lib/diagram.ts、src/styles/global.css。设计记录在 docs/plans/2026-10-14-gallery-design.md 与 DESIGN.md。未添加依赖。
- 基线 npm run check（40 项）、原 npm run test:gallery 通过。本轮 npm run check（40 项）、npm run build、扩展的 npm run test:gallery 通过；生产页全部 10 案例的每个节点、搜索/组合筛选、缩放/拖动、连线、焦点循环/归还、背景关闭均实际检查。320/375/760/1024px 无横向溢出，真实触屏上下文点击有效；开发模式重复挂载也验证了关闭后焦点归还。
- 五种合成拓扑、长中英文标签、18 步拆分切换、选中节点可读性和无效 SVG 错误在独立测试页验证，不进入正式图库。测试页加载时曾被开发服务器回退为 HTML，已修正测试数据接口位置；键盘末项焦点曾不循环，已修复并通过检查。
- 浏览器：Chromium 145.0.7632.6；8 组检查、10 张截图、0 页面错误，结果见 gallery/report.json。Agent 实际查看了桌面图库、手机图库/覆层/节点、连线、长标签、并行和拆分截图，确认布局与本轮要求一致；这不代表用户视觉验收。before.png 保留原页面对照。git diff --check 和旧 workflows/docs/diagrams 无改动检查通过。
- 预览仍在 http://127.0.0.1:5173/awesome-workflow/ 。重新启动：npm run dev -- --host 127.0.0.1 --port 5173。复跑 UI 检查：先 npm run build，再 npm run test:gallery。
- 待完成：用户验收本轮视觉与交互。已有三份真实草稿仍待人工事实/许可审核，没有借 UI 修改发布它们或实施 P1。特别宽的图需缩放或选择节点阅读；全图模式优先显示完整拓扑。
- 回退本轮 UI 时按本节文件逐项反向应用对应差异，保留此前 P0 修改，再构建检查；不要直接恢复整个工作区到 HEAD。无需回退 YAML、导出 SVG 或依赖。

## 已完成

- schema 和语义检查支持明确连接、条件、并行分发/汇合、反馈，以及角色类别/实例、动态并行集合、证据定位、推断与未知项；发布和证据状态分离。
- 10 个旧 YAML 和原 SVG 未修改；兼容投影不丢原字段。旧 verified 保留但证据为 unknown，数组顺序连接标注 migrated，不补造审批、失败或重试。
- 主后端是原有 SVG 编译器，颜色/字体/网格保留。五种拓扑、中文英文长标签、18 步/9 审批拆分、末端反馈与密集返回通道有测试。图形预算作用于视图；所有原节点、连接和审批仍可追溯。
- Archify v3.0.1 实测两轮适配，五样本最终可编译；另有独立 SVG 与完整 HTML 的 10 张浏览器对照截图。没有把它引入主构建或增加第二个主后端。选择依据见 renderer-decision.md，未继续扩展 ELK 调研。
- 20 个种子幂等导入，3 个原始文章完成来源读取 → Agent 草稿 → SVG → 浏览器检查 → 审核包；17 条仍为候选。来源/下一步见 candidate-status.json，工作状态在被忽略的 .curator/queue.json。
- 指定仓库文件、官方文章、已脱敏原生 JSON 的读取/去重/缓存/增量、失败分类、超时/限速/退避、队列上限与手动恢复已实现。原生敏感字段在写入前拒绝；不执行来源代码。
- prepare 在 staging 校验和截图，通过后替换包。未知目录、额外文件和人工修改的生成文件拒绝覆盖；失败最多初次 + 两轮修复，保留旧包并转人工。坏 YAML 错误不回显原文。
- 仓库 skill：../../.agents/skills/workflow-curator/SKILL.md，格式验证通过；实际 CLI 入口和已测行为有测试，没有模型/API 服务依赖。

## 实际验证

- 基线：npm run check（17 项通过）和 npm run build 通过，图库为 10 个案例。
- 最终：npm run check（40 项通过）、npm run build、Node 22.22.1 的同一组 40 项测试通过；本机默认 Node 23.2.0。TypeScript 和生产构建通过。
- npm run test:gallery：生产预览打开全部 10 案例，搜索/重置有效，无页面错误，截图在 gallery/gallery.png。
- 每个真实包内 browser-report.json 和 full.png：真实 Chromium 检查通过。npm run test:visual 的14 张组合截图和报告在 visual/；自动检查与 Agent 图片查看分别记录，不代表用户验收。
- 两次相同 prepare：来源、草稿、编译器不变时 skipped，原包未重写。抓取失败分类和复现状态的测试使用合成响应，不当作在线核验成功。
- npm ci 与 Chromium 环境准备成功；npm audit 最终 0 个已知漏洞。新增精确版本：parse5 7.3.0、undici 7.30.0、Playwright 1.58.2。图截图浏览器 Chromium 145.0.7632.6。
- git diff --check 通过；git diff --exit-code -- workflows docs/diagrams 通过，旧内容和图未变。

## 真实案例与证据界限

- docs/review/cases/delivery-hero-account-recovery：经理批准后的账号恢复。未知提交、拒绝、超时和接口拓扑，不补造路径。
- docs/review/cases/formula-bot-data-connectors：用户数据接入到结构化文件；连接器内部保留动态边界。
- docs/review/cases/anthropic-parallel-research：动态并行研究集合、继续研究反馈和引用整理；不虚构固定两个子 Agent。

三个来源均通过实际在线读取；Agent 读了对应正文并形成原创说明。来源绑定检查只证明 URL/hash 和定位存在，不自动证明事实。来源全文仅在 ignored cache；仓库只放原创说明与生成图，未复制文章截图、模板或原文。素材再分发权、作者确认、用户人工审核和真实工作流执行全部未完成，绝不标 reproduced。

## 演示与后续

```bash
npm run curate -- import-seeds
npm run curate -- prepare --source delivery-hero-account-recovery --draft content/drafts/delivery-hero-account-recovery.yml --out docs/review/cases
```

打开 ../review/cases/delivery-hero-account-recovery/index.html。完整使用方式与恢复命令见 pipeline.md。下一步唯一优先任务：人工核对这三份包的事实、未知项和许可，记录接受/修改/拒绝结论；通过前不扩大采集或进入 P1。

## 限制与回滚

- 超过 9 个概览组、单详情边界端点过密或不可折行长词仍会阻碍渲染，完整草稿保留；不是任意大图的最优布局器。当地字体 fallback 和不同 OS 的截图可能不同，需要在目标环境重查。
- 未运行第三方业务工作流、生产 API、作者确认、线上部署、远程 CI、完整技能独立 Agent 行为评估；这轮只验证已交付脚本和本地流程。
- 删除/回退本轮新增文件，并按 git diff 反向恢复修改后运行 npm run build:data，即可回到基线；不要对未提交修改使用 reset 或 stash。case 输出有指纹保护，目录替换中断若留下 .previous，应先人工恢复该备份。
- 浏览器安装曾清理旧 1228 缓存，已确认原 Chromium/Headless 两份缓存存在。恢复时误下载的 1248 是额外缓存，不参与本项目；未改其他仓库代码或依赖。今后的安装命令使用 PLAYWRIGHT_SKIP_BROWSER_GC=1。
