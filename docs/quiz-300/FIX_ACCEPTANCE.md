# Quiz 300 review and release follow-up — 2026-10-02

Status: IN_PROGRESS. This report supplements the historical handoff in `ACCEPTANCE.md`.

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
- Bank/topic remain DRAFT while CI and the compatible hosted frontend are being verified.
- Final local checks, exact-head CI, PR and hosted evidence: pending.

## Rollout and recovery

Run full PR CI, deploy the compatible frontend, verify its public Supabase configuration points
to rehearsal, then publish only the fixed bank/topic and run real Auth/browser acceptance.
If any release gate fails, return the bank/topic to DRAFT and retain all question/attempt data.
Frontend recovery uses the previous deployment. Schema fixes must use forward migrations;
renamed existing SQL must never be applied a second time to rehearsal.

Automatic approval review rejected pulling all production environment variables, since that
could retrieve secrets beyond rehearsal/preview. No production env file was downloaded.
Preview uses only the rehearsal URL and publishable key; no server secret is placed in VITE_*.
