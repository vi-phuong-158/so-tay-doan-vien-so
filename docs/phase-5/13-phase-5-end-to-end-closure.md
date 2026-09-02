# Phase 5 End-to-End Closure

## Status

`PHASE_5_RUNTIME_BLOCKED_ACTOR_INVOCATION_TOOL_UNAVAILABLE`

Technical CI gates are complete. The authenticated Supabase management connector reconciled and
deployed the rehearsal state, but it exposes no authenticated Auth/session creation or Edge Function
invocation operation. Runtime actor acceptance therefore remains blocked; this report does not claim
a full Phase 5 pass.

## Forward changes

- Preserved PR #36's accepted P5-03 head and based the closure worktree on the subsequent
  trigger-function privilege forward fix `ff72ccd`.
- Added `202608310001_phase_5_rag_retrieval.sql`: scoped admins explicitly opt a published document
  and its approved current article into retrieval; `search_published_knowledge()` is a
  `SECURITY INVOKER` RPC and therefore applies the caller's document/article/evidence RLS before
  any model call.
- Replaced the legacy `ask-ai` direct chunk query with approved-evidence retrieval, conversation
  ownership verification, a bounded Gemini gateway, deterministic source labels, and trusted
  `ai_message_sources` evidence provenance.
- Added `/tri-thuc/hoi-ai`; the browser invokes only the authenticated Edge Function and citations
  link to the canonical document route rather than object paths or public storage URLs.

## Baseline regression analysis

- Exact PR base: `a91f7145a76507e171bb9e96a9a7262ed6575aaf`.
- The historical base CI `32745420238` passed. Replaying that same base with the current
  `supabase/setup-cli@v1` `latest` environment failed run `33413402157` at the same four pgTAP
  assertions as the closure candidate: anonymous notification read plus unexpected authenticated
  `INSERT` on `profiles.account_status`, `profiles.organization_id`, and `profiles.full_name`.
- Candidate retrieval code does not modify `profiles` or `notifications`; classification is
  `ENVIRONMENT_VERSION_REGRESSION`, not `PHASE_5_REGRESSION`.
- `202608310002_phase_5_baseline_privilege_stabilization.sql` makes the accepted minimal grants
  explicit, preserving RLS and the existing assertions rather than changing tests. The CI runtime
  used PostgreSQL image `15.8.1.085`, PostgREST `v16.1`, pg_prove `3.36`, and Deno `1.46.3`.

## Technical validation

- `npm test`: 147 passed, 0 failed.
- `npm run lint`: 0 errors.
- `npm run build`: passed.
- `git diff --check`: passed.
- Exact-head CI `33415028799` on `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`: frontend lint/test/build passed; Supabase reset and
  full pgTAP passed (`Files=27, Tests=815`); `phase_5_article_generation.sql` passed; Deno check
  and Deno test passed (`74 passed, 0 failed`).

## Runtime acceptance evidence (rehearsal only)

- Exact HEAD: `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`; worktree clean; Production accessed: **NO**.
- C1 identity: ref `znexculhbdjiflkczpyu`, name `so-tay-doan-vien-rehearsal`, status `ACTIVE_HEALTHY`,
  region `ap-southeast-1`, PostgreSQL `17.6.1.155`.
- C2 reconciliation: starting head `20260825154300_phase_5_function_privilege_hardening`; applied
  exact committed migrations `202608310001_phase_5_rag_retrieval` and
  `202608310002_phase_5_baseline_privilege_stabilization`; final head includes both.
- RPC/security verification: retrieval manager RPCs are `SECURITY DEFINER` with authenticated-only
  EXECUTE and internal authorization; `search_published_knowledge(text,integer)` is
  `SECURITY INVOKER`, authenticated-only EXECUTE, anonymous denied. All Phase 5 tables retain RLS.
  Stabilized grants show anonymous notification SELECT denied, authenticated profile INSERT denied,
  and only intended profile update columns allowed.
- C3 deployment: `ask-ai` v1, `process-document` v1, and `generate-knowledge-article` v1 are ACTIVE,
  source uploaded from this HEAD, `verify_jwt=true`. `run-ingestion-jobs` was not deployed: its
  canonical worker is explicit `NO_OP_FOUNDATION` and is not required by the selected pilot.
- C4 configuration: no secret-presence endpoint is available; a Vault name query returned no matching
  names and cannot prove Edge runtime secret state. Gemini configuration is `UNVERIFIABLE`; Drive is
  `NOT_REQUIRED` for a Supabase Storage text pilot.
- Anonymous HTTP probe to rehearsal `ask-ai` returned controlled `401 UNAUTHORIZED_NO_AUTH_HEADER`.
  No authenticated actor/session or Edge invocation API is available in the connected tooling, so
  actor matrix, document pilot, review/toggle sequence, Ask AI evidence, citations, failure matrix,
  cleanup proof, and citation UI acceptance were not executed and are not fabricated.

## Authenticated runtime harness

Added `scripts/phase5-runtime-acceptance.mjs` and the rehearsal-only command
`npm run test:phase5:runtime`. The harness uses the existing `@supabase/supabase-js` dependency,
rejects every URL except `https://znexculhbdjiflkczpyu.supabase.co`, creates random temporary actors
through the server-side Auth Admin API, signs them in through `signInWithPassword`, invokes deployed
Edge Functions with ordinary user JWTs, redacts sensitive headers, and performs best-effort cleanup
in `finally`. It never imports into the product runtime and never logs credentials.

Local execution was intentionally blocked because no rehearsal public configuration or server/admin
bootstrap credential exists in the local environment. The harness emitted
`PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PUBLIC_CONFIG_REQUIRED`; with public config supplied, the next
precise blocker is `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_AUTH_BOOTSTRAP_CREDENTIAL_REQUIRED`. No
authenticated actor or pilot data was created by this run.

## Security advisor classification

The rehearsal security advisor returned existing INFO `rls_enabled_no_policy` notices for internal
queue/audit/embedding tables and existing WARN mutable-search-path and authenticated SECURITY
DEFINER notices across legacy RPCs. These are pre-existing project-wide findings, not introduced by
the two Phase 5 migrations; the Phase 5 retrieval RPC contract was verified explicitly and no
high-confidence new Phase 5 issue was found. No advisor remediation was applied in this closure.

## Production

Production access used: **NO**. Production migration, deploy, secret change, cron change, and test
artifact upload are all out of scope for this closure.

## Authenticated rehearsal execution update (2026-09-01)

The rehearsal-only harness was run with untracked local configuration after a presence-only
preflight. The URL matched `znexculhbdjiflkczpyu`; the public and server/admin keys were present;
no secret value was printed or committed. The local configuration file uses PowerShell assignment
syntax, so the three required values were parsed into the child process only rather than sourced as
arbitrary code.

- Auth bootstrap passed: an admin, User A (Organization A), and User B (Organization B) were
  created through the server-side Auth Admin API and signed in through normal password auth to
  obtain user JWTs.
- The anonymous `ask-ai` request was denied with HTTP 401 / `UNAUTHENTICATED`; a regular User A
  was denied the retrieval-manager RPC. This is runtime evidence for the initial direct-client and
  privileged-boundary gates.
- The real `process-document` invocation then failed closed with HTTP 400 and controlled
  `GEMINI_NOT_CONFIGURED`, normalized by the harness as
  `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED`. Therefore no extraction,
  generation, review/toggle, Ask AI, citation, provider-failure, or UI gate is claimed as passed.
- This is a rehearsal server configuration blocker, not a bypassable test failure. The required
  Gemini embedding configuration for `process-document` (one or both of `GEMINI_API_KEY` and
  `GEMINI_EMBEDDING_MODEL`) must be configured by an authorized rehearsal owner before rerun.
- Every synthetic artifact created by the failed runs was removed using an exact-ID, transactionally
  scoped management cleanup because provenance triggers correctly make sources immutable to the
  application service client. Final synthetic counts were zero for organizations, documents,
  sources, ingestion jobs, and storage objects. Production accessed: **NO**.

The harness was corrected after real reproduction of two acceptance-tool defects: its original
actor password exceeded the Auth/bcrypt length limit, and it did not recognize a controlled string
error payload. Regression tests cover both behaviors. This is still not a full runtime acceptance
pass.

## Owner-configured rehearsal attempt (2026-09-01)

After owner configuration, `process-document`, `generate-knowledge-article`, and `ask-ai` were
deployed to rehearsal as active version 3 with JWT verification enabled. Synthetic Auth and
`process-document` completed successfully, including the 768-dimensional embedding contract.
Gemini generation reached the provider but returned redacted HTTP 503 `UNAVAILABLE`; one bounded
retry returned the same transient condition. Storage objects and chunks were removed and the five
synthetic jobs were cancelled. Because ingestion events are append-only and foreign-key linked,
3 documents, 3 versions, 3 sources, 5 jobs and 9 events remain as linked audit history; orphan
jobs/events = 0. Production accessed: **NO**.

## Gemini compatibility remediation pending rehearsal secret sync (2026-09-01)

The local untracked environment now contains all four required Gemini settings and their model
identifiers match the accepted contract; values were inspected only as presence/equality booleans
and were neither printed nor staged. The hosted reconciliation cannot be performed from this
session: `supabase` CLI is not installed (and must not be installed as a workaround) and the
connected management tools do not expose a secret-write operation.

The source was updated before the next deployment to request `output_dimensionality: 768` from
`models/gemini-embedding-2`, validate finite numeric vectors of exactly 768 dimensions, and fail
closed for any mismatch. Gemini 3.7 requests now remove deprecated sampling parameters; knowledge
generation uses medium thinking while the evidence-grounded Ask AI path uses low thinking. These
contracts have automated regression tests. Exact-head CI `33484622052` passed on
`7ebefbdf23d6bfe45b27c00f451ba687e35d4a07`: frontend lint/test/build, Supabase reset, all
pgTAP, Deno check, and Deno tests. This proves the source change only; it does not establish hosted
secret presence or replace the remaining rehearsal runtime gates.

Owner action for rehearsal only: open **Edge Functions → Secrets** in project
`znexculhbdjiflkczpyu`, add or replace exactly `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`,
`KNOWLEDGE_GENERATION_MODEL`, and `RAG_GENERATION_MODEL` from the local untracked file, then save.
Do not copy values into a ticket, PR, or browser source. No redeploy is required merely to make
saved secrets available, but the affected function source must be deployed from the post-fix PR
HEAD before rerunning the authenticated acceptance harness.

## Provider retry hardening (2026-09-01)

The Gemini generation adapters now share a bounded four-attempt exponential backoff policy with
small jitter and a per-request timeout. Only HTTP 500/503, HTTP 429, and transient network/timeout
failures retry. HTTP 503 is classified as `PROVIDER_UNAVAILABLE`, HTTP 429 as
`MODEL_RATE_LIMITED`, malformed successful output as `MODEL_INVALID_OUTPUT`, and permanent 4xx as
`MODEL_PROVIDER_ERROR`; configuration errors do not retry. Deterministic Deno tests cover retry,
non-retry, success-after-transient, malformed output, and exhaustion semantics. No model fallback
was introduced; the accepted Gemini 3.7 models remain unchanged.

The post-deployment minimal provider smoke used the accepted `models/gemini-3.7-flash` model and a
short JSON prompt without creating a document chain. All four bounded attempts returned redacted
HTTP 503 `UNAVAILABLE`. The full authenticated runtime harness was therefore not started and the
runtime verdict remains `PHASE_5_RUNTIME_BLOCKED_PROVIDER_UNAVAILABLE_503`.

## Provider model diagnostic (2026-09-01)

Using the same rehearsal-only API key, REST endpoint, minimal prompt and bounded request timeout:

| Model | HTTP | Error code | Result |
|---|---:|---|---|
| `models/gemini-3.7-flash` | 503 | `UNAVAILABLE` | unavailable during diagnostic |
| `models/gemini-3.6-flash` | 200 | — | minimal generation succeeded |

This classifies the incident as `MODEL_SPECIFIC_CAPACITY_ISSUE_GEMINI_3_7_FLASH`, not a provider-wide
outage. No automatic fallback was added. At the time of this diagnostic the hosted configuration
could not be changed through the connected tooling; the owner subsequently reported setting both
`KNOWLEDGE_GENERATION_MODEL` and `RAG_GENERATION_MODEL` to `models/gemini-3.6-flash`. Embedding
remains `models/gemini-embedding-2` with 768 dimensions.

## Hosted Gemini 3.6 follow-up (2026-09-01)

- **Starting/ending HEAD:** `c3f5b5d4c88d070e23516be5b547b2e1e0ad636a`; no repository code change was
  made during this attempt.
- **Rehearsal guard:** Supabase ref `znexculhbdjiflkczpyu`, project `so-tay-doan-vien-rehearsal`,
  healthy non-production project; Production accessed: **NO**.
- **Hosted functions:** `ask-ai`, `process-document`, and `generate-knowledge-article` were observed
  ACTIVE at hosted version 6 with `verify_jwt=true`. Source/model values are not exposed by the safe
  inventory response.
- **Owner configuration:** owner reported `KNOWLEDGE_GENERATION_MODEL` and
  `RAG_GENERATION_MODEL` set to `models/gemini-3.6-flash`; secret values were not read or printed.
- **Hosted generation smoke:** the first real generation call in
  `npm run test:phase5:runtime` returned HTTP 503 with controlled `PROVIDER_UNAVAILABLE` after the
  bounded retry policy. The edge-function log summary likewise shows `generate-knowledge-article`
  version 6 returning 503. Because the hosted response does not disclose the configured model, the
  3.6 hosted model cannot be independently proven from this run.
- **Runtime progress:** Auth bootstrap (Admin/User A/User B), anonymous `ask-ai` denial (401),
  User A manager-boundary denial, and `process-document` (HTTP 200 with the 768-dimensional embedding
  contract) passed. Generation failure stopped the harness before review, retrieval toggles, Ask AI,
  citation, cross-organization, failure-path, and final cleanup gates.
- **Cleanup:** storage/chunk artifacts from this run were removed and two temporary users were
  removed. Immutable source-linked database history was retained by design; the harness reported
  `database_rows_removed=false` and `orphan_check=BLOCKED_IMMUTABLE_SOURCE`. No force-delete or RLS
  bypass was used.
- **Verdict:** `PHASE_5_RUNTIME_BLOCKED_HOSTED_GENERATION_UNAVAILABLE_503`. Do not claim full runtime
  acceptance until a successful hosted 3.6 generation smoke is observed, then rerun the full harness.

## Timeout remediation preliminary rehearsal (2026-09-02)

- **Source state:** the timeout/remapping patch is locally validated but not yet deployed to
  rehearsal. It changes the client-bound timeout from 12 seconds to 35 seconds (accepted range
  30–45 seconds), uses two hosted attempts, and returns `MODEL_TIMEOUT` only for a local abort;
  received HTTP 500/503 remains `PROVIDER_UNAVAILABLE`.
- **Rehearsal identity and actor gates:** the harness rejected every non-rehearsal target and ran
  only against `znexculhbdjiflkczpyu`. Admin, User A and User B authenticated; anonymous Ask AI
  received 401; User A was denied the scoped manager RPC; and synthetic TXT extraction returned
  HTTP 200. The following generation call returned HTTP 400 `GENERATION_FAILED` from the currently
  deployed function, before review/retrieval/Ask AI. That generic hosted response has no actual
  Gemini HTTP status, so it is not classified as either timeout or provider outage.
- **Direct synthetic diagnostic:** the local untracked diagnostic configuration resolved to
  `models/gemini-3.7-flash`, not the accepted generation contract. Its harmless, production-shaped
  synthetic request received actual HTTP 503 at 4.001s with a 12-second bound and 10.804s with a
  35-second bound. This is evidence of an upstream response for that non-contract local setting,
  not evidence about hosted `models/gemini-3.6-flash` and not a reason to change models.
- **Cleanup:** the harness removed the synthetic storage object; it removed two of three temporary
  users, while immutable source-linked audit history correctly prevented destructive database
  deletion. No orphan check was claimed PASS and Production access remained **NO**.
- **Current verdict:** `PHASE_5_RUNTIME_BLOCKED_CONFIGURATION`. Exact-head CI, rehearsal deployment
  of the timeout patch, and independent confirmation that the hosted generation model is
  `models/gemini-3.6-flash` are required before resuming the full vertical-slice harness.

## Exact-head technical gate and deployment handoff (2026-09-02)

Commit `60759a977cb30bc48d801817414404b062769681` passed GitHub Actions run
`33583763200`: frontend build/lint/tests, Supabase reset/full pgTAP, Deno check and Deno tests all
completed successfully. The local environment has neither a Supabase CLI/local deploy binary nor a
rehearsal-scoped deployment token, and no tool was installed as a workaround. Therefore no
function deployment, secret change, or additional hosted runtime call was made after this gate.
This remains a deployment/configuration handoff, not a runtime pass or Production action.

## Authorized rehearsal deployment and cleanup-contract gate (2026-09-02)

- **Source and deployment:** exact source `19ddf93ee14d4f721a29dcf4b224a8e1bc7f842f` was deployed
  only through the authorized Supabase management connector to rehearsal
  `znexculhbdjiflkczpyu` (`so-tay-doan-vien-rehearsal`). `generate-knowledge-article` and `ask-ai`
  are now ACTIVE version 7 with JWT verification; retrieved hosted source confirms both include
  the shared timeout mapping. `process-document` was intentionally not redeployed because it is
  outside this patch. No secret, model setting, migration, or Production project was changed.
- **Technical gate:** GitHub Actions `33584096813` passed on the exact source above, including
  frontend build/lint/tests, Supabase reset/full pgTAP, Deno check, and Deno tests.
- **Hosted model evidence:** `models/gemini-3.6-flash` is owner-reported only. Safe management
  interfaces do not expose secret values or the resolved hosted model, so the model is
  `OWNER_CONFIGURED_NOT_INDEPENDENTLY_VERIFIED`; no provider smoke is claimed.
- **Cleanup gate before full harness:** a rehearsal aggregate audit found five synthetic document
  chains (documents, versions, sources), nine synthetic ingestion jobs, seventeen append-only
  events, and five temporary Auth users left by historical attempts. The sole public `_cleanup()`
  routine only drops pgTAP temporary tables/sequences. It is not a fixture purge API. Source,
  version, and ingestion-event immutability therefore leave no supported, ID-scoped cleanup DAG
  for another full run. No additional harness or actor creation was performed, avoiding further
  non-removable residue.
- **Verdict:** `PHASE_5_RUNTIME_BLOCKED_CLEANUP_CONTRACT`. Provide a reviewed, rehearsal-only,
  exact-ID cleanup contract (including documented treatment of immutable audit history) before
  running the provider smoke or full actor harness. PR #37 remains Draft; PR #36 is unchanged.

## Rehearsal Cleanup & Immutable Retention Contract (2026-09-02)

The contract is now `CLEANUP_CONTRACT_PASS` for a new, uniquely namespaced run. It does not weaken
RLS, triggers, provenance, or append-only history. Every new fixture uses one `P5_ACCEPTANCE_<runId>`
namespace and is enumerated by exact IDs.

| Entity | Lifecycle class | Cleanup action | Final state |
|---|---|---|---|
| documents | ARCHIVE_OR_DISABLE | `set_document_retrieval_enabled(false)` then `withdraw_document` | synthetic, `WITHDRAWN`, not retrievable |
| document_versions | IMMUTABLE_RETAIN | retain by exact document/version ID | synthetic provenance history |
| document_sources | IMMUTABLE_RETAIN | retain by exact source ID; delete linked Storage object | synthetic provenance history |
| ingestion_jobs | ARCHIVE_OR_DISABLE | exact-ID status transition to `CANCELLED` | no active work |
| ingestion_events | IMMUTABLE_RETAIN | never update/delete | bounded append-only audit |
| knowledge_articles/revisions | IMMUTABLE_RETAIN after approval | disable article retrieval via scoped RPC; retain approved history | not retrievable |
| selective evidence | IMMUTABLE_RETAIN when approved | retain exact article/document linkage | not retrievable with disabled article/document |
| knowledge_embeddings | DELETE_ALLOWED when disposable | exact-ID deletion if created by run; otherwise retain only if immutable | inactive/absent |
| AI conversations/messages/sources | DELETE_ALLOWED | exact-ID deletion after negative check | removed |
| Storage objects | EXTERNAL_RESOURCE_MUST_DELETE | exact path removal in private bucket | removed |
| temporary Auth users/profiles/roles | AUTH_ACTOR_MUST_DELETE_OR_REUSE | sign out, delete where no historical FK requires retention | deleted or explicitly retained fixture identity |

Historical residue audit identified five synthetic document/version/source chains (all titles begin
`PHASE 5 REHEARSAL`, all `PENDING_REVIEW` and `ORGANIZATION_ONLY`), nine jobs, seventeen append-only
events, and five `p5-admin-*` users. There are no historical knowledge articles or embeddings. The
chains are `RETAIN_AS_IMMUTABLE_REHEARSAL_HISTORY`; pending/retry jobs are `DISABLE`, failed/cancelled
jobs are terminal, and no existing record is touched by broad matching. Their exact IDs and counts
are recorded in the rehearsal evidence; ordinary retrieval is ineligible because no article is
approved/enabled and the documents are not published.

The five retained historical document IDs are `344935b5-cf59-4f8a-836e-dc023e6e3800`,
`b92a1a90-4119-42aa-a363-5e1524a82f1d`, `80204d6d-bc1b-4f05-91da-3550cd410471`,
`b6e6c7e1-5a5f-47c1-9d9f-f5c8a58676da`, and `b12877ae-8774-46b4-9041-fa8956d04d2b`.
The final run's retained chain is separately enumerated above; all are synthetic, non-sensitive,
bounded by the `PHASE 5 REHEARSAL` marker, and `NOT_RETRIEVAL_ELIGIBLE` after cleanup.

This retention strategy treats bounded, synthetic, non-retrievable immutable history as successful
cleanup. Physical deletion is required only for mutable/external resources. A post-cleanup negative
retrieval and Ask AI check is mandatory for the new run.

## R3 generation failure trace and targeted fix (2026-09-02)

The first R3 rehearsal used run namespace `P5_ACCEPTANCE_0ba6a78b298d4d85`. Authentication,
anonymous denial, manager-boundary denial, and TXT extraction passed. Deployed generation v7 then
returned HTTP 400 `GENERATION_FAILED` after 12.6 seconds. Postgres logs identified the exact cause:
`document_chunks_evidence_kind_check` rejected a model-supplied evidence label outside the canonical
enum. The job and attempt were retained as synthetic failed history; Storage was deleted and the
new document was withdrawn/disabled by the cleanup contract. Post-cleanup retrieval and Ask AI
returned no synthetic content.

The targeted fix normalizes untrusted evidence labels to the canonical `ARTICLE_CLAUSE` fallback and
adds a regression test. This is a production-safe boundary fix; no schema, RLS, immutability,
provider, or model fallback was added. Exact-head CI and redeployment of `generate-knowledge-article`
are required before rerunning the smoke/E2E gates.

## R3 final rehearsal and acceptance result (2026-09-02)

- **Source and CI:** the evidence-normalization fix was deployed as `generate-knowledge-article`
  v8 from `4579863a33a10d7392e013fa2bd8b96e0ad9a87b`. The harness-only retrieval-query alignment
  was then committed at `b92012af0f1ba59c49154637ce57b981bf1e47b3`; exact-head CI
  `33587311565` passed frontend, pgTAP, Deno and Edge Function tests. `ask-ai` remains v7.
- **Provider smoke:** a synthetic direct request with `models/gemini-3.6-flash` and the accepted
  35-second timeout completed in 11,233 ms with HTTP 200 `SUCCESS`. The hosted generation call
  also completed in 10,535 ms with HTTP 200. A prior 12-second diagnostic timeout is recorded as
  `MODEL_TIMEOUT`, not as a provider outage; no model fallback was introduced.
- **Run:** namespace `P5_ACCEPTANCE_56e868dbbee4457e`; document
  `6fd275f4-b207-4564-b509-27ba9e93579b`; version `66b1b544-4849-4410-b900-e485a0c3e0be`;
  source `3e8913d4-e921-4526-84d0-c97140bb7b77`; article
  `22e437b4-a89e-42ed-ac92-7823cc53e67b`. Admin, User A (Org A), User B (Org B), and anonymous
  checks all passed. The harness verified extraction, generation, pre-approval denial, canonical
  approval, enabled retrieval, grounded Ask AI with citations, second grounded answer,
  insufficient-evidence abstention, conversation ownership, and cross-organization isolation.
- **Cleanup:** the exact run's document is `WITHDRAWN`, document/article retrieval are both false,
  Storage was removed, mutable AI rows and generation attempts were deleted, pending/retry jobs
  were cancelled by exact ID, and append-only source/version/events remain retained. Two of three
  temporary Auth users were deleted; the admin actor remains only where historical foreign keys
  prevent deletion. Post-cleanup retrieval returned zero rows and post-cleanup Ask AI returned the
  safe no-evidence answer with zero citations.
- **Verdict:** `PHASE_5_END_TO_END_ACCEPTANCE_PASS`. Production accessed: `NO`. This closes the
  Phase 5 runtime gate; it does not authorize a merge or Production deployment.
