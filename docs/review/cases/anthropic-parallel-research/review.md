# 并行研究、反馈与引用整理

LeadResearcher 保存计划，委派数量动态变化的研究子 Agent，汇总后决定是否继续研究，完成后交给 CitationAgent 整理引用并返回结果。并行集合保留为动态子流程，不假定固定两个研究者。

- Lifecycle: draft; evidence: source_checked.
- Source: https://www.anthropic.com/engineering/multi-agent-research-system
- Source hash: b2059d785ae34c94baed2033b6c2b88e9f0e1155eb8813a6562af2472634af17
- Original summary and generated diagrams only; upstream text/images/templates are not redistributed.
- Automated checks: report.json. Browser check and human acceptance are separate.
- Runtime execution: not performed.

## Unknowns

- 动态研究子 Agent 的实际数量、各轮工具顺序与执行时长未知。
- 更多研究和停止的具体判断规则未公开。
- 中断、失败和引用无法定位时的完整处理未知。
- 此库未执行该系统，也未独立核验原文的效果数字。

## Inferences

- 动态子 Agent 与内部搜索迭代合并为并行集合节点。

## Human review

Check every step/edge against evidence.json and the primary source; inspect labels, branch/parallel/loop direction and boundaries in index.html. Review reuse rights. Do not treat narrative/source checks as reproduction. After this review, record an explicit decision with the review command; it never publishes.
