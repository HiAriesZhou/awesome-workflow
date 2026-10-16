# 直属经理批准的账号恢复

员工账号锁定后，由直属经理批准恢复，再由 n8n 调用相关系统接口。此草稿只表达公开说明的成功路径；接口之间的顺序、拒绝与重试均未披露。

- Lifecycle: draft; evidence: source_checked.
- Source: https://n8n.io/case-studies/delivery-hero
- Source hash: eca577a08477ea6a778fd247d8cde56d02d4c9a80194c756d2b3fbcbf3b5a137
- Original summary and generated diagrams only; upstream text/images/templates are not redistributed.
- Automated checks: report.json. Browser check and human acceptance are separate.
- Runtime execution: not performed.

## Unknowns

- 请求界面、触发器与身份核验机制未披露。
- 经理拒绝、超时和不响应时的处理未知。
- 接口失败、部分恢复、重试次数和接口之间的拓扑未知。
- 没有取得可运行的原生 n8n JSON。

## Inferences

- 需求到经理审批的连接是叙事整理。
- 多个恢复接口合并为一个子流程，未填补内部拓扑。

## Human review

Check every step/edge against evidence.json and the primary source; inspect labels, branch/parallel/loop direction and boundaries in index.html. Review reuse rights. Do not treat narrative/source checks as reproduction. After this review, record an explicit decision with the review command; it never publishes.
