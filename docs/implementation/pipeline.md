# 内容准备入口（P0）

现有 10 个图库条目继续由 `workflows/*.yml` 管理。新增案例位于 `content/drafts/`，合成测试位于 `tests/fixtures/`；两者不会进入图库。当前 Agent 读来源、提取语义、编辑草稿；脚本不调用模型，也不执行来源代码。

## 演示

在仓库根目录运行：

```bash
npm ci
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium
npm run curate -- import-seeds
npm run curate -- prepare --source delivery-hero-account-recovery --draft content/drafts/delivery-hero-account-recovery.yml --out docs/review/cases
npm run curate -- batch --drafts content/drafts --out docs/review/cases
npm run test:visual
npm run check
npm run build
npm run test:gallery
```

打开 `docs/review/cases/delivery-hero-account-recovery/index.html`。默认 prepare 在临时目录完成 schema、语义、来源版本、SVG 几何、重复渲染及真实 Chromium 检查，通过后才替换案例包。没有浏览器、来源变化或校验失败会明确报错；上一份通过的包保留。输出目录必须属于该案例；存在额外文件或人工改动时拒绝覆盖，改用新输出目录或先保存人工改动。浏览器几何通过不等于人已核对事实或许可。

源内容或提取结果变化时，必须重新阅读 `.curator/sources/.../*.txt`，再更新草稿的证据、未知项和 hash；脚本不会把旧草稿自动适配成新事实。来源、草稿和渲染器指纹都不变时，prepare 跳过，不改变既有人工审核状态。来源在线失败时不冒充缓存核验成功；随仓库保存的审核包可直接查看。

图库预览仍用 `npm run dev`；生产构建输出 `dist/`。这轮没有新增分享、统计或发布服务。

## 输入与队列

- 注册表：`content/source-registry.json`。原启动包来源/候选研究信息保留；`read_allowed` 和 `allowed_prefixes` 只授权读取，不表示素材可再分发。尚未支持的入口仍明确记录待解析，不自动采集所有目录。
- 种子：`content/candidate-seeds.json`，20 条。`import-seeds` 记录稳定 ID、来源、处理状态、筛选原因、下一步及研究元数据，不把历史 `inspection_depth` 或 `checked_at` 当成本轮在线核验。
- 工作状态：`.curator/queue.json`，被 git 忽略。提交用的本轮状态摘要是 `docs/implementation/candidate-status.json`，只是一次快照。
- 去重：canonical URL + 指定源路径 / 原生工作流 ID。种子使用稳定种子 ID 区分同一目录中的不同流程；不能将 5 个 CrewAI 线索因相同目录 URL 合并。URL 去重忽略片段、跟踪参数和末尾斜杠；实际请求保留重定向所需斜杠。raw GitHub 文件与 blob URL 映射到同一标识。
- 增量：HTTP ETag 或提取后内容 SHA-256。不变就跳过重生成；变化使旧审核失效，保留旧包和旧审核 hash。
- 上限：默认 20 个待审/待人工处理案例。达到上限暂停新增包和新来源准入，已有待审包仍可改正；种子元数据继续登记并标记暂停。可用 `npm run curate -- config --max-pending 20` 修改上限。
- 串行使用 CLI。一个 batch 串行抓取并继续处理其他失败候选；不是后台服务，也没有调度器。

新 URL 或文件：

```bash
npm run curate -- add --source <注册表允许的URL或已脱敏JSON> --workflow-id <源工作流ID>
npm run curate -- fetch --id <返回的candidate-id>
npm run curate -- queue
```

公开仓库来源须指向具体 `https://github.com/<owner>/<repo>/blob/<revision>/<file>`；目录需要 Agent 先定位，不能把整个仓库或目录当成已提取案例。优先固定 commit，未固定时记录实际内容 hash 和读取时间。文件内容只读取，不 import/eval/执行它的代码。

官方文章从 article/main/body 中抽取文本，去掉脚本、样式、导航和表单；不运行脚本。原生 JSON 解析前限 2 MiB，入库前递归拒绝凭据、认证字段、认证参数名、名称/ID、认证 URL 和明显 token。去掉敏感字段后才重试；它不是保证识别所有私人数据的通用脱敏工具。原生文件仅由 Agent 映射成展示草稿，没有自动运行或自动转为商业模板。

## 证据与迁移

V2 保留现有步骤字段，增加 actor_id、actors、type、edges、coverage、lifecycle 和 evidence。`actor` 是 human/agent/tool/ci 类别；`actor_id` 指向角色实例。数量动态变化的角色集合用 `multiplicity: dynamic`，动态并行子流程用 `execution: dynamic_parallel`。

每个步骤/控制边都需要 evidence；`support` 是 explicit/inferred/unknown/migrated。推断、未知和迁移须写 reason。定位支持章节文本前缀（`Solution · paragraph 1`）、文件行号 `lines:10-30`、JSON Pointer `json:/nodes/0/id`。脚本校验来源版本和定位存在，不证明每项事实从该处推出；事实核对仍由 Agent 和人完成。

`lifecycle` 管发布状态，`evidence.status` 管证据状态。source_checked、author_confirmed、reproduced 不混同；后两者需要独立记录，prepare 不接受它们。三个真实草稿均只是 source_checked。所有效果数字和完整运行行为都未复现，本轮也未联系作者。

旧 YAML 原样保留。build 输出兼容投影：旧 maturity/verified 留在数据内，证据设 unknown；数组顺序产生的边明确 migrated；类别作为暂存角色 ID，不推断新角色、审批、失败或重试。原有小图保持原 SVG。需要导出迁移文件时：

```bash
npm run curate -- migrate --input workflows/oneredoak-code-review.yml --output /tmp/oneredoak-code-review-v2.yml
```

命令拒绝覆盖已有输出或输入文件。迁移后的发布时间含义是“此前已在图库显示”，不是新完成的人工审批。

## 失败、人工审核与恢复

抓取：每个来源默认 15 秒超时、2 MiB 上限、同进程同源间隔至少 1 秒、总尝试最多 3 次；429/5xx/网络错误有退避。Retry-After 超出单次 10 秒等待预算就记录并留待稍后，不提前绕过。401/403 不重试或换账号。重定向目标也须在允许范围。

状态区分 missing / forbidden / rate_limited / transient_error / sensitive / invalid_response / source_mismatch。目录缺少指定文件是 missing（待定位），403 是 forbidden；不会宣称链接失效。脚本支持环境代理，不输出代理或认证信息。

首次案例失败后可由 Agent 修正两轮；总失败三次后 needs_manual。失败报告在 `.curator/failures/`，浏览器失败时保留失败 SVG 和截图；已通过案例不被替换。手动检查后可运行：

```bash
npm run curate -- resume --id <id> --note <人工检查原因>
```

人确认后记录审核，不自动发布：

```bash
npm run curate -- review --id <id> --decision accepted --note <人工审核结论>
```

也支持 rejected / changes_requested。accepted 只能用于当前版本的待审包；来源变化或校验失败的候选不能直接接受。人工审核记录留在被忽略的队列中，包内 report 表示生成时状态。Agent 不得自己冒充人完成审核。

如果目录替换时进程被中断并留下 `<case>.previous`，停止该案例，先检查该备份，再恢复；脚本拒绝覆盖它。所有新文件均未提交、推送或发布，可以按 git diff 范围回退；`workflows/` 原文和 10 份原图没有改动。
