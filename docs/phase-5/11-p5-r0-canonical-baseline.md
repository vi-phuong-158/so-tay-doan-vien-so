# P5-R0 — Consolidate Phase 5 Canonical Baseline

## Scope and baseline

This branch starts from exact `origin/master@343547cb5a81d5e1e69cea26a6a232c990e8c92b` in an
isolated worktree. It is the clean Phase 5 baseline; it does not cherry-pick the stacked branches.

The existing dirty P5-02R evidence was preserved separately on
`codex/phase-5-02r-drive-runtime-gate` as docs-only checkpoint `8d37f5c`. Its runtime-blocked
verdict is historical evidence only and is not acceptance evidence for this branch.

## Canonical architecture

```text
documents
  -> document_versions
  -> document_sources
  -> ingestion_jobs / ingestion_events
  -> knowledge_articles (revision rows, reviewed)
  -> document_chunks (selective evidence)
  -> knowledge_embeddings (optional secondary retrieval aid)
  -> future trusted retrieval / AI provenance
```

The publication state `documents.status` remains owned by Phase 4. P5 ingestion fields are a
separate axis. `knowledge_articles` is the canonical reviewed model: one document version may
produce many article keys and revisions; source provenance, reviewer, review timestamps and
retrieval eligibility are explicit. Approved article content and approved evidence are immutable;
corrections create new rows. Visibility derives from the document authorization model.

No extraction, Gemini summarization, automatic article generation, embedding generation, vector
retrieval, ask-ai, UI, innovation module or production deployment is included.

## Stacked work audit

| Source | Component | Decision | Reason |
|---|---|---|---|
| #31 / P5-01 | `document_versions` | ADAPT | Keep immutable checksum/version provenance; add current-version boundary and canonical migration name. |
| #31 / P5-01 | `document_sources` | ADAPT | Keep multi-source/version provenance; make provider-neutral fields explicit and source rows immutable. |
| #31 / P5-01 | `knowledge_wikis` | DROP | Superseded by the architecture decision that `knowledge_articles` is canonical. |
| #31 / P5-01 | `knowledge_wiki_versions` | DROP | Replaced by article revision rows; avoids duplicate production models. |
| #31 / P5-01 | `document_chunks` | ADAPT | Evolve in place into selective evidence and retain legacy columns needed by Phase 1–4 tests. |
| #31 / P5-01 | `knowledge_embeddings` | REWRITE | Keep separate/model-aware idea; target canonical articles/evidence and revoke client table access. |
| #31 / P5-01 | legacy AI citation shape | ADAPT | Add article/evidence/source provenance and close authenticated DML; no fabricated citations. |
| #32 / P5-02 | `ingestion_jobs` | REWRITE | Preserve lifecycle/idempotency/lease primitives with provider-neutral source links and no obsolete wiki fields. |
| #32 / P5-02 | `ingestion_events` | KEEP/ADAPT | Keep append-only operational trail; bound and reject document text/credential-shaped fields. |
| #32 / P5-02 | claim/complete/fail RPCs | ADAPT | Keep `SKIP LOCKED`, stale reclaim and retry semantics; expose only to `service_role`. |
| #32 | `run-ingestion-jobs` | ADAPT | Port as a trusted no-op foundation worker; extraction remains P5-03. |
| #33 / P5-02R | provider contract | KEEP | Small typed provider-neutral interface is reusable. |
| #33 / P5-02R | authorization gateway | ADAPT | Generalize source fields and ensure authorization precedes locator/provider call. |
| #33 / P5-02R | Google Drive adapter | ADAPT | Keep server-only OAuth refresh, typed errors and private-by-default behavior; no public sharing. |
| #33 / P5-02R | OAuth bootstrap | KEEP/ADAPT | Keep opt-in local non-production bootstrap; output is ignored and no value is logged. |
| #33 / P5-02R | live rehearsal verdict | DROP as acceptance | Schema/Vault/cron drift blocked the rehearsal; exact new-head CI and future rehearsal are required. |

## Migrations and invariants

- `202608240001_phase_5_canonical_knowledge_foundation.sql` adds source/version provenance, canonical
  articles, selective evidence evolution, secondary embeddings, citation shape, immutability guards,
  document publication/ingestion axis separation and RLS/grants.
- `202608240002_phase_5_ingestion_foundation.sql` adds idempotent queueing, atomic claim/reclaim,
  bounded retry, completion/failure transitions, append-only events and a trusted no-op worker contract.
- No obsolete Phase 5 migration is included. No `knowledge_wikis` table is created.
- `document_versions` are checksum/version immutable; `set_current_document_version` makes one
  version current through a trusted transaction. `document_sources` are immutable locators.
- Embedding inserts require approved article/evidence and both article/document retrieval opt-ins;
  model and dimension are persisted and provenance is checked.
- Ingestion jobs are idempotent by source/version/job key and do not mutate `documents.status`.

## RLS and security model

RLS is installed in the same migrations. End users see only approved articles/evidence for documents
allowed by existing `can_access_document()`. Curators are limited by `can_manage_document()` and
organization scope. Suspended users fail closed through existing active-user helpers. Embedding and
ingestion tables have no `authenticated`/`anon` table privileges; queue RPCs are `service_role` only.
Authenticated clients have SELECT-only access to their own AI source rows and no citation DML.

All SECURITY DEFINER functions in the new migrations set `search_path = public`, revoke default
execution and grant explicit trusted roles. Provider credentials remain backend environment values.

## Validation and runtime gates

Required before technical acceptance:

```text
npm test
npm run lint
npm run build
supabase db reset
supabase test db
cd supabase/functions && deno check **/*.ts && deno test --allow-all
git diff --check
secret audit
```

The existing P5-02R runtime result is not reused: it observed missing `document_sources`, missing
Vault cron names, missing cron job and missing `run-ingestion-jobs`, then stopped at `42P01`. No
Drive object or credential was created. A non-production rehearsal must be reset/synced to this
exact baseline before provider/runtime claims are made.

## Old PR disposition

Do not merge #31, #32 or #33. After the canonical PR reaches exact-head CI green, propose:

```text
#31 SUPERSEDED
#32 SUPERSEDED
#33 SUPERSEDED
```

If GitHub mutations are unavailable, leave the PRs open and report
`READY_TO_CLOSE_AS_SUPERSEDED`.

## Residual risks

- Supabase/Deno runtime availability and exact-head CI remain authoritative gates.
- Google OAuth owner consent, verified backend secrets and a non-production Drive rehearsal are
  intentionally not performed by P5-R0.
- Retrieval API and AI answer provenance consumption remain future work; no vector query path is
  enabled by this baseline.
