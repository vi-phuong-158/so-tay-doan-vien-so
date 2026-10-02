# Quiz 300 review and release follow-up — 2026-10-02

Verdict: `QUIZ_300_END_TO_END_REHEARSAL_PASS`. This report supersedes the historical
GitHub-write blocker in `ACCEPTANCE.md`. Git/CLI credentials successfully pushed the restored
implementation and fixes and opened [PR #60](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/60).

The original patch identifies source `5c3e7ef8388a03cce4ccb5c729f734a873a9b1a8`.
It was restored with `git am` as local `3b5046343a162e9252001c137b5d73526d89b1ae` on
`codex/quiz-300-nq-fixes`, based on `8f3d99425e0147bf045c95988589c2b7e6704df1`.
The original commit object was unavailable; no identity claim is made between the two commits.

## Review fixes

- P1: Hosted versions are `20261002134138` and `20261002140545`. Complete stored SQL bodies match
  the delivered migration files (MD5 `78a7ab103c3bf524aa8a6fc34b64b730` and
  `5fe9ab36f5a83149297267da8695ceea`). Rename the unpushed local files to those timestamps;
  do not replay DDL or rewrite hosted migration history.
- P2: Load-more uses the last completed search. Changing the input disables pagination until a
  fresh search replaces the result set and offset. Browser acceptance includes this regression.
- PWA: Bump shell cache v2 → v3 so a compatible frontend shell replaces the older cached shell.
- Hosting: The browser harness accepts `NQ_BASE_URL`, validates the rehearsal RPC host and checks
  360/390/430/768/1440px for horizontal overflow.

## Gates

- Target database: rehearsal `znexculhbdjiflkczpyu`, `so-tay-doan-vien-rehearsal` only.
- Production database: not accessed.
- Source/database content: 300/300 match; 300 distinct STT 1–300; 1200 options.
- Frontend: 208/208 tests; lint zero errors / three existing warnings; build and diff-check PASS.
- Full CI on `2f17215aec5dc9f7255e231a1ebce20490866ad6`:
  [run 37024141701](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/37024141701) PASS.
  Includes 32 pgTAP files / 844 assertions, 119 Deno tests and 273 Member API tests.
  CI seeds the bank twice and passes NQ runtime assertions. The old local Member DB blocker is resolved by CI.
- Real rehearsal SQL lifecycle/security and Auth/HTTP PASS: anonymous/cross-user denied,
  no grading key during the exam, snapshot/resume/expiry/grade/idempotent submission validated.
- Real hosted Auth/browser PASS on both the preview and the public main hosting address:
  30-question completion, reload/route return, offline/reconnect, review, source-number/keyword
  lookup, changed-query pagination regression and five widths 360/390/430/768/1440. No page errors.
- Auto-submit PASS: EXPIRED, elapsed_seconds 1200. Only the temporary fixture clock was advanced;
  its start/deadline interval remained 20 minutes and the client could not modify it.
- Evidence: `evidence/browser-summary.json`, `evidence/auto-submit-summary.json` and the mobile/desktop PNGs.
- Compatible frontend is READY at https://so-tay-doan-vien-so.vercel.app . Verified artifact
  `2f17215` was promoted from preview into deployment `dpl_CgnTbXoDgnEcCB3goYvr7LRsTQFC`.
  Public bundle uses rehearsal and the PWA shell cache is v3.
- Bank/topic are PUBLISHED after the compatible frontend was verified; 300 questions retained.
- Temporary Auth users/profiles/roles/attempts/snapshots and local credential files are cleaned.
  Final PR-head CI and merge status are available on PR #60; acceptance harness/evidence/doc changes
  after `2f17215` do not change the tested product frontend or SQL.

## Rollout and recovery

Full PR CI, compatible frontend promotion, rehearsal-host verification, bank/topic publication
and real hosted Auth/browser acceptance have been performed in that order.
If any release gate fails, return the bank/topic to DRAFT and retain all question/attempt data.
Frontend recovery uses the previous deployment. Schema fixes must use forward migrations;
renamed existing SQL must never be applied a second time to rehearsal.
Previous frontend deployment: https://so-tay-doan-vien-6ulkv0q0u-vi-phuong-158s-projects.vercel.app .

Automatic approval review rejected pulling all production environment variables, since that
could retrieve secrets beyond rehearsal/preview. No production env file was downloaded.
Preview uses only the rehearsal URL and publishable key; no server secret is placed in VITE_*.
