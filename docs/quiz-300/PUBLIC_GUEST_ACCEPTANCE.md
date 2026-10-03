# NQ_300 public guest acceptance — 2026-10-03

PR: #61, `codex/quiz-300-public-access`.
Starting head: `c2fda47295a5c3aff228a1319020611e58890c16`.
Fetched master: `bb722841d14a0a2c27f3928e294b9b356ecde659`.
Production Supabase is outside this task and has not been changed.

## Source/runtime reconciliation

The initial PR was no longer mergeable against current master. Merge current master into the PR,
retaining both task-log sections in the sole conflict (`04-current-tasks.md`).

Rehearsal `znexculhbdjiflkczpyu` already had applied migration
`20261003091716_nq_guest_privilege_boundary`, absent from the PR. Restore its exact stored SQL to
source; do not replay it remotely. INVITED account status alone does not exclude guests from legacy
ownership-only policies. Five restrictive policies deny NQ guests access to personal AI/announcement
data; another denies profile edits. No RLS disabling or client privilege widening is involved.

Add a 12-assertion pgTAP regression for these boundaries, including preserved permanent-member
ownership behavior. Extend the rolled-back lifecycle integration with two anonymous owners and
completed-review denials. Limit cleanup fixtures to exact synthetic IDs and prove permanent,
unregistered anonymous and recent NQ users survive the unchanged 30-day predicate.

## Hosted rehearsal evidence

Anonymous Auth returned HTTP 200 using the publishable key, with distinct Auth UIDs, anonymous user
and JWT claims, and JWT role `authenticated`. Two independent SDK clients had persistence and refresh
disabled; no service role was used for these client assertions. Provisioned profile: INVITED,
organization null, no application role.

- 300 source questions and distinct numbers; four options and one correct source key each.
- 30 distinct sampled questions, valid source numbers/text/options; 1,200-second server deadline.
- Question order and option order differ from source; grading all 30 source-correct shuffled IDs
  yields correct=30, wrong=0, score=100. Retry uses a new ID and independent question draw.
- Resume keeps attempt ID, questions, option ordering, answers and deadline.
- Rolled-back SQL fixtures verify partial score 1 correct/1 wrong/28 unanswered, idempotent submit,
  submitted mutation denial, and late-answer expiry/finalization without changing production logic.
- `125` and `Câu 125` each return question 125; substring `công nghiệp` returns matches;
  two 20-row pages produce 40 distinct questions. Lookup includes the source answer by product design;
  exam payload does not include the key.
- Both client directions: foreign read/answer/submit return `ATTEMPT_SCOPE_DENIED`; foreign review
  is denied; direct foreign read returns zero rows and direct update is denied.
- Direct quiz key tables: `42501`; private snapshot REST schema: `PGRST106`; private SQL schema:
  `42501`. Organizations, roles, notifications, assignments, resources and foreign profiles reveal
  no private rows; audit access denied. AI write and own-profile edit denied.
- Generic quiz/admin RPCs: `ACCOUNT_NOT_ACTIVE`; member-scope RPC: `42501`.
- Hosted SQL lifecycle returns `NQ_RUNTIME_ASSERTIONS_PASS`; new pgTAP has 12 passing assertions.

## Browser evidence and outstanding gates

Initial immutable Preview `dpl_FaBMRhZqcvKMpfhuNBTK5yE77VWr` is READY at the starting head.
Vercel protection was accessed through an authorized temporary Preview access link.
Direct NQ navigation showed the no-login intro, automatically loaded a guest attempt, showed 30
navigation buttons and four answers, and persisted two selected answers across reload with timer
continuing. There was no application login redirect.

Attempt layout: 360×800, 390×844, 412×915, 768×1024 and 1440×900 all had no horizontal overflow;
answers were approximately 52px high and previous/next/submit controls 48px high; timer remained visible.

Clicking manual submit reached a native confirmation that the browser tool could not resolve:
`Input.dispatchMouseEvent` / `Emulation.setFocusEmulationEnabled` timeouts; supported dialog API
reported no active dialog. This is incomplete browser evidence, not a passing manual-submit gate.
Final-head Preview, clean independent browser contexts, result/review/retry/lookup responsive screens,
client-clock tampering and normal-user hosted login regression still require acceptance.

## Validation and release gate

Local merged source: root/frontend 220/220, lint zero errors (three existing Fast Refresh warnings),
production build succeeds (existing large-chunk warning). No dependencies installed.
Initial-head CI run 37042342879 passed build, database/pgTAP/lifecycle/Deno and Member API.
Those CI results do not establish success for a subsequent head: rerun all required CI on the exact
pushed head and inspect its Preview before any conditional merge.

No end-to-end PASS or merge is authorized by partial evidence. Rollback is frontend rollback plus
bank unpublish/forward fix as appropriate; keep restrictive policies protecting registered guests.
No destructive database rollback is needed for this source reconciliation. Never enable or migrate
production Supabase as part of this task.
