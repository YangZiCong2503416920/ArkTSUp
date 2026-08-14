## 变更说明

（这个 PR 改了什么、解决什么问题，一句话说清）

## 质检自检清单（反水 PR 门禁，未打勾的 PR 会被打回）

- [ ] `npm test` 全绿（33 用例）
- [ ] 若新增/修改 check 规则：已在 docs/RULES.md 补充官方出处（无出处不合并）
- [ ] 若修改规则行为：已在官方 samples（3327 个 .ets 文件）上重跑，错误级误报 < 0.1%
- [ ] 若修改 json2ts：examples/sample.json 输出人工核验无误
- [ ] README / `arktsup --help` 帮助文本已同步
