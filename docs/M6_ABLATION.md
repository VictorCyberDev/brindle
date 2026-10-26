# M6 ablation: what each safeguard prevents

Each row removes **one** safeguard inside an analysis harness (never a product mode) and measures
what it prevented, using the real engine's persisted data. Truth and reasoning are MOCK; the engine
is the real implementation. Regenerate with `npm run eval:m6`; raw results are in
`docs/evidence/M6_EVAL_RESULTS.json`.

| Safeguard removed  | Scenario                                  | Measure                                                                       | With | Without |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------- | ---- | ------- |
| Temporal filtering | Future-only truth change                  | consequences sent to analysis/recovery for decisions the change never touched | 0    | 10      |
| Materiality        | SAME decisions are preserved              | business objects mutated although the decision would have been identical      | 0    | 4       |
| Fresh verification | Residual violation after executor success | false RECOVERED verdicts                                                      | 0    | 1       |
| H-MEM              | Cross-incident transfer                   | verified prior-failure warnings shown to the operator before planning         | 1    | 0       |

## What each result means

- **Temporal filtering**: Without the decision-time barrier every downstream object that merely shares lineage with the fact is treated as affected.
- **Materiality**: Without counterfactual materiality every reachable object is cancelled or compensated, including correct work.
- **Fresh verification**: Trusting the executor's success response would close the incident while a prohibited open PO still exists.
- **H-MEM**: Without memory the operator re-learns a known failure mode during the next incident. Memory is advisory only: it never changes the plan.

## The eight evaluation scenarios

| #   | Scenario                                  | Result    | Status |
| --- | ----------------------------------------- | --------- | ------ |
| 1   | Canonical retroactive recovery            | 8 claims  | PASS   |
| 2   | Future-only truth change                  | 4 claims  | PASS   |
| 3   | SAME decisions are preserved              | 3 claims  | PASS   |
| 4   | UNCERTAIN escalates safely                | 4 claims  | PASS   |
| 5   | Irreversible consequence handled honestly | 4 claims  | PASS   |
| 6   | Precondition / compensator failure        | 4 claims  | PASS   |
| 7   | Duplicate / replay safety                 | 5 claims  | PASS   |
| 8   | H-MEM cross-incident transfer             | 13 claims | PASS   |

## Honest limits

- The data is a small sandbox business system, not a production ERP.
- The ablation shows that each safeguard does real work in this system. It does not prove the same
  numbers on another system.
- H-MEM advises. The ablation row measures _warnings shown_, not recovery quality, because memory
  never changes the plan by design.
