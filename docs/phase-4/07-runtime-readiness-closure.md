# P4-R — Phase 4 Runtime Readiness Closure

## VERDICT

`PHASE_4_RUNTIME_GATES_PASSED`

Both outstanding runtime gates — P4-02R (Documents Storage actor rehearsal) and P4-04R2 (Quiz
two-session concurrency rehearsal) — were executed against the established non-production rehearsal
project with real authenticated HTTP round-trips and PASS. This closes the runtime-readiness gap
recorded in `docs/phase-4/06-phase-4-final-acceptance.md`.

This is **not** a production-readiness declaration. No production Supabase project exists. Backups,
monitoring, deployment configuration and Phase 7 hardening remain outside this task's scope.

## Environment

- **Project:** `znexculhbdjiflkczpyu` — the same non-production rehearsal project used since P3-03R,
  P3-07B, P3-08A/B and P4-02. Production was not touched; no production project exists.
- **Migration parity:** the project was at `202608160005` (missing `202608160006_phase_4_learning_quiz_admin`,
  merged to `master` via PR #27 after the project's last rehearsal). Applied via the Supabase MCP
  `apply_migration` tool using the exact repository migration file content, byte for byte. `list_migrations`
  after application shows all 30 repository migrations present, matching `supabase/migrations/`.
- **Pre-existing fixture state:** `organizations` (4 synthetic rows: Ban Thanh niên, Chi đoàn A/B/C),
  `profiles`/`user_roles`/`auth.users` with 9 pre-existing synthetic `*@test.local` actors from prior
  rehearsals (P3/P4), plus one legitimate `P3-03R Rehearsal Inbox` routable test address unrelated to
  this task. No real đoàn viên data, no police operational data, no production credentials were found
  or used.
- **No secret was written to git, docs, PR, screenshots or logs.** The anon/publishable key used for
  authenticated HTTP calls is the standard frontend `VITE_SUPABASE_ANON_KEY`-equivalent, not a secret
  by this project's own classification (`CLAUDE.md`: "Frontend chỉ VITE_SUPABASE_URL/ANON_KEY"). No
  JWT/access token issued during sign-in was ever recorded in a file, log or this document.

## Part 1 — Test actors

The environment did **not** block `auth.users` creation for this session (Supabase MCP database
access was available). The smallest missing set was provisioned; pre-existing legitimate synthetic
actors from prior rehearsals were reused rather than duplicated:

| Role | Actor | Org | Source |
| --- | --- | --- | --- |
| Org A content admin | `youthadmina@test.local` (Youth Admin A) | Chi đoàn A | pre-existing (`supabase/seed.sql` pattern) |
| Org A normal member | `member@test.local` (Member) | Chi đoàn A | pre-existing |
| Org B content admin | `p4r-admin-b@test.local` (P4R Admin B) | Chi đoàn B | **newly provisioned this task** |
| Org B normal member | `p4r-member-b@test.local` (P4R Member B) | Chi đoàn B | **newly provisioned this task** |
| Suspended actor | `suspended@test.local` (Suspended Member) | Chi đoàn A | pre-existing |

All accounts use the repository's own fixture password convention (`supabase/seed.sql`:
`extensions.crypt('password123', extensions.gen_salt('bf', 10))`) — not a project secret, applicable
to this non-production project only. New actors were inserted with the identical `auth.users` +
`auth.identities` + `profiles` + `user_roles` shape already established by the repo's seed script, so
no new pattern was introduced.

## P4-02R — Documents Storage actor rehearsal

**Verdict: `P4_02R_PASS`**

**Actor model:** real password-grant sign-in via `POST /auth/v1/token?grant_type=password` for each
actor, yielding an independent access token used as `Authorization: Bearer` on every subsequent
PostgREST RPC call, table read and Storage HTTP call. No SQL shortcut stood in for an actor action.

**Fixture:** one synthetic 371-byte placeholder PDF (`p4r-document-fixture.pdf`, fabricated text
content only) and one synthetic forbidden-extension file (`p4r-forbidden.exe`, plain text, harmless).
One `documents` row created via `create_document_draft` as Org A admin, `visibility_level =
ORGANIZATION_ONLY`, `owner_organization_id` = Chi đoàn A — chosen specifically so cross-org denial
(Scenario D) is a real, meaningful check rather than a visibility level that would let any youth
member read it anyway.

| # | Scenario | Actor | Result | Evidence |
| --- | --- | --- | --- | --- |
| A | Admin upload + attach | Org A admin | **PASS** — upload `200`, `attach_document_source_file` `200/true`, `documents.storage_path` updated to the exact uploaded path, audit action recorded (`DOCUMENT_SOURCE_ATTACHED`) | AGENT_OBSERVED_LIVE |
| B | Admin signed download | Org A admin | **PASS** — signed URL issued, real byte fetch returned 371 bytes matching the uploaded fixture exactly | AGENT_OBSERVED_LIVE |
| C | Authorized member after publish | Org A admin → Org A member | **PASS** — after `publish_document`, the member's own session read the row, obtained its own signed URL, and fetched 371 bytes matching the fixture | AGENT_OBSERVED_LIVE |
| D | Cross-org denial | Org B member | **PASS (denied)** — row read returned 0 rows; signed-URL request denied (`404 NoSuchKey`, no path/object disclosure); authenticated direct Storage fetch denied | AGENT_OBSERVED_LIVE |
| E | DRAFT denial | Org A member (before publish) | **PASS (denied)** — row read returned 0 rows while status was DRAFT; signed-URL request denied | AGENT_OBSERVED_LIVE |
| F | Malformed / traversal path | Org A admin | **PASS (clean deny)** — `../../etc/passwd`, bare traversal, non-UUID first segment and an empty path all returned a controlled `INVALID_STORAGE_PATH` business error (HTTP 400), never a raw Postgres exception (HTTP 500) | AGENT_OBSERVED_LIVE |
| G | Forbidden extension | Org A admin | **PASS (rejected)** — `attach_document_source_file` on a `.exe` object returned `FILE_TYPE_NOT_ALLOWED` before any durable pointer change; orphan object removed | AGENT_OBSERVED_LIVE |
| H | Size boundary | Org A admin | **PASS (rejected)** — deterministic contract check: `attach_document_source_file` called with declared `p_file_size_bytes = 52,428,801` (one byte over the 50 MiB / 52,428,800-byte bound) returned `FILE_TOO_LARGE`; the bound matches `MAX_SOURCE_FILE_BYTES` in `documentAdminService.js` exactly. A real 50+ MiB upload was not performed — impractical and unnecessary given the RPC validates the declared size as an explicit parameter, independent of actual object bytes | AGENT_OBSERVED_LIVE |
| I | Withdraw revocation | Org A admin → Org A member | **PASS (denied immediately)** — after `withdraw_document`, the same member session that could read the file in Scenario C got 0 rows and a denied signed-URL request on the very next call | AGENT_OBSERVED_LIVE |

### Finding (non-security, recorded transparently)

**Observation, not a confirmed application defect:** the bulk Storage "remove" endpoint
(`DELETE /storage/v1/object/remove/{bucket}` with a `{prefixes: [...]}` body — the exact call
`supabase-js`'s `.storage.from(bucket).remove([path])` issues) returned `404 NoSuchKey` against this
rehearsal project for objects the calling admin demonstrably owned, could read, and could delete
individually. Reproduced 3 times with fresh objects, with both `curl` and Node's native `fetch`,
ruling out a client-library quirk. A single-object `DELETE /storage/v1/object/{bucket}/{path}` call
against the identical object succeeded every time.

This means `documentAdminService.js`'s own orphan-cleanup compensation (`uploadSourceFile`'s
catch-block cleanup, `detachSourceFile`'s post-detach removal) would silently fail to actually delete
the object in this environment — both call sites already wrap the removal in a `try { } catch { /*
best effort */ }`, by design, precisely because cleanup was never treated as guaranteed. No
unauthorized access, no security control bypass, and no user-facing failure resulted: the pointer
update (the security-relevant part) always succeeded correctly in every scenario above. This is
recorded as a residual operational risk — possible orphaned-object accumulation — rather than a
Part-4 defect requiring an immediate code fix, because (a) root cause could not be isolated between
an environment-specific Storage API behavior and a universal one without access to a second
independent project to compare against, and (b) the only available application-level fix would
replace the standard `supabase-js` `.remove()` call with a hand-rolled single-object HTTP loop,
which is a real architecture change this task's "no convenience feature work" instruction argues
against making unilaterally. Recommended as a scoped follow-up investigation, not carried forward as
a blocking defect.

**Cleanup:** all rehearsal `documents` rows and Storage objects created by this rehearsal were
removed (verified `0` remaining by title match and by bucket prefix match after cleanup).

## P4-04R2 — Quiz two-session concurrency rehearsal

**Verdict: `P4_04R2_PASS`**

**Connection model:** two independent authenticated sessions for the **same** member
(`member@test.local`), each obtained via its own `POST /auth/v1/token?grant_type=password` call
(two distinct access tokens, two distinct underlying HTTP/PostgREST connections). Both sessions'
`start_quiz_attempt` RPC calls were dispatched via `Promise.all` so both requests were in flight
concurrently from the same process, released together as closely as a single-process Node HTTP
client allows. This is a genuine overlapping-request test, not two sequential RPC calls relabelled
as concurrent.

**Fixture:** one published Learning Topic per test batch (`ORGANIZATION_ONLY`, Chi đoàn A), and
per-round published Quizzes with one `SINGLE`-type question and two options (one correct), all
synthetic content. `max_attempts = 1` throughout, the strongest race condition — any race bug shows
up as either a duplicate attempt or a bypassed limit.

| Test | Description | Result |
| --- | --- | --- |
| 1 | Simultaneous first start, fresh quiz, `max_attempts=1` | **PASS** — both sessions' responses returned the **identical** `attempt_id` and `attempt_number=1`; exactly one session got `resumed=false` (the winner that inserted), the other `resumed=true` (correctly found the just-committed row via the `for update` read). No duplicate attempt, no error. |
| 2 | Repeat stress, 10 independent fresh-quiz rounds | **PASS, 10/10** — every round produced exactly one attempt row, `attempt_number=1`, matching `attempt_id` on both sides, one `resumed=false`/one `resumed=true`. The winning session alternated non-deterministically across rounds (not a fixed ordering artifact), consistent with a real race resolved correctly each time rather than an accidental fixed execution order. |
| 3 | Max-attempts edge | **PASS** — after the only allowed attempt was started and submitted (consumed), two simultaneous fresh `start_quiz_attempt` calls on the same quiz/user **both** returned `MAX_ATTEMPTS_REACHED` (HTTP 400); no new attempt row was created by either. |
| 4 | Transaction integrity | **PASS** — direct database check across all 12 rehearsal attempts (10 stress rounds + test 1 + the edge test): zero `(quiz_id, user_id, attempt_number)` duplicates, zero orphan `quiz_answers` rows, zero null `started_at`, and exactly one `submitted_at` set (the edge test's deliberate submission). |

**Mechanism observed:** `start_quiz_attempt`'s `select ... for update` on any existing unsubmitted
attempt, combined with `pg_advisory_xact_lock(hashtext(quiz_id || user_id))` serializing the
insert path, correctly prevented every race outcome the schema's
`unique(quiz_id, user_id, attempt_number)` constraint exists as a backstop for. No backstop was
triggered — the primary advisory-lock mechanism handled every round cleanly.

**Cleanup:** all rehearsal quizzes, questions, options, attempts, answers and the learning topic were
removed (verified `0` remaining by title match).

## Defects found / fixed

**None requiring a code or migration change.** The Storage bulk-remove observation above is recorded
as a residual risk, not a fix-now defect, for the reasons stated in that section. No regression test
or production code change was made on this branch.

## Full validation

No application code or migration file changed in this branch — `supabase/migrations/202608160006`
was already present on `master` (merged via PR #27) and was applied to the rehearsal project's live
database via the Supabase MCP `apply_migration` tool, not authored here. Per Part 5, CI was still run
for this docs+evidence-only branch:

- `npm test`: to be confirmed by CI on this branch's exact HEAD
- `npm run lint`: to be confirmed by CI
- `npm run build`: to be confirmed by CI
- `supabase db reset` + pgTAP + Deno: unchanged from the merged P4-06 baseline (`Files=25, Tests=727,
  PASS`; Deno `42 passed`) — no migration or Edge Function content changed by this branch

## Production readiness

Unchanged from `docs/phase-4/06-phase-4-final-acceptance.md`: `NOT_PRODUCTION_READY`. Closing the
runtime gates proves the documented behaviors work against a real actor/byte round-trip; it does not
establish a production Supabase project, secrets management, deployment configuration, monitoring,
backup/restore, or operational rollback evidence — all explicitly out of scope for Phase 4.

## Explicitly not done

- No production environment was created, configured, or touched. No production Supabase project
  exists.
- No Phase 5 / AI-RAG implementation, no embeddings, no AI API call, no vector migration.
- No application code or migration content changed.
- No real đoàn viên data, police operational data, or production credential was used at any point.
- No secret, token or JWT was written to git, this document, or any log.
- No runtime evidence was fabricated; every result above was observed live against the rehearsal
  project by this agent (`AGENT_OBSERVED_LIVE`).

## Next recommended task

`P5-00 — AI/RAG Architecture Decision` (proposal only; see
`docs/phase-5/00-ai-rag-architecture-proposal.md`). Implementation begins only in a separate task and
branch.
