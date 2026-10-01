# Ask the Repo eval: every stored run re-judged under the checks changes

All 30 stored result sets in this folder (1,530 runs: the baselines, the
RR-103 and v1.3.6.37 runs, the RR-144 behavior runs and the model bake-off,
gemma3:27b, qwen3:32b and gpt-oss:20b included) re-judged with
`ask/checks.js` before and after the five checks changes of decision 20
(`docs/decisions.md`). No model was called. The stored JSON files are
unchanged (same SHA-1 before and after), and all 1,530 stored answers are
byte-identical. Only the checks moved.

The label dates and shown passages came from
`ask/eval/prompt-sources/4ba145f717683ee7f6192a9f4429eee9fa4f7353.json`,
rebuilt from the corpus at 4ba145f. Every stored cited excerpt matched the
rebuild, and so did every stored prompt size: 1,326 of 1,326 runs that
stored one, rebuilt with the run's prompt behaviors.

**Attribution.** Each change was turned off on its own, and a changed count
is attributed to the change whose removal restores the old count. With all
five off, the new code gives exactly the old verdicts and counts on all 1,530
runs. "1, 3" means both contribute: gemma3:27b's `prior-auth-citations`
dates its sources and quotes a supervisor ("This is what I wanted in April.
It shows its work…").

The changes:
1. A source's label date is evidence for a figure.
2. A decline needs its negation within 80 characters of "sources".
3. A quotation stays in its sentence.
4. An uncited decline's figures may come from any shown source.
5. U+202F and U+2011 are read as a space and a hyphen.

Changes 2 and 5 moved no verdict and no count. Every decline in the stored
runs that only the negation-and-"sources" rule counts has its negation at
most 60 characters from "sources". Change 5 moved failure reasons only: on
gpt-oss:20b's `audit-ai-readiness` (3 seeded, 3 unseeded runs) and one
unseeded `audit-session-timeout` run, the "34% of non-clinical staff" and
"10 minutes" claims now match ("non‑clinical" with U+2011). Those runs
still fail on uncited sentences.

## Per entry

Every entry whose verdict, uncited count or unsupported-figure count changed
in any of its 6 runs. "First seeded" is what the reports judge. Unchanged
cells show one value.

| Result set | Entry | Seeded verdict | Unseeded passing (of 3) | Uncited, first seeded | Unsupported, first seeded | Uncited, all 6 runs | Unsupported, all 6 runs | Change |
|---|---|---|---|---|---|---|---|---|
| `behavior-combined-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 2 → 0 | 1 → 0 | 10 → 0 | 5 → 0 | 3 |
| `behavior-combined-scenarios` | `scenario-session-timeout-open` | FAIL | 0 | 0 | 0 | 0 | 1 → 0 | 4 |
| `behavior-control-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 6 → 0 | 3 → 0 | 3 |
| `behavior-decline-list` | `onboarding-required-steps` | FAIL | 0 | 0 | 5 → 0 | 0 | 24 → 0 | 4 |
| `behavior-decline-list-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 2 → 0 | 1 → 0 | 13 → 2 | 9 → 4 | 3 |
| `behavior-decline-list-scenarios` | `scenario-care-coordinator-gaps` | FAIL | 0 | 3 → 1 | 6 → 5 | 9 → 3 | 18 → 15 | 3 |
| `behavior-extra-open-items-whole4-scenarios` | `scenario-calendar-premise` | FAIL | 0 | 8 | 11 | 25 | 37 → 36 | 1 |
| `model-gemma2-9b-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 4 → 0 | 2 → 0 | 3 |
| `model-gemma3-27b` | `prior-auth-citations` | FAIL → PASS | 0 → 1 | 1 → 0 | 3 → 0 | 6 → 0 | 23 → 2 | 1, 3 |
| `model-gemma3-27b` | `audit-session-timeout` | FAIL → PASS | 1 | 0 | 1 → 0 | 0 | 6 → 2 | 1 |
| `model-gemma3-27b` | `audit-ai-readiness` | FAIL → PASS | 0 → 2 | 0 | 1 → 0 | 0 | 8 → 2 | 1 |
| `model-gemma3-27b-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 3 → 0 | 3 → 2 | 17 → 0 | 18 → 12 | 3 |
| `model-gemma3-27b-scenarios` | `scenario-scribe-trust` | FAIL | 0 | 0 | 1 → 0 | 0 | 1 → 0 | 1 |
| `model-gemma3-27b-scenarios` | `scenario-nurses-citations` | FAIL → PASS | 3 | 0 | 1 → 0 | 0 | 3 → 0 | 1 |
| `model-gemma3-27b-scenarios` | `scenario-session-timeout-open` | FAIL | 0 | 0 | 2 → 0 | 0 | 12 → 0 | 1 |
| `model-gpt-oss-20b-low` | `audit-session-timeout` | FAIL | 0 | 1 | 1 | 6 | 8 → 6 | 1 |
| `model-gpt-oss-20b-low` | `audit-ai-readiness` | FAIL | 0 | 2 | 3 | 12 | 16 → 13 | 1 |
| `model-gpt-oss-20b-low-scenarios` | `scenario-scribe-trust` | FAIL | 0 | 1 | 0 | 9 | 8 → 6 | 1 |
| `model-qwen3-32b` | `onboarding-required-steps` | FAIL | 0 | 6 | 7 | 30 | 39 → 37 | 4 |
| `model-qwen3-32b` | `prior-auth-citations` | FAIL | 0 | 2 → 1 | 1 → 0 | 10 → 6 | 5 → 0 | 1, 3 |
| `model-qwen3-32b-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 → 1 | 2 → 0 | 0 | 9 → 2 | 0 | 3 |
| `model-qwen3-32b-scenarios` | `scenario-care-coordinator-gaps` | FAIL | 0 | 0 | 0 | 1 | 1 → 0 | 1 |
| `v1.3.6.37-control-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 6 → 0 | 3 → 0 | 3 |
| `v1.3.6.37-guard-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 2 → 0 | 1 → 0 | 3 |
| `v1.3.6.37-whole4-scenarios` | `scenario-nurses-citations` | PASS | 0 → 1 | 0 | 0 | 2 | 11 → 8 | 1 |
| `v1.3.6.7-step5-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 6 → 0 | 3 → 0 | 3 |

## Totals that changed (first seeded run, as the reports give them)

| Result set | Gold pass | Unseeded passing | Uncited sentences | Unsupported figures |
|---|---|---|---|---|
| `model-gemma3-27b` | 3 → **6** of 10 | 10 → 13 of 30 | 2 → 1 | 11 → 6 |
| `model-gemma3-27b-scenarios` | 0 → **1** of 7 | 3 of 21 | 3 → 0 | 7 → 2 |
| `model-qwen3-32b` | 3 of 10 | 7 of 30 | 15 → 14 | 8 → 7 |
| `model-qwen3-32b-scenarios` | 0 of 7 | 0 → 1 of 21 | 11 → 9 | 0 |
| `behavior-decline-list` | 7 of 10 | 18 of 30 | 0 | 5 → 0 |
| `behavior-decline-list-scenarios` | 0 of 7 | 1 of 21 | 5 → 1 | 7 → 5 |
| `behavior-combined-scenarios` | 0 of 7 | 0 of 21 | 2 → 0 | 1 → 0 |
| `v1.3.6.37-whole4-scenarios` | 1 of 7 | 0 → 1 of 21 | 1 | 7 |

Nothing else moved in a set's totals. gemma2:9b's seeded verdicts are
unchanged in every set. gpt-oss:20b still passes 0 of 10 and 0 of 7.

The stored per-set reports (`<label>.md`, `-vs-` reports and
`model-comparison.md`) are left as written, under the checks of their
time. `node scripts/eval-ask.js report <label>` re-judges any of them
under the current checks.
