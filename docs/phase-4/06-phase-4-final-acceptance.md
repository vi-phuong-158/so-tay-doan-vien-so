# P4-06 — Phase 4 Integrated Final Acceptance

## VERDICT

At audit branch cut, the repository and integrated database evidence are technically ready for
exact-head CI. The final verdict is intentionally held until that CI run completes. The runtime
gates below remain separate and are not inferred from structural tests.

Expected technical verdict when the final exact-head CI is green:

`PHASE_4_TECHNICAL_ACCEPTANCE_PASS_RUNTIME_GATES_PENDING`

This is not a production-readiness approval. `P4-02R` and `P4-04R2` remain pending because no
legitimate non-production actor/byte-round-trip environment or two-session concurrency actors
were available during this audit.

## P4-05 CLOSURE

P4-05 was reverified on exact implementation HEAD `1706f064980ffe73150a71649b91d66807d25f71`.
The replacement exact-head CI run `31959883659` passed frontend build, full database reset and
pgTAP/Deno gates, and Vercel. The branch was marked ready and PR #27 was merged into `master`.

- P4-05 merge commit: `3761dcc1be4fd6aebc1e91e78426076feead5e31`
- Fresh `origin/master`: the same SHA
- P4-05 review state: no unresolved review comments or review threads
- P4-05 acceptance hygiene: four trailing-blank-line warnings were removed before merge; no
  production behavior changed by that correction

The merged P4-05 implementation keeps admin reads and mutations behind scoped trusted RPCs,
validates quiz publication server-side, revokes direct authenticated authoring paths, protects the
answer key, and freezes scoring-affecting quiz content once a submitted attempt exists.

## PHASE 4 SCOPE ACCEPTED

### Documents

P4-01 and P4-02 provide the document read/admin vertical slice, visibility ladder, trusted admin
mutations, private storage policies, attach/detach compensation, and no-overwrite file lifecycle.
The inspected source and tests are `src/services/documentService.js`,
`src/services/documentAdminService.js`, the document pages, migrations `202608160001` and
`202608160002`, and the document/Storage pgTAP suites. Technical scope is accepted; the actor
Storage byte round-trip remains P4-02R.

### Learning

P4-03 and P4-05 provide topic/resource read and admin workflows, parent-anchored visibility,
resource path validation, private resource storage, scoped admin RPCs, publication transitions, and
the `/admin/chuyen-de` routes. The inspected source and tests are `learningService.js`,
`learningAdminService.js`, the learning pages, migrations `202608160003` and `202608160006`, and
the learning/admin pgTAP and frontend suites. Technical scope is accepted.

### Quiz

P4-04 and P4-05 provide quiz delivery, safe question payloads, server-owned scoring, attempt
numbering, publication validation, authoring RPCs, answer-key isolation, and historical-attempt
immutability. The inspected source and tests are `quizService.js`, `quizAdminService.js`, the
quiz and admin pages, migrations `202608160004`, `202608160005`, and `202608160006`, plus the
quiz/admin and integrated acceptance suites. Technical scope is accepted; the real two-session
concurrency rehearsal remains P4-04R2.

## INTEGRATED JOURNEYS

The rollback-bounded suite `supabase/tests/phase_4_final_acceptance.sql` exercises the following
cross-module paths with known fixture IDs:

1. A scoped admin creates a document, attaches a validated source path, publishes it, and an
   organization member reads it through the document visibility policy.
2. The same scoped admin creates a learning topic and resource, publishes the topic, and the
   member reads the resource through the parent-topic boundary.
3. The admin creates a quiz, question, and two options, publishes it, and the member starts an
   attempt, receives a payload without `is_correct`, submits the correct option, and receives a
   server-owned passing result.
4. A member from another organization cannot read or start any of the known document/topic/
   resource/quiz IDs and cannot use the scoped learning admin RPC to bypass ownership.
5. A suspended account cannot read the scoped records, start a quiz, or use the admin read RPC.
6. After submission, cosmetic quiz metadata remains editable while scoring metadata, question
   text, and answer options are rejected; the historical score and selected option remain intact.

The suite does not fabricate Storage bytes or concurrent authenticated sessions; those are runtime
gates below.

## SECURITY ACCEPTANCE

- Active-account checks fail closed in the canonical document, learning-topic, and quiz helpers and
  in trusted admin/delivery RPCs.
- Organization and visibility checks are re-evaluated server-side. Known direct IDs do not bypass
  parent scope or publication state.
- Trusted functions use `SECURITY DEFINER`, pin `search_path = public`, validate scope/active
  status internally, and expose only explicit authenticated execute grants.
- Authenticated direct quiz/question/option DML is revoked. Direct question/option SELECT is
  revoked, so the answer key is available only to the scoped admin authoring RPC.
- End-user quiz payloads do not include `is_correct`; scoring reads the key only inside the trusted
  submission path.
- Submitted-attempt scoring structure is immutable. Cosmetic title/description correction does not
  rewrite historical scoring or selected answers.
- Document and learning resource buckets are private. Storage path predicates are anchored to the
  owning row and use fail-closed UUID parsing.
- Secret audit found no credential or secret value in the reviewed diff, source, documentation, or
  CI configuration references.

## FULL VALIDATION

Local frontend validation from the merged P4-05 baseline and audit branch:

- `npm test`: 136/136 passed
- `npm run lint`: 0 errors, 3 pre-existing Fast Refresh warnings
- `npm run build`: passed
- `git diff --check`: passed for the tracked audit changes

The local environment does not provide the Supabase CLI, Docker, or Deno. Database reset, pgTAP,
Deno, and Vercel evidence therefore comes from GitHub Actions exact-head CI. The final audit PR
must report the run ID and exact head in its handoff; no green result from an older head is reused.

## RUNTIME READINESS GATES

### P4-02R — Documents Storage actor rehearsal

`P4_02R_PENDING_ENVIRONMENT`.

The prior non-production rehearsal established migration parity, bucket privacy, deployed policy
predicates, and fail-closed path handling, but could not create legitimate test identities. This
audit did not fabricate actors or substitute SQL policy checks for the required real byte
round-trip. Still required: upload bytes, attach, signed download, cross-scope/DRAFT rejection,
extension/size rejection, publish/withdraw transition, and cleanup.

### P4-04R2 — Quiz two-session concurrency rehearsal

`P4_04R2_PENDING_ENVIRONMENT`.

Structural advisory-lock and unique-constraint tests are present and run in CI, but no genuine two-
session authenticated actors were available to prove concurrent start/resume behavior. This gate
remains pending.

## DEFECTS FOUND

No material P4-05 or P4-06 behavior, security, scope, or integration defect was found during this
audit. The only acceptance issue found was trailing blank-line hygiene in four P4-05 files; it was
fixed before PR #27 merge in commit `1706f06` and had no runtime effect.

## GIT STATE

- Base: fresh `origin/master@3761dcc1be4fd6aebc1e91e78426076feead5e31`
- Audit branch: `audit/phase-4-final-acceptance`
- P4-06 PR: Draft, targeting `master`, not to be merged automatically
- Exact final audit HEAD and CI run: recorded in the PR handoff after push
- `.agents/`, `.claude/`, `.mcp.json`, and `skills-lock.json` remain excluded from commit/push

## PRODUCTION READINESS

`NOT_PRODUCTION_READY`.

Technical repository acceptance does not close the two runtime gates, nor does it establish
production Supabase configuration, secrets, Storage bytes, Auth provisioning, deployment,
monitoring, backup/restore, or operational rollback evidence.

## EXPLICITLY NOT DONE

- P4-02R actor-based Storage rehearsal
- P4-04R2 real two-session concurrency rehearsal
- P4-06 merge
- Any Phase 5 work
- AI/RAG, embeddings, certificates, leaderboard/gamification, or production deployment

## NEXT RECOMMENDED TASK

Provision an isolated non-production Supabase rehearsal environment with legitimate test actors
and server-side credentials, then execute P4-02R and P4-04R2 with redacted evidence. Reassess the
production-readiness verdict only after both gates and the remaining operational controls pass.
