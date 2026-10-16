# 按用户数据生成结构化结果

用户在 Bubble 接入数据，n8n 读取连接和模式信息，Agent 按需求生成查询，结果处理后存入 S3 并返回文件。查询内部作为动态子流程保留，未虚构固定连接器顺序。

- Lifecycle: draft; evidence: source_checked.
- Source: https://n8n.io/case-studies/formula-bot
- Source hash: aa7fe817478eab642cc2a54e04a25887a768e236a67c1bf55a5f8321e2cf82cf
- Original summary and generated diagrams only; upstream text/images/templates are not redistributed.
- Automated checks: report.json. Browser check and human acceptance are separate.
- Runtime execution: not performed.

## Unknowns

- 连接器内部节点、参数和错误处理未披露。
- 查询失败、超时和重试策略未知。
- 没有原生模板或本地复现记录。

## Inferences

- 连接器选择与查询执行合并为动态子流程。

## Human review

Check every step/edge against evidence.json and the primary source; inspect labels, branch/parallel/loop direction and boundaries in index.html. Review reuse rights. Do not treat narrative/source checks as reproduction. After this review, record an explicit decision with the review command; it never publishes.
