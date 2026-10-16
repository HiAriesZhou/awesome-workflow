# P0 渲染后端：扩展现有 SVG 编译器

本轮只保留现有 SVG 编译器为主后端，不引入 Archify 或 ELK 的运行依赖。V1 小图保持原样；v2 由同一编译入口分派到显式图布局。五种拓扑、长标签、拆图及真实草稿均已生成 SVG 和实际浏览器截图。

## Archify 有界实测

原始项目：https://github.com/tt-a1i/archify ，固定发布 v3.0.1。下载的 release archive SHA-256：`61ea13cc559a7a040022d22696184dd4bb8a7157121708b13858fff2877c64e0`。GitHub tree API 首次返回 rate limit；随后读取 release archive，没有换账号或绕过访问限制。

实际命令（checkout 是解压的 Archify v3.0.1；它未安装到本仓库）：

```bash
node scripts/probes/archify.mjs <checkout> docs/implementation/archify-probe
node scripts/probes/archify-browser.mjs <checkout> docs/implementation/archify-probe
```

输入均为 `tests/fixtures/topologies.mjs` 中的合成样本，映射后的 JSON 和两类静态截图位于 `archify-probe/`。它们不是可发布的真实工作流。

第一轮实际结果：简单链和跨角色审批通过；条件样本标签超出默认 92px；同一类别的并行节点在同列同 lane 重叠；返回边使用了不支持的 route 名称。第二轮把节点宽度设为 180，计算独立显示行，使用已支持的 up-channel：五种样本全部编译通过、重复 SVG 字节相同。`report.json` 是第二轮实测结果；不是未运行的宣传判断。

浏览器实测见 `browser-report.json`（10 张对照截图）：

- 直接拿 compileWorkflow.svg 作为独立 SVG，样式依赖 class/CSS，默认黑色填充、Times 字体，没有内嵌样式；独立 SVG 不是本库可直接复用的带样式主产物。
- 通过官方 CLI render 的完整 HTML 样式正常，但字体是 JetBrains Mono，底色 `--bg: #f4f5f7`，多种色彩和节点样式均不同于本库 warm-paper token 与“只有审批用 teal diamond”的约定。
- 适配器已经必须计算 ranks、同列并行显示行与列位置；语义 kind、证据和 actor 类别不能直接原样送进它的图形 schema。不是省掉全部布局工作的现成替换。
- 核验 package.json：CLI/render 核心无额外生产依赖，要求 Node >=18；上游 devDependencies 包含 AJV、parse5、saxes 等。维护成本的实际参考：workflow-compiler.mjs 为 4,913 行，依赖共享布局、校验、图例、字体、viewer/template 模块。保留本库风格还需维护 CSS/class 导出桥接、审批符号及语义适配。未声称测出开发工时。

完整 HTML 样式能力可用，SVG 导出也可能在 viewer 里继续适配；本轮不把“技术上能导出”当成“最适合替换本库”。实验只能说明上述五样本和默认样式的实际结果，不声称 Archify 普遍不能画工作流。因现有扩展已通过所需样本，未继续加入 ELK 对照，避免同时维护多个后端。

## 主编译器实测与限制

`compileDiagramSet` 保留语义 IR；按实际控制边排层，同层并行分行，返回边走上方通道。演员实例与类别颜色分开。概览只做编辑分组，manifest 对应所有原始 step/edge IDs；详情保留完整审批和控制边，包括跨图端点引用。

`npm run test:visual` 检查浏览器实际文字尺寸、节点内包含、标签之间重叠及画布裁切，保存原始尺寸截图。几何路由校验在编译器中运行；这些自动检查不替代人对语义和可读性的判断。单案例 prepare 内也执行同样检查，失败不替换上一份合格包。

较密集图的顶端通道会增高画布，交叉连线仍需阅读者沿线查看；不是通用最优布局器。超过 9 个概览组、单详情外部端点过多、不可折行词过宽，会明确进入阻碍，而不是删掉真实内容。没有对任意大图作保证。

固定 SVG 几何不依赖浏览器；排序使用 codepoint，新增依赖为精确版本，锁文件固定传递依赖。已测截图环境：Playwright 1.58.2 / Chromium 145.0.7632.6 / macOS arm64；本机 Node 23.2.0。字体为原有本地 fallback stack，不承诺跨操作系统像素一致。现有 CI Node 22 的语义与构建检查仍保留。

Archify 仅作为独立的一次性 probe：不在默认 build、prepare 或 preview 路径中，不运行更新检查，不成为第二个主后端。对照 HTML/SVG 为该 MIT 项目生成的合成测试产物，归属说明见 `archify-probe/NOTICE.md`。
