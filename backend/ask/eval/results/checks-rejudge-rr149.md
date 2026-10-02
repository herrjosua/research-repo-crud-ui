# Ask the Repo eval: stored runs re-judged under the checks changes, round 2

Every stored result set re-judged with `ask/checks.js` before and after the
two checks changes of decision 21 (`docs/decisions.md`). That is the 36 sets
in this folder (1,836 runs) and the 8 RR-144 behavior sets moved out of the
repo under decision 19, in `~/rr144-results/` (408 runs, outside the repo,
read as they are): 44 sets, 2,244 runs. `~/rr103-results/` is excluded. No
model was called. Every stored JSON file has the same SHA-1 before, during
and after, and every stored answer is byte-identical in every pass. Only the
checks moved.

"Before" is `ask/checks.js` at ff5ce49 (decision 20's checks). Each pass ran
the harness's own `withPromptSources` and `judgeRun`, with entries from
`loadGold()` and the prompt sources in
`ask/eval/prompt-sources/4ba145f717683ee7f6192a9f4429eee9fa4f7353.json`. A
scratch script outside the repo swapped in each version of the checks with a
module-resolution hook, so no repo file was edited to judge them.

**Attribution.** Each change was turned off on its own, and a changed count
is attributed to the change whose removal restores the old count. With both
off, the new code gives exactly the old sentences, verdicts and counts on
all 2,244 runs.

The changes:
1. "vs." and "avg." don't end a sentence.
3(a). "surveys" is one of `DECLINE_RE`'s nouns.

(Numbered as in RR-149's investigation, which also looked at items 2 and
4–7 and left them; decision 21 says why.)

## Records that moved

Thirteen runs changed at all: ten by change 1 and three by change 3(a). No
other sentence in any of the 44 sets changed.

Change 1, ten runs:

| Result set | Entry | Run | Abbreviation | Uncited | Unsupported |
|---|---|---|---|---|---|
| `behavior-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 0 | vs. | 1 → 0 | 5 |
| `behavior-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 1 | vs. | 1 → 0 | 5 |
| `behavior-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 2 | vs. | 1 → 0 | 5 |
| `checks-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 0 | vs. | 1 → 0 | 5 |
| `checks-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 1 | vs. | 1 → 0 | 5 |
| `checks-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 2 | vs. | 1 → 0 | 5 |
| `behavior-decline-list-scenarios` | `scenario-documentation-pain-points` | unseeded 0 | avg. | 2 → 1 | 4 → 0 |
| `checks-decline-list-scenarios` | `scenario-documentation-pain-points` | unseeded 0 | avg. | 3 → 2 | 4 → 0 |
| `model-gpt-oss-20b-low-scenarios` | `scenario-care-coordinator-gaps` | unseeded 2 | vs. | 7 → 6 | 2 → 1 |
| `behavior-list-scenarios` (`~/rr144-results`, outside the repo) | `scenario-documentation-pain-points` | unseeded 2 | avg. | 1 → 0 | 4 → 0 |

- **Care coordinator, six runs.** "It was faster (6.5 min vs. 9 min to
  clear a 20-item queue), but 4 of 5 participants disagreed…" is now one
  sentence, credited to [4]. The "…(6.5 min vs." fragment is no longer an
  uncited sentence. The five unsupported figures (6.5, 9, 20, 4, "4 of 5")
  stay: the answer puts each item's marker before it, so the sentence is
  still credited to the source before (item 2, left; decision 21).
- **"avg.", three runs.** "…"pajama time" charting (avg. 1.2 hrs/day)
  [1][2]." is one sentence cited [1][2]. The uncited "…charting (avg."
  fragment and its four unsupported figures (the 1 of "#1", 52, 31, 64) are
  gone.
- **gpt-oss, one run.** "We only have a single 6.5‑minute vs. 9‑minute
  comparison; …[4]." is one sentence. One uncited fragment and its "6.5"
  clear. "20" stays unsupported in the sentence before.

The tenth row, `behavior-list-scenarios` in `~/rr144-results`, wasn't
predicted. The prediction came from the investigation of the 36 in-repo
sets, and this re-judge also covers `~/rr144-results`. It's the same
"avg." sentence as the two in-repo "avg." rows, and it moves the same way.
No check was changed for it.

Change 3(a), three runs: `checks-gpt-oss-20b-low`, `audit-burnout-share`,
seeded 0, 1 and 2. "The surveys do not report an overall burnout rate for
clinicians." is now a decline, so uncited goes 2 → 1 in each. The seeded
verdict stays FAIL on the last sentence, "No source provides a direct
percentage of clinicians experiencing burnout.", which is still uncited.
It has singular "source" with the negation first, so neither decline rule
matches it.

## Per entry

Every entry whose verdict, uncited count or unsupported-figure count changed
in any of its 6 runs. "First seeded" is what the reports judge. Unchanged
cells show one value.

| Result set | Entry | Seeded verdict | Unseeded passing (of 3) | Uncited, first seeded | Unsupported, first seeded | Uncited, all 6 runs | Unsupported, all 6 runs | Change |
|---|---|---|---|---|---|---|---|---|
| `behavior-decline-list-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 2 → 1 | 4 → 0 | 1 |
| `behavior-decline-list-scenarios` | `scenario-care-coordinator-gaps` | FAIL | 0 | 1 → 0 | 5 | 3 → 0 | 15 | 1 |
| `checks-decline-list-scenarios` | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 3 → 2 | 4 → 0 | 1 |
| `checks-decline-list-scenarios` | `scenario-care-coordinator-gaps` | FAIL | 0 | 1 → 0 | 5 | 3 → 0 | 15 | 1 |
| `checks-gpt-oss-20b-low` | `audit-burnout-share` | FAIL | 0 | 2 → 1 | 0 | 9 → 6 | 1 | 3(a) |
| `model-gpt-oss-20b-low-scenarios` | `scenario-care-coordinator-gaps` | FAIL | 0 | 9 | 6 | 44 → 43 | 23 → 22 | 1 |
| `behavior-list-scenarios` (`~/rr144-results`) | `scenario-documentation-pain-points` | FAIL | 0 | 0 | 0 | 1 → 0 | 4 → 0 | 1 |

No verdict moved, seeded or unseeded, so the stop rule has nothing to
count. None of the default-configuration sets moved: `checks-control`,
`behavior-combined`, `behavior-control`, `v1.3.6.7-step5`,
`v1.3.6.37-control` and `v1.3.6.37-guard`, each with its `-scenarios` set
(612 runs).

## Totals that changed (first seeded run, as the reports give them)

| Result set | Gold pass | Unseeded passing | Uncited sentences | Unsupported figures |
|---|---|---|---|---|
| `behavior-decline-list-scenarios` | 0 of 7 | 1 of 21 | 1 → 0 | 5 |
| `checks-decline-list-scenarios` | 0 of 7 | 1 of 21 | 1 → 0 | 5 |
| `checks-gpt-oss-20b-low` | 0 of 10 | 2 of 30 | 32 → 31 | 17 |

Nothing else moved in a set's totals.

## Decision 19's rule for list format

Decline with evidence alone (`checks-control[-scenarios]`) against decline
with evidence plus list format (`checks-decline-list[-scenarios]`), under
the new checks. First seeded run:

| | Control | Decline + list format |
|---|---|---|
| Gold pass, regression | 5 of 10 | 7 of 10 |
| Gold pass, scenario | 0 of 7 | 0 of 7 |
| Unseeded passing, regression / scenario | 15 of 30 / 1 of 21 | 19 of 30 / 1 of 21 |
| Uncited, regression / scenario | 5 / 0 | 0 / 0 (was 0 / 1) |
| Unsupported, regression / scenario | 5 / 0 | 0 / 5 |

Per entry, the same as decision 20: `prior-auth-citations` (FAIL → PASS,
unseeded 2 → 3 of 3) and `audit-onboarding-steps-order` (FAIL → PASS,
unseeded 1 → 3 of 3) are counted gains. There is no counted regression.

The rule: a set clears only if its uncited and unsupported counts are both
0, and both sets must clear with no counted regression. The regression set
clears. The scenario set doesn't: its 5 unsupported figures are the
care-coordinator answer's misplaced citations. **List format stays off,
and decline with evidence alone stays the default.** Its counted regression
against step 5, `audit-onboarding-steps-order` at 1 of 3 unseeded in
`checks-control`, is recorded in decision 21.

## Predictions, written before the re-judge

1. Change 1 moves exactly 9 records. **Missed by one**: it moves 10. The 9
   predicted moved as predicted. The tenth is `behavior-list-scenarios`
   (`~/rr144-results`), above. None of the default sets moved, as
   predicted.
2. Change 3(a) moves exactly the 3 `audit-burnout-share` records.
   **Matched.**
3. Care coordinator: uncited 1 → 0, unsupported stays 5. The "avg."
   records clear 1, 52, 31 and 64. **Matched** (and the unpredicted
   "avg." record clears the same four).
4. The scenario set under list format doesn't clear, so list format stays
   off. **Matched.**
5. gpt-oss `audit-burnout-share` may move FAIL → PASS. **It didn't**: it
   stays FAIL on the uncited "No source provides…" sentence. Decision 20's
   gpt-oss comparison stands.
6. Everything else unchanged. **Missed on the same one record** as
   prediction 1. Stored JSON and answers are unchanged, as predicted.

The stored per-set reports (`<label>.md`, `-vs-` reports and
`model-comparison.md`) are left as written, under the checks of their
time. `node scripts/eval-ask.js report <label>` re-judges any of them
under the current checks.
